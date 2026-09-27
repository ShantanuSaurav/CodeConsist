/**
 * The learner's cached rules (`cq-settings-v1`) and the build's defaults.
 *
 * A default changed in code (Phase 2's level curve) does not bump the
 * server's settings revision, and the cache holds whole arrays that would win
 * over the new default. So a cache is only used when it was written under
 * this build's defaults; otherwise it counts as no cache (revision null) and
 * the next revision the server reports refetches.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../api-client/api', () => ({ api: { settings: async () => null } }));

import { DEFAULT_PUBLIC_SETTINGS, settingsFingerprint } from '../../settings/merge';
import { STORAGE_KEYS, remove, writeJson } from '../../storage/storage';
import { FORMULA_LEVEL_CURVE } from '../../xp-leveling/leveling';
import { defaultsFingerprint, readCachedSettings, writeCachedSettings } from '../useSettingsState';

/** Rules served under the Phase 1 defaults: the formula curve (40 levels, then 4000 XP a level). */
const formulaCurve = FORMULA_LEVEL_CURVE.thresholds;
const phase1Settings = {
  ...DEFAULT_PUBLIC_SETTINGS,
  levels: { ...DEFAULT_PUBLIC_SETTINGS.levels, thresholds: [...formulaCurve], overflowStep: FORMULA_LEVEL_CURVE.overflowStep }
};

beforeEach(() => remove(STORAGE_KEYS.settings));

describe('the cached settings', () => {
  it('fingerprints this build’s defaults, stably', () => {
    expect(defaultsFingerprint()).toBe(settingsFingerprint(DEFAULT_PUBLIC_SETTINGS));
    expect(settingsFingerprint(phase1Settings)).not.toBe(defaultsFingerprint());
    expect(settingsFingerprint({ a: 1 })).toBe(settingsFingerprint({ a: 1 }));
  });

  it('are used when written under this build’s defaults', () => {
    writeCachedSettings({ settings: phase1Settings, revision: 3 });
    const read = readCachedSettings();
    expect(read.revision).toBe(3);
    // An admin's own curve (the served rules) is kept as it was served.
    expect(read.settings.levels.thresholds).toEqual(formulaCurve);
  });

  it('are not used when written under other defaults at the same revision', () => {
    writeJson(STORAGE_KEYS.settings, { revision: 3, settings: phase1Settings, defaults: settingsFingerprint(phase1Settings) });
    const read = readCachedSettings();
    expect(read.revision).toBeNull();
    expect(read.settings.levels.thresholds).toEqual(DEFAULT_PUBLIC_SETTINGS.levels.thresholds);
    expect(read.settings.levels.overflowStep).toBe(DEFAULT_PUBLIC_SETTINGS.levels.overflowStep);
  });

  it('are not used when written by a build that did not fingerprint them', () => {
    writeJson(STORAGE_KEYS.settings, { revision: 3, settings: phase1Settings });
    expect(readCachedSettings()).toEqual({ settings: DEFAULT_PUBLIC_SETTINGS, revision: null });
  });
});
