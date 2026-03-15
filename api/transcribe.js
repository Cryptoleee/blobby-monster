module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { audio } = req.body;

  if (!audio) {
    return res.status(400).json({ error: 'No audio provided' });
  }

  try {
    const response = await fetch(
      `https://speech.googleapis.com/v1/speech:recognize?key=${process.env.GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          config: {
            encoding: 'LINEAR16',
            sampleRateHertz: 16000,
            languageCode: 'nl-NL',
            model: 'latest_short',
            enableAutomaticPunctuation: true,
          },
          audio: {
            content: audio,
          },
        }),
      }
    );

    if (!response.ok) {
      const errBody = await response.text();
      console.error('Google STT error:', response.status, errBody);
      return res.status(response.status).json({ error: 'Transcription failed' });
    }

    const data = await response.json();
    const transcript =
      data.results?.[0]?.alternatives?.[0]?.transcript?.trim() || '';

    console.log(`Transcribed: "${transcript}"`);
    res.json({ transcript });
  } catch (err) {
    console.error('Transcription error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};
