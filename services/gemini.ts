import { GoogleGenAI } from "@google/genai";
import { Message, TriageData } from "../types";
import { SYSTEM_INSTRUCTION } from "../constants";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

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
  
  // Format history for Gemini API
  // Note: Gemini requires alternating user/model turns.
  const chatHistory = history.map(msg => ({
    role: msg.role,
    parts: [{ text: msg.text }], // We only send the text part back to context, hiding the raw JSON from the "conversation" memory to keep it clean, or we could include it. Ideally, we keep context pure.
  }));

  try {
    const model = "gemini-2.5-flash";
    
    const response = await ai.models.generateContent({
      model: model,
      contents: [
        ...chatHistory,
        { role: 'user', parts: [{ text: newMessage }] }
      ],
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
        temperature: 0.7, // Slightly lower for more consistent following of protocol
      }
    });

    const responseText = response.text || "";
    return parseResponse(responseText);

  } catch (error) {
    console.error("Gemini API Error:", error);
    throw error;
  }
};