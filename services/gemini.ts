
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
 * Ієрархія моделей для забезпечення безперебійної роботи:
 * 1. gemini-1.5-flash - стабільна, високі ліміти.
 * 2. gemini-2.0-flash-exp - швидка (experimental).
 * 3. gemini-1.5-pro - потужна.
 */
const MODEL_HIERARCHY = [
  'gemini-1.5-flash',
  'gemini-2.0-flash-exp',
  'gemini-1.5-pro'
];

export const sendMessageToGemini = async (
  history: Message[], 
  newMessage: string,
  modelIndex = 0
): Promise<{ text: string; triage: TriageData | null; modelUsed: string }> => {
  
  // Vercel та більшість середовищ збірки використовують process.env для ін'єкції ключів.
  // В AI Studio середовищі ключ доступний саме через process.env.API_KEY.
  const apiKey = process.env.API_KEY;

  if (!apiKey) {
    throw new Error("API Key is missing. Ensure process.env.API_KEY is defined in your environment.");
  }

  const modelName = MODEL_HIERARCHY[modelIndex] || MODEL_HIERARCHY[0];
  
  // Створюємо екземпляр згідно з правилами: new GoogleGenAI({ apiKey: process.env.API_KEY })
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
    if (!text) throw new Error("Empty response from model");

    const parsed = parseResponse(text);

    // Логування (асинхронно)
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
    
    // Перемикання на наступну модель при 429 (ліміти) або 404 (недоступність)
    if (modelIndex < MODEL_HIERARCHY.length - 1) {
      console.warn(`Attempting fallback to ${MODEL_HIERARCHY[modelIndex + 1]}`);
      return sendMessageToGemini(history, newMessage, modelIndex + 1);
    }
    
    throw error;
  }
};
