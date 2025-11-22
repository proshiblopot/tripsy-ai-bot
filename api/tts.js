export default async function handler(req, res) {
  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const { text, lang } = body;
    
    // Map language codes for Google (ua -> uk)
    let googleLang = 'uk';
    if (lang === 'ru') googleLang = 'ru';
    if (lang === 'en') googleLang = 'en';

    // Attempt 1: Hugging Face
    try {
      const token = process.env.VITE_HF_TOKEN;
      if (!token) throw new Error("HF Token missing");

      // Using microsoft/speecht5_tts as requested. 
      // Note: This model is primarily English. For UA/RU it might produce suboptimal results 
      // or fail, triggering the fallback below.
      const model = "microsoft/speecht5_tts"; 
      console.log(`Attempting HF: ${model}`);

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
      return; // Exit if HF succeeds

    } catch (hfError) {
      console.warn("HF TTS failed, switching to Google Fallback:", hfError.message);
      // Fall through to Google logic
    }

    // Attempt 2: Google Translate Fallback
    console.log(`Attempting Google TTS (lang=${googleLang})`);
    
    // Using client=tw-ob for better access
    const googleUrl = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(text)}&tl=${googleLang}&client=tw-ob`;

    const googleResponse = await fetch(googleUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
      }
    });

    if (!googleResponse.ok) {
      throw new Error(`Google TTS Error ${googleResponse.status}`);
    }

    const arrayBuffer = await googleResponse.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    res.setHeader("Content-Type", "audio/mpeg");
    res.send(buffer);

  } catch (error) {
    console.error("TTS Final Error:", error);
    res.status(500).json({ error: error.message });
  }
}