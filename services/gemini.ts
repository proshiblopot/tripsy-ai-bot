import { GoogleGenAI } from "@google/genai";
import { Message, TriageData } from "../types";
import { SYSTEM_INSTRUCTION } from "../constants";

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

const MODEL_NAME = 'gemini-3-flash-preview';

export const sendMessageToGemini = async (
  history: Message[], 
  newMessage: string
): Promise<{ text: string; triage: TriageData | null; modelUsed: string }> => {
  
  /**
   * Отримання ключа:
   * 1. В першу чергу шукаємо VITE_GOOGLE_API_KEY (як ви вказали).
   * 2. Fallback на API_KEY (для внутрішніх тестів AI Studio).
   */
  const env = (import.meta as any).env;
  const apiKey = env?.VITE_GOOGLE_API_KEY || (process.env as any)?.API_KEY;

  if (!apiKey) {
    console.error("CRITICAL: API Key not found. Ensure VITE_GOOGLE_API_KEY is set in Vercel.");
    throw new Error("API_KEY_MISSING");
  }

  // Створюємо клієнт з іменованим параметром apiKey
  const ai = new GoogleGenAI({ apiKey: apiKey });

  const formattedContents = history.slice(-10).map(msg => ({
    role: msg.role === 'model' ? 'model' : 'user',
    parts: [{ text: msg.text }]
  }));
  
  formattedContents.push({ role: 'user', parts: [{ text: newMessage }] });

  try {
    const response = await ai.models.generateContent({
      model: MODEL_NAME,
      contents: {
        parts: formattedContents.flatMap(c => c.parts)
      },
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
        temperature: 0.7,
      },
    });

    // Використовуємо властивість .text (не метод) згідно з документацією
    const text = response.text;
    if (!text) throw new Error("EMPTY_RESPONSE");

    const parsed = parseResponse(text);

    // Логування в Telegram
    fetch('/api/log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userText: newMessage,
        botResponse: parsed.text,
        triage: parsed.triage,
        modelUsed: MODEL_NAME,
        timestamp: new Date().toISOString()
      })
    }).catch(() => {});

    return { 
      ...parsed, 
      modelUsed: MODEL_NAME 
    };

  } catch (error: any) {
    console.error("Gemini API Error:", error);
    throw error;
  }
};