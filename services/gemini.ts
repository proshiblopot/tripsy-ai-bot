
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
  
  // FIX: Use process.env.API_KEY as per guidelines. 
  // The environment variable is assumed to be available in the execution context.
  const apiKey = process.env.API_KEY;

  if (!apiKey) {
    console.error("process.env.API_KEY is not defined");
    throw new Error("API_KEY_MISSING");
  }

  // FIX: Always use new GoogleGenAI({apiKey: process.env.API_KEY});
  const ai = new GoogleGenAI({ apiKey });

  // Formatting history for the contents array
  const formattedContents = history.slice(-5).map(msg => ({
    role: msg.role === 'model' ? 'model' : 'user',
    parts: [{ text: msg.text }]
  }));
  
  formattedContents.push({ role: 'user', parts: [{ text: newMessage }] });

  try {
    // FIX: Use ai.models.generateContent directly. 
    // Do not use model.generateContent or getGenerativeModel.
    const response = await ai.models.generateContent({
      model: MODEL_NAME,
      contents: formattedContents,
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
        temperature: 0.7,
      },
    });

    // FIX: Access .text property directly (not a method).
    const text = response.text;
    if (!text) throw new Error("EMPTY_RESPONSE");

    const parsed = parseResponse(text);

    // Логування (API Route)
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
    
    // Перевірка на Quota Exceeded (429)
    if (error.message?.includes('429') || error.status === 429) {
      throw new Error("RATE_LIMIT_EXCEEDED");
    }
    
    throw error;
  }
};
