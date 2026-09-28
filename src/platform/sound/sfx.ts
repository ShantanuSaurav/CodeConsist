/* ==========================================================================
   Sound effects: short tones synthesized with WebAudio - no audio files, no
   licences, a few hundred bytes.

   The AudioContext is created lazily, on the first sound actually played
   (which always follows a click, so autoplay rules are satisfied), and
   resumed if the browser suspended it. Without WebAudio - an old browser,
   a test runner, a locked-down profile - every call is a silent no-op. A
   muted learner never causes a context to be built at all.

   Sound is never the only signal: every event it marks is also on screen.
   ========================================================================== */
import type { SfxEvent } from '../settings/types';

interface Tone {
  /** Hz. */
  freq: number;
  /** Seconds after the event starts. */
  at: number;
  /** Seconds. */
  dur: number;
  type?: OscillatorType;
  /** Relative loudness of this tone, 0-1. */
  gain?: number;
  /** Glide to this frequency over the tone. */
  slideTo?: number;
}

/** The notes of each event. Kept quiet and short - a lesson is not an arcade. */
const PATTERNS: Record<SfxEvent, Tone[]> = {
  // A bright rising fifth.
  correct: [
    { freq: 659.25, at: 0, dur: 0.09, type: 'sine' },
    { freq: 987.77, at: 0.08, dur: 0.16, type: 'sine' }
  ],
  // A soft falling blip - not a buzzer.
  wrong: [{ freq: 260, at: 0, dur: 0.2, type: 'triangle', gain: 0.8, slideTo: 190 }],
  // A major arpeggio.
  unitComplete: [
    { freq: 523.25, at: 0, dur: 0.12 },
    { freq: 659.25, at: 0.1, dur: 0.12 },
    { freq: 783.99, at: 0.2, dur: 0.12 },
    { freq: 1046.5, at: 0.3, dur: 0.3 }
  ],
  // A fanfare-ish climb.
  levelUp: [
    { freq: 392, at: 0, dur: 0.12, type: 'triangle' },
    { freq: 523.25, at: 0.12, dur: 0.12, type: 'triangle' },
    { freq: 659.25, at: 0.24, dur: 0.12, type: 'triangle' },
    { freq: 783.99, at: 0.36, dur: 0.4, type: 'triangle' },
    { freq: 1046.5, at: 0.36, dur: 0.4, type: 'sine', gain: 0.5 }
  ],
  // Two sparkling notes.
  badge: [
    { freq: 1318.5, at: 0, dur: 0.1 },
    { freq: 1760, at: 0.09, dur: 0.22 }
  ]
};

type AudioContextCtor = new () => AudioContext;

let context: AudioContext | null = null;
let unavailable = false;

function audioContext(): AudioContext | null {
  if (context) return context;
  if (unavailable) return null;
  try {
    const scope = globalThis as unknown as { AudioContext?: AudioContextCtor; webkitAudioContext?: AudioContextCtor };
    // Safari before 14.1 only has the prefixed constructor.
    const Ctor = scope.AudioContext ?? scope.webkitAudioContext;
    if (typeof Ctor !== 'function') {
      unavailable = true;
      return null;
    }
    context = new Ctor();
    return context;
  } catch {
    unavailable = true;
    return null;
  }
}

export interface SfxOptions {
  /** 0-1 (`celebrations.sound.volume`). */
  volume?: number;
  /** False when the learner muted sound, or this event is switched off: nothing happens, no context is built. */
  enabled?: boolean;
}

/**
 * Play one event. Returns whether anything was scheduled - never throws.
 */
export function playSfx(event: SfxEvent, options: SfxOptions = {}): boolean {
  if (options.enabled === false) return false;
  const volume = Math.max(0, Math.min(1, Number(options.volume ?? 0.5) || 0));
  if (volume <= 0) return false;
  const pattern = PATTERNS[event];
  if (!pattern) return false;
  const ctx = audioContext();
  if (!ctx) return false;
  try {
    if (ctx.state === 'suspended') void ctx.resume().catch(() => {});
    const start = ctx.currentTime + 0.01;
    const master = ctx.createGain();
    // A quarter of full scale at volume 1: these are cues, not music.
    master.gain.value = volume * 0.25;
    master.connect(ctx.destination);
    for (const tone of pattern) {
      const osc = ctx.createOscillator();
      const env = ctx.createGain();
      osc.type = tone.type ?? 'sine';
      const t0 = start + tone.at;
      const t1 = t0 + tone.dur;
      osc.frequency.setValueAtTime(tone.freq, t0);
      if (tone.slideTo) osc.frequency.exponentialRampToValueAtTime(tone.slideTo, t1);
      // A quick attack and a smooth release, so nothing clicks.
      env.gain.setValueAtTime(0.0001, t0);
      env.gain.exponentialRampToValueAtTime(Math.max(0.0002, tone.gain ?? 1), t0 + 0.012);
      env.gain.exponentialRampToValueAtTime(0.0001, t1);
      osc.connect(env);
      env.connect(master);
      osc.start(t0);
      osc.stop(t1 + 0.02);
    }
    return true;
  } catch {
    return false;
  }
}

/** Whether a context has been built yet (for tests). */
export function sfxContextBuilt(): boolean {
  return context !== null;
}

/** Forget the context and the "unavailable" verdict (for tests). */
export function resetSfx(): void {
  context = null;
  unavailable = false;
}
