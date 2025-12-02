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

  const contents = [
    ...chatHistory,
    { role: 'user', parts: [{ text: newMessage }] }
  ];

  const config = {
    systemInstruction: SYSTEM_INSTRUCTION,
    temperature: 0.1, 
  };

  try {
    // Strategy: Try PRO model first (User preference). 
    // If Quota limit (429) is hit, fallback to FLASH to ensure service continuity.
    try {
      const response = await ai.models.generateContent({
        model: "gemini-3-pro-preview",
        contents,
        config
      });
      return parseResponse(response.text || "");
    } catch (primaryError: any) {
      // Check specifically for Quota Exceeded (429)
      const isQuotaError = 
        primaryError.toString().includes('429') || 
        primaryError.message?.includes('429') || 
        primaryError.status === 429 ||
        primaryError.toString().includes('RESOURCE_EXHAUSTED');

      if (isQuotaError) {
        console.warn("Gemini Pro Quota Exceeded (429). Recovering with Flash model.");
        
        // Fallback to Flash which has much higher limits
        const response = await ai.models.generateContent({
          model: "gemini-2.5-flash",
          contents,
          config
        });
        return parseResponse(response.text || "");
      }
      
      // If it's another type of error, throw it up
      throw primaryError;
    }

  } catch (error) {
    console.error("Gemini API Error:", error);
    throw error;
  }
};