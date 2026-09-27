import { describe, expect, it } from 'vitest';
import type { DailyGoalOption } from '@/types';
import {
  DEFAULT_HABIT_RULES,
  applySolve,
  habitRulesFrom,
  habitStatus,
  normalizeHabit,
  replayDays,
  resetHabit,
  settle,
  streakFieldsOf,
  streakStrip
} from '../streak';
import type { HabitRules, StreakFields } from '../types';
import { addDays } from '../../time/days';
import { DEFAULT_GOAL_SETTINGS } from '../goals';
import { learnerHabitStatus, learnerRules, learnerSolve } from '../learner';
import { DEFAULT_SETTINGS } from '../../settings/defaults';

const AT = '2026-09-20T12:00:00.000Z';
const XP_GOAL: DailyGoalOption = { id: 'regular', label: 'Regular', blurb: '', metric: 'xp', target: 100, bonusXp: 10, enabled: true };

function rules(overrides: Partial<{ dayRule: HabitRules['dayRule']; freeze: Partial<HabitRules['freeze']>; repair: Partial<HabitRules['repair']> }> = {}): HabitRules {
  return habitRulesFrom({
    streak: {
      dayRule: overrides.dayRule ?? 'any-solve',
      freeze: { ...DEFAULT_HABIT_RULES.freeze, ...overrides.freeze },
      repair: { ...DEFAULT_HABIT_RULES.repair, ...overrides.repair }
    }
  });
}

/** A live run of `streak` days ending on `lastActiveDay`, holding `freezes`. */
function run(streak: number, lastActiveDay: string, freezes = 0, r: HabitRules = rules()): StreakFields {
  const fields = streakFieldsOf({ streak, bestStreak: streak, lastActiveDay }, r);
  return { ...fields, habit: { ...fields.habit, freezes } };
}

/** One solve on `today` that pays `xp` (the day record after it). */
function solve(fields: StreakFields, today: string, r: HabitRules = rules(), day: Record<string, unknown> = { xp: 10, lessons: 1 }, goal: DailyGoalOption | null = null) {
  return applySolve(fields, { today, day, goal, rules: r, at: `${today}T12:00:00.000Z` });
}

describe('settle', () => {
  it('uses freezes greedily: one missed day with two freezes is covered by one', () => {
    const { state, events } = settle(run(5, '2026-09-10', 2), '2026-09-12', rules());
    expect(state.streak).toBe(5);
    expect(state.habit.freezes).toBe(1);
    expect(state.habit.frozenDays).toEqual(['2026-09-11']);
    expect(events.frozenDays).toEqual(['2026-09-11']);
    expect(events.broken).toBeNull();
  });

  it('three missed days with two freezes: two frozen, then a break and a repair offer', () => {
    const { state, events } = settle(run(10, '2026-09-10', 2), '2026-09-14', rules());
    expect(state.habit.frozenDays).toEqual(['2026-09-11', '2026-09-12']);
    expect(state.habit.freezes).toBe(0);
    expect(state.streak).toBe(0);
    expect(events.broken).toEqual({ lostStreak: 10, repairOffered: true });
    expect(state.habit.repair).toMatchObject({ lostStreak: 10, lostRunStart: '2026-09-01', missedDays: ['2026-09-13'], expiresDay: '2026-09-15', required: 3, done: 0 });
    expect(state.habit.runs).toEqual([{ start: '2026-09-01', end: '2026-09-10', length: 10, ended: 'missed' }]);
  });

  it('settling day by day gives the same result as settling at once', () => {
    for (const freezes of [0, 1, 2, 3]) {
      for (const gap of [1, 2, 3, 4, 6, 12]) {
        const start = run(8, '2026-09-10', freezes);
        const today = addDays('2026-09-10', gap + 1);
        const atOnce = settle(start, today, rules()).state;
        let stepped = start;
        for (let d = addDays('2026-09-10', 1); d <= today; d = addDays(d, 1)) stepped = settle(stepped, d, rules()).state;
        expect(stepped, `freezes ${freezes}, gap ${gap}`).toEqual(atOnce);
      }
    }
  });

  it('is idempotent', () => {
    const once = settle(run(8, '2026-09-10', 1), '2026-09-14', rules()).state;
    const twice = settle(once, '2026-09-14', rules());
    expect(twice.state).toEqual(once);
    expect(twice.events).toEqual({ frozenDays: [], broken: null, repairExpired: false });
  });

  it('leaves yesterday and today alone', () => {
    const fields = run(4, '2026-09-10');
    expect(settle(fields, '2026-09-11', rules()).state).toEqual(fields);
    expect(settle(fields, '2026-09-10', rules()).state).toEqual(fields);
  });

  it('opens no repair for a gap longer than the window, and none when repair is off', () => {
    const long = settle(run(9, '2026-09-10'), '2026-09-14', rules()).state;
    expect(long.streak).toBe(0);
    expect(long.habit.repair).toBeNull();
    const off = settle(run(9, '2026-09-10'), '2026-09-12', rules({ repair: { enabled: false } }));
    expect(off.state.habit.repair).toBeNull();
    expect(off.events.broken).toEqual({ lostStreak: 9, repairOffered: false });
  });

  it('with freezes disabled, a held freeze is kept but not used', () => {
    const { state } = settle(run(6, '2026-09-10', 2), '2026-09-12', rules({ freeze: { enabled: false } }));
    expect(state.streak).toBe(0);
    expect(state.habit.freezes).toBe(2);
    expect(state.habit.frozenDays).toEqual([]);
  });

  it('never loops for long over an ancient last day', () => {
    const { state } = settle(run(9, '2016-01-01'), '2026-09-27', rules());
    expect(state.streak).toBe(0);
    expect(state.habit.repair).toBeNull();
    expect(state.habit.settledThrough).toBe('2026-09-26');
  });
});

describe('repair', () => {
  it('succeeds: the lost streak comes back, with the missed day bridged but not counted', () => {
    const broken = settle(run(10, '2026-09-10'), '2026-09-12', rules()).state;
    expect(broken.habit.repair).toMatchObject({ missedDays: ['2026-09-11'], required: 3 });
    let s = broken;
    let last;
    for (let i = 0; i < 3; i++) {
      last = solve(s, '2026-09-12');
      s = last.state;
    }
    expect(last!.events.repaired).toBe(true);
    // 10 days, the 11th repaired, the 12th counted.
    expect(s.streak).toBe(11);
    expect(s.bestStreak).toBe(11);
    expect(s.habit.repair).toBeNull();
    expect(s.habit.repairedDays).toEqual(['2026-09-11']);
    expect(s.habit.runStart).toBe('2026-09-01');
    expect(s.habit.runs).toEqual([]);
    // The next day continues it.
    expect(solve(s, '2026-09-13').state.streak).toBe(12);
  });

  it('can be finished on a later day of the window', () => {
    let s = settle(run(10, '2026-09-10'), '2026-09-12', rules()).state;
    s = solve(s, '2026-09-12').state;
    expect(s.streak).toBe(1);
    s = solve(s, '2026-09-13').state;
    s = solve(s, '2026-09-13').state;
    expect(s.streak).toBe(12);
  });

  it('expires once the window has passed', () => {
    const broken = settle(run(10, '2026-09-10'), '2026-09-12', rules()).state;
    const later = settle(broken, '2026-09-14', rules());
    expect(later.state.habit.repair).toBeNull();
    expect(later.events.repairExpired).toBe(true);
    expect(solve(later.state, '2026-09-14').state.streak).toBe(1);
  });

  it('grows with each further missed day, then asks for more', () => {
    const broken = settle(run(10, '2026-09-10'), '2026-09-12', rules()).state;
    const grown = settle(broken, '2026-09-13', rules()).state;
    expect(grown.habit.repair).toMatchObject({ missedDays: ['2026-09-11', '2026-09-12'], required: 6, expiresDay: '2026-09-13' });
    let s = grown;
    for (let i = 0; i < 6; i++) s = solve(s, '2026-09-13').state;
    expect(s.streak).toBe(11);
    expect(s.habit.repairedDays).toEqual(['2026-09-11', '2026-09-12']);
  });
});

describe('freezes are earned on goal days', () => {
  const goalDay = (fields: StreakFields, today: string) => solve(fields, today, rules(), { xp: 120, lessons: 3 }, XP_GOAL);

  it('one every 7 goal days, not while holding the maximum', () => {
    let s = run(1, '2026-09-01');
    let earned = 0;
    for (let i = 1; i <= 7; i++) {
      const out = goalDay(s, addDays('2026-09-01', i));
      s = out.state;
      if (out.events.freezeEarned) earned += 1;
      expect(out.events.goalMet).toBe(true);
    }
    expect(earned).toBe(1);
    expect(s.habit.freezes).toBe(1);
    expect(s.habit.freezeProgress).toBe(0);

    // Held at the maximum: nothing counts.
    s = { ...s, habit: { ...s.habit, freezes: 2 } };
    for (let i = 8; i <= 20; i++) s = goalDay(s, addDays('2026-09-01', i)).state;
    expect(s.habit.freezes).toBe(2);
    expect(s.habit.freezeProgress).toBe(0);
  });

  it('meets the goal once per day', () => {
    const first = goalDay(run(1, '2026-09-01'), '2026-09-02');
    expect(first.events.goal).toEqual({ optionId: 'regular', metric: 'xp', target: 100, metAt: '2026-09-02T12:00:00.000Z' });
    const again = solve(first.state, '2026-09-02', rules(), { xp: 150, lessons: 4, goal: first.events.goal! }, XP_GOAL);
    expect(again.events.goalMet).toBe(false);
    expect(again.state.habit.freezeProgress).toBe(first.state.habit.freezeProgress);
  });
});

describe('the day rule', () => {
  const noXp = { xp: 0, reSolves: 1 };
  it('any-solve counts a 0-XP re-solve', () => {
    expect(solve(run(2, '2026-09-10'), '2026-09-11', rules(), noXp).state.streak).toBe(3);
  });

  it('xp-earned needs XP that day', () => {
    const r = rules({ dayRule: 'xp-earned' });
    expect(solve(run(2, '2026-09-10', 0, r), '2026-09-11', r, noXp).state).toMatchObject({ streak: 2, lastActiveDay: '2026-09-10' });
    expect(solve(run(2, '2026-09-10', 0, r), '2026-09-11', r, { xp: 5 }).state).toMatchObject({ streak: 3, lastActiveDay: '2026-09-11' });
  });

  it('goal-met needs the goal', () => {
    const r = rules({ dayRule: 'goal-met' });
    const short = solve(run(2, '2026-09-10', 0, r), '2026-09-11', r, { xp: 40 }, XP_GOAL);
    expect(short.state.streak).toBe(2);
    const met = solve(run(2, '2026-09-10', 0, r), '2026-09-11', r, { xp: 100 }, XP_GOAL);
    expect(met.state.streak).toBe(3);
    expect(met.events).toMatchObject({ goalMet: true, streakDay: true });
  });
});

describe('time zones', () => {
  it('moving west clamps to the same day: no second count, no going back', () => {
    // Counted on the 27th in Auckland; the next solve arrives on the 26th in Los Angeles.
    const fields = run(4, '2026-09-27');
    const west = solve(fields, '2026-09-26');
    expect(west.state).toMatchObject({ streak: 4, lastActiveDay: '2026-09-27' });
    expect(west.events.streakDay).toBe(false);
    // And the same day again is the same day.
    expect(solve(west.state, '2026-09-27').state.streak).toBe(4);
  });
});

describe('normalizeHabit', () => {
  it('backfills an old row from its streak', () => {
    const habit = normalizeHabit(undefined, { streak: 5, lastActiveDay: '2026-09-20' }, rules({ freeze: { startingCount: 1 } }));
    expect(habit).toEqual({
      v: 1,
      freezes: 1,
      freezeProgress: 0,
      settledThrough: null,
      frozenDays: [],
      repairedDays: [],
      repairedOn: [],
      repair: null,
      runStart: '2026-09-16',
      runs: []
    });
  });

  it('keeps what is stored, never takes freezes away, and drops what is not a day', () => {
    const habit = normalizeHabit(
      { freezes: 5, frozenDays: ['2026-09-01', 'nope', '2026-09-01'], runs: [{ start: '2026-08-01', end: '2026-08-03', length: 3 }, { junk: true }], repair: { lostStreak: 0 } },
      { streak: 0, lastActiveDay: '2026-09-02' },
      rules({ freeze: { maxHeld: 2 } })
    );
    expect(habit.freezes).toBe(5);
    expect(habit.frozenDays).toEqual(['2026-09-01']);
    expect(habit.runs).toEqual([{ start: '2026-08-01', end: '2026-08-03', length: 3, ended: 'missed' }]);
    expect(habit.repair).toBeNull();
  });

  it('keeps the newest runs only', () => {
    const r = habitRulesFrom({ streak: { runsKept: 5 } });
    const runs = Array.from({ length: 9 }, (_, i) => ({ start: addDays('2026-01-01', i * 10), end: addDays('2026-01-01', i * 10 + 1), length: 2, ended: 'missed' }));
    expect(normalizeHabit({ runs }, null, r).runs.map((x) => x.start)).toEqual(runs.slice(-5).map((x) => x.start));
  });
});

describe('habitStatus', () => {
  const evening = new Date('2026-09-20T19:30:00Z');
  const morning = new Date('2026-09-20T07:30:00Z');

  it('says a live streak not yet counted today is at risk - in the evening', () => {
    const status = habitStatus(run(4, '2026-09-19', 1), { today: '2026-09-20', now: evening, zone: 'UTC', day: null, goal: XP_GOAL, atRisk: { enabled: true, fromLocalHour: 18 } });
    expect(status).toMatchObject({ streak: 4, activeToday: false, atRisk: true, hoursLeft: 5, freezes: 1, daysAway: 1 });
    expect(habitStatus(run(4, '2026-09-19'), { today: '2026-09-20', now: morning, zone: 'UTC', day: null, goal: XP_GOAL }).atRisk).toBe(false);
  });

  it('reads without writing, and shows the freeze that covered yesterday', () => {
    const fields = run(4, '2026-09-18', 1);
    const status = habitStatus(fields, { today: '2026-09-20', now: evening, zone: 'UTC', day: null, goal: null });
    expect(status).toMatchObject({ streak: 4, frozenNow: ['2026-09-19'], freezes: 0 });
    expect(fields.habit.freezes).toBe(1);
  });

  it('describes an open repair and the goal', () => {
    const broken = settle(run(10, '2026-09-18'), '2026-09-20', rules()).state;
    const status = habitStatus(broken, { today: '2026-09-20', now: evening, zone: 'UTC', day: { xp: 40 }, goal: XP_GOAL });
    expect(status.repair).toMatchObject({ lostStreak: 10, remaining: 3, deadline: '2026-09-21' });
    expect(status.goal).toMatchObject({ optionId: 'regular', done: 40, target: 100, met: false, percent: 40 });
    expect(status.streak).toBe(0);
  });
});

describe('reset', () => {
  it('closes the current run as reset and keeps the history', () => {
    const fields = { ...run(6, '2026-09-19', 2), habit: { ...run(6, '2026-09-19', 2).habit, runs: [{ start: '2026-08-01', end: '2026-08-04', length: 4, ended: 'missed' as const }] } };
    const fresh = resetHabit(fields, '2026-09-20', rules({ freeze: { startingCount: 0 } }));
    expect(fresh).toMatchObject({ streak: 0, bestStreak: 0, lastActiveDay: null });
    expect(fresh.habit.freezes).toBe(0);
    expect(fresh.habit.runs).toEqual([
      { start: '2026-08-01', end: '2026-08-04', length: 4, ended: 'missed' },
      { start: '2026-09-14', end: '2026-09-19', length: 6, ended: 'reset' }
    ]);
  });
});

describe('replayDays', () => {
  it('replays days in order: an old day can meet its goal but never adds a streak day', () => {
    const fields = run(3, '2026-09-10');
    const out = replayDays(
      fields,
      [
        { day: '2026-09-12', row: { xp: 120, lessons: 3 }, solves: 3 },
        // Before the last streak day: offline solves that met the goal.
        { day: '2026-09-09', row: { xp: 120, lessons: 3 }, solves: 3 },
        { day: '2026-09-11', row: { xp: 20, lessons: 1 }, solves: 1 },
        // Already met (the snapshot is on the day): nothing more.
        { day: '2026-09-10', row: { xp: 150, lessons: 4, goal: { optionId: 'regular', metric: 'xp', target: 100, metAt: AT } }, solves: 1 }
      ],
      { today: '2026-09-12', goal: XP_GOAL, rules: rules(), at: AT }
    );
    // 3 days to the 10th, then the 11th and the 12th.
    expect(out.state).toMatchObject({ streak: 5, lastActiveDay: '2026-09-12' });
    expect(out.goals.map((g) => [g.day, g.goal.optionId, g.bonusXp])).toEqual([
      ['2026-09-09', 'regular', 10],
      ['2026-09-12', 'regular', 10]
    ]);
  });

  it('is idempotent once the goals are on the days: replaying again pays nothing and counts nothing', () => {
    const days = [{ day: '2026-09-11', row: { xp: 120, lessons: 3 }, solves: 3 }];
    const once = replayDays(run(3, '2026-09-10'), days, { today: '2026-09-11', goal: XP_GOAL, rules: rules(), at: AT });
    const met = [{ ...days[0], row: { ...days[0].row, goal: once.goals[0].goal }, solves: 0 }];
    const twice = replayDays(once.state, met, { today: '2026-09-11', goal: XP_GOAL, rules: rules(), at: AT });
    expect(twice.goals).toEqual([]);
    expect(twice.state).toEqual(once.state);
  });

  it('counts only solves made after the missed days towards an open repair', () => {
    const broken = settle(run(10, '2026-09-10'), '2026-09-12', rules()).state;
    // Offline solves on the 10th (before the break) do not repair it; the 12th's do.
    const old = replayDays(broken, [{ day: '2026-09-10', row: { lessons: 5 }, solves: 5 }], { today: '2026-09-12', goal: null, rules: rules(), at: AT });
    expect(old.state.habit.repair).toMatchObject({ done: 0 });
    const fresh = replayDays(broken, [{ day: '2026-09-12', row: { lessons: 3 }, solves: 3 }], { today: '2026-09-12', goal: null, rules: rules(), at: AT });
    expect(fresh.repaired).toBe(true);
    expect(fresh.state.streak).toBe(11);
  });
});

describe('a second break while a repair is on offer', () => {
  it('grows the offer to cover both runs, and a completed repair restores all of it', () => {
    const r = rules({ repair: { windowDays: 7 } });
    // 10 days to the 10th; the 11th missed; one day on the 12th; the 13th missed.
    let s = settle(run(10, '2026-09-10', 0, r), '2026-09-12', r).state;
    s = solve(s, '2026-09-12', r, { lessons: 1, xp: 10 }).state;
    expect(s).toMatchObject({ streak: 1 });
    s = settle(s, '2026-09-14', r).state;
    expect(s.streak).toBe(0);
    expect(s.habit.repair).toMatchObject({ lostStreak: 11, missedDays: ['2026-09-11', '2026-09-13'], required: 6, done: 1, expiresDay: '2026-09-18' });
    for (let i = 0; i < 5; i++) s = solve(s, '2026-09-14', r).state;
    // 10 + 1 restored, the two missed days bridged, the 14th counted.
    expect(s.streak).toBe(12);
    expect(s.habit.runStart).toBe('2026-09-01');
    expect(s.habit.runs).toEqual([]);
    expect(s.habit.repairedDays).toEqual(['2026-09-11', '2026-09-13']);
  });

  it('settling day by day still equals settling at once', () => {
    const r = rules({ repair: { windowDays: 7 } });
    const start = solve(settle(run(10, '2026-09-10', 0, r), '2026-09-12', r).state, '2026-09-12', r).state;
    const atOnce = settle(start, '2026-09-19', r).state;
    let stepped = start;
    for (let d = '2026-09-13'; d <= '2026-09-19'; d = addDays(d, 1)) stepped = settle(stepped, d, r).state;
    expect(stepped).toEqual(atOnce);
  });
});

describe('streakStrip', () => {
  it('marks active, frozen, repaired, missed and today', () => {
    const fields = run(3, '2026-09-18', 1);
    const cells = streakStrip(
      fields,
      { '2026-09-15': { lessons: 1 }, '2026-09-16': { lessons: 1 }, '2026-09-17': { lessons: 1 }, '2026-09-18': { lessons: 2 } },
      '2026-09-20',
      7
    );
    // 14th: before any activity. 19th: covered by the freeze. 20th: not counted yet.
    expect(cells.map((c) => c.state)).toEqual(['none', 'active', 'active', 'active', 'active', 'frozen', 'today']);
  });

  it('counts the days of a run as streak days even without day records (before the log, or set by support)', () => {
    const cells = streakStrip(run(4, '2026-09-19', 0), {}, '2026-09-20', 6);
    expect(cells.map((c) => c.state)).toEqual(['none', 'active', 'active', 'active', 'active', 'today']);
  });
});

describe('a day already settled', () => {
  it('replayed later never carries a run over the missed days after it', () => {
    // 10 days to the 10th; by the 15th the run is broken and worked out
    // through the 14th (a support edit, say, then gave 2 freezes).
    const settled = settle(run(10, '2026-09-10'), '2026-09-15', rules()).state;
    expect(settled).toMatchObject({ streak: 0, habit: { settledThrough: '2026-09-14', repair: null } });
    const withFreezes = { ...settled, habit: { ...settled.habit, freezes: 2 } };
    // An offline first solve from the 11th arrives with a merge.
    const out = replayDays(withFreezes, [{ day: '2026-09-11', row: { lessons: 1, xp: 10 }, solves: 1 }], { today: '2026-09-15', goal: null, rules: rules(), at: AT });
    expect(out.state).toMatchObject({ streak: 0, lastActiveDay: '2026-09-10' });
    const status = habitStatus(out.state, { today: '2026-09-15', now: new Date('2026-09-15T12:00:00Z'), zone: 'UTC', day: null, goal: null, rules: rules() });
    expect(status).toMatchObject({ streak: 0, freezes: 2 });
    // A day after everything settled still counts.
    expect(solve(withFreezes, '2026-09-15').state).toMatchObject({ streak: 1, lastActiveDay: '2026-09-15' });
  });

  it('replays only days with new solves: counters alone are never a streak day', () => {
    const out = replayDays(run(3, '2026-09-10'), [{ day: '2026-09-11', row: { reSolves: 4, xp: 0 }, solves: 0 }], { today: '2026-09-12', goal: null, rules: rules(), at: AT });
    expect(out.state).toMatchObject({ streak: 3, lastActiveDay: '2026-09-10' });
  });
});

describe('goal-met with no goal to meet', () => {
  it('counts any passing solve while daily goals are off (or no option is enabled)', () => {
    const goalsOn = DEFAULT_GOAL_SETTINGS;
    const goalsOff = { ...DEFAULT_GOAL_SETTINGS, enabled: false };
    const noneEnabled = { ...DEFAULT_GOAL_SETTINGS, options: DEFAULT_GOAL_SETTINGS.options.map((o) => ({ ...o, enabled: false })) };
    expect(habitRulesFrom({ streak: { dayRule: 'goal-met' }, goals: goalsOn }).dayRule).toBe('goal-met');
    expect(habitRulesFrom({ streak: { dayRule: 'goal-met' }, goals: goalsOff }).dayRule).toBe('any-solve');
    expect(habitRulesFrom({ streak: { dayRule: 'goal-met' }, goals: noneEnabled }).dayRule).toBe('any-solve');
    // Without the goal settings the rule is taken as it is.
    expect(habitRulesFrom({ streak: { dayRule: 'goal-met' } }).dayRule).toBe('goal-met');
  });

  it('keeps every learner’s streak counting after an admin switches goals off', () => {
    const settings = { ...DEFAULT_SETTINGS, streak: { ...DEFAULT_SETTINGS.streak, dayRule: 'goal-met' as const }, goals: { ...DEFAULT_SETTINGS.goals, enabled: false } };
    const row = { streak: 4, bestStreak: 4, lastActiveDay: '2026-09-19' };
    const out = learnerSolve(row, { settings, dailyGoalId: null, today: '2026-09-20', day: { xp: 40, lessons: 1 }, at: AT });
    expect(out.events).toMatchObject({ streakDay: true, goalMet: false });
    expect(out.fields).toMatchObject({ streak: 5, lastActiveDay: '2026-09-20' });
    const status = learnerHabitStatus(out.fields, { settings, dailyGoalId: null, today: '2026-09-20', day: { xp: 40, lessons: 1 } });
    expect(status).toMatchObject({ dayRule: 'any-solve', activeToday: true, goal: null });
    // The strip reads the days the same way.
    expect(streakStrip(out.fields, { '2026-09-20': { lessons: 1 } }, '2026-09-20', 1, learnerRules({ settings })).map((c) => c.state)).toEqual(['active']);
  });
});

describe('repairs completed', () => {
  it('are recorded on the day they were won back, and trimmed like the other days', () => {
    let s = settle(run(10, '2026-09-10'), '2026-09-12', rules()).state;
    for (let i = 0; i < 3; i++) s = solve(s, '2026-09-12').state;
    expect(s.habit.repairedOn).toEqual(['2026-09-12']);
    expect(normalizeHabit(s.habit, s, rules()).repairedOn).toEqual(['2026-09-12']);
    // A reset starts the record over (history is the runs).
    expect(resetHabit(s, '2026-09-13', rules()).habit.repairedOn).toEqual([]);
  });
});
