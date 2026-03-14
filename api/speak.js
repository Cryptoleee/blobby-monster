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
      `https://api.elevenlabs.io/v1/text-to-speech/${config.voice_id}`,
      {
        method: 'POST',
        headers: {
          'xi-api-key': process.env.ELEVENLABS_API_KEY,
          'Content-Type': 'application/json',
          Accept: 'audio/mpeg',
        },
        body: JSON.stringify({
          text: safeText,
          model_id: 'eleven_multilingual_v2',
          voice_settings: config.voice_settings,
        }),
      }
    );

    if (!response.ok) {
      const errBody = await response.text();
      console.error('ElevenLabs error:', response.status, errBody);
      return res.status(response.status).json({ error: 'Voice generation failed' });
    }

    const arrayBuffer = await response.arrayBuffer();

    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Cache-Control', 'no-cache');
    res.send(Buffer.from(arrayBuffer));
  } catch (err) {
    console.error('Server error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};
