
import { GoogleGenAI } from "@google/genai";
import { Message, TriageData } from "../types";
import { SYSTEM_INSTRUCTION } from "../constants";

// Updated model list based on latest guidelines
const MODELS_HIERARCHY = [
  'gemini-3-pro-preview',
  'gemini-3-flash-preview',
  'gemini-flash-latest',
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

export const sendMessageToGemini = async (
  history: Message[], 
  newMessage: string,
  modelIndex: number = 0
): Promise<{ text: string; triage: TriageData | null; modelUsed: string }> => {
  
  // FIXED: Using process.env.API_KEY as per guidelines and fixing the ImportMeta error
  const apiKey = process.env.API_KEY;

  if (!apiKey) {
    console.error("API_KEY is missing in Environment Variables");
    throw new Error("API_KEY_MISSING");
  }

  const currentModel = MODELS_HIERARCHY[modelIndex] || 'gemini-3-flash-preview';
  
  // FIXED: Correct initialization with named parameter
  const ai = new GoogleGenAI({ apiKey });

  const formattedContents = history.slice(-4).map(msg => ({
    role: msg.role === 'model' ? 'model' : 'user',
    parts: [{ text: msg.text }]
  }));
  
  formattedContents.push({ role: 'user', parts: [{ text: newMessage }] });

  try {
    // FIXED: Using ai.models.generateContent directly
    const response = await ai.models.generateContent({
      model: currentModel,
      contents: formattedContents,
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
        temperature: 0.7,
      },
    });

    // FIXED: .text is a getter property, not a method
    const text = response.text;
    if (!text) throw new Error("EMPTY_RESPONSE");

    const parsed = parseResponse(text);

    // Logging (non-blocking)
    fetch('/api/log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userText: newMessage,
        botResponse: parsed.text,
        triage: parsed.triage,
        modelUsed: currentModel,
        timestamp: new Date().toISOString()
      })
    }).catch(() => {});

    return { 
      ...parsed, 
      modelUsed: currentModel 
    };

  } catch (error: any) {
    console.warn(`Model ${currentModel} failed:`, error);

    const isRateLimit = error.message?.includes('429') || 
                        error.status === 429 || 
                        error.message?.includes('RESOURCE_EXHAUSTED');

    // Model fallback on rate limit
    if (isRateLimit && modelIndex < MODELS_HIERARCHY.length - 1) {
      return sendMessageToGemini(history, newMessage, modelIndex + 1);
    }

    if (isRateLimit) throw new Error("RATE_LIMIT_EXCEEDED");
    throw error;
  }
};
