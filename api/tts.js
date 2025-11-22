export default async function handler(req, res) {
  // Handle parsing robustly (Vercel parses JSON body automatically if header is set, but we handle string case just in case)
  let body = req.body;
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch (e) {
      return res.status(400).json({ error: "Invalid JSON body" });
    }
  }
  
  const { text, lang } = body;
  const token = process.env.VITE_HF_TOKEN;

  let model = "facebook/mms-tts-ukr";
  if (lang === "ru") model = "facebook/mms-tts-rus";
  if (lang === "en") model = "facebook/mms-tts-eng";

  try {
    const response = await fetch(`https://api-inference.huggingface.co/models/${model}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      method: "POST",
      body: JSON.stringify({ inputs: text }),
    });

    if (!response.ok) {
        const errText = await response.text();
        console.error("HF API Error:", errText);
        throw new Error(`HF API Error: ${response.status}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    
    res.setHeader("Content-Type", "audio/mpeg");
    res.send(buffer);
  } catch (error) {
    console.error("Serverless TTS Error:", error);
    res.status(500).json({ error: "Failed to generate speech" });
  }
}