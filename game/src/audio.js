// Sound, synthesised: no audio files, no network. Every effect is a small WebAudio graph
// built on first use, and every call is a no-op until the player has clicked (the browser
// keeps the context suspended before a gesture, and the shot hooks never play a sound).
let context = null;
let master = null;
let noiseBuffer = null;

function ensure() {
  if (context) return context;
  try {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return null;
    context = new AudioContextClass();
    master = context.createGain();
    master.gain.value = 0.22;
    master.connect(context.destination);
    noiseBuffer = context.createBuffer(1, context.sampleRate * 0.5, context.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
  } catch {
    context = null;
  }
  return context;
}

function noise(duration, filterFreq, gainValue, when = 0) {
  const ctx = ensure();
  if (!ctx || ctx.state !== 'running') return;
  const source = ctx.createBufferSource();
  source.buffer = noiseBuffer;
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = filterFreq;
  const gain = ctx.createGain();
  const start = ctx.currentTime + when;
  gain.gain.setValueAtTime(gainValue, start);
  gain.gain.exponentialRampToValueAtTime(0.001, start + duration);
  source.connect(filter).connect(gain).connect(master);
  source.start(start, Math.random() * 0.3, duration);
  source.stop(start + duration + 0.02);
}

function tone(freq, duration, gainValue, type = 'square', slideTo = null, when = 0) {
  const ctx = ensure();
  if (!ctx || ctx.state !== 'running') return;
  const oscillator = ctx.createOscillator();
  oscillator.type = type;
  const start = ctx.currentTime + when;
  oscillator.frequency.setValueAtTime(freq, start);
  if (slideTo !== null) oscillator.frequency.exponentialRampToValueAtTime(slideTo, start + duration);
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(gainValue, start);
  gain.gain.exponentialRampToValueAtTime(0.001, start + duration);
  oscillator.connect(gain).connect(master);
  oscillator.start(start);
  oscillator.stop(start + duration + 0.02);
}

export function createAudio() {
  return {
    resume() {
      const ctx = ensure();
      if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {});
    },
    shot() {
      noise(0.09, 1800, 0.9);
      tone(180, 0.07, 0.5, 'square', 60);
    },
    enemyShot(distance) {
      const volume = Math.max(0.08, 0.5 - distance * 0.012);
      noise(0.08, 1200, volume);
    },
    dryFire() {
      tone(1400, 0.03, 0.25, 'square');
    },
    reload() {
      tone(900, 0.04, 0.3, 'square');
      tone(600, 0.04, 0.3, 'square', null, 0.25);
    },
    hit() {
      tone(1250, 0.05, 0.35, 'sine');
    },
    kill() {
      tone(1250, 0.05, 0.35, 'sine');
      tone(1750, 0.08, 0.35, 'sine', null, 0.07);
    },
    hurt() {
      noise(0.12, 500, 0.5);
      tone(110, 0.15, 0.4, 'sawtooth', 70);
    },
    plantBeep() {
      tone(1500, 0.06, 0.3, 'sine');
    },
    plantDone() {
      tone(900, 0.08, 0.35, 'sine');
      tone(1350, 0.12, 0.35, 'sine', null, 0.1);
    },
    explosion() {
      noise(0.9, 300, 1.0);
      tone(70, 0.8, 0.8, 'sine', 30);
    },
    flashbang() {
      tone(2400, 0.4, 0.25, 'sine', 1800);
      noise(0.3, 4000, 0.2);
    },
    roundWin() {
      tone(523, 0.12, 0.35, 'sine');
      tone(659, 0.12, 0.35, 'sine', null, 0.12);
      tone(784, 0.2, 0.35, 'sine', null, 0.24);
    },
    roundLose() {
      tone(392, 0.15, 0.35, 'sine');
      tone(311, 0.25, 0.35, 'sine', null, 0.15);
    },
    buy() {
      tone(1000, 0.05, 0.3, 'sine');
    },
  };
}
