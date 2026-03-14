require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

const CONFIG_PATH = path.join(__dirname, 'blobby-config.json');

function loadConfig() {
  return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
}

// ---- Get config (frontend reads personality, voice settings, etc.) ----
app.get('/api/config', (_req, res) => {
  try {
    const config = loadConfig();
    res.json(config);
  } catch (err) {
    console.error('Config read error:', err);
    res.status(500).json({ error: 'Failed to load config' });
  }
});

// ---- Update config ----
app.put('/api/config', (req, res) => {
  try {
    const current = loadConfig();
    const updated = { ...current, ...req.body };
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(updated, null, 2) + '\n');
    console.log('Config updated:', updated);
    res.json(updated);
  } catch (err) {
    console.error('Config write error:', err);
    res.status(500).json({ error: 'Failed to save config' });
  }
});

// ---- Generate Blobby's response via Gemini ----
app.post('/api/respond', async (req, res) => {
  const { text } = req.body;

  if (!text || text.trim().length === 0) {
    return res.status(400).json({ error: 'No text provided' });
  }

  const config = loadConfig();
  const safeText = text.slice(0, 500);

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite-preview:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Referer: 'http://localhost:3000',
        },
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
      data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || 'Blobby weet niet wat hij moet zeggen!';

    console.log(`Kid: "${safeText}" → Blobby: "${reply}"`);
    res.json({ reply });
  } catch (err) {
    console.error('Gemini error:', err);
    res.status(500).json({ error: 'Failed to generate response' });
  }
});

// ---- Transcribe audio via Google Cloud Speech-to-Text ----
app.post('/api/transcribe', async (req, res) => {
  const { audio, mimeType } = req.body;

  if (!audio) {
    return res.status(400).json({ error: 'No audio provided' });
  }

  let encoding = 'WEBM_OPUS';
  let sampleRateHertz = 48000;

  if (mimeType && mimeType.includes('mp4')) {
    encoding = 'MP4';
    sampleRateHertz = 44100;
  } else if (mimeType && mimeType.includes('ogg')) {
    encoding = 'OGG_OPUS';
    sampleRateHertz = 48000;
  }

  try {
    const response = await fetch(
      `https://speech.googleapis.com/v1/speech:recognize?key=${process.env.GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          config: {
            encoding,
            sampleRateHertz,
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
});

// ---- Text-to-speech via ElevenLabs ----
app.post('/api/speak', async (req, res) => {
  const { text } = req.body;

  if (!text || text.trim().length === 0) {
    return res.status(400).json({ error: 'No text provided' });
  }

  const config = loadConfig();
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

    res.set({
      'Content-Type': 'audio/mpeg',
      'Cache-Control': 'no-cache',
    });

    const arrayBuffer = await response.arrayBuffer();
    res.send(Buffer.from(arrayBuffer));
  } catch (err) {
    console.error('Server error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`\n  🟣 Blobby Monster is alive at http://localhost:${PORT}\n`);
});
