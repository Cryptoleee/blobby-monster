const config = require('./_config');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { text } = req.body;

  if (!text || text.trim().length === 0) {
    return res.status(400).json({ error: 'No text provided' });
  }

  const safeText = text.slice(0, 500);

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite-preview:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system_instruction: {
            parts: [{ text: config.personality }],
          },
          contents: [
            {
              role: 'user',
              parts: [{ text: `Een kind zei: "${safeText}"\n\nReageer als Blobby.` }],
            },
          ],
          generationConfig: {
            maxOutputTokens: 256,
            temperature: 1.0,
            thinkingConfig: { thinkingBudget: 0 },
          },
        }),
      }
    );

    if (!response.ok) {
      const errBody = await response.text();
      console.error('Gemini error:', response.status, errBody);
      return res.status(response.status).json({ error: 'Gemini request failed' });
    }

    const data = await response.json();
    const reply =
      data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ||
      'Blobby weet niet wat hij moet zeggen!';

    console.log(`Kid: "${safeText}" → Blobby: "${reply}"`);
    res.json({ reply });
  } catch (err) {
    console.error('Gemini error:', err);
    res.status(500).json({ error: 'Failed to generate response' });
  }
};
