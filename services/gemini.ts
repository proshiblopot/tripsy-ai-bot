
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

export const sendMessageToGemini = async (
  history: Message[], 
  newMessage: string
): Promise<{ text: string; triage: TriageData | null; modelUsed: string }> => {
  
  const modelName = 'gemini-3-pro-preview';

  try {
    // У Vercel змінні для фронтенду повинні мати префікс VITE_
    // або ми використовуємо process.env.API_KEY, якщо Vercel прокидає його під час build-time.
    const apiKey = process.env.API_KEY || (import.meta as any).env?.VITE_API_KEY;

    if (!apiKey) {
      throw new Error("Missing Gemini API Key. Please set API_KEY in Vercel environment variables.");
    }

    const ai = new GoogleGenAI({ apiKey });
    
    const trimmedHistory = history.slice(-6); 
    const contents = [
      ...trimmedHistory.map(msg => ({
        role: msg.role === 'model' ? 'model' : 'user',
        parts: [{ text: msg.text }]
      })),
      { role: 'user', parts: [{ text: newMessage }] }
    ];

    const response = await ai.models.generateContent({
      model: modelName,
      contents: contents,
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
        temperature: 0.1,
        topP: 0.95,
      }
    });

    const responseText = response.text; 
    if (!responseText) throw new Error("Empty model response");

    const parsed = parseResponse(responseText);
    
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
    console.error("Gemini API Error:", error);
    throw error;
  }
};
