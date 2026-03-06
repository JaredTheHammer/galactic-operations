/**
 * Audio Manager - Synthesized Sound Effects
 *
 * Generates all game sounds procedurally using Web Audio API.
 * No external audio files required. Star Wars-inspired sci-fi synthesis.
 */

type SoundName =
  | 'blasterFire'
  | 'blasterHeavy'
  | 'hit'
  | 'miss'
  | 'defeat'
  | 'heroWounded'
  | 'move'
  | 'victory'
  | 'missionFailed'
  | 'uiClick'
  | 'uiBack'
  | 'uiConfirm'
  | 'phaseChange'
  | 'reinforcement'
  | 'objectiveComplete'
  | 'diceRoll'
  | 'triumph'
  | 'despair'
  | 'shopBuy'
  | 'shopSell'
  | 'socialSuccess'
  | 'socialFailure'
  | 'screenTransition'
  | 'xpGain';

export type { SoundName };

let audioCtx: AudioContext | null = null;
let masterGain: GainNode | null = null;
let sfxGain: GainNode | null = null;
let _masterVolume = 0.5;
let _sfxVolume = 0.7;
let _muted = false;

function getContext(): AudioContext {
  if (!audioCtx) {
    audioCtx = new AudioContext();
    masterGain = audioCtx.createGain();
    masterGain.gain.value = _muted ? 0 : _masterVolume;
    masterGain.connect(audioCtx.destination);

    sfxGain = audioCtx.createGain();
    sfxGain.gain.value = _sfxVolume;
    sfxGain.connect(masterGain);
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
  return audioCtx;
}

function getSfxOutput(): GainNode {
  getContext();
  return sfxGain!;
}

// --- Volume controls ---

export function setMasterVolume(v: number): void {
  _masterVolume = Math.max(0, Math.min(1, v));
  if (masterGain) masterGain.gain.value = _muted ? 0 : _masterVolume;
}

export function setSfxVolume(v: number): void {
  _sfxVolume = Math.max(0, Math.min(1, v));
  if (sfxGain) sfxGain.gain.value = _sfxVolume;
}

export function setMuted(m: boolean): void {
  _muted = m;
  if (masterGain) masterGain.gain.value = m ? 0 : _masterVolume;
}

export function getMasterVolume(): number { return _masterVolume; }
export function getSfxVolume(): number { return _sfxVolume; }
export function isMuted(): boolean { return _muted; }

// --- Utility synthesis helpers ---

function noise(ctx: AudioContext, duration: number, output: AudioNode): AudioBufferSourceNode {
  const buf = ctx.createBuffer(1, ctx.sampleRate * duration, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.connect(output);
  return src;
}

function osc(
  ctx: AudioContext,
  type: OscillatorType,
  freq: number,
  output: AudioNode,
): OscillatorNode {
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.value = freq;
  o.connect(output);
  return o;
}

function envelope(
  ctx: AudioContext,
  attack: number,
  decay: number,
  sustain: number,
  release: number,
  peak: number = 1,
): GainNode {
  const g = ctx.createGain();
  const t = ctx.currentTime;
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(peak, t + attack);
  g.gain.linearRampToValueAtTime(sustain * peak, t + attack + decay);
  g.gain.linearRampToValueAtTime(0, t + attack + decay + release);
  return g;
}

// --- Sound definitions ---

function playBlasterFire(): void {
  const ctx = getContext();
  const out = getSfxOutput();
  const env = envelope(ctx, 0.001, 0.03, 0.3, 0.08, 0.4);
  env.connect(out);

  const o = osc(ctx, 'sawtooth', 900, env);
  o.frequency.exponentialRampToValueAtTime(200, ctx.currentTime + 0.12);
  o.start();
  o.stop(ctx.currentTime + 0.15);

  // Noise burst
  const nEnv = envelope(ctx, 0.001, 0.02, 0.1, 0.04, 0.15);
  nEnv.connect(out);
  const filter = ctx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = 2000;
  filter.Q.value = 2;
  filter.connect(nEnv);
  const n = noise(ctx, 0.08, filter);
  n.start();
  n.stop(ctx.currentTime + 0.08);
}

function playBlasterHeavy(): void {
  const ctx = getContext();
  const out = getSfxOutput();
  const env = envelope(ctx, 0.001, 0.05, 0.4, 0.15, 0.5);
  env.connect(out);

  const o = osc(ctx, 'sawtooth', 600, env);
  o.frequency.exponentialRampToValueAtTime(80, ctx.currentTime + 0.2);
  o.start();
  o.stop(ctx.currentTime + 0.25);

  const nEnv = envelope(ctx, 0.001, 0.03, 0.2, 0.1, 0.2);
  nEnv.connect(out);
  const n = noise(ctx, 0.15, nEnv);
  n.start();
  n.stop(ctx.currentTime + 0.15);
}

function playHit(): void {
  const ctx = getContext();
  const out = getSfxOutput();

  // Low thump
  const env = envelope(ctx, 0.001, 0.04, 0.2, 0.1, 0.5);
  env.connect(out);
  const o = osc(ctx, 'sine', 80, env);
  o.frequency.exponentialRampToValueAtTime(40, ctx.currentTime + 0.15);
  o.start();
  o.stop(ctx.currentTime + 0.2);

  // Crackle
  const nEnv = envelope(ctx, 0.001, 0.02, 0.1, 0.05, 0.2);
  nEnv.connect(out);
  const n = noise(ctx, 0.08, nEnv);
  n.start();
  n.stop(ctx.currentTime + 0.08);
}

function playMiss(): void {
  const ctx = getContext();
  const out = getSfxOutput();
  const env = envelope(ctx, 0.001, 0.02, 0.1, 0.06, 0.15);
  env.connect(out);

  // Quick whizz
  const o = osc(ctx, 'sine', 1200, env);
  o.frequency.exponentialRampToValueAtTime(600, ctx.currentTime + 0.1);
  o.start();
  o.stop(ctx.currentTime + 0.12);
}

function playDefeat(): void {
  const ctx = getContext();
  const out = getSfxOutput();

  // Falling tone
  const env = envelope(ctx, 0.001, 0.1, 0.3, 0.3, 0.4);
  env.connect(out);
  const o = osc(ctx, 'triangle', 400, env);
  o.frequency.exponentialRampToValueAtTime(60, ctx.currentTime + 0.5);
  o.start();
  o.stop(ctx.currentTime + 0.6);

  // Noise
  const nEnv = envelope(ctx, 0.01, 0.1, 0.1, 0.2, 0.15);
  nEnv.connect(out);
  const n = noise(ctx, 0.4, nEnv);
  n.start();
  n.stop(ctx.currentTime + 0.4);
}

function playHeroWounded(): void {
  const ctx = getContext();
  const out = getSfxOutput();

  // Alarm-like two-tone
  const env = envelope(ctx, 0.001, 0.05, 0.6, 0.2, 0.35);
  env.connect(out);
  const o = osc(ctx, 'square', 440, env);
  const t = ctx.currentTime;
  o.frequency.setValueAtTime(440, t);
  o.frequency.setValueAtTime(330, t + 0.15);
  o.frequency.setValueAtTime(440, t + 0.3);
  o.frequency.setValueAtTime(330, t + 0.45);
  o.start();
  o.stop(t + 0.6);
}

function playMove(): void {
  const ctx = getContext();
  const out = getSfxOutput();
  const env = envelope(ctx, 0.001, 0.01, 0.1, 0.03, 0.08);
  env.connect(out);

  const o = osc(ctx, 'sine', 300, env);
  o.frequency.exponentialRampToValueAtTime(200, ctx.currentTime + 0.05);
  o.start();
  o.stop(ctx.currentTime + 0.06);
}

function playVictory(): void {
  const ctx = getContext();
  const out = getSfxOutput();

  // Rising arpeggio: C5, E5, G5, C6
  const notes = [523, 659, 784, 1047];
  notes.forEach((freq, i) => {
    const delay = i * 0.12;
    const env = envelope(ctx, 0.001, 0.05, 0.4, 0.2, 0.3);
    env.connect(out);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, ctx.currentTime + delay);
    g.gain.linearRampToValueAtTime(0.3, ctx.currentTime + delay + 0.001);
    g.gain.linearRampToValueAtTime(0, ctx.currentTime + delay + 0.4);
    g.connect(out);
    const o = osc(ctx, 'triangle', freq, g);
    o.start(ctx.currentTime + delay);
    o.stop(ctx.currentTime + delay + 0.4);
  });
}

function playMissionFailed(): void {
  const ctx = getContext();
  const out = getSfxOutput();

  // Descending minor: C5, Eb5, G4, C4
  const notes = [523, 311, 261, 196];
  notes.forEach((freq, i) => {
    const delay = i * 0.18;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, ctx.currentTime + delay);
    g.gain.linearRampToValueAtTime(0.25, ctx.currentTime + delay + 0.001);
    g.gain.linearRampToValueAtTime(0, ctx.currentTime + delay + 0.5);
    g.connect(out);
    const o = osc(ctx, 'triangle', freq, g);
    o.start(ctx.currentTime + delay);
    o.stop(ctx.currentTime + delay + 0.5);
  });
}

function playUiClick(): void {
  const ctx = getContext();
  const out = getSfxOutput();
  const env = envelope(ctx, 0.001, 0.01, 0.1, 0.02, 0.12);
  env.connect(out);
  const o = osc(ctx, 'sine', 1200, env);
  o.start();
  o.stop(ctx.currentTime + 0.04);
}

function playUiBack(): void {
  const ctx = getContext();
  const out = getSfxOutput();
  const env = envelope(ctx, 0.001, 0.02, 0.1, 0.04, 0.1);
  env.connect(out);
  const o = osc(ctx, 'sine', 800, env);
  o.frequency.exponentialRampToValueAtTime(500, ctx.currentTime + 0.06);
  o.start();
  o.stop(ctx.currentTime + 0.08);
}

function playUiConfirm(): void {
  const ctx = getContext();
  const out = getSfxOutput();

  // Two quick ascending tones
  [800, 1100].forEach((freq, i) => {
    const delay = i * 0.06;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, ctx.currentTime + delay);
    g.gain.linearRampToValueAtTime(0.15, ctx.currentTime + delay + 0.001);
    g.gain.linearRampToValueAtTime(0, ctx.currentTime + delay + 0.08);
    g.connect(out);
    const o = osc(ctx, 'sine', freq, g);
    o.start(ctx.currentTime + delay);
    o.stop(ctx.currentTime + delay + 0.08);
  });
}

function playPhaseChange(): void {
  const ctx = getContext();
  const out = getSfxOutput();

  // Two-tone chime
  [660, 880].forEach((freq, i) => {
    const delay = i * 0.1;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, ctx.currentTime + delay);
    g.gain.linearRampToValueAtTime(0.2, ctx.currentTime + delay + 0.001);
    g.gain.linearRampToValueAtTime(0, ctx.currentTime + delay + 0.3);
    g.connect(out);
    const o = osc(ctx, 'sine', freq, g);
    o.start(ctx.currentTime + delay);
    o.stop(ctx.currentTime + delay + 0.3);
  });
}

function playReinforcement(): void {
  const ctx = getContext();
  const out = getSfxOutput();

  // Ominous low pulse
  const env = envelope(ctx, 0.01, 0.1, 0.3, 0.3, 0.25);
  env.connect(out);
  const o = osc(ctx, 'sawtooth', 100, env);
  o.frequency.linearRampToValueAtTime(150, ctx.currentTime + 0.2);
  o.frequency.linearRampToValueAtTime(80, ctx.currentTime + 0.5);
  o.start();
  o.stop(ctx.currentTime + 0.6);
}

function playObjectiveComplete(): void {
  const ctx = getContext();
  const out = getSfxOutput();

  // Bright ascending chime
  [880, 1100, 1320].forEach((freq, i) => {
    const delay = i * 0.08;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, ctx.currentTime + delay);
    g.gain.linearRampToValueAtTime(0.2, ctx.currentTime + delay + 0.001);
    g.gain.linearRampToValueAtTime(0, ctx.currentTime + delay + 0.25);
    g.connect(out);
    const o = osc(ctx, 'triangle', freq, g);
    o.start(ctx.currentTime + delay);
    o.stop(ctx.currentTime + delay + 0.25);
  });
}

function playDiceRoll(): void {
  const ctx = getContext();
  const out = getSfxOutput();

  // Rapid noise bursts (rattling dice)
  for (let i = 0; i < 4; i++) {
    const delay = i * 0.04;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, ctx.currentTime + delay);
    g.gain.linearRampToValueAtTime(0.08, ctx.currentTime + delay + 0.005);
    g.gain.linearRampToValueAtTime(0, ctx.currentTime + delay + 0.03);
    g.connect(out);
    const filter = ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = 3000;
    filter.connect(g);
    const n = noise(ctx, 0.03, filter);
    n.start(ctx.currentTime + delay);
    n.stop(ctx.currentTime + delay + 0.03);
  }
}

function playTriumph(): void {
  const ctx = getContext();
  const out = getSfxOutput();

  // Bright triumphant hit
  const env = envelope(ctx, 0.001, 0.02, 0.5, 0.3, 0.3);
  env.connect(out);
  const o = osc(ctx, 'triangle', 880, env);
  o.start();
  o.stop(ctx.currentTime + 0.4);

  const o2env = envelope(ctx, 0.001, 0.02, 0.5, 0.3, 0.2);
  o2env.connect(out);
  const o2 = osc(ctx, 'triangle', 1320, o2env);
  o2.start();
  o2.stop(ctx.currentTime + 0.4);
}

function playDespair(): void {
  const ctx = getContext();
  const out = getSfxOutput();

  // Dark descending hit
  const env = envelope(ctx, 0.001, 0.05, 0.3, 0.3, 0.3);
  env.connect(out);
  const o = osc(ctx, 'sawtooth', 200, env);
  o.frequency.exponentialRampToValueAtTime(50, ctx.currentTime + 0.4);
  o.start();
  o.stop(ctx.currentTime + 0.5);
}

function playShopBuy(): void {
  const ctx = getContext();
  const out = getSfxOutput();

  // Credits clink
  [1400, 1800, 1600].forEach((freq, i) => {
    const delay = i * 0.05;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, ctx.currentTime + delay);
    g.gain.linearRampToValueAtTime(0.1, ctx.currentTime + delay + 0.001);
    g.gain.linearRampToValueAtTime(0, ctx.currentTime + delay + 0.06);
    g.connect(out);
    const o = osc(ctx, 'sine', freq, g);
    o.start(ctx.currentTime + delay);
    o.stop(ctx.currentTime + delay + 0.06);
  });
}

function playShopSell(): void {
  const ctx = getContext();
  const out = getSfxOutput();
  // Reverse clink
  [1600, 1800, 1400].forEach((freq, i) => {
    const delay = i * 0.05;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, ctx.currentTime + delay);
    g.gain.linearRampToValueAtTime(0.08, ctx.currentTime + delay + 0.001);
    g.gain.linearRampToValueAtTime(0, ctx.currentTime + delay + 0.06);
    g.connect(out);
    const o = osc(ctx, 'sine', freq, g);
    o.start(ctx.currentTime + delay);
    o.stop(ctx.currentTime + delay + 0.06);
  });
}

function playSocialSuccess(): void {
  const ctx = getContext();
  const out = getSfxOutput();
  // Warm ascending
  [440, 554, 659].forEach((freq, i) => {
    const delay = i * 0.1;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, ctx.currentTime + delay);
    g.gain.linearRampToValueAtTime(0.15, ctx.currentTime + delay + 0.001);
    g.gain.linearRampToValueAtTime(0, ctx.currentTime + delay + 0.25);
    g.connect(out);
    const o = osc(ctx, 'triangle', freq, g);
    o.start(ctx.currentTime + delay);
    o.stop(ctx.currentTime + delay + 0.25);
  });
}

function playSocialFailure(): void {
  const ctx = getContext();
  const out = getSfxOutput();
  // Descending minor
  [440, 370, 330].forEach((freq, i) => {
    const delay = i * 0.12;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, ctx.currentTime + delay);
    g.gain.linearRampToValueAtTime(0.12, ctx.currentTime + delay + 0.001);
    g.gain.linearRampToValueAtTime(0, ctx.currentTime + delay + 0.25);
    g.connect(out);
    const o = osc(ctx, 'triangle', freq, g);
    o.start(ctx.currentTime + delay);
    o.stop(ctx.currentTime + delay + 0.25);
  });
}

function playScreenTransition(): void {
  const ctx = getContext();
  const out = getSfxOutput();
  // Filtered noise swoosh
  const env = envelope(ctx, 0.01, 0.08, 0.2, 0.1, 0.1);
  env.connect(out);
  const filter = ctx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = 800;
  filter.frequency.exponentialRampToValueAtTime(3000, ctx.currentTime + 0.2);
  filter.Q.value = 1;
  filter.connect(env);
  const n = noise(ctx, 0.25, filter);
  n.start();
  n.stop(ctx.currentTime + 0.25);
}

function playXpGain(): void {
  const ctx = getContext();
  const out = getSfxOutput();
  // Quick rising sparkle
  [600, 900, 1200].forEach((freq, i) => {
    const delay = i * 0.04;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, ctx.currentTime + delay);
    g.gain.linearRampToValueAtTime(0.1, ctx.currentTime + delay + 0.001);
    g.gain.linearRampToValueAtTime(0, ctx.currentTime + delay + 0.08);
    g.connect(out);
    const o = osc(ctx, 'sine', freq, g);
    o.start(ctx.currentTime + delay);
    o.stop(ctx.currentTime + delay + 0.08);
  });
}

// --- Sound dispatch ---

const SOUND_MAP: Record<SoundName, () => void> = {
  blasterFire: playBlasterFire,
  blasterHeavy: playBlasterHeavy,
  hit: playHit,
  miss: playMiss,
  defeat: playDefeat,
  heroWounded: playHeroWounded,
  move: playMove,
  victory: playVictory,
  missionFailed: playMissionFailed,
  uiClick: playUiClick,
  uiBack: playUiBack,
  uiConfirm: playUiConfirm,
  phaseChange: playPhaseChange,
  reinforcement: playReinforcement,
  objectiveComplete: playObjectiveComplete,
  diceRoll: playDiceRoll,
  triumph: playTriumph,
  despair: playDespair,
  shopBuy: playShopBuy,
  shopSell: playShopSell,
  socialSuccess: playSocialSuccess,
  socialFailure: playSocialFailure,
  screenTransition: playScreenTransition,
  xpGain: playXpGain,
};

export function playSound(name: SoundName): void {
  if (_muted) return;
  try {
    SOUND_MAP[name]();
  } catch {
    // Silently ignore audio errors (e.g., AudioContext not allowed)
  }
}

/**
 * Resume AudioContext after user interaction.
 * Browsers require a user gesture before audio can play.
 */
export function unlockAudio(): void {
  try {
    getContext();
  } catch {
    // Ignore
  }
}
