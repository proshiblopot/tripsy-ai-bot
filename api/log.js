
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  }

  try {
    // Vercel handles body parsing automatically, but let's be safe
    const body = req.body;
    const { userText, botResponse, triage, modelUsed, language } = body;

    const token = process.env.TG_BOT_TOKEN;
    const chatId = process.env.TG_CHAT_ID;

    if (!token || !chatId) {
      return res.status(500).json({ error: 'Telegram credentials missing' });
    }

    const urgencyIcon = triage?.urgency === 'CRITICAL' ? '🔴' : 
                        triage?.urgency === 'HIGH' ? '🟠' : 
                        triage?.urgency === 'MEDIUM' ? '🟡' : '🟢';

    const langFlag = language === 'en' ? '🇬🇧' : '🇺🇦';

    const message = `
<b>TriPsy Monitor</b> ${urgencyIcon} ${langFlag}
<code>${modelUsed || 'Unknown Model'}</code>

<b>User:</b>
${userText}

<b>Bot:</b>
${botResponse}

<b>Analysis:</b>
🎯 <b>Topic:</b> ${triage?.topic || 'N/A'}
⚠️ <b>Urgency:</b> ${triage?.urgency || 'Low'}
💡 <b>Action:</b> ${triage?.suggested_action || 'None'}
    `.trim();

    const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: message,
        parse_mode: 'HTML'
      }),
    });

    const data = await response.json();
    if (!data.ok) throw new Error(data.description || 'Telegram API error');

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error("Log error:", error);
    return res.status(500).json({ error: error.message });
  }
}
