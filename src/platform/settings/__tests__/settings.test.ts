import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '../defaults';
import { SECTION_META, SETTING_META, metaFor } from '../meta';
import {
  applySettingsPatch,
  coerceSettings,
  defaultsWithEnv,
  getPath,
  isPlainObject,
  mergeSettings,
  overrideLeaves,
  patchFromEdits,
  publicSettings
} from '../merge';
import { patchIssues, resolveSettings, validateSettings } from '../schema';
import { fillCopy, tokensIn } from '../copy';
import { getCopy, getSettingsSnapshot, setSettingsSnapshot, subscribe } from '../store';
import { DEFAULT_LEVEL_CURVE, DEFAULT_XP_RULES } from '../../xp-leveling/leveling';
import { DEFAULT_RANKS } from '../../xp-leveling/insights';

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));

/** Every leaf of the defaults, stopping at settings (a list or rows value is one leaf). */
function leaves(node: unknown, prefix = ''): string[] {
  if (prefix && metaFor(prefix)) return [prefix];
  if (!isPlainObject(node)) return [prefix];
  return Object.keys(node).flatMap((key) => leaves(node[key], prefix ? `${prefix}.${key}` : key));
}

describe('defaults', () => {
  it('pass their own schema', () => {
    expect(validateSettings(DEFAULT_SETTINGS)).toEqual({ ok: true, issues: [] });
  });

  it("equal today's constants", () => {
    expect(DEFAULT_SETTINGS.xp).toEqual({ ...DEFAULT_XP_RULES, maxAttemptsCounted: 50, maxHintsCounted: 10 });
    expect(DEFAULT_SETTINGS.xp).toMatchObject({ retryPenalty: 10, hintPenalty: 10, scoreFloor: 50, passScore: 60, minXpPerSolve: 1 });
    expect(DEFAULT_SETTINGS.levels.thresholds).toEqual(DEFAULT_LEVEL_CURVE.thresholds);
    expect(DEFAULT_SETTINGS.levels.thresholds.slice(0, 5)).toEqual([0, 100, 300, 600, 1000]);
    expect(DEFAULT_SETTINGS.levels.overflowStep).toBe(4000);
    expect(DEFAULT_SETTINGS.levels.ranks).toEqual(DEFAULT_RANKS);
    expect(DEFAULT_SETTINGS.streak).toEqual({ defaultTimeZone: null, timeZoneChangeCooldownHours: 20, maxPlausibleMergedStreak: 400 });
  });

  it('every leaf has admin metadata, so nothing can be added without being editable', () => {
    const missing = leaves(DEFAULT_SETTINGS).filter((path) => !metaFor(path));
    expect(missing).toEqual([]);
  });

  it('every setting in the metadata exists in the defaults, in a known section', () => {
    const sections = SECTION_META.map((s) => s.id as string);
    for (const path of Object.keys(SETTING_META)) {
      expect(getPath(DEFAULT_SETTINGS, path), path).not.toBeUndefined();
      expect(sections).toContain(path.split('.')[0]);
    }
    expect(Object.keys(DEFAULT_SETTINGS).sort()).toEqual([...sections].sort());
  });

  it('every text default uses only its declared tokens', () => {
    for (const [path, meta] of Object.entries(SETTING_META)) {
      if (meta.kind !== 'text') continue;
      const value = getPath(DEFAULT_SETTINGS, path) as string;
      for (const token of tokensIn(value)) expect(meta.tokens ?? [], `${path} uses {${token}}`).toContain(token);
    }
  });
});

describe('mergeSettings', () => {
  it('recurses into sections and replaces leaves', () => {
    const merged = mergeSettings(DEFAULT_SETTINGS, { xp: { passScore: 70 } });
    expect(merged.xp.passScore).toBe(70);
    expect(merged.xp.retryPenalty).toBe(10);
    expect(merged.levels).toEqual(DEFAULT_SETTINGS.levels);
  });

  it('replaces arrays and rows whole', () => {
    const merged = mergeSettings(DEFAULT_SETTINGS, { levels: { thresholds: [0, 10, 20], ranks: [{ minLevel: 1, title: 'Only' }] } });
    expect(merged.levels.thresholds).toEqual([0, 10, 20]);
    expect(merged.levels.ranks).toEqual([{ minLevel: 1, title: 'Only' }]);
  });

  it('ignores a value of the wrong type, and keys that are not settings', () => {
    const merged = mergeSettings(DEFAULT_SETTINGS, {
      xp: { passScore: '70', retryPenalty: null, bogus: 1 },
      levels: 'nope',
      nonsense: { a: 1 }
    } as any);
    expect(merged.xp.passScore).toBe(60);
    expect(merged.xp.retryPenalty).toBe(10);
    expect((merged.xp as any).bogus).toBeUndefined();
    expect(merged.levels).toEqual(DEFAULT_SETTINGS.levels);
    expect((merged as any).nonsense).toBeUndefined();
  });

  it('accepts null or a zone name for a nullable zone', () => {
    expect(mergeSettings(DEFAULT_SETTINGS, { streak: { defaultTimeZone: 'Asia/Kolkata' } }).streak.defaultTimeZone).toBe('Asia/Kolkata');
    expect(mergeSettings(DEFAULT_SETTINGS, { streak: { defaultTimeZone: null } }).streak.defaultTimeZone).toBeNull();
  });

  it('never lets __proto__ through', () => {
    const hostile = JSON.parse('{"__proto__": {"polluted": true}, "xp": {"__proto__": {"passScore": 1}}}');
    const merged = mergeSettings(DEFAULT_SETTINGS, hostile);
    expect(({} as any).polluted).toBeUndefined();
    expect(Object.getPrototypeOf(merged)).toBe(Object.prototype);
    expect(merged.xp.passScore).toBe(60);
    expect(Object.keys(merged).sort()).toEqual(Object.keys(DEFAULT_SETTINGS).sort());
  });

  it('never mutates the defaults', () => {
    const before = clone(DEFAULT_SETTINGS);
    const merged = mergeSettings(DEFAULT_SETTINGS, { levels: { thresholds: [0, 5] } });
    merged.levels.ranks[0].title = 'changed';
    expect(DEFAULT_SETTINGS).toEqual(before);
  });

  it('coerces a cached or served object back into a full, safe one', () => {
    expect(coerceSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(coerceSettings({ xp: { hintPenalty: 20 } }).xp.hintPenalty).toBe(20);
    expect(coerceSettings({ xp: { hintPenalty: 20 } }).retention).toEqual(DEFAULT_SETTINGS.retention);
  });
});

describe('applySettingsPatch', () => {
  it('stores only what was patched', () => {
    const result = applySettingsPatch({}, { xp: { passScore: 70 } });
    expect(result).toEqual({ overrides: { xp: { passScore: 70 } }, changedPaths: ['xp.passScore'], unknownPaths: [] });
  });

  it('null removes an override and prunes the emptied section', () => {
    const result = applySettingsPatch({ xp: { passScore: 70 } }, { xp: { passScore: null } });
    expect(result.overrides).toEqual({});
    expect(result.changedPaths).toEqual(['xp.passScore']);
  });

  it('null on a section resets every override in it', () => {
    const result = applySettingsPatch({ xp: { passScore: 70, hintPenalty: 5 }, streak: { maxPlausibleMergedStreak: 10 } }, { xp: null });
    expect(result.overrides).toEqual({ streak: { maxPlausibleMergedStreak: 10 } });
    expect(result.changedPaths.sort()).toEqual(['xp.hintPenalty', 'xp.passScore']);
  });

  it('reports keys that are not settings', () => {
    expect(applySettingsPatch({}, { xp: { foo: 1 } }).unknownPaths).toEqual(['xp.foo']);
    expect(applySettingsPatch({}, { nope: 1 }).unknownPaths).toEqual(['nope']);
    expect(applySettingsPatch({}, { xp: 5 }).unknownPaths).toEqual(['xp']);
    expect(applySettingsPatch({}, JSON.parse('{"__proto__": {"x": 1}}')).unknownPaths).toEqual(['__proto__']);
    expect(applySettingsPatch({}, [1, 2]).unknownPaths.length).toBe(1);
  });

  it('does not count an unchanged value as a change', () => {
    expect(applySettingsPatch({ xp: { passScore: 70 } }, { xp: { passScore: 70 } }).changedPaths).toEqual([]);
  });

  it('lets null remove a stored key this build does not know - but never set one', () => {
    // What a rollback leaves behind: keys a newer build wrote.
    const stored = { celebrations: { confetti: true }, xp: { passScore: 70, ghost: 1 } };
    expect(applySettingsPatch(stored, { celebrations: null })).toEqual({
      overrides: { xp: { passScore: 70, ghost: 1 } },
      changedPaths: ['celebrations'],
      unknownPaths: []
    });
    expect(applySettingsPatch(stored, { xp: { ghost: null } }).overrides).toEqual({ celebrations: { confetti: true }, xp: { passScore: 70 } });
    expect(applySettingsPatch(stored, { celebrations: { confetti: null } }).overrides).toEqual({ xp: { passScore: 70, ghost: 1 } });
    expect(applySettingsPatch(stored, { celebrations: { confetti: false } }).unknownPaths).toEqual(['celebrations.confetti']);
    expect(applySettingsPatch(stored, { xp: { ghost: 2 } }).unknownPaths).toEqual(['xp.ghost']);
    // Nothing stored there: still not a setting.
    expect(applySettingsPatch({}, { celebrations: null }).unknownPaths).toEqual(['celebrations']);
  });

  it('builds a nested patch from flat edits', () => {
    expect(patchFromEdits({ 'xp.passScore': 70, 'levels.ranks': null })).toEqual({ xp: { passScore: 70 }, levels: { ranks: null } });
    expect(overrideLeaves({ xp: { passScore: 70 }, levels: { ranks: [] } })).toEqual({ 'xp.passScore': 70, 'levels.ranks': [] });
  });
});

describe('patchIssues', () => {
  /** The paths that would block saving `patch` over `stored`. */
  const blocking = (stored: object, patch: object) => {
    const next = applySettingsPatch(stored, patch).overrides;
    return patchIssues(patch, next, mergeSettings(DEFAULT_SETTINGS, next))
      .map((issue) => issue.path)
      .sort();
  };

  it('never blocks a patch on a stored value it leaves alone', () => {
    expect(blocking({ celebrations: { confetti: true } }, { xp: { passScore: 70 } })).toEqual([]);
    expect(blocking({ xp: { ghost: 1, passScore: 'high' } }, { xp: { hintPenalty: 5 } })).toEqual([]);
    expect(blocking({ xp: { scoreFloor: 95 } }, { streak: { maxPlausibleMergedStreak: 30 } })).toEqual([]);
  });

  it('blocks a value the patch sets that would be dropped, and any rule broken in a section it touches', () => {
    expect(blocking({}, { xp: { passScore: 'high' } })).toEqual(['xp.passScore']);
    expect(blocking({ xp: { scoreFloor: 95 } }, { xp: { hintPenalty: 5 } })).toEqual(['xp.scoreFloor']);
    expect(blocking({ xp: { scoreFloor: 95 } }, { xp: { scoreFloor: null } })).toEqual([]);
  });
});

describe('validateSettings refinements', () => {
  const withPatch = (patch: object) => mergeSettings(DEFAULT_SETTINGS, patch);
  const paths = (patch: object) => validateSettings(withPatch(patch)).issues.map((i) => i.path);

  it('keeps the floor at or below the pass score', () => {
    expect(paths({ xp: { scoreFloor: 80, passScore: 70 } })).toEqual(['xp.scoreFloor']);
  });

  it('enforces bounds and whole numbers', () => {
    expect(paths({ xp: { retryPenalty: 51 } })).toEqual(['xp.retryPenalty']);
    expect(paths({ xp: { hintPenalty: 2.5 } })).toEqual(['xp.hintPenalty']);
    expect(paths({ streak: { timeZoneChangeCooldownHours: -1 } })).toEqual(['streak.timeZoneChangeCooldownHours']);
  });

  it('wants a threshold table that starts at 0 and climbs', () => {
    expect(paths({ levels: { thresholds: [5, 100, 300] } })).toEqual(['levels.thresholds.0']);
    expect(paths({ levels: { thresholds: [0, 100, 100, 300] } })).toEqual(['levels.thresholds.2']);
    expect(paths({ levels: { thresholds: [0] } })).toEqual(['levels.thresholds']);
  });

  it('wants ranks that start at level 1 and climb', () => {
    expect(paths({ levels: { ranks: [{ minLevel: 2, title: 'A' }] } })).toEqual(['levels.ranks.0.minLevel']);
    expect(paths({ levels: { ranks: [{ minLevel: 1, title: 'A' }, { minLevel: 1, title: 'B' }] } })).toEqual(['levels.ranks.1.minLevel']);
    expect(paths({ levels: { ranks: [{ minLevel: 1, title: '' }] } })).toEqual(['levels.ranks.0.title']);
    expect(paths({ levels: { ranks: [{ minLevel: 1, title: 'x'.repeat(41) }] } })).toEqual(['levels.ranks.0.title']);
  });

  it('wants a real time zone', () => {
    expect(paths({ streak: { defaultTimeZone: 'Mars/Base' } })).toEqual(['streak.defaultTimeZone']);
    expect(paths({ streak: { defaultTimeZone: 'Asia/Kolkata' } })).toEqual([]);
  });
});

describe('resolveSettings', () => {
  it('layers overrides on the defaults', () => {
    const { settings, issues } = resolveSettings({ xp: { passScore: 70 } });
    expect(settings.xp.passScore).toBe(70);
    expect(issues).toEqual([]);
  });

  it('falls back per section when a stored section no longer validates', () => {
    const { settings, issues } = resolveSettings({ xp: { scoreFloor: 90, passScore: 70, hintPenalty: 5 }, streak: { maxPlausibleMergedStreak: 30 } });
    expect(settings.xp).toEqual(DEFAULT_SETTINGS.xp);
    expect(settings.streak.maxPlausibleMergedStreak).toBe(30);
    expect(issues.map((i) => i.path)).toEqual(['xp.scoreFloor']);
  });

  it('reports stored values it had to ignore', () => {
    const { settings, issues } = resolveSettings({ xp: { passScore: 'high', ghost: 1 } });
    expect(settings.xp.passScore).toBe(60);
    expect(issues.map((i) => i.path).sort()).toEqual(['xp.ghost', 'xp.passScore']);
  });

  it('reads nothing from the environment until a setting names a variable', () => {
    expect(defaultsWithEnv({ ANYTHING: '1' })).toEqual(DEFAULT_SETTINGS);
  });
});

describe('publicSettings', () => {
  it('drops the admin-only sections', () => {
    const pub = publicSettings(DEFAULT_SETTINGS) as any;
    expect(pub.retention).toBeUndefined();
    expect(pub.access).toBeUndefined();
    expect(pub.xp).toEqual(DEFAULT_SETTINGS.xp);
    expect(SECTION_META.filter((s) => s.audience === 'admin').map((s) => s.id)).toEqual(['retention']);
  });
});

describe('copy', () => {
  it('finds tokens and fills them, leaving unknown ones out', () => {
    expect(tokensIn('Level {level}: {title}, {level} again')).toEqual(['level', 'title']);
    expect(fillCopy('Level {level} - {title}', { level: 7 })).toBe('Level 7 - ');
    expect(fillCopy('{n}-day streak', { n: 3 })).toBe('3-day streak');
    expect(fillCopy('no tokens')).toBe('no tokens');
    expect(fillCopy('{constructor}', {})).toBe('');
  });
});

describe('the client snapshot', () => {
  it('holds the current settings and tells subscribers', () => {
    const seen: number[] = [];
    const stop = subscribe(() => seen.push(getSettingsSnapshot().xp.passScore));
    const next = publicSettings(mergeSettings(DEFAULT_SETTINGS, { xp: { passScore: 75 } }));
    setSettingsSnapshot(next, 3);
    expect(getSettingsSnapshot().xp.passScore).toBe(75);
    expect(seen).toEqual([75]);
    stop();
    setSettingsSnapshot(publicSettings(DEFAULT_SETTINGS), null);
    expect(seen).toEqual([75]);
    expect(getCopy('xp.passScore')).toBe('');
  });
});
