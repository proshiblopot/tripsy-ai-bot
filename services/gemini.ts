
import { GoogleGenAI } from "@google/genai";
import { Message, TriageData } from "../types";
import { SYSTEM_INSTRUCTION } from "../constants";

// Updated model list according to the guidelines for Gemini 3, 2.5 and 2.0 series
const MODELS_HIERARCHY = [
  'gemini-3-pro-preview',
  'gemini-3-flash-preview',
  'gemini-2.5-pro',
  'gemini-2.5-flash',
  'gemini-2.0-pro',
  'gemini-2.0-flash',
  'gemini-flash-lite-latest'
];

function parseResponse(rawText: string): { text: string; triage: TriageData | null } {
  const jsonBlockRegex = /```json\s*([\s\S]*?)\s*```$/;
  const match = rawText.match(jsonBlockRegex);

  if (match && match[1]) {
    try {
      const jsonString = match[1];
      const textPart = rawText.replace(jsonBlockRegex, '').trim();
      const triageData = JSON.parse(jsonString);
      return { text: textPart, triage: triageData };
    } catch (e) {
      console.error("Failed to parse Triage JSON:", e);
    }
  }
  return { text: rawText, triage: null };
}

/**
 * Checks if a model supports the Thinking feature (Gemini 3 and 2.5 series)
 */
function supportsThinking(modelName: string): boolean {
  return modelName.includes('gemini-3') || modelName.includes('gemini-2.5');
}

/**
 * Returns appropriate thinking budget based on model class
 */
function getThinkingBudget(modelName: string): number {
  if (modelName.includes('pro')) return 16384; // Solid reasoning for Pro
  return 8192; // Faster reasoning for Flash
}

export const sendMessageToGemini = async (
  history: Message[], 
  newMessage: string,
  modelIndex: number = 0,
  tryThinking: boolean = true
): Promise<{ text: string; triage: TriageData | null; modelUsed: string }> => {
  
  const apiKey = (import.meta as any).env.VITE_GOOGLE_API_KEY;

  if (!apiKey) {
    console.error("VITE_GOOGLE_API_KEY is missing from environment variables.");
    throw new Error("API_KEY_MISSING");
  }

  const currentModel = MODELS_HIERARCHY[modelIndex] || 'gemini-3-flash-preview';
  const ai = new GoogleGenAI({ apiKey });

  const formattedContents = history.slice(-10).map(msg => ({
    role: msg.role === 'model' ? 'model' : 'user',
    parts: [{ text: msg.text }]
  }));
  
  formattedContents.push({ role: 'user', parts: [{ text: newMessage }] });

  const useThinkingInThisRequest = tryThinking && supportsThinking(currentModel);

  try {
    const response = await ai.models.generateContent({
      model: currentModel,
      contents: formattedContents.map(c => ({ role: c.role as any, parts: c.parts })),
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
        temperature: 0.3,
        ...(useThinkingInThisRequest ? {
          thinkingConfig: { thinkingBudget: getThinkingBudget(currentModel) }
        } : {})
      },
    });

    const text = response.text;
    if (!text || text.trim().length === 0) throw new Error("EMPTY_RESPONSE");

    const parsed = parseResponse(text);
    const finalModelLabel = `${currentModel}${useThinkingInThisRequest ? ' (thinking)' : ''}`;

    // Logging to internal monitoring
    fetch('/api/log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userText: newMessage,
        botResponse: parsed.text,
        triage: parsed.triage,
        modelUsed: finalModelLabel,
        timestamp: new Date().toISOString()
      })
    }).catch(() => {});

    return { 
      ...parsed, 
      modelUsed: finalModelLabel
    };

  } catch (error: any) {
    console.warn(`Model ${currentModel} error (Thinking: ${useThinkingInThisRequest}):`, error);

    const status = error.status || 0;
    const errorMessage = error.message?.toLowerCase() || "";
    
    // Expanded list of errors that should trigger a fallback to another model/mode
    const isRetryable = 
      status === 429 || 
      status === 500 || 
      status === 503 || 
      status === 504 ||
      errorMessage.includes('429') ||
      errorMessage.includes('503') ||
      errorMessage.includes('resource_exhausted') ||
      errorMessage.includes('overloaded') ||
      errorMessage.includes('unavailable') ||
      errorMessage.includes('empty_response') ||
      errorMessage.includes('deadline_exceeded');

    if (isRetryable) {
      // 1. If failed with thinking, try the SAME model WITHOUT thinking
      if (useThinkingInThisRequest) {
        console.info(`TriPsy: Issue with ${currentModel} in thinking mode. Retrying in standard mode...`);
        return sendMessageToGemini(history, newMessage, modelIndex, false);
      }
      
      // 2. If already tried without thinking, move to NEXT model in hierarchy
      if (modelIndex < MODELS_HIERARCHY.length - 1) {
        console.info(`TriPsy: Service issues with ${currentModel}. Falling back to next available model...`);
        return sendMessageToGemini(history, newMessage, modelIndex + 1, true);
      }
    }

    // If we've exhausted all options, throw specific errors or the original error
    if (status === 429 || errorMessage.includes('429')) throw new Error("RATE_LIMIT_EXCEEDED");
    throw error;
  }
};
