import { GoogleGenAI } from "@google/genai";
import { Message, TriageData } from "../types";
import { SYSTEM_INSTRUCTION } from "../constants";

/**
 * Офіційна ієрархія моделей TriPsy для забезпечення максимальної стабільності.
 * Пріоритет від найрозумніших до найбільш стійких до лімітів.
 */
const MODELS_HIERARCHY = [
  'gemini-3-pro-preview',               // 1. Основна модель (найвищий інтелект)
  'gemini-3-flash-preview',             // 2. Баланс швидкості та якості
  'gemini-3-pro-image-preview',         // 3. Резервна Pro версія
  'gemini-2.5-flash-latest',            // 4. Стабільний середній рівень
  'gemini-flash-lite-latest',           // 5. Найвищі ліміти на запити
  'gemini-2.5-flash-preview-tts',       // 6. Резервний канал
  'gemini-2.5-flash-native-audio-preview-12-2025', // 7. Аудіо-оптимізований резерв
  'gemini-flash-latest'                 // 8. Фінальний бекап
];

function parseResponse(rawText: string): { text: string; triage: TriageData | null } {
  const jsonBlockRegex = /```json\s*([\s\S]*?)\s*```$/;
  const match = rawText.match(jsonBlockRegex);

  if (match && match[1]) {
    try {
      const jsonString = match[1];
      const textPart = rawText.replace(jsonBlockRegex, '').trim();
      const triageData = JSON.parse(jsonString);
      
      if (!triageData.urgency || !triageData.topic) {
        return { text: rawText, triage: null };
      }
      
      return { text: textPart, triage: triageData };
    } catch (e) {
      console.error("Failed to parse Triage JSON:", e);
    }
  }
  return { text: rawText, triage: null };
}

export const sendMessageToGemini = async (
  history: Message[], 
  newMessage: string,
  modelIndex: number = 0
): Promise<{ text: string; triage: TriageData | null; modelUsed: string }> => {
  
  // Використовуємо (import.meta as any).env.VITE_GOOGLE_API_KEY згідно з вашою вимогою
  const apiKey = (import.meta as any).env.VITE_GOOGLE_API_KEY;

  if (!apiKey) {
    throw new Error("API_KEY_MISSING");
  }

  const currentModel = MODELS_HIERARCHY[modelIndex];
  if (!currentModel) throw new Error("ALL_MODELS_FAILED");

  // Ініціалізація клієнта безпосередньо перед викликом з правильним об'єктом конфігурації
  const ai = new GoogleGenAI({ apiKey });

  const formattedContents = history.slice(-6).map(msg => ({
    role: msg.role === 'model' ? 'model' : 'user',
    parts: [{ text: msg.text }]
  }));
  
  formattedContents.push({ role: 'user', parts: [{ text: newMessage }] });

  try {
    const isPro = currentModel.includes('pro');
    
    const response = await ai.models.generateContent({
      model: currentModel,
      contents: formattedContents.map(c => ({ role: c.role as any, parts: c.parts })),
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
        temperature: 0.3, // Температура 0.3 для стабільності JSON
        ...(isPro ? { thinkingConfig: { thinkingBudget: 2000 } } : {})
      },
    });

    const text = response.text;
    if (!text) throw new Error("EMPTY_RESPONSE");

    const parsed = parseResponse(text);

    // Ротація, якщо модель не видала JSON у перших спробах
    if (!parsed.triage && modelIndex < 3) {
       console.warn(`Model ${currentModel} failed quality check. Rotating...`);
       return sendMessageToGemini(history, newMessage, modelIndex + 1);
    }

    // Логування (асинхронно)
    fetch('/api/log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userText: newMessage,
        botResponse: parsed.text,
        triage: parsed.triage,
        modelUsed: currentModel,
        timestamp: new Date().toISOString()
      })
    }).catch(() => {});

    return { 
      ...parsed, 
      modelUsed: currentModel 
    };

  } catch (error: any) {
    console.warn(`Model ${currentModel} error:`, error);

    const isRetryable = error.message?.includes('429') || 
                        error.message?.includes('500') ||
                        error.status === 429 || 
                        error.message?.includes('RESOURCE_EXHAUSTED');

    if (isRetryable && modelIndex < MODELS_HIERARCHY.length - 1) {
      return sendMessageToGemini(history, newMessage, modelIndex + 1);
    }

    if (isRetryable) throw new Error("RATE_LIMIT_EXCEEDED");
    throw error;
  }
};