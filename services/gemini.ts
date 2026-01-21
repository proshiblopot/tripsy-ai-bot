
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
 * Оновлена ієрархія для уникнення лімітів (429) та помилок відсутності моделей (404):
 * 1. gemini-1.5-flash-latest - стабільна, високі ліміти.
 * 2. gemini-3-flash-preview - нова, швидка, але низькі ліміти.
 * 3. gemini-1.5-pro-latest - потужна, низькі ліміти.
 */
const MODEL_HIERARCHY = [
  'gemini-1.5-flash-latest',
  'gemini-3-flash-preview',
  'gemini-1.5-pro-latest'
];

export const sendMessageToGemini = async (
  history: Message[], 
  newMessage: string,
  modelIndex = 0
): Promise<{ text: string; triage: TriageData | null; modelUsed: string }> => {
  
  let apiKey = "";
  try {
    // @ts-ignore
    apiKey = import.meta.env?.VITE_GOOGLE_API_KEY || 
             // @ts-ignore
             import.meta.env?.VITE_API_KEY || 
             (process.env as any)?.VITE_GOOGLE_API_KEY ||
             process.env.API_KEY;
  } catch (e) {}

  if (!apiKey) {
    throw new Error("API Key is missing. Check your environment variables.");
  }

  const modelName = MODEL_HIERARCHY[modelIndex] || MODEL_HIERARCHY[0];
  const ai = new GoogleGenAI({ apiKey });

  const formattedContents = [
    ...history.slice(-10).map(msg => ({
      role: msg.role === 'model' ? 'model' : 'user',
      parts: [{ text: msg.text }]
    })),
    { role: 'user', parts: [{ text: newMessage }] }
  ];

  try {
    const response = await ai.models.generateContent({
      model: modelName,
      contents: formattedContents,
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
        temperature: 0.7,
      },
    });

    const responseText = response.text;
    if (!responseText) throw new Error("Empty response");

    const parsed = parseResponse(responseText);

    // Логування
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
    console.error(`Error with model ${modelName}:`, error);
    
    // Якщо помилка 429 або 404 — перемикаємося на наступну модель
    if (modelIndex < MODEL_HIERARCHY.length - 1) {
      return sendMessageToGemini(history, newMessage, modelIndex + 1);
    }
    
    throw error;
  }
};
