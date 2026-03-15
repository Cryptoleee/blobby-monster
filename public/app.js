// ============================================
// BLOBBY MONSTER — Main App Logic
// ============================================

const talkBtn = document.getElementById('talkBtn');
const btnText = talkBtn.querySelector('.btn-text');
const btnIcon = talkBtn.querySelector('.btn-icon');
const monsterWrapper = document.getElementById('monsterWrapper');
const speechBubble = document.getElementById('speechBubble');
const speechText = document.getElementById('speechText');
const subtitle = document.getElementById('subtitle');
const status = document.getElementById('status');
const audioPlayer = document.getElementById('audioPlayer');
const mouth = document.getElementById('mouth');

// ---- State ----
let isRecording = false;
let recognition = null;
let useMediaRecorder = false;
let mediaRecorder = null;
let audioChunks = [];

const subtitleMessages = [
  'Tik op mij en zeg iets geks!',
  'Blobby wil je stem horen!',
  'Vertel Blobby een geheimpje!',
  'Zeg iets grappigs!',
  'Blobby wacht... prik prik!',
  'Wat voor geks ga je zeggen?',
  'Blobby houdt van gekke woorden!',
];

// ---- Initialize ----
setupSpeechInput();

// ---- Speech Input Setup ----
function setupSpeechInput() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

  if (SpeechRecognition) {
    // Use native Web Speech API (desktop Chrome, Android Chrome)
    setupWebSpeechAPI(SpeechRecognition);
  } else if (navigator.mediaDevices && window.MediaRecorder) {
    // Fallback: MediaRecorder + Google Cloud STT (iOS, Firefox, etc.)
    useMediaRecorder = true;
    console.log('Web Speech API not available — using MediaRecorder + Google Cloud STT');
  } else {
    status.textContent = 'Oeps! Je browser kan Blobby niet horen. Probeer Chrome!';
    talkBtn.disabled = true;
  }
}

// ---- Web Speech API (primary) ----
function setupWebSpeechAPI(SpeechRecognition) {
  recognition = new SpeechRecognition();
  recognition.continuous = false;
  recognition.interimResults = true;
  recognition.lang = 'nl-NL';

  recognition.onstart = () => {
    isRecording = true;
    talkBtn.classList.add('recording');
    btnText.textContent = 'Blobby luistert...';
    btnIcon.textContent = '👂';
    monsterWrapper.classList.add('listening');
    monsterWrapper.classList.remove('speaking', 'thinking');
    setMouth('open');
    subtitle.textContent = 'Praat maar! Blobby is één groot oor!';
  };

  recognition.onresult = (event) => {
    let transcript = '';
    for (let i = event.resultIndex; i < event.results.length; i++) {
      transcript += event.results[i][0].transcript;
    }
    if (transcript.trim()) {
      speechText.textContent = transcript;
      speechBubble.classList.add('visible');
    }
  };

  recognition.onend = () => {
    isRecording = false;
    talkBtn.classList.remove('recording');
    monsterWrapper.classList.remove('listening');

    const text = speechText.textContent.trim();
    if (text) {
      processAndSpeak(text);
    } else {
      resetUI();
      subtitle.textContent = 'Blobby hoorde niks... probeer nog eens!';
    }
  };

  recognition.onerror = (event) => {
    console.error('Speech recognition error:', event.error);
    isRecording = false;
    talkBtn.classList.remove('recording');
    monsterWrapper.classList.remove('listening');

    if (event.error === 'not-allowed') {
      status.textContent = 'Geef Blobby toegang tot je microfoon!';
    } else {
      status.textContent = 'Oeps! Laten we het nog eens proberen!';
    }
    resetUI();
  };
}

// ---- MediaRecorder fallback (for iOS etc.) ----
function getMediaRecorderMimeType() {
  const types = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/mp4',
    'audio/ogg;codecs=opus',
  ];
  for (const type of types) {
    if (MediaRecorder.isTypeSupported(type)) return type;
  }
  return '';
}

async function startMediaRecording() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const mimeType = getMediaRecorderMimeType();

    mediaRecorder = new MediaRecorder(stream, mimeType ? { mimeType } : {});
    audioChunks = [];

    mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) audioChunks.push(e.data);
    };

    mediaRecorder.onstop = async () => {
      // Stop all tracks to release the microphone
      stream.getTracks().forEach((t) => t.stop());

      isRecording = false;
      talkBtn.classList.remove('recording');
      monsterWrapper.classList.remove('listening');

      if (audioChunks.length === 0) {
        resetUI();
        subtitle.textContent = 'Blobby hoorde niks... probeer nog eens!';
        return;
      }

      // Show thinking while transcribing
      btnText.textContent = 'Blobby luistert nog even...';
      btnIcon.textContent = '🤔';
      talkBtn.disabled = true;

      const audioBlob = new Blob(audioChunks, { type: mediaRecorder.mimeType });
      const transcript = await transcribeAudio(audioBlob);

      if (transcript) {
        speechText.textContent = transcript;
        speechBubble.classList.add('visible');
        processAndSpeak(transcript);
      } else {
        resetUI();
        subtitle.textContent = 'Blobby hoorde niks... probeer nog eens!';
      }
    };

    mediaRecorder.onerror = () => {
      stream.getTracks().forEach((t) => t.stop());
      isRecording = false;
      talkBtn.classList.remove('recording');
      monsterWrapper.classList.remove('listening');
      status.textContent = 'Oeps! Laten we het nog eens proberen!';
      resetUI();
    };

    mediaRecorder.start();

    isRecording = true;
    talkBtn.classList.add('recording');
    btnText.textContent = 'Blobby luistert...';
    btnIcon.textContent = '👂';
    monsterWrapper.classList.add('listening');
    monsterWrapper.classList.remove('speaking', 'thinking');
    setMouth('open');
    subtitle.textContent = 'Praat maar! Blobby is één groot oor!';
  } catch (err) {
    console.error('Microphone error:', err);
    if (err.name === 'NotAllowedError') {
      status.textContent = 'Geef Blobby toegang tot je microfoon!';
    } else {
      status.textContent = 'Oeps! Blobby kan je microfoon niet vinden!';
    }
    resetUI();
  }
}

function stopMediaRecording() {
  if (mediaRecorder && mediaRecorder.state === 'recording') {
    mediaRecorder.stop();
  }
}

async function convertToLinear16(audioBlob) {
  const audioContext = new (window.AudioContext || window.webkitAudioContext)();
  const arrayBuffer = await audioBlob.arrayBuffer();
  const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

  // Downsample to 16kHz mono (optimal for speech recognition)
  const targetSampleRate = 16000;
  const offlineCtx = new OfflineAudioContext(1, audioBuffer.duration * targetSampleRate, targetSampleRate);
  const source = offlineCtx.createBufferSource();
  source.buffer = audioBuffer;
  source.connect(offlineCtx.destination);
  source.start();
  const resampled = await offlineCtx.startRendering();

  // Convert float samples to 16-bit PCM
  const channelData = resampled.getChannelData(0);
  const pcm = new Int16Array(channelData.length);
  for (let i = 0; i < channelData.length; i++) {
    const s = Math.max(-1, Math.min(1, channelData[i]));
    pcm[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
  }

  audioContext.close();

  // Convert to base64
  const bytes = new Uint8Array(pcm.buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

async function transcribeAudio(audioBlob) {
  try {
    const base64Audio = await convertToLinear16(audioBlob);

    const res = await fetch('/api/transcribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ audio: base64Audio }),
    });

    if (!res.ok) throw new Error('Transcription request failed');

    const { transcript } = await res.json();
    return transcript || '';
  } catch (err) {
    console.error('Transcription error:', err);
    return '';
  }
}

// ---- Process & Speak ----
async function processAndSpeak(userText) {
  // Show thinking state
  monsterWrapper.classList.add('thinking');
  btnText.textContent = 'Blobby denkt na...';
  btnIcon.textContent = '🤔';
  talkBtn.disabled = true;
  setMouth('thinking');
  subtitle.textContent = 'Hmm hmm hmm...';
  status.textContent = '';

  try {
    // Step 1: Get Blobby's reply from Gemini
    const replyRes = await fetch('/api/respond', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: userText }),
    });

    if (!replyRes.ok) throw new Error('Gemini request failed');

    const { reply } = await replyRes.json();

    // Update speech bubble with Blobby's reply
    speechText.textContent = reply;

    // Step 2: Turn reply into speech via ElevenLabs
    const speakRes = await fetch('/api/speak', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: reply }),
    });

    if (!speakRes.ok) throw new Error('Voice generation failed');

    const audioBlob = await speakRes.blob();
    const audioUrl = URL.createObjectURL(audioBlob);

    // Play audio
    monsterWrapper.classList.remove('thinking');
    monsterWrapper.classList.add('speaking');
    setMouth('speaking');
    startWobble();
    subtitle.textContent = 'Blobby zegt...';
    btnText.textContent = 'Blobby praat!';
    btnIcon.textContent = '🔊';

    audioPlayer.src = audioUrl;
    audioPlayer.playbackRate = 1.0;

    audioPlayer.onended = () => {
      URL.revokeObjectURL(audioUrl);
      monsterWrapper.classList.remove('speaking');
      stopWobble();
      setMouth('happy');
      launchConfetti();
      resetUI();
      subtitle.textContent = subtitleMessages[Math.floor(Math.random() * subtitleMessages.length)];
    };

    await audioPlayer.play();
  } catch (err) {
    console.error('Error:', err);
    monsterWrapper.classList.remove('thinking', 'speaking');
    stopWobble();
    status.textContent = 'Blobby is zijn stem kwijt! Probeer nog eens!';
    setMouth('sad');
    resetUI();
  }
}

// ---- Mouth expressions ----
function setMouth(expression) {
  switch (expression) {
    case 'open':
      mouth.setAttribute('d', 'M115,180 Q150,225 185,180 Q150,200 115,180');
      mouth.setAttribute('fill', '#2d1b69');
      mouth.setAttribute('stroke', 'none');
      break;
    case 'speaking':
      mouth.setAttribute('d', 'M120,180 Q150,220 180,180 Q150,210 120,180');
      mouth.setAttribute('fill', '#2d1b69');
      mouth.setAttribute('stroke', 'none');
      break;
    case 'thinking':
      mouth.setAttribute('d', 'M130,192 Q150,188 170,192');
      mouth.setAttribute('fill', 'none');
      mouth.setAttribute('stroke', '#2d1b69');
      break;
    case 'sad':
      mouth.setAttribute('d', 'M125,200 Q150,185 175,200');
      mouth.setAttribute('fill', 'none');
      mouth.setAttribute('stroke', '#2d1b69');
      break;
    case 'happy':
    default:
      mouth.setAttribute('d', 'M120,185 Q150,215 180,185');
      mouth.setAttribute('fill', 'none');
      mouth.setAttribute('stroke', '#2d1b69');
      break;
  }
}

// ---- Blob body wobble engine (JS-driven for extra squish) ----
let wobbleAnimId = null;

const blobShapes = [
  'M150,28 C215,30 272,82 270,152 C268,222 218,272 150,270 C82,268 30,218 32,150 C34,80 88,26 150,28 Z',
  'M150,32 C210,28 274,86 268,155 C262,224 216,270 148,272 C80,274 28,222 34,148 C40,78 90,36 150,32 Z',
  'M150,28 C218,32 270,84 272,154 C274,220 220,268 150,270 C80,272 30,220 30,150 C30,82 86,24 150,28 Z',
];

function startWobble() {
  const blobPath = document.getElementById('blobPath');
  // Pause the default idle animation
  const anim = blobPath.querySelector('animate');
  if (anim) anim.setAttribute('dur', '999999s');

  let frame = 0;
  const speed = 12; // frames per shape change — gentle pace

  function wobble() {
    const idx = Math.floor(frame / speed) % blobShapes.length;
    blobPath.setAttribute('d', blobShapes[idx]);
    frame++;
    wobbleAnimId = requestAnimationFrame(wobble);
  }
  wobbleAnimId = requestAnimationFrame(wobble);
}

function stopWobble() {
  if (wobbleAnimId) {
    cancelAnimationFrame(wobbleAnimId);
    wobbleAnimId = null;
  }
  // Restore the idle animation
  const blobPath = document.getElementById('blobPath');
  const anim = blobPath.querySelector('animate');
  if (anim) anim.setAttribute('dur', '3s');
  // Reset to default shape
  blobPath.setAttribute('d', 'M150,30 C210,30 270,80 270,150 C270,220 220,270 150,270 C80,270 30,220 30,150 C30,80 90,30 150,30 Z');
}

// ---- UI Reset ----
function resetUI() {
  talkBtn.disabled = false;
  btnText.textContent = 'Praat met Blobby!';
  btnIcon.textContent = '🎤';
  setTimeout(() => {
    status.textContent = '';
  }, 3000);
}

// ---- Confetti ----
function launchConfetti() {
  const emojis = ['⭐', '🌟', '✨', '💜', '💖', '🎉', '🎊', '🦄', '🌈', '🍬'];
  for (let i = 0; i < 12; i++) {
    const confetti = document.createElement('div');
    confetti.className = 'confetti';
    confetti.textContent = emojis[Math.floor(Math.random() * emojis.length)];
    confetti.style.left = 20 + Math.random() * 60 + '%';
    confetti.style.top = '-20px';
    confetti.style.animationDuration = 1.5 + Math.random() * 2 + 's';
    document.body.appendChild(confetti);

    confetti.addEventListener('animationend', () => confetti.remove());
  }
}

// ---- Tap stars on monster ----
monsterWrapper.addEventListener('click', (e) => {
  const stars = ['⭐', '✨', '💫', '🌟', '💜', '💖'];
  for (let i = 0; i < 4; i++) {
    const star = document.createElement('div');
    star.className = 'tap-star';
    star.textContent = stars[Math.floor(Math.random() * stars.length)];

    const rect = monsterWrapper.getBoundingClientRect();
    star.style.left = (e.clientX - rect.left) + 'px';
    star.style.top = (e.clientY - rect.top) + 'px';
    star.style.setProperty('--tx', (Math.random() - 0.5) * 100 + 'px');
    star.style.setProperty('--ty', (Math.random() - 0.5) * 100 + 'px');

    monsterWrapper.appendChild(star);
    star.addEventListener('animationend', () => star.remove());
  }
});

// ---- Button & Monster Click ----
talkBtn.addEventListener('click', toggleRecording);
monsterWrapper.addEventListener('click', () => {
  if (!isRecording && !talkBtn.disabled) {
    toggleRecording();
  }
});

function toggleRecording() {
  if (isRecording) {
    if (useMediaRecorder) {
      stopMediaRecording();
    } else {
      recognition.stop();
    }
  } else {
    speechBubble.classList.remove('visible');
    if (useMediaRecorder) {
      startMediaRecording();
    } else {
      recognition.start();
    }
  }
}

// ---- Pupil tracking (follows cursor / touch) ----
document.addEventListener('mousemove', movePupils);
document.addEventListener('touchmove', (e) => {
  if (e.touches.length > 0) {
    movePupils({ clientX: e.touches[0].clientX, clientY: e.touches[0].clientY });
  }
});

function movePupils(e) {
  const svg = document.getElementById('blobby');
  const rect = svg.getBoundingClientRect();
  const svgCenterX = rect.left + rect.width / 2;
  const svgCenterY = rect.top + rect.height / 2;

  const dx = e.clientX - svgCenterX;
  const dy = e.clientY - svgCenterY;
  const dist = Math.sqrt(dx * dx + dy * dy);

  // Normalize and clamp movement
  const maxMove = 6;
  const moveX = (dx / Math.max(dist, 1)) * Math.min(dist * 0.02, maxMove);
  const moveY = (dy / Math.max(dist, 1)) * Math.min(dist * 0.02, maxMove);

  const pupilL = document.getElementById('pupilL');
  const pupilR = document.getElementById('pupilR');

  pupilL.setAttribute('cx', 118 + moveX);
  pupilL.setAttribute('cy', 128 + moveY);
  pupilR.setAttribute('cx', 188 + moveX);
  pupilR.setAttribute('cy', 128 + moveY);
}
