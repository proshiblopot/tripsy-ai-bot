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
  
  // Use safe access pattern for environment variables to prevent crashes
  // if import.meta.env is undefined in specific runtime environments
  const env = (import.meta as any).env || {};
  const apiKey = env.VITE_GOOGLE_API_KEY;

  if (!apiKey) {
    console.error("Google API Key is missing in Environment Variables");
    return {
      text: "System Error: API Key is missing. Please check your VITE_GOOGLE_API_KEY configuration.",
      triage: null
    };
  }

  // Initialize the client INSIDE the function to avoid "API Key must be set" errors 
  // during initial page load or if the key is missing.
  const ai = new GoogleGenAI({ apiKey });

  // Format history for Gemini API
  // Note: Gemini requires alternating user/model turns.
  const chatHistory = history.map(msg => ({
    role: msg.role,
    parts: [{ text: msg.text }], 
  }));

  try {
    // Switched to Gemini 3 Pro for better instruction following and reasoning
    const model = "gemini-3-pro-preview";
    
    const response = await ai.models.generateContent({
      model: model,
      contents: [
        ...chatHistory,
        { role: 'user', parts: [{ text: newMessage }] }
      ],
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
        temperature: 0.1, // Minimal temperature for maximum strictness and safety
      }
    });

    const responseText = response.text || "";
    return parseResponse(responseText);

  } catch (error) {
    console.error("Gemini API Error:", error);
    throw error;
  }
};