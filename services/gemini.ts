
import { GoogleGenAI } from "@google/genai";
import { Message, TriageData } from "../types";
import { SYSTEM_INSTRUCTION } from "../constants";

// Updated model hierarchy using recommended model names
const MODELS_HIERARCHY = [
  'gemini-3-pro-preview',
  'gemini-3-flash-preview',
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
  
  // Requirement: The API key must be obtained exclusively from process.env.API_KEY
  const apiKey = process.env.API_KEY;

  if (!apiKey) {
    console.error("API_KEY is not defined.");
    throw new Error("API_KEY_MISSING");
  }

  const currentModel = MODELS_HIERARCHY[modelIndex] || 'gemini-3-flash-preview';
  
  // Initialize GoogleGenAI with named parameter
  const ai = new GoogleGenAI({ apiKey });

  // Format contents for the generateContent call
  const formattedContents = history.slice(-4).map(msg => ({
    role: msg.role === 'model' ? 'model' : 'user',
    parts: [{ text: msg.text }]
  }));
  
  formattedContents.push({ role: 'user', parts: [{ text: newMessage }] });

  try {
    // Correct usage of ai.models.generateContent with model name and contents
    const response = await ai.models.generateContent({
      model: currentModel,
      contents: formattedContents,
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
        temperature: 0.7,
      },
    });

    // response.text is a property getter, do not call as a function
    const text = response.text;
    if (!text) throw new Error("EMPTY_RESPONSE");

    const parsed = parseResponse(text);

    // Logging attempt
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
    console.warn(`Model ${currentModel} error:`, error);

    const isRateLimit = error.message?.includes('429') || 
                        error.status === 429 || 
                        error.message?.includes('RESOURCE_EXHAUSTED');

    // Fallback logic for rate limits
    if (isRateLimit && modelIndex < MODELS_HIERARCHY.length - 1) {
      return sendMessageToGemini(history, newMessage, modelIndex + 1);
    }

    if (isRateLimit) throw new Error("RATE_LIMIT_EXCEEDED");
    throw error;
  }
};
