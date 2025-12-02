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
): Promise<{ text: string; triage: TriageData | null; modelUsed: string }> => {
  
  // EXACT API KEY INITIALIZATION AS REQUESTED (Vercel Compatibility)
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
    // VERIFIED: Temperature 0.3 provides a balance of empathy and adherence to strict protocols
    temperature: 0.3, 
  };

  // PRIORITY SEQUENCE FOR FALLBACKS
  // 1. Gemini 3.0 Pro (Best Quality)
  // 2. Gemini 2.0 Thinking (Deep Reasoning)
  // 3. Gemini 2.0 Pro (High Tier Fallback)
  // 4. Gemini 2.5 Flash (High Availability/Speed)
  const modelSequence = [
    "gemini-3-pro-preview",
    "gemini-2.0-flash-thinking-exp-01-21",
    "gemini-2.0-pro-exp-02-05",
    "gemini-2.5-flash"
  ];

  let lastError: any = null;

  for (const model of modelSequence) {
    try {
      const response = await ai.models.generateContent({
        model,
        contents,
        config
      });
      
      // If successful, parse and return immediately with the model name
      const parsed = parseResponse(response.text || "");
      return { 
        ...parsed, 
        modelUsed: model 
      };

    } catch (error: any) {
      lastError = error;

      // Check specifically for Quota Exceeded (429)
      const isQuotaError = 
        error.toString().includes('429') || 
        error.message?.includes('429') || 
        error.status === 429 ||
        error.toString().includes('RESOURCE_EXHAUSTED');

      if (isQuotaError) {
        console.warn(`Model ${model} exhausted (429). Switching to next model...`);
        // Continue loop to try next model
        continue;
      }
      
      // If it's NOT a quota error (e.g., safety block, network fail), stop trying and throw
      console.error(`Gemini Error on model ${model}:`, error);
      throw error;
    }
  }

  // If loop finishes and no model worked
  throw lastError || new Error("All models failed to respond.");
};