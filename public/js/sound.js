// Small game sounds made with the Web Audio API (no audio files). Muted state is per device.
let ctx = null;
let muted = false;
try { muted = localStorage.getItem('muted') === '1'; } catch { /* storage blocked */ }

export const isMuted = () => muted;
export function setMuted(v) {
  muted = !!v;
  try { localStorage.setItem('muted', muted ? '1' : '0'); } catch { /* storage blocked */ }
}

function audio() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

// One soft note: frequency (Hz), start offset and length (seconds).
function note(ac, freq, at, len, { type = 'triangle', vol = 0.18 } = {}) {
  const t0 = ac.currentTime + at;
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.exponentialRampToValueAtTime(vol, t0 + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + len);
  osc.connect(gain).connect(ac.destination);
  osc.start(t0);
  osc.stop(t0 + len + 0.05);
}

const SONGS = {
  tap: [[880, 0, 0.07, { type: 'sine', vol: 0.08 }]],
  star: [[784, 0, 0.12], [1047, 0.08, 0.14], [1319, 0.16, 0.28]],
  sent: [[659, 0, 0.12], [880, 0.1, 0.22]],
  level: [[523, 0, 0.14], [659, 0.12, 0.14], [784, 0.24, 0.14], [1047, 0.36, 0.45, { vol: 0.22 }]],
  unlock: [[392, 0, 0.18], [523, 0.16, 0.18], [659, 0.32, 0.18], [784, 0.48, 0.2], [1047, 0.66, 0.7, { vol: 0.24 }], [1319, 0.66, 0.7, { type: 'sine', vol: 0.1 }]],
  error: [[220, 0, 0.18, { type: 'square', vol: 0.06 }], [196, 0.14, 0.22, { type: 'square', vol: 0.06 }]],
};

export function play(name) {
  if (muted) return;
  try {
    const ac = audio();
    if (!ac) return;
    for (const [f, at, len, opts] of SONGS[name] || []) note(ac, f, at, len, opts);
  } catch { /* audio not available */ }
}
