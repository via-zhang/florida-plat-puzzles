/**
 * Synthesized sound effects. The AudioContext is created on the first sound.
 */
let ctx: AudioContext | null = null;
let enabled = true;

export const setSoundEnabled = (on: boolean) => (enabled = on);

function audio(): AudioContext | null {
  if (!enabled || typeof window === 'undefined') return null;
  try {
    ctx ??= new AudioContext();
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

/** Short wooden "click": a filtered noise tick plus a low knock. */
export function click(strength = 1) {
  const a = audio();
  if (!a) return;
  const t = a.currentTime;
  const len = Math.floor(a.sampleRate * 0.03);
  const buf = a.createBuffer(1, len, a.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 3;
  const noise = a.createBufferSource();
  noise.buffer = buf;
  const bp = a.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = 2400;
  bp.Q.value = 1.2;
  const ng = a.createGain();
  ng.gain.value = 0.35 * strength;
  noise.connect(bp).connect(ng).connect(a.destination);
  noise.start(t);

  const osc = a.createOscillator();
  osc.type = 'triangle';
  osc.frequency.setValueAtTime(320, t);
  osc.frequency.exponentialRampToValueAtTime(140, t + 0.06);
  const og = a.createGain();
  og.gain.setValueAtTime(0.25 * strength, t);
  og.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
  osc.connect(og).connect(a.destination);
  osc.start(t);
  osc.stop(t + 0.09);
}

/** A soft tick for ordinary moves. */
export const tick = () => click(0.35);

/** Little rising chime for a solved puzzle. */
export function chime() {
  const a = audio();
  if (!a) return;
  const t = a.currentTime;
  [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => {
    const o = a.createOscillator();
    o.type = 'sine';
    o.frequency.value = f;
    const g = a.createGain();
    const s = t + i * 0.09;
    g.gain.setValueAtTime(0.0001, s);
    g.gain.exponentialRampToValueAtTime(0.18, s + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, s + 0.5);
    o.connect(g).connect(a.destination);
    o.start(s);
    o.stop(s + 0.55);
  });
}
