// Small synthesized sounds for the physical moments: a card flick, a slip sliding, a stamp, a chime.
// Nothing is downloaded. Audio starts only after the viewer has clicked something.

let ctx: AudioContext | null = null;
let enabled = true;

export function setSoundEnabled(on: boolean) { enabled = on; }
export function unlockAudio() {
  try {
    ctx ??= new AudioContext();
    if (ctx.state === "suspended") void ctx.resume();
  } catch { ctx = null; }
}

function noise(dur: number, freq: number, q: number, gain: number, when = 0) {
  if (!ctx || !enabled || ctx.state !== "running") return;
  const t = ctx.currentTime + when;
  const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.2);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const f = ctx.createBiquadFilter();
  f.type = "bandpass"; f.frequency.value = freq; f.Q.value = q;
  const g = ctx.createGain();
  g.gain.setValueAtTime(gain, t);
  src.connect(f).connect(g).connect(ctx.destination);
  src.start(t);
}

function tone(freq: number, dur: number, gain: number, type: OscillatorType = "sine", when = 0) {
  if (!ctx || !enabled || ctx.state !== "running") return;
  const t = ctx.currentTime + when;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(ctx.destination);
  o.start(t); o.stop(t + dur + 0.05);
}

export const sfx = {
  flick: () => { noise(0.07, 3200, 1.2, 0.35); noise(0.05, 900, 2, 0.25, 0.62); },
  slide: () => noise(0.42, 1400, 0.6, 0.22),
  stamp: () => { tone(70, 0.22, 0.6, "sine"); noise(0.05, 2200, 1, 0.4); },
  tick: () => noise(0.02, 5200, 4, 0.15),
  reject: () => { tone(150, 0.16, 0.25, "square"); tone(118, 0.22, 0.22, "square", 0.17); },
  chime: () => { tone(784, 0.9, 0.18); tone(1175, 1.2, 0.12, "sine", 0.12); },
  end: () => { tone(220, 0.5, 0.25, "triangle"); tone(165, 0.8, 0.22, "triangle", 0.18); noise(0.6, 600, 0.5, 0.3, 0.05); },
  print: () => { for (let i = 0; i < 9; i++) noise(0.03, 2600, 3, 0.12, i * 0.07); },
};
