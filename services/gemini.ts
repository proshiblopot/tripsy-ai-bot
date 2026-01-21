
import { GoogleGenAI } from "@google/genai";
import { Message, TriageData } from "../types";
import { SYSTEM_INSTRUCTION } from "../constants";

/**
 * Parses the raw response from Gemini to separate the conversational text
 * from the JSON triage data.
 */
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
 * Model Hierarchy: 3 Pro -> 3 Flash -> 1.5 Pro -> 1.5 Flash.
 */
const MODEL_HIERARCHY = [
  'gemini-3-pro-preview',
  'gemini-3-flash-preview',
  'gemini-1.5-pro',
  'gemini-1.5-flash'
];

export const sendMessageToGemini = async (
  history: Message[], 
  newMessage: string,
  modelIndex = 0
): Promise<{ text: string; triage: TriageData | null; modelUsed: string }> => {
  
  // Direct integration using the key via import.meta.env as requested
  const apiKey = (import.meta as any).env.VITE_GOOGLE_API_KEY;
  if (!apiKey) {
    throw new Error("VITE_GOOGLE_API_KEY is not defined.");
  }

  const ai = new GoogleGenAI({ apiKey });
  const modelName = MODEL_HIERARCHY[modelIndex];

  if (!modelName) {
    throw new Error("Specified models in hierarchy are exhausted.");
  }

  const trimmedHistory = history.slice(-12); 
  const formattedContents = [
    ...trimmedHistory.map(msg => ({
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
        temperature: 0.3,
        topP: 0.95,
      },
    });

    const responseText = response.text;
    if (!responseText) throw new Error("Empty model response");

    const parsed = parseResponse(responseText);
    return { 
      ...parsed, 
      modelUsed: modelName 
    };

  } catch (error: any) {
    console.warn(`Model ${modelName} failed. Reason: ${error.message}. Trying next in hierarchy...`);
    
    if (modelIndex < MODEL_HIERARCHY.length - 1) {
      return sendMessageToGemini(history, newMessage, modelIndex + 1);
    }
    
    throw error;
  }
};
