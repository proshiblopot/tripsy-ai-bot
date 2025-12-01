import { GoogleGenAI } from "@google/genai";
import { Message, TriageData } from "../types";
import { SYSTEM_INSTRUCTION } from "../constants";

/**
 * Parses the raw response from Gemini to separate the conversational text
 * from the JSON triage data.
 */
function parseResponse(rawText: string): { text: string; triage: TriageData | null } {
  // Regex to find the last JSON code block
  const jsonBlockRegex = /```json\s*([\s\S]*?)\s*```$/;
  const match = rawText.match(jsonBlockRegex);

  if (match && match[1]) {
    const jsonString = match[1];
    const textPart = rawText.replace(jsonBlockRegex, '').trim();
    
    try {
      const triageData = JSON.parse(jsonString);
      return { text: textPart, triage: triageData };
    } catch (e) {
      console.error("Failed to parse Triage JSON:", e);
      return { text: rawText, triage: null };
    }
  }

  return { text: rawText, triage: null };
}

export const sendMessageToGemini = async (
  history: Message[], 
  newMessage: string
): Promise<{ text: string; triage: TriageData | null }> => {
  
  // RESTORED TO EXACT SCREENSHOT STATE FOR VERCEL COMPATIBILITY
  const apiKey = (import.meta as any).env.VITE_GOOGLE_API_KEY;
  
  if (!apiKey) {
    console.error("CRITICAL ERROR: API Key is missing.");
    throw new Error("API Key is missing. Please configure VITE_GOOGLE_API_KEY.");
  }

  const ai = new GoogleGenAI({ apiKey });

  // Format history for Gemini API
  const chatHistory = history.map(msg => ({
    role: msg.role,
    parts: [{ text: msg.text }], 
  }));

  try {
    // Model is set to PRO as requested
    const model = "gemini-3-pro-preview";
    
    const response = await ai.models.generateContent({
      model: model,
      contents: [
        ...chatHistory,
        { role: 'user', parts: [{ text: newMessage }] }
      ],
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
        temperature: 0.1, 
      }
    });

    const responseText = response.text || "";
    return parseResponse(responseText);

  } catch (error) {
    console.error("Gemini API Error:", error);
    throw error;
  }
};