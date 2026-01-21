
import { GoogleGenAI } from "@google/genai";
import { Message, TriageData } from "../types";
import { SYSTEM_INSTRUCTION } from "../constants";

// Список моделей у порядку пріоритету для перевірки лімітів
const MODELS_HIERARCHY = [
  'gemini-3-pro-preview',
  'gemini-3-flash-preview',
  'gemini-2.0-pro-exp-02-05',
  'gemini-2.0-flash-exp',
  'gemini-1.5-pro-latest',
  'gemini-1.5-flash-latest'
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
  
  // Універсальний спосіб отримання ключа: Vercel (VITE_) або Sandbox (process.env)
  const apiKey = (import.meta as any).env?.VITE_GOOGLE_API_KEY || process.env.API_KEY;

  if (!apiKey) {
    throw new Error("API_KEY_MISSING");
  }

  const currentModel = MODELS_HIERARCHY[modelIndex];
  const ai = new GoogleGenAI({ apiKey });

  // Формування історії (останні 4 повідомлення для економії токенів)
  const formattedContents = history.slice(-4).map(msg => ({
    role: msg.role === 'model' ? 'model' : 'user',
    parts: [{ text: msg.text }]
  }));
  
  formattedContents.push({ role: 'user', parts: [{ text: newMessage }] });

  try {
    const response = await ai.models.generateContent({
      model: currentModel,
      contents: formattedContents,
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
        temperature: 0.7,
      },
    });

    const text = response.text;
    if (!text) throw new Error("EMPTY_RESPONSE");

    const parsed = parseResponse(text);

    // Логування успішного запиту
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
    console.warn(`Model ${currentModel} failed:`, error.message);

    const isRateLimit = error.message?.includes('429') || 
                        error.status === 429 || 
                        error.message?.includes('RESOURCE_EXHAUSTED');

    // Якщо це помилка ліміту і є наступна модель у списку - пробуємо її
    if (isRateLimit && modelIndex < MODELS_HIERARCHY.length - 1) {
      console.log(`Switching to fallback model: ${MODELS_HIERARCHY[modelIndex + 1]}`);
      return sendMessageToGemini(history, newMessage, modelIndex + 1);
    }

    // Якщо ліміти вичерпані всюди або інша помилка
    if (isRateLimit) {
      throw new Error("RATE_LIMIT_EXCEEDED");
    }
    
    throw error;
  }
};
