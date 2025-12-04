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

  const config: any = {
    systemInstruction: SYSTEM_INSTRUCTION,
    // VERIFIED: Temperature 0.3 provides a balance of empathy and adherence to strict protocols
    temperature: 0.3,
    // Custom parameter requested by user
    thinking_level: "high" 
  };

  // CUSTOM MODEL SEQUENCE FOR TESTING (User Defined)
  const modelSequence = [
    "gemini-3-pro",
    "gemini-2.5-pro",
    "gemini-2.5-flash"
  ];

  let lastError: any = null;

  for (const model of modelSequence) {
    try {
      // Log which model we are trying (helpful for expert mode debugging)
      console.log(`[Gemini] Requesting with model: ${model}`);

      const response = await ai.models.generateContent({
        model,
        contents,
        config
      });
      
      console.log(`[Gemini] Success with model: ${model}`);

      // If successful, parse and return immediately with the model name
      const parsed = parseResponse(response.text || "");
      return { 
        ...parsed, 
        modelUsed: model 
      };

    } catch (error: any) {
      lastError = error;

      // Check for retryable errors:
      // 429 (Quota), 404 (Model Not Found), 503 (Service Unavailable)
      const isRetryableError = 
        error.toString().includes('429') || 
        error.message?.includes('429') || 
        error.status === 429 ||
        error.toString().includes('RESOURCE_EXHAUSTED') ||
        error.status === 404 ||
        error.message?.includes('NOT_FOUND') ||
        error.toString().includes('404') ||
        error.status === 503;

      if (isRetryableError) {
        console.warn(`Model ${model} failed (Status: ${error.status || 'Unknown'}). Switching to next model...`);
        // Continue loop to try next model
        continue;
      }
      
      // If it's NOT a retryable error (e.g., safety block, invalid key), stop trying and throw
      console.error(`Gemini Error on model ${model}:`, error);
      throw error;
    }
  }

  // If loop finishes and no model worked
  throw lastError || new Error("All models failed to respond.");
};