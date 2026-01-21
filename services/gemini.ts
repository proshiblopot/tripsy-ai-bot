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
 * Використовуємо рекомендовану модель для базових текстових завдань.
 */
const MODEL_NAME = 'gemini-3-flash-preview';

export const sendMessageToGemini = async (
  history: Message[], 
  newMessage: string
): Promise<{ text: string; triage: TriageData | null; modelUsed: string }> => {
  
  /**
   * Спроба отримати ключ з різних джерел:
   * 1. process.env.API_KEY - стандарт для інжектованих ключів у цьому середовищі.
   * 2. import.meta.env.VITE_API_KEY - стандарт для Vite.
   */
  const apiKey = (process.env as any).API_KEY || (import.meta as any).env?.VITE_API_KEY;

  if (!apiKey) {
    console.error("API Key not found in process.env or import.meta.env");
    throw new Error("API_KEY_MISSING");
  }

  // Ініціалізуємо SDK безпосередньо перед використанням згідно з правилами
  const ai = new GoogleGenAI({ apiKey });

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

    const text = response.text;
    if (!text) throw new Error("EMPTY_RESPONSE");

    const parsed = parseResponse(text);

    // Логування в Telegram (не блокує основний інтерфейс)
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
    console.error("Gemini API Error Detail:", error);
    throw error;
  }
};