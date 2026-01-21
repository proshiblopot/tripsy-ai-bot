import { GoogleGenAI } from "@google/genai";
import { Message, TriageData } from "../types";
import { SYSTEM_INSTRUCTION } from "../constants";

/**
 * Пріоритет моделей згідно з вашим запитом.
 * Використовуються актуальні назви для Gemini 3 та 2.5 серій.
 */
const MODELS_HIERARCHY = [
  'gemini-3-pro-preview',        // 3 Pro
  'gemini-3-flash-preview',      // 3 Flash
  'gemini-2.5-pro-preview',      // 2.5 Pro (замість 2 Pro)
  'gemini-2.5-flash-preview-09-2025', // 2.5 Flash (замість 2 Flash)
  'gemini-3-pro-preview',        // 1.5 Pro (оновлено до 3 Pro)
  'gemini-3-flash-preview'       // 1.5 Flash (оновлено до 3 Flash)
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
  
  const apiKey = (import.meta as any).env.VITE_GOOGLE_API_KEY;

  if (!apiKey) {
    console.error("VITE_GOOGLE_API_KEY is missing.");
    throw new Error("API_KEY_MISSING");
  }

  const currentModel = MODELS_HIERARCHY[modelIndex] || 'gemini-3-flash-preview';
  const ai = new GoogleGenAI({ apiKey });

  const formattedContents = history.slice(-10).map(msg => ({
    role: msg.role === 'model' ? 'model' : 'user',
    parts: [{ text: msg.text }]
  }));
  
  formattedContents.push({ role: 'user', parts: [{ text: newMessage }] });

  try {
    const isPro = currentModel.includes('pro');
    
    const response = await ai.models.generateContent({
      model: currentModel,
      contents: formattedContents.map(c => ({ role: c.role as any, parts: c.parts })),
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
        temperature: 0.7,
        // Включення "мислення" (Thinking Config)
        thinkingConfig: { 
          thinkingBudget: isPro ? 32768 : 24576 
        }
      },
    });

    const text = response.text;
    if (!text) throw new Error("EMPTY_RESPONSE");

    const parsed = parseResponse(text);

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

    const isRetryable = error.message?.includes('429') || 
                        error.status === 429 || 
                        error.message?.includes('RESOURCE_EXHAUSTED') ||
                        error.message?.includes('500');

    if (isRetryable && modelIndex < MODELS_HIERARCHY.length - 1) {
      return sendMessageToGemini(history, newMessage, modelIndex + 1);
    }

    if (isRetryable) throw new Error("RATE_LIMIT_EXCEEDED");
    throw error;
  }
};