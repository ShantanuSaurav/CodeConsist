import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '../defaults';
import { SECTION_META, SETTING_META, metaFor } from '../meta';
import {
  applySettingsPatch,
  coerceSettings,
  getPath,
  isPlainObject,
  mergeSettings,
  normalizeOrigin,
  overrideLeaves,
  patchFromEdits,
  publicSettings
} from '../merge';
import { defaultsWithEnv } from '../env';
import { ADMIN_ONLY_SECTIONS, MAP_SETTINGS, NULLABLE_SETTINGS, isSettingsGroup, settingLeafPaths } from '../leaves';
import { patchIssues, resolveSettings, settingsContentIssues, validateSettings } from '../schema';
import { fillCopy, tokensIn } from '../copy';
import { getCopy, getSettingsSnapshot, setSettingsSnapshot, subscribe } from '../store';
import { DEFAULT_LEVEL_CURVE, DEFAULT_XP_RULES } from '../../xp-leveling/leveling';
import { DEFAULT_BADGES, DEFAULT_RANKS } from '../../xp-leveling/insights';
import { DEFAULT_UNIT_SETTINGS } from '../../progress/units';

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
    // Phase 2: the retuned curve (owner decision 2) - 900 XP per level past level 10.
    expect(DEFAULT_SETTINGS.levels.overflowStep).toBe(900);
    expect(DEFAULT_SETTINGS.levels.ranks).toEqual(DEFAULT_RANKS);
    expect(DEFAULT_SETTINGS.streak).toMatchObject({ defaultTimeZone: null, timeZoneChangeCooldownHours: 20, maxPlausibleMergedStreak: 400 });
  });

  it('carry the Phase 3 streak, goal and reminder rules from the habits engine', () => {
    expect(DEFAULT_SETTINGS.streak).toEqual({
      defaultTimeZone: null,
      timeZoneChangeCooldownHours: 20,
      maxPlausibleMergedStreak: 400,
      dayRule: 'any-solve',
      freeze: { enabled: true, earnEveryGoalDays: 7, maxHeld: 2, startingCount: 0 },
      repair: { enabled: true, windowDays: 2, lessonsPerMissedDay: 3 },
      milestones: [3, 7, 14, 30, 50, 100, 365],
      runsKept: 50,
      mergeReplayDays: 7
    });
    // XP goals 50/100/250/500 with bonuses 5/10/25/50; "Regular" (100 XP, the old dashboard goal) by default.
    expect(DEFAULT_SETTINGS.goals.options.map((o) => [o.id, o.metric, o.target, o.bonusXp, o.enabled])).toEqual([
      ['casual', 'xp', 50, 5, true],
      ['regular', 'xp', 100, 10, true],
      ['serious', 'xp', 250, 25, true],
      ['intense', 'xp', 500, 50, true]
    ]);
    expect(DEFAULT_SETTINGS.goals.defaultOptionId).toBe('regular');
    // An evening nudge, never a morning one.
    expect(DEFAULT_SETTINGS.reminders.atRisk.fromLocalHour).toBe(18);
    expect(Object.keys(publicSettings(DEFAULT_SETTINGS))).toEqual(expect.arrayContaining(['goals', 'reminders', 'streak']));
  });

  it('carry the Phase 2 units, celebrations and badges from the code that uses them', () => {
    expect(DEFAULT_SETTINGS.units).toEqual(DEFAULT_UNIT_SETTINGS);
    expect(DEFAULT_SETTINGS.units).toMatchObject({ targetSize: 5, minSize: 3, maxSize: 8, targetMinutes: 8, perfectBonusXp: 25, perfectRequiresNoHints: true });
    expect(DEFAULT_SETTINGS.badges).toEqual(DEFAULT_BADGES);
    expect(DEFAULT_SETTINGS.badges.families.map((f) => f.id)).toEqual(['streak', 'solved', 'units', 'perfect', 'tests', 'xp']);
    expect(DEFAULT_SETTINGS.celebrations.confetti).toEqual({ onCorrect: true, onCorrectParticles: 40, onReSolve: false, onUnitEnd: true, unitEndParticles: 140 });
    expect(DEFAULT_SETTINGS.celebrations.sound).toEqual({
      defaultOn: true,
      volume: 0.5,
      events: { correct: true, wrong: true, unitComplete: true, levelUp: true, badge: true }
    });
    // Learners get all three (none is admin only).
    expect(Object.keys(publicSettings(DEFAULT_SETTINGS))).toEqual(expect.arrayContaining(['units', 'celebrations', 'badges']));
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

  it("the learner's merge knows the same settings as the admin metadata (leaves.ts vs meta.ts)", () => {
    // merge.ts reads ./leaves so the admin help text stays out of the shell;
    // the two must name exactly the same settings, groups and nullable ones.
    expect([...settingLeafPaths()].sort()).toEqual(Object.keys(SETTING_META).sort());
    expect([...MAP_SETTINGS].sort()).toEqual(Object.keys(SETTING_META).filter((path) => SETTING_META[path].kind === 'map').sort());
    expect([...NULLABLE_SETTINGS].sort()).toEqual(Object.keys(SETTING_META).filter((path) => SETTING_META[path].nullable).sort());
    const groups = new Set(Object.keys(SETTING_META).flatMap((path) => path.split('.').slice(0, -1).map((_, i, parts) => parts.slice(0, i + 1).join('.'))));
    for (const group of groups) expect(isSettingsGroup(group), group).toBe(true);
    for (const path of Object.keys(SETTING_META)) expect(isSettingsGroup(path), path).toBe(false);
    expect(isSettingsGroup('xp.nope')).toBe(false);
    expect(ADMIN_ONLY_SECTIONS.every((id) => SECTION_META.some((s) => s.id === id))).toBe(true);
  });

  it('every text default uses only its declared tokens', () => {
    for (const [path, meta] of Object.entries(SETTING_META)) {
      if (meta.kind !== 'text') continue;
      const value = getPath(DEFAULT_SETTINGS, path) as string;
      for (const token of tokensIn(value)) expect(meta.tokens ?? [], `${path} uses {${token}}`).toContain(token);
    }
  });
});

describe('Phase 2 rules', () => {
  const check = (patch: object) => validateSettings(mergeSettings(DEFAULT_SETTINGS, patch)).issues.map((i) => i.path);

  it('keeps minSize <= targetSize <= maxSize', () => {
    expect(check({ units: { minSize: 6 } })).toEqual(['units.minSize']);
    expect(check({ units: { targetSize: 9 } })).toEqual(['units.targetSize']);
    expect(check({ units: { minSize: 5, targetSize: 5, maxSize: 5 } })).toEqual([]);
  });

  it('bounds the minutes per question kind and the bonus', () => {
    expect(check({ units: { minutesByType: { ...DEFAULT_SETTINGS.units.minutesByType, quiz: 0 } } })).toEqual(['units.minutesByType.quiz']);
    expect(check({ units: { perfectBonusXp: 501 } })).toEqual(['units.perfectBonusXp']);
  });

  it('checks every badge family: a slug id, unique, {n} in its words, tiers that climb', () => {
    const families = DEFAULT_SETTINGS.badges.families.map((f) => ({ ...f }));
    families[0] = { ...families[0], id: 'Streak!' };
    families[1] = { ...families[1], id: 'units' };
    families[2] = { ...families[2], title: 'Units done', detail: 'Done {n} of {total}' };
    families[3] = { ...families[3], tiers: [1, 5, 5] };
    expect(check({ badges: { families } }).sort()).toEqual(
      ['badges.families.0.id', 'badges.families.2.id', 'badges.families.2.title', 'badges.families.2.detail', 'badges.families.3.tiers.2'].sort()
    );
    expect(check({ badges: { families: [{ ...families[5], metric: 'coins' }] } })).toEqual(['badges.families.0.metric']);
    expect(check({ badges: { tierNames: ['Only one'] } })).toEqual(['badges.tierNames']);
  });

  it('refuses a token a celebration line does not have', () => {
    expect(check({ celebrations: { copy: { perfect: 'Perfect! +{xp} XP, level {level}' } } })).toEqual(['celebrations.copy.perfect']);
    expect(check({ badges: { stageBadges: { coreTitle: '{name} cleared' } } })).toEqual(['badges.stageBadges.coreTitle']);
  });

  it('merges one sound event without losing the others', () => {
    const merged = mergeSettings(DEFAULT_SETTINGS, { celebrations: { sound: { events: { wrong: false } } } });
    expect(merged.celebrations.sound.events).toEqual({ correct: true, wrong: false, unitComplete: true, levelUp: true, badge: true });
  });
});

describe('Phase 5 rules: onboarding, placement, test-out, the stage-order gates', () => {
  const check = (patch: object) => validateSettings(mergeSettings(DEFAULT_SETTINGS, patch)).issues.map((i) => i.path);
  const steps = () => DEFAULT_SETTINGS.onboarding.steps.map((s) => ({ ...s }));

  it('ships the gates logging only, and claims checked by the server', () => {
    expect(DEFAULT_SETTINGS.access).toMatchObject({ solveGate: 'log', mergeGate: 'log', requireServerVerification: true, acceptGuestClaims: true });
    expect(check({ access: { solveGate: 'sometimes' } })).toEqual(['access.solveGate']);
    expect(check({ access: { mergeGate: 'off', solveGate: 'enforce' } })).toEqual([]);
    // Admin only: never sent to learners. The learner-facing sections are.
    expect((publicSettings(DEFAULT_SETTINGS) as any).access).toBeUndefined();
    expect((publicSettings(DEFAULT_SETTINGS) as any).testOut).toEqual(DEFAULT_SETTINGS.testOut);
  });

  it('keeps the track step before the experience step, when both are on', () => {
    const swapped = steps();
    [swapped[1], swapped[2]] = [swapped[2], swapped[1]];
    expect(check({ onboarding: { steps: swapped } })).toEqual(['onboarding.steps.2.id']);
    // With one of them off, the order does not matter.
    swapped[1] = { ...swapped[1], enabled: false };
    expect(check({ onboarding: { steps: swapped } })).toEqual([]);
  });

  it('wants each step at most once, from the fixed set, in plain text', () => {
    const twice = steps();
    twice[4] = { ...twice[4], id: 'goal' };
    expect(check({ onboarding: { steps: twice } })).toEqual(['onboarding.steps.4.id']);
    const unknown = steps();
    (unknown[0] as { id: string }).id = 'survey';
    expect(check({ onboarding: { steps: unknown } })).toEqual(['onboarding.steps.0.id']);
    const tokens = steps();
    tokens[0] = { ...tokens[0], title: 'Hi {name}' };
    expect(check({ onboarding: { steps: tokens } })).toEqual(['onboarding.steps.0.title']);
  });

  it('wants 2-8 motivation answers with distinct slug ids and a known icon', () => {
    const options = DEFAULT_SETTINGS.onboarding.motivation.options.map((o) => ({ ...o }));
    expect(check({ onboarding: { motivation: { options: options.slice(0, 1) } } })).toEqual(['onboarding.motivation.options']);
    const bad = options.map((o) => ({ ...o }));
    bad[1] = { ...bad[1], id: 'job' };
    bad[2] = { ...bad[2], id: 'Big Tech' };
    expect(check({ onboarding: { motivation: { options: bad } } }).sort()).toEqual(['onboarding.motivation.options.1.id', 'onboarding.motivation.options.2.id']);
    const icon = options.map((o) => ({ ...o }));
    icon[3] = { ...icon[3], icon: 'unicorn' };
    expect(check({ onboarding: { motivation: { options: icon } } })).toEqual(['onboarding.motivation.options.3.icon']);
  });

  it('holds pass marks to 50-100 in steps of 10', () => {
    expect(check({ testOut: { passMark: 85 } })).toEqual(['testOut.passMark']);
    expect(check({ placement: { passMark: 40 } })).toEqual(['placement.passMark']);
    expect(check({ testOut: { passMark: 100 }, placement: { passMark: 50 } })).toEqual([]);
  });

  it('bounds the numbers and checks the stage lists', () => {
    expect(check({ placement: { maxStages: 0 } })).toEqual(['placement.maxStages']);
    expect(check({ testOut: { maxAttempts: 11, sessionMinutes: 4 } }).sort()).toEqual(['testOut.maxAttempts', 'testOut.sessionMinutes']);
    expect(check({ placement: { stagesByTrack: { core: ['stage-1', 'stage-1'] } } })).toEqual(['placement.stagesByTrack.core']);
    expect(check({ placement: { stagesByTrack: { core: 'stage-1' } } })).toEqual(['placement.stagesByTrack.core']);
    expect(check({ testOut: { disabledStages: ['stage-3', 'stage-3'] } })).toEqual(['testOut.disabledStages']);
  });

  it('keeps assessment copy to its tokens', () => {
    expect(check({ testOut: { copy: { cooldownLabel: 'Back {when}, {stage}' } } })).toEqual(['testOut.copy.cooldownLabel']);
    expect(check({ placement: { copy: { failBody: 'Start at {stage}, again {when}.' } } })).toEqual([]);
    expect(check({ copy: { landing: { pathLineWithSkip: '{stages} stages; skip ahead with {tests} tests' } } })).toEqual(['copy.landing.pathLineWithSkip']);
  });

  it('checks what needs the content only against the content, on save', () => {
    const facts = { tracks: [{ id: 'core', stageIds: ['stage-1', 'stage-2'] }], stageIds: ['stage-1', 'stage-2', 'stage-c1'] };
    const settings = mergeSettings(DEFAULT_SETTINGS, {
      onboarding: { track: { blurbs: { core: 'The path', rust: 'Soon' } } },
      placement: { stagesByTrack: { core: ['stage-2', 'stage-c1'], c: ['stage-c1'] } },
      testOut: { disabledStages: ['stage-c1', 'stage-9'] }
    });
    expect(settingsContentIssues(settings, facts).map((i) => i.path)).toEqual([
      'onboarding.track.blurbs.rust',
      'placement.stagesByTrack.core',
      'placement.stagesByTrack.c',
      'testOut.disabledStages.1'
    ]);
    expect(settingsContentIssues(DEFAULT_SETTINGS, facts)).toEqual([]);
  });

  it('lets a patch set one track of a map without an unknown-path error', () => {
    const patch = { placement: { stagesByTrack: { core: ['stage-1'] } }, onboarding: { track: { blurbs: { core: 'The path' } } } };
    const next = applySettingsPatch({}, patch);
    expect(next.unknownPaths).toEqual([]);
    expect(patchIssues(patch, next.overrides, mergeSettings(DEFAULT_SETTINGS, next.overrides))).toEqual([]);
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
    const stored = { fireworks: { confetti: true }, xp: { passScore: 70, ghost: 1 } };
    expect(applySettingsPatch(stored, { fireworks: null })).toEqual({
      overrides: { xp: { passScore: 70, ghost: 1 } },
      changedPaths: ['fireworks'],
      unknownPaths: []
    });
    expect(applySettingsPatch(stored, { xp: { ghost: null } }).overrides).toEqual({ fireworks: { confetti: true }, xp: { passScore: 70 } });
    expect(applySettingsPatch(stored, { fireworks: { confetti: null } }).overrides).toEqual({ xp: { passScore: 70, ghost: 1 } });
    expect(applySettingsPatch(stored, { fireworks: { confetti: false } }).unknownPaths).toEqual(['fireworks.confetti']);
    expect(applySettingsPatch(stored, { xp: { ghost: 2 } }).unknownPaths).toEqual(['xp.ghost']);
    // Nothing stored there: still not a setting.
    expect(applySettingsPatch({}, { fireworks: null }).unknownPaths).toEqual(['fireworks']);
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
    expect(blocking({ fireworks: { confetti: true } }, { xp: { passScore: 70 } })).toEqual([]);
    expect(blocking({ xp: { ghost: 1, passScore: 'high' } }, { xp: { hintPenalty: 5 } })).toEqual([]);
    expect(blocking({ xp: { scoreFloor: 95 } }, { streak: { maxPlausibleMergedStreak: 30 } })).toEqual([]);
  });

  it('blocks a value the patch sets that would be dropped, and any rule broken in a section it touches', () => {
    expect(blocking({}, { xp: { passScore: 'high' } })).toEqual(['xp.passScore']);
    expect(blocking({ xp: { scoreFloor: 95 } }, { xp: { hintPenalty: 5 } })).toEqual(['xp.scoreFloor']);
    expect(blocking({ xp: { scoreFloor: 95 } }, { xp: { scoreFloor: null } })).toEqual([]);
  });

  it('words a wrong type as what the value must be - "ignored" is for stored overrides only', () => {
    const issuesFor = (patch: object) => {
      const next = applySettingsPatch({}, patch).overrides;
      return patchIssues(patch, next, mergeSettings(DEFAULT_SETTINGS, next));
    };
    expect(issuesFor({ xp: { passScore: '70' } })).toEqual([{ path: 'xp.passScore', message: 'Must be a number.' }]);
    expect(issuesFor({ units: { perfectRequiresNoHints: 1 } })).toEqual([{ path: 'units.perfectRequiresNoHints', message: 'Must be on or off.' }]);
    expect(issuesFor({ levels: { ranks: { minLevel: 1 } } })).toEqual([{ path: 'levels.ranks', message: 'Must be a list.' }]);
    expect(issuesFor({ placement: { stagesByTrack: ['core'] } })).toEqual([{ path: 'placement.stagesByTrack', message: 'Must be a map.' }]);
    // The same value already stored is reported by resolveSettings, where it is ignored.
    expect(resolveSettings({ xp: { passScore: '70' } }).issues).toEqual([{ path: 'xp.passScore', message: 'Wrong type for this setting - ignored.' }]);
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

  it('holds the access section to its ranges', () => {
    expect(paths({ access: { rateLimit: { loginAccount: { limit: 0 } } } })).toEqual(['access.rateLimit.loginAccount.limit']);
    expect(paths({ access: { rateLimit: { loginIp: { windowSeconds: 30 } } } })).toEqual(['access.rateLimit.loginIp.windowSeconds']);
    expect(paths({ access: { rateLimit: { mode: 'sometimes' } } })).toEqual(['access.rateLimit.mode']);
    expect(paths({ access: { execution: { maxConcurrent: 17 } } })).toEqual(['access.execution.maxConcurrent']);
    expect(paths({ access: { network: { trustProxyHops: 6 } } })).toEqual(['access.network.trustProxyHops']);
    expect(paths({ access: { premiumGate: 'off' } })).toEqual(['access.premiumGate']);
    expect(paths({ access: { passwordResetTtlMinutes: 5 } })).toEqual(['access.passwordResetTtlMinutes']);
  });

  it('wants exact, normalised, distinct origins - at most 20', () => {
    expect(paths({ access: { cors: { extraOrigins: ['https://preview.example.com', 'http://localhost:5173'] } } })).toEqual([]);
    for (const bad of ['https://example.com/app', 'https://*.example.com', 'ftp://example.com', 'example.com', 'https://user@example.com']) {
      expect(paths({ access: { cors: { extraOrigins: [bad] } } }), bad).toEqual(['access.cors.extraOrigins.0']);
    }
    // Valid, but not in the form a browser sends it: the message names the form.
    const upper = validateSettings(withPatch({ access: { cors: { extraOrigins: ['https://Example.com/'] } } })).issues;
    expect(upper).toEqual([{ path: 'access.cors.extraOrigins.0', message: expect.stringContaining('https://example.com') }]);
    expect(paths({ access: { cors: { extraOrigins: ['https://a.example.com', 'https://a.example.com'] } } })).toEqual(['access.cors.extraOrigins.1']);
    const many = Array.from({ length: 21 }, (_, i) => `https://s${i}.example.com`);
    expect(paths({ access: { cors: { extraOrigins: many } } })).toEqual(['access.cors.extraOrigins']);
  });

  it('keeps site copy to its tokens and its length', () => {
    expect(paths({ copy: { landing: { pathLine: '{stages} stages and {lessons} lessons' } } })).toEqual(['copy.landing.pathLine']);
    expect(paths({ copy: { offline: { banner: 'x'.repeat(301) } } })).toEqual(['copy.offline.banner']);
    expect(paths({ copy: { offline: { banner: '' } } })).toEqual(['copy.offline.banner']);
    expect(paths({ copy: { limits: { tooMany: 'Slow down - {minutes} min.' } } })).toEqual([]);
  });
});

describe('normalizeOrigin', () => {
  it('turns what an admin types into the form a browser sends', () => {
    expect(normalizeOrigin(' https://Example.COM/ ')).toBe('https://example.com');
    expect(normalizeOrigin('https://example.com:443')).toBe('https://example.com');
    expect(normalizeOrigin('http://localhost:3000')).toBe('http://localhost:3000');
  });

  it('refuses anything that is not one exact origin', () => {
    for (const bad of ['https://example.com/path', 'https://example.com?x=1', 'https://*.example.com', 'ftp://example.com', 'example.com', '', null, 42]) {
      expect(normalizeOrigin(bad), String(bad)).toBeNull();
    }
  });
});

describe('site copy defaults', () => {
  it('are all plain text within the length limit', () => {
    for (const [path, meta] of Object.entries(SETTING_META)) {
      if (!path.startsWith('copy.')) continue;
      const value = getPath(DEFAULT_SETTINGS, path) as string;
      expect(meta.kind, path).toBe('text');
      expect(value.length, path).toBeLessThanOrEqual(300);
      expect(value, path).not.toMatch(/npm run|\.env|docker|judge0|\bAPI\b/i);
    }
  });

  it('can be read through getCopy, with or without the section prefix', () => {
    setSettingsSnapshot(publicSettings(DEFAULT_SETTINGS), null);
    expect(getCopy('copy.landing.pathLine', { stages: 12 })).toBe('12 stages, in order, each ending in a coding test.');
    expect(getCopy('limits.tooMany', { minutes: 3 })).toBe('Too many attempts - wait 3 min and try again.');
    expect(getCopy('copy.nothing.here')).toBe('');
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
    expect(SECTION_META.filter((s) => s.audience === 'admin').map((s) => s.id)).toEqual(['retention', 'access']);
    // Site copy is for learners: it goes out with the rest.
    expect(pub.copy).toEqual(DEFAULT_SETTINGS.copy);
  });
});

describe('the environment layer', () => {
  it('reads TRUST_PROXY_HOPS as the default proxy hops, under any admin override', () => {
    expect(defaultsWithEnv({ TRUST_PROXY_HOPS: '1' }).access.network.trustProxyHops).toBe(1);
    expect(defaultsWithEnv({ TRUST_PROXY_HOPS: 'lots' }).access.network.trustProxyHops).toBe(2);
    expect(resolveSettings({ access: { network: { trustProxyHops: 3 } } }, { TRUST_PROXY_HOPS: '1' }).settings.access.network.trustProxyHops).toBe(3);
    // An environment value outside the bounds falls back rather than half-applying.
    const out = resolveSettings({}, { TRUST_PROXY_HOPS: '9' });
    expect(out.settings.access).toEqual(DEFAULT_SETTINGS.access);
    expect(out.issues.map((i) => i.path)).toEqual(['access.network.trustProxyHops']);
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
