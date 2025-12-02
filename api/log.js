export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method Not Allowed' });
  }

  const { userText, botResponse, triage, modelUsed, timestamp, language } = req.body;

  // 1. Get Environment Variables
  const token = process.env.TG_BOT_TOKEN;
  const chatId = process.env.TG_CHAT_ID;

  if (!token || !chatId) {
    console.error("Missing TG_BOT_TOKEN or TG_CHAT_ID");
    // Fail silently to frontend
    return res.status(500).json({ error: 'Server config missing' });
  }

  // 2. Format Message for Telegram
  // Urgency Icons
  const urgencyIcon = triage?.urgency === 'CRITICAL' ? '🔴' : 
                      triage?.urgency === 'HIGH' ? '🟠' : 
                      triage?.urgency === 'MEDIUM' ? '🟡' : '🟢';

  // Language Flag
  const langFlag = language === 'en' ? '🇬🇧' : '🇺🇦';

  const message = `
<b>TriPsy Monitor</b> ${urgencyIcon} ${langFlag}
<code>${modelUsed || 'Unknown Model'}</code>

<b>User:</b>
${userText}

<b>Bot:</b>
${botResponse}

<b>Analysis:</b>
🎯 ${triage?.topic || 'No topic'}
⚠️ ${triage?.urgency || 'Low'}
💡 ${triage?.suggested_action || 'None'}
`;

  try {
    // 3. Send to Telegram API
    const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        chat_id: chatId,
        text: message,
        parse_mode: 'HTML' // Allows bolding and code blocks
      }),
    });

    const data = await response.json();

    if (!data.ok) {
      throw new Error(data.description);
    }

    return res.status(200).json({ success: true });

  } catch (error) {
    console.error("Telegram Log Error:", error);
    return res.status(500).json({ error: error.message });
  }
}