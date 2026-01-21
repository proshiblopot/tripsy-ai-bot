
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

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Hierarchy of models with Pro prioritized.
 * We start with the best (3 Pro) and fallback to most available (1.5 Flash).
 */
const MODEL_HIERARCHY = [
  'gemini-3-pro-preview',     // 1. Primary: Best reasoning
  'gemini-3-flash-preview',   // 2. Fast/Modern fallback
  'gemini-1.5-pro',           // 3. Stable Pro fallback
  'gemini-1.5-flash'          // 4. Maximum availability fallback
];

export const sendMessageToGemini = async (
  history: Message[], 
  newMessage: string,
  modelIndex = 0,
  retryCount = 0
): Promise<{ text: string; triage: TriageData | null; modelUsed: string }> => {
  
  const apiKey = process.env.API_KEY || (import.meta as any).env.VITE_GOOGLE_API_KEY;
  if (!apiKey) throw new Error("API Key is missing.");

  const ai = new GoogleGenAI({ apiKey });
  const modelName = MODEL_HIERARCHY[modelIndex] || MODEL_HIERARCHY[0];

  // Limit history context to stay within TPM limits across different models
  const trimmedHistory = history.slice(-10);

  const formattedContents = [
    ...trimmedHistory.map(msg => ({
      role: msg.role === 'model' ? 'model' : 'user',
      parts: [{ text: msg.text }]
    })),
    { role: 'user', parts: [{ text: newMessage }] }
  ];

  try {
    console.log(`[Gemini] Requesting with model: ${modelName} (Attempt ${retryCount + 1})`);
    
    const response = await ai.models.generateContent({
      model: modelName,
      contents: formattedContents,
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
        temperature: 0.7,
      },
    });

    const responseText = response.text;
    if (!responseText) throw new Error("Empty response from model");

    const parsed = parseResponse(responseText);
    return { 
      ...parsed, 
      modelUsed: modelName 
    };

  } catch (error: any) {
    const isRateLimit = error.message?.includes('429') || error.status === 429;
    
    // 1. If Rate Limited (429), try retrying the SAME model once after a short delay
    if (isRateLimit && retryCount < 1) {
      const delay = 2000 + Math.random() * 1000;
      console.warn(`[Gemini] Model ${modelName} rate limited. Retrying same model in ${Math.round(delay)}ms...`);
      await sleep(delay);
      return sendMessageToGemini(history, newMessage, modelIndex, retryCount + 1);
    }

    // 2. If retries failed OR other error (500, etc), switch to the NEXT model in hierarchy
    if (modelIndex < MODEL_HIERARCHY.length - 1) {
      console.warn(`[Gemini] Model ${modelName} failed/limited. Switching to next model: ${MODEL_HIERARCHY[modelIndex + 1]}`);
      // Wait a tiny bit before switching to let the network settle
      await sleep(500);
      return sendMessageToGemini(history, newMessage, modelIndex + 1, 0);
    }

    // 3. If all models in hierarchy failed, throw the final error to the UI
    console.error(`[Gemini] All fallback models failed.`);
    throw error;
  }
};
