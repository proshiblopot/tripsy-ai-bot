export default async function handler(req, res) {
  try {
    // Robust parsing: Vercel might parse JSON automatically, or send a string
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const { text, lang } = body;
    
    // Validate Token
    const token = process.env.VITE_HF_TOKEN;
    if (!token) {
        throw new Error("Server: HF Token is missing in environment variables");
    }

    console.log(`TTS Request: lang=${lang}, text length=${text?.length}`);

    // Select Model
    let model = "facebook/mms-tts-ukr";
    if (lang === "ru") model = "facebook/mms-tts-rus";
    if (lang === "en") model = "facebook/mms-tts-eng";

    // Call Hugging Face API
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
      // Log the specific error from HF for debugging in Vercel Dashboard
      console.error(`HF API Error details: ${errText}`);
      throw new Error(`HF API Error: ${response.status} - ${errText}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    res.setHeader("Content-Type", "audio/mpeg");
    res.send(buffer);

  } catch (error) {
    console.error("TTS Function Error:", error);
    res.status(500).json({ 
        error: error.message, 
        details: "Check Vercel Function Logs for more info" 
    });
  }
}