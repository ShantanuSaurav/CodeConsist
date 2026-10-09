/**
 * Editable site copy: `{tokens}` filled from what is known, left out (never
 * printed as "{name}") when a value is missing, and the defaults read the
 * way the app read before copy was editable.
 */
import { describe, expect, it } from 'vitest';
import { fillCopy, refreshProductCopy, tokensIn } from '../copy';
import { DEFAULT_SETTINGS } from '../defaults';
import { SETTING_META } from '../meta';
import { publicSettings } from '../merge';
import { getCopy, setSettingsSnapshot } from '../store';

describe('fillCopy', () => {
  it('refreshes old shipped landing copy without replacing custom text', () => {
    expect(refreshProductCopy('copy.landing.finalCta', 'Open the first stage. It takes about twenty minutes.')).toBe(DEFAULT_SETTINGS.copy.landing.finalCta);
    expect(refreshProductCopy('landing.finalCta', 'Start your own journey.')).toBe('Start your own journey.');
    expect(refreshProductCopy('copy.landing.heroFootnote', 'Free to start · {freeStages} free stages, {premiumStages} premium · Every stage ends in a coding test')).toBe(DEFAULT_SETTINGS.copy.landing.heroFootnote);
  });

  it('uses consistent practice spelling in cached copy, without changing inserted values', () => {
    expect(refreshProductCopy('offline.auth', 'Practise, practised, practising, PRACTISE.')).toBe('Practice, practiced, practicing, PRACTICE.');
    expect(fillCopy(refreshProductCopy('landing.finalCta', 'Practise with {name}'), { name: 'Practise' })).toBe('Practice with Practise');
  });

  it('fills known tokens', () => {
    expect(fillCopy('Free to start · {freeStages} free stages, {premiumStages} premium', { freeStages: 6, premiumStages: 4 })).toBe(
      'Free to start · 6 free stages, 4 premium'
    );
    expect(fillCopy('{language} runs on the server', { language: 'Java' })).toBe('Java runs on the server');
  });

  it('leaves a missing or empty token out rather than printing it', () => {
    expect(fillCopy('Try again in {minutes} minutes.', {})).toBe('Try again in  minutes.');
    expect(fillCopy('{a}{b}', { a: null, b: undefined })).toBe('');
    // Only own values: nothing on Object.prototype is a token value.
    expect(fillCopy('{toString}{hasOwnProperty}', {})).toBe('');
  });

  it('treats zero as a value', () => {
    expect(fillCopy('{premiumStages} premium', { premiumStages: 0 })).toBe('0 premium');
  });

  it('leaves text that is not a token alone', () => {
    expect(fillCopy('Use {} or {1abc} or { spaced }', { spaced: 'x' })).toBe('Use {} or {1abc} or { spaced }');
  });
});

describe('the copy defaults', () => {
  it('each use only the tokens their setting declares', () => {
    for (const [path, meta] of Object.entries(SETTING_META)) {
      if (!path.startsWith('copy.')) continue;
      const [, group, key] = path.split('.');
      const value = (DEFAULT_SETTINGS.copy as unknown as Record<string, Record<string, string>>)[group][key];
      expect(tokensIn(value).every((token) => (meta.tokens ?? []).includes(token)), path).toBe(true);
    }
  });

  it('are what getCopy hands the app', () => {
    setSettingsSnapshot(publicSettings(DEFAULT_SETTINGS), null);
    expect(getCopy('copy.offline.auth')).toBe(DEFAULT_SETTINGS.copy.offline.auth);
    expect(getCopy('copy.runtime.unavailable', { language: 'C++' })).toBe(
      "C++ can't run here right now - this server has no compiler for it yet. JavaScript and Python work as usual."
    );
    expect(getCopy('copy.meta.description', { lessons: '230+', tests: 12, stages: 12, tracks: 3 })).toContain('230+ bite-sized lessons and 12 stage tests');
  });
});
