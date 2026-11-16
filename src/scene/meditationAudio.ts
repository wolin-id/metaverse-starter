/**
 * Contemplative Web Audio API Singing-Bowl & Lunar Harmonics Synthesizer (`달멍 · 명상`).
 *
 * Strictly user-gesture gated: creates/resumes `AudioContext` only after an explicit click
 * on Meditate or Mute/Unmute, and fails gracefully in SSR or headless environments.
 */

export interface MeditationAudioController {
  start: () => void;
  stop: () => void;
  setMuted: (muted: boolean) => void;
  isMuted: () => boolean;
  isRunning: () => boolean;
  dispose: () => void;
}

type AudioContextConstructor = typeof AudioContext;

function resolveAudioContextConstructor(): AudioContextConstructor | null {
  if (typeof globalThis === 'undefined') return null;
  const g = globalThis as typeof globalThis & {
    AudioContext?: AudioContextConstructor;
    webkitAudioContext?: AudioContextConstructor;
  };
  return g.AudioContext ?? g.webkitAudioContext ?? null;
}

export function createMeditationAudioController(): MeditationAudioController {
  let ctx: AudioContext | null = null;
  let masterGain: GainNode | null = null;
  let droneNodes: Array<OscillatorNode | GainNode> = [];
  let bowlTimer: number | null = null;
  let active = false;
  let muted = false;

  const clearBowlTimer = () => {
    if (bowlTimer !== null && typeof window !== 'undefined') {
      window.clearInterval(bowlTimer);
      bowlTimer = null;
    }
  };

  const strikeSingingBowl = () => {
    if (!ctx || !masterGain || muted || !active) return;
    const now = ctx.currentTime;

    // Warm bronze temple singing bowl partials (tuned around 216 Hz / 432 Hz)
    const partials: Array<{ freq: number; gain: number; decay: number }> = [
      { freq: 216, gain: 0.11, decay: 6.8 },
      { freq: 216.6, gain: 0.065, decay: 6.4 }, // Gentle ~0.6Hz acoustic beating shimmer
      { freq: 596.4, gain: 0.042, decay: 4.6 },
      { freq: 1108.8, gain: 0.018, decay: 3.1 },
    ];

    for (const partial of partials) {
      const osc = ctx.createOscillator();
      const env = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(partial.freq, now);

      env.gain.setValueAtTime(0.0001, now);
      env.gain.linearRampToValueAtTime(partial.gain, now + 0.08);
      env.gain.exponentialRampToValueAtTime(0.0001, now + partial.decay);

      osc.connect(env);
      env.connect(masterGain);
      osc.start(now);
      osc.stop(now + partial.decay + 0.1);
    }
  };

  const ensureContextAndDrone = () => {
    if (ctx) return;
    const Ctor = resolveAudioContextConstructor();
    if (!Ctor) return;

    try {
      ctx = new Ctor();
      masterGain = ctx.createGain();
      masterGain.gain.setValueAtTime(0.0001, ctx.currentTime);
      masterGain.connect(ctx.destination);

      // Subtle warm sub-harmonic pad underneath the singing bowl
      const padFreqs = [108, 162, 216];
      for (const freq of padFreqs) {
        const osc = ctx.createOscillator();
        const padGain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, ctx.currentTime);
        padGain.gain.setValueAtTime(freq === 108 ? 0.028 : 0.014, ctx.currentTime);
        osc.connect(padGain);
        padGain.connect(masterGain);
        osc.start();
        droneNodes.push(osc, padGain);
      }
    } catch {
      ctx = null;
      masterGain = null;
    }
  };

  const syncMasterVolume = () => {
    if (!ctx || !masterGain) return;
    const now = ctx.currentTime;
    const target = active && !muted ? 0.72 : 0.0001;
    masterGain.gain.cancelScheduledValues(now);
    masterGain.gain.setValueAtTime(Math.max(0.0001, masterGain.gain.value), now);
    masterGain.gain.exponentialRampToValueAtTime(target, now + 0.45);
  };

  return {
    start() {
      active = true;
      ensureContextAndDrone();
      if (ctx && ctx.state === 'suspended') {
        void ctx.resume().catch(() => undefined);
      }
      syncMasterVolume();
      strikeSingingBowl();
      clearBowlTimer();
      if (typeof window !== 'undefined') {
        bowlTimer = window.setInterval(() => {
          strikeSingingBowl();
        }, 8800);
      }
    },

    stop() {
      active = false;
      clearBowlTimer();
      syncMasterVolume();
    },

    setMuted(nextMuted: boolean) {
      muted = nextMuted;
      if (active && !muted && ctx && ctx.state === 'suspended') {
        void ctx.resume().catch(() => undefined);
      }
      syncMasterVolume();
      if (active && !muted) {
        strikeSingingBowl();
      }
    },

    isMuted() {
      return muted;
    },

    isRunning() {
      return active;
    },

    dispose() {
      active = false;
      clearBowlTimer();
      for (const node of droneNodes) {
        try {
          if ('stop' in node) node.stop();
          node.disconnect();
        } catch {
          // Ignore already stopped audio nodes
        }
      }
      droneNodes = [];
      if (ctx) {
        void ctx.close().catch(() => undefined);
        ctx = null;
      }
      masterGain = null;
    },
  };
}
