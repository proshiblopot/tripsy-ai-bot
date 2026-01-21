
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { text, lang } = req.body;
    if (!text) return res.status(400).json({ error: 'Text is required' });
    
    let googleLang = 'uk';
    if (lang === 'ru') googleLang = 'ru';
    if (lang === 'en') googleLang = 'en';

    // Fallback logic starts with Attempt 1: Hugging Face (optional)
    try {
      const token = process.env.VITE_HF_TOKEN;
      if (token) {
        const model = "microsoft/speecht5_tts"; 
        const hfResponse = await fetch(`https://api-inference.huggingface.co/models/${model}`, {
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          method: "POST",
          body: JSON.stringify({ inputs: text.substring(0, 200) }), // HF models often have limits
        });

        if (hfResponse.ok) {
          const buffer = Buffer.from(await hfResponse.arrayBuffer());
          res.setHeader("Content-Type", "audio/mpeg");
          return res.send(buffer);
        }
      }
    } catch (e) {
      console.warn("HF failed, using Google.");
    }

    // Default: Google Translate TTS (Reliable)
    const googleUrl = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(text.substring(0, 200))}&tl=${googleLang}&client=tw-ob`;
    const googleRes = await fetch(googleUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
      }
    });

    if (!googleRes.ok) throw new Error("Google TTS failed");

    const buffer = Buffer.from(await googleRes.arrayBuffer());
    res.setHeader("Content-Type", "audio/mpeg");
    res.send(buffer);

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}
