import { afterEach, describe, expect, it } from 'vitest';
import { playSfx, resetSfx, sfxContextBuilt } from '../sfx';

/** A minimal stand-in for WebAudio that counts what it is asked to do. */
function fakeAudio() {
  const log = { contexts: 0, oscillators: 0, resumed: 0 };
  const param = () => ({ value: 0, setValueAtTime() {}, exponentialRampToValueAtTime() {} });
  const node = () => ({ connect() {}, gain: param() });
  class FakeContext {
    state = 'suspended';
    currentTime = 0;
    destination = {};
    constructor() {
      log.contexts += 1;
    }
    resume() {
      log.resumed += 1;
      return Promise.resolve();
    }
    createGain() {
      return node();
    }
    createOscillator() {
      log.oscillators += 1;
      return { ...node(), type: 'sine', frequency: param(), start() {}, stop() {} };
    }
  }
  return { log, FakeContext };
}

const scope = globalThis as Record<string, unknown>;

afterEach(() => {
  delete scope.AudioContext;
  delete scope.webkitAudioContext;
  resetSfx();
});

describe('playSfx', () => {
  it('is a silent no-op without WebAudio (the node test runner has none)', () => {
    expect(() => playSfx('correct')).not.toThrow();
    expect(playSfx('unitComplete', { volume: 1 })).toBe(false);
    expect(sfxContextBuilt()).toBe(false);
  });

  it('never builds a context while muted, or at volume 0', () => {
    const { log, FakeContext } = fakeAudio();
    scope.AudioContext = FakeContext;
    expect(playSfx('correct', { enabled: false })).toBe(false);
    expect(playSfx('levelUp', { volume: 0 })).toBe(false);
    expect(log.contexts).toBe(0);
    expect(sfxContextBuilt()).toBe(false);
  });

  it('builds one context lazily, resumes it when suspended, and reuses it', () => {
    const { log, FakeContext } = fakeAudio();
    scope.AudioContext = FakeContext;
    expect(playSfx('correct', { volume: 0.5 })).toBe(true);
    expect(playSfx('badge', { volume: 0.5 })).toBe(true);
    expect(log.contexts).toBe(1);
    expect(log.resumed).toBeGreaterThan(0);
    expect(log.oscillators).toBeGreaterThan(2);
  });

  it('falls back to the prefixed webkitAudioContext', () => {
    const { log, FakeContext } = fakeAudio();
    scope.webkitAudioContext = FakeContext;
    expect(playSfx('wrong')).toBe(true);
    expect(log.contexts).toBe(1);
  });

  it('swallows a constructor that throws', () => {
    scope.AudioContext = class {
      constructor() {
        throw new Error('blocked');
      }
    };
    expect(() => playSfx('correct')).not.toThrow();
    expect(playSfx('correct')).toBe(false);
  });
});
