// Sound, vibration and a screen that stays on, for a live run. Every cue
// fails quietly: a phone without vibration or audio still times the run.
// iPhones ignore vibration; the sounds carry the same information.
let ctx = null;

// Call from a tap: browsers only start audio after a user gesture.
export function unlockAudio() {
  try {
    ctx ??= new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === "suspended") ctx.resume();
  } catch {
    ctx = null;
  }
}

function tone(freq, start, length, type = "sine", volume = 0.25) {
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.value = freq;
  const t = ctx.currentTime + start;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(volume, t + 0.015);
  g.gain.exponentialRampToValueAtTime(0.0001, t + length);
  o.connect(g).connect(ctx.destination);
  o.start(t);
  o.stop(t + length + 0.02);
}

const SOUNDS = {
  count: () => tone(660, 0, 0.14),
  go: () => tone(990, 0, 0.45),
  pass: () => tone(1046, 0, 0.12),
  fail: () => tone(196, 0, 0.32, "square", 0.12),
  skip: () => tone(523, 0, 0.1, "triangle"),
  warn: () => {
    tone(740, 0, 0.12);
    tone(740, 0.18, 0.12);
  },
  end: () => tone(147, 0, 0.7, "sawtooth", 0.12),
  finish: () => {
    tone(784, 0, 0.14);
    tone(988, 0.14, 0.14);
    tone(1318, 0.28, 0.32);
  },
};

const BUZZ = {
  count: 30,
  go: 120,
  pass: 40,
  fail: [80, 60, 80],
  skip: 25,
  warn: [50, 80, 50],
  end: 400,
  finish: [60, 60, 60, 60, 160],
};

export function cue(name, { sound = true, haptics = true } = {}) {
  if (sound && ctx) {
    try {
      SOUNDS[name]();
    } catch {}
  }
  if (haptics) {
    try {
      navigator.vibrate?.(BUZZ[name]);
    } catch {}
  }
}

// Keeps the screen awake for the run; returns a release function.
export async function keepAwake() {
  try {
    const lock = await navigator.wakeLock?.request("screen");
    return () => lock?.release().catch(() => {});
  } catch {
    return () => {};
  }
}
