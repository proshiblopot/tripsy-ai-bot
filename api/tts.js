export default async function handler(req, res) {
  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const { text, lang } = body;
    const token = process.env.VITE_HF_TOKEN;

    if (!token) throw new Error("Server: HF Token is missing in env vars");

    let model = "facebook/mms-tts-ukr";
    if (lang === "ru") model = "facebook/mms-tts-rus";
    if (lang === "en") model = "facebook/mms-tts-eng";

    console.log(`Connecting to HF: ${model}`);

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
      throw new Error(`HF Error ${response.status}: ${errText}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    res.setHeader("Content-Type", "audio/mpeg");
    res.send(buffer);

  } catch (error) {
    console.error("TTS Error Details:", error);
    res.status(500).json({ error: error.message });
  }
}