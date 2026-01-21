
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

/**
 * Иерархия моделей. 
 * ВАЖНО: Удалены суффиксы '-latest', которые вызывают 404 в v1beta.
 */
const MODEL_HIERARCHY = [
  'gemini-1.5-flash',
  'gemini-1.5-pro',
  'gemini-2.0-flash-exp'
];

export const sendMessageToGemini = async (
  history: Message[], 
  newMessage: string,
  modelIndex = 0
): Promise<{ text: string; triage: TriageData | null; modelUsed: string }> => {
  
  /**
   * Vercel требует префикс VITE_ для клиентских переменных.
   * Мы проверяем оба варианта, чтобы соответствовать и SDK, и платформе.
   */
  const apiKey = (process.env as any).API_KEY || 
                 (process.env as any).VITE_API_KEY || 
                 (import.meta as any).env?.VITE_API_KEY;

  if (!apiKey) {
    throw new Error("API_KEY_MISSING");
  }

  const modelName = MODEL_HIERARCHY[modelIndex] || MODEL_HIERARCHY[0];
  
  // Инициализация строго по гайдлайну SDK
  const ai = new GoogleGenAI({ apiKey });

  const formattedContents = history.slice(-6).map(msg => ({
    role: msg.role === 'model' ? 'model' : 'user',
    parts: [{ text: msg.text }]
  }));
  
  formattedContents.push({ role: 'user', parts: [{ text: newMessage }] });

  try {
    const response = await ai.models.generateContent({
      model: modelName,
      contents: formattedContents,
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
        temperature: 0.7,
      },
    });

    const text = response.text;
    if (!text) throw new Error("EMPTY_RESPONSE");

    const parsed = parseResponse(text);

    // Логирование в Telegram через API роут
    fetch('/api/log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userText: newMessage,
        botResponse: parsed.text,
        triage: parsed.triage,
        modelUsed: modelName,
        timestamp: new Date().toISOString()
      })
    }).catch(() => {});

    return { 
      ...parsed, 
      modelUsed: modelName 
    };

  } catch (error: any) {
    console.error(`Gemini Error (${modelName}):`, error);
    
    // Автоматический переход на другую модель при ошибках 404 или 429
    if (modelIndex < MODEL_HIERARCHY.length - 1) {
      return sendMessageToGemini(history, newMessage, modelIndex + 1);
    }
    
    throw error;
  }
};
