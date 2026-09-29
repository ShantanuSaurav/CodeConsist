/**
 * Streaks, freezes, repair and the daily goal - the server side of
 * src/platform/habits (the same engine the browser runs, compiled into
 * learning.mjs and handed in as `lib`).
 *
 *   recordSolveHabits  pipeline step 11 of POST /progress/solve: settle the
 *                      missed days, count towards an open repair, count the
 *                      streak day, snapshot the daily goal the first time it
 *                      is met and pay its bonus - once per day - into
 *                      `progress.xp` and the day's `goalBonusXp`.
 *   mergeHabitsFor     step 6 of POST /progress/merge: a new account (one
 *                      that never had a streak state) adopts the guest's
 *                      habit, checked and capped; any other keeps its own
 *                      and replays the days this merge credited solves on
 *                      (at most `streak.mergeReplayDays` back). Goal
 *                      bonuses come only from those days.
 *   userLearning,      the admin's user drawer, its support edit (freezes,
 *   adminUpdate,       the streak, the goal, forgetting the zone), and the
 *   engagement         numbers behind the admin's "who this affects" lines
 *                      and the dashboard's Engagement card.
 *   habitSummary       the derived status a screen shows (settles a copy).
 *   streakFor          the streak as it stands today, freezes applied, in
 *                      the learner's own zone (leaderboard, admin users).
 *   settledRow         a progress row with its missed days worked out: what
 *                      GET /progress, /auth/me and login hand the browser, so
 *                      its own settle agrees (a settle persisted later gives
 *                      the same result as one persisted now).
 *
 * The progress row keeps the RAW streak (`streak`, `bestStreak`,
 * `lastActiveDay`) and `habit`; nothing here stores a derived number. Every
 * function is synchronous: the routes call them after their last `await`, in
 * the same tick as `setProgress`.
 */

function plainObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

/** What an administrator's support edit may change (`adminUpdate`). */
const ADMIN_FIELDS = ['freezes', 'streak', 'dailyGoalId', 'clearTimeZone'];
/** The longest streak an administrator can set by hand. */
const ADMIN_MAX_STREAK = 400;
/**
 * The most days a run of `length` streak days can span: each missed day
 * inside it was covered by a freeze, and a learner can hold at most 10
 * (the settings' ceiling) plus one earned per goal day.
 */
const maxRunSpan = (length) => 2 * length + 10;

/**
 * @param {object} deps
 * @param {object} deps.lib        the compiled src/platform/server-lib.ts
 * @param {object} deps.store      server/db.js
 * @param {object} deps.settings   server/settings.js's service
 * @param {object} deps.activity   server/activity.js's service
 */
export function createHabitsService({ lib, store, settings, activity }) {
  const prefsOf = (user) => store.normalizePreferences?.(user?.preferences) ?? plainObject(user?.preferences);

  function rules() {
    const s = settings.current();
    return lib.learnerRules({ settings: s, keepDays: s.retention.activityDaysKept });
  }

  /** What the shared engine needs to know about this learner on `today`. */
  function contextFor(user, today, day) {
    const s = settings.current();
    return { settings: s, keepDays: s.retention.activityDaysKept, dailyGoalId: prefsOf(user).dailyGoalId, today, day };
  }

  function withFields(progress, fields) {
    return { ...progress, streak: fields.streak, bestStreak: fields.bestStreak, lastActiveDay: fields.lastActiveDay, habit: fields.habit };
  }

  function dayOf(user, day) {
    return lib.dayRow(activity.load(user), day);
  }

  /** The goal that applies to this learner now, or null (goals off). */
  function goalFor(user) {
    return lib.effectiveGoal(prefsOf(user).dailyGoalId, settings.current().goals);
  }

  /**
   * The derived status: streak (freezes applied), at risk, freezes, repair,
   * today's goal, days away. `progress` defaults to the stored row.
   */
  function habitSummary(user, progress = store.getProgress(user.id), now = new Date()) {
    const today = activity.todayFor(user, progress, now);
    return lib.learnerHabitStatus(progress, { ...contextFor(user, today, dayOf(user, today)), now, zone: activity.zoneFor(user) });
  }

  /** The streak as it stands on the learner's today. */
  function streakFor(user, progress = store.getProgress(user.id), now = new Date()) {
    const today = activity.todayFor(user, progress, now);
    return lib.settle(lib.streakFieldsOf(progress, rules()), today, rules()).state.streak;
  }

  /** The row with its missed days settled as of `today`. Nothing is written. */
  function settledRow(progress, today) {
    const r = rules();
    return withFields(progress, lib.settle(lib.streakFieldsOf(progress, r), today, r).state);
  }

  /**
   * Pipeline step 11. `progress` is the row after the solve and its unit
   * reward; `dayRow` today's activity row after the solve. Returns the row
   * to store (goal bonus included), today's row (with the goal snapshot)
   * and `habitEvents` for the response.
   */
  function recordSolveHabits({ user, progress, today, dayRow, now = new Date() }) {
    const at = now.toISOString();
    const { fields, events } = lib.learnerSolve(progress, { ...contextFor(user, today, dayRow), at });
    let next = withFields(progress, fields);
    let row = dayRow;
    let bonusXp = 0;
    if (events.goalMet && events.goal) {
      // Once per day: the day keeps its first snapshot, and only a snapshot
      // that landed pays. A goal met live counts for the weekly league too.
      const recorded = activity.recordGoal(user, { day: today, at, goal: events.goal, bonusXp: events.bonusXp, leagueXp: events.bonusXp });
      row = recorded.row;
      if (recorded.applied) bonusXp = events.bonusXp;
    }
    if (bonusXp > 0) {
      const xp = next.xp + bonusXp;
      next = { ...next, xp, level: lib.levelFromXp(xp, settings.current().levels) };
    }
    return {
      next,
      today: row,
      bonusXp,
      habitEvents: {
        goalMet: Boolean(events.goalMet && row.goal),
        freezeEarned: events.freezeEarned,
        repaired: events.repaired,
        bonusXp,
        streakDay: events.streakDay,
        frozenDays: events.frozenDays,
        broken: events.broken
      }
    };
  }

  /**
   * `start` when a run of `length` days ending on `end` could have started
   * then (its own days, plus the frozen ones `maxRunSpan` allows), else
   * the start with no frozen days in it.
   */
  function plausibleStart(start, end, length) {
    const span = lib.isDayKey(start) && start <= end ? lib.daysBetween(start, end) + 1 : 0;
    return span >= length && span <= maxRunSpan(length) ? start : lib.addDays(end, -(length - 1));
  }

  /**
   * A guest's open repair offer, made safe to adopt - or null. Only while
   * repair is on and the offer is still open under TODAY's rules (a
   * deadline no later than `windowDays` after the first missed day, no more
   * missed days than the window), and never worth more than the plausible
   * streak (`lostStreak + streak <= maxPlausibleMergedStreak`).
   */
  function adoptableRepair(repair, fields, today, r, cap) {
    if (!repair || !r.repair.enabled) return null;
    const missed = repair.missedDays;
    if (missed.length === 0 || missed.length > r.repair.windowDays || !missed.every((d) => d < today)) return null;
    const latest = lib.addDays(missed[0], r.repair.windowDays);
    const expiresDay = repair.expiresDay < latest ? repair.expiresDay : latest;
    if (expiresDay < today) return null;
    const lostStreak = Math.min(repair.lostStreak, cap - fields.streak);
    if (lostStreak < 1) return null;
    const required = Math.max(repair.required, r.repair.lessonsPerMissedDay * missed.length);
    return {
      ...repair,
      lostStreak,
      // The lost run ended the day before the first missed day.
      lostRunStart: plausibleStart(repair.lostRunStart, lib.addDays(missed[0], -1), lostStreak),
      expiresDay,
      required,
      done: Math.min(repair.done, required)
    };
  }

  /**
   * A guest's habit, made safe to adopt: freezes at most `maxHeld`, progress
   * towards the next one below a whole freeze, nothing after `today`, run
   * starts and past runs that fit their lengths (never longer than the
   * plausible streak), and a repair offer only while it is still open.
   */
  function adoptableHabit(raw, fields, today, r) {
    const cap = settings.current().streak.maxPlausibleMergedStreak;
    const habit = lib.normalizeHabit(raw, fields, r);
    const notAfter = (d) => d <= today;
    const fitsItsDays = (run) => {
      const span = lib.daysBetween(run.start, run.end) + 1;
      return run.end <= today && run.length <= cap && span >= run.length && span <= maxRunSpan(run.length);
    };
    return {
      ...habit,
      freezes: Math.min(habit.freezes, r.freeze.maxHeld),
      freezeProgress: Math.min(habit.freezeProgress, Math.max(0, r.freeze.earnEveryGoalDays - 1)),
      settledThrough: habit.settledThrough && habit.settledThrough < today ? habit.settledThrough : null,
      frozenDays: habit.frozenDays.filter(notAfter),
      repairedDays: habit.repairedDays.filter(notAfter),
      repairedOn: habit.repairedOn.filter(notAfter),
      runStart: fields.streak > 0 && fields.lastActiveDay ? plausibleStart(habit.runStart, fields.lastActiveDay, fields.streak) : null,
      runs: habit.runs.filter(fitsItsDays),
      repair: adoptableRepair(habit.repair, fields, today, r, cap)
    };
  }

  /**
   * Merge step 6. `current` is the account's row before the merge, `merged`
   * the row after the XP merge (its streak fields are still the account's),
   * `incoming` the guest's progress and `incomingHabit` their habit.
   * `credits` are the first solves and the Practice answers the merge paid
   * for (their days).
   * Returns the row to store and the goal bonuses paid on the way.
   */
  function mergeHabitsFor({ user, current, merged, incoming, incomingHabit, credits = [], today, now = new Date() }) {
    const r = rules();
    const s = settings.current();
    const at = now.toISOString();
    const inc = plainObject(incoming);
    // New: no streak state, ever. A reset row keeps `habit` (its history),
    // so it is not new: it replays like any other account.
    const isNew =
      !current.habit &&
      !lib.isDayKey(current.lastActiveDay) &&
      !(Number(current.streak) > 0) &&
      (Array.isArray(current.completedChallenges) ? current.completedChallenges.length : 0) === 0;
    const log = activity.load(user, now);
    const replayFrom = lib.addDays(today, -s.streak.mergeReplayDays);
    const inWindow = (day) => lib.isDayKey(day) && day >= replayFrom && day <= today;
    const creditsOn = new Map();
    for (const credit of credits) if (inWindow(credit.day)) creditsOn.set(credit.day, (creditsOn.get(credit.day) ?? 0) + 1);

    let fields;
    const goals = [];
    if (isNew) {
      // A new account adopts the guest's streak - the plausibility clamp as
      // before, and a last day that is not after the account's today.
      const clamp = (v) => Math.max(0, Math.min(s.streak.maxPlausibleMergedStreak, Math.floor(Number(v)) || 0));
      const lastActiveDay = lib.isDayKey(inc.lastActiveDay) && inc.lastActiveDay <= today ? inc.lastActiveDay : null;
      const streak = lastActiveDay ? clamp(inc.streak) : 0;
      const guest = { streak, lastActiveDay };
      fields = {
        streak,
        bestStreak: Math.max(Number(current.bestStreak) || 0, clamp(inc.bestStreak), streak),
        lastActiveDay,
        // The account has no history of its own yet (it is new).
        habit: adoptableHabit(incomingHabit ?? inc.habit, guest, today, r)
      };
      // The guest counted their goal days (and the freezes they earned)
      // themselves; the goals they met in the window are recorded and paid
      // here - only on the days this merge credited (server-priced) -
      // without counting them again.
      const goal = goalFor(user);
      if (goal) {
        for (const day of Object.keys(log.days).filter((d) => inWindow(d) && creditsOn.has(d)).sort()) {
          const row = lib.dayRow(log, day);
          if (row.goal || !lib.goalProgress(row, goal).met) continue;
          goals.push({ day, goal: lib.goalSnapshot(goal, at), bonusXp: Math.max(0, Math.floor(Number(goal.bonusXp) || 0)) });
        }
      }
    } else {
      // An existing account keeps its own habit and replays only the days
      // this merge credited solves on (priced by the server). Counters a
      // browser reported for a day (its re-solves) never make a streak day.
      const own = lib.streakFieldsOf(current, r);
      const days = Object.keys(log.days)
        .filter((day) => inWindow(day) && creditsOn.has(day))
        .map((day) => ({ day, row: lib.dayRow(log, day), solves: creditsOn.get(day) }));
      const replay = lib.replayDays(own, days, { today, goal: goalFor(user), rules: r, at });
      fields = replay.state;
      goals.push(...replay.goals);
    }

    let next = withFields(merged, fields);
    let bonusXp = 0;
    // A goal met by merged days counts for the weekly league only when merged XP does.
    const mergedCounts = s.league?.countMergedXp === true;
    for (const met of goals) {
      const recorded = activity.recordGoal(user, { day: met.day, at, goal: met.goal, bonusXp: met.bonusXp, leagueXp: mergedCounts ? met.bonusXp : 0 });
      if (recorded.applied) bonusXp += met.bonusXp;
    }
    if (bonusXp > 0) {
      const xp = next.xp + bonusXp;
      next = { ...next, xp, level: lib.levelFromXp(xp, s.levels) };
    }
    return { next, bonusXp, goals: goals.map((g) => ({ day: g.day, xp: g.bonusXp })) };
  }

  /** A progress reset: the current run is closed as 'reset', history kept, freezes back to the start. */
  function resetFields(user, progress, now = new Date()) {
    const today = activity.todayFor(user, progress, now);
    return lib.resetHabit(lib.streakFieldsOf(progress, rules()), today, rules());
  }

  /**
   * For the admin's user drawer: preferences, the stored habit, the derived
   * summary and the last 30 days as a streak strip (active, frozen,
   * repaired, missed).
   */
  function userLearning(user, now = new Date()) {
    const progress = store.getProgress(user.id);
    const prefs = prefsOf(user);
    const goal = goalFor(user);
    const r = rules();
    const summary = habitSummary(user, progress, now);
    const fields = lib.streakFieldsOf(progress, r);
    return {
      preferences: {
        timeZone: prefs.timeZone ?? null,
        timeZoneSetAt: prefs.timeZoneSetAt ?? null,
        dailyGoalId: prefs.dailyGoalId ?? null,
        soundOn: prefs.soundOn ?? null
      },
      effectiveGoal: goal ? { id: goal.id, label: goal.label, metric: goal.metric, target: goal.target } : null,
      habit: fields,
      summary,
      strip: lib.streakStrip(fields, activity.load(user, now).days, summary.day, 30, r),
      // What the support edit may set: freezes up to this, a goal from these.
      maxFreezes: r.freeze.maxHeld,
      goalOptions: lib.enabledGoalOptions(settings.current().goals).map((o) => ({ id: o.id, label: o.label }))
    };
  }

  /**
   * An administrator's support edit (PATCH /api/admin/users/:id/learning):
   *   freezes        0 to `streak.freeze.maxHeld`
   *   streak         { value: 0-400, lastActiveDay: a day not after the
   *                  learner's today } - 0 closes the current run into the
   *                  history as `ended: 'admin'`; a value starts the run
   *                  `value - 1` days before `lastActiveDay` and closes any
   *                  open repair offer
   *   dailyGoalId    an enabled goal option's id, or null (the default)
   *   clearTimeZone  true: the learner's zone is forgotten (their browser
   *                  reports it again on its next write)
   * Edits apply to the streak as it stands today (settled). Returns
   * `{ ok: true, changes }` - `{ [field]: { from, to } }`, empty when nothing
   * changed - or `{ ok: false, status, error }` naming the first bad field.
   */
  function adminUpdate(user, body, now = new Date()) {
    if (!body || typeof body !== 'object' || Array.isArray(body)) return { ok: false, status: 400, error: 'Send the changes as an object.' };
    const keys = Object.keys(body);
    const unknown = keys.find((key) => !ADMIN_FIELDS.includes(key));
    if (unknown) return { ok: false, status: 400, error: `"${unknown}" cannot be changed here.` };
    if (keys.length === 0) return { ok: false, status: 400, error: 'Nothing to change.' };

    const s = settings.current();
    const r = rules();
    const progress = store.getProgress(user.id);
    const today = activity.todayFor(user, progress, now);
    const settled = lib.settle(lib.streakFieldsOf(progress, r), today, r).state;
    let fields = { ...settled, habit: { ...settled.habit } };
    let prefs = { ...prefsOf(user) };
    const changes = {};

    if ('freezes' in body) {
      const n = body.freezes;
      const max = r.freeze.maxHeld;
      if (!Number.isInteger(n) || n < 0 || n > max) return { ok: false, status: 400, error: `freezes must be a whole number from 0 to ${max}.` };
      if (n !== fields.habit.freezes) {
        changes.freezes = { from: fields.habit.freezes, to: n };
        fields.habit.freezes = n;
      }
    }

    if ('streak' in body) {
      const raw = plainObject(body.streak);
      const value = raw.value;
      if (!Number.isInteger(value) || value < 0 || value > ADMIN_MAX_STREAK) {
        return { ok: false, status: 400, error: `streak.value must be a whole number from 0 to ${ADMIN_MAX_STREAK}.` };
      }
      let lastActiveDay = null;
      if (value > 0) {
        if (!lib.isDayKey(raw.lastActiveDay)) return { ok: false, status: 400, error: 'streak.lastActiveDay must be a day (yyyy-mm-dd).' };
        if (raw.lastActiveDay > today) return { ok: false, status: 400, error: `streak.lastActiveDay cannot be after the learner's today (${today}).` };
        lastActiveDay = raw.lastActiveDay;
      }
      const from = { value: fields.streak, lastActiveDay: fields.lastActiveDay };
      if (from.value !== value || (value > 0 && from.lastActiveDay !== lastActiveDay)) {
        changes.streak = { from, to: { value, lastActiveDay } };
        if (value === 0) {
          // The run the learner had ends here, and stays in their history.
          if (fields.streak > 0 && fields.lastActiveDay) {
            const start = fields.habit.runStart && fields.habit.runStart <= fields.lastActiveDay ? fields.habit.runStart : lib.addDays(fields.lastActiveDay, -(fields.streak - 1));
            fields.habit.runs = [...fields.habit.runs, { start, end: fields.lastActiveDay, length: fields.streak, ended: 'admin' }].slice(-r.runsKept);
          }
          fields = { ...fields, streak: 0, lastActiveDay: null, habit: { ...fields.habit, runStart: null, repair: null, settledThrough: null } };
        } else {
          fields = {
            ...fields,
            streak: value,
            lastActiveDay,
            bestStreak: Math.max(fields.bestStreak, value),
            // Worked out again from the new last day: missed days after it
            // are settled (freezes, a break) on the learner's next read.
            habit: { ...fields.habit, runStart: lib.addDays(lastActiveDay, -(value - 1)), repair: null, settledThrough: null }
          };
        }
      }
    }

    if ('dailyGoalId' in body) {
      const id = body.dailyGoalId;
      if (id !== null && !lib.isGoalOptionAvailable(id, s.goals)) return { ok: false, status: 400, error: 'That goal is not available.' };
      if ((prefs.dailyGoalId ?? null) !== id) {
        changes.dailyGoalId = { from: prefs.dailyGoalId ?? null, to: id };
        prefs = { ...prefs, dailyGoalId: id };
      }
    }

    if ('clearTimeZone' in body) {
      if (body.clearTimeZone !== true) return { ok: false, status: 400, error: 'clearTimeZone must be true.' };
      if (prefs.timeZone) {
        changes.timeZone = { from: prefs.timeZone, to: null };
        prefs = { ...prefs, timeZone: null, timeZoneSetAt: null };
      }
    }

    if (changes.freezes || changes.streak) store.setProgress(user.id, withFields(progress, fields));
    if (changes.dailyGoalId || changes.timeZone) store.updateUser(user.id, { preferences: { ...prefs, updatedAt: now.toISOString() } });
    return { ok: true, changes };
  }

  /**
   * How many learners chose each goal option (the admin's "N learners chose
   * this"), and how many have no choice - or one no longer offered - and
   * so follow the default.
   */
  function goalChoices() {
    const choiceCounts = {};
    for (const option of settings.current().goals.options) choiceCounts[option.id] = 0;
    let unset = 0;
    for (const user of store.allUsers()) {
      const chosen = prefsOf(user).dailyGoalId;
      if (chosen && Object.hasOwn(choiceCounts, chosen)) choiceCounts[chosen] += 1;
      else unset += 1;
    }
    return { choiceCounts, unset };
  }

  /**
   * "Who this affects" for the goal, streak and reminder sections, and the
   * Engagement card: goal choices, today's met goals, at-risk streaks,
   * freezes held and used, repairs open and done, zones known.
   */
  function engagement(now = new Date()) {
    const r = rules();
    const { choiceCounts: goalChoice, unset } = goalChoices();
    let metGoalToday = 0;
    let atRiskNow = 0;
    let streakTotal = 0;
    let withStreak = 0;
    let freezesHeld = 0;
    let freezesUsed7d = 0;
    let repairsOpen = 0;
    let repairsDone7d = 0;
    let learnersWithTimeZone = 0;
    const users = store.allUsers();
    const all = store.allProgress();
    for (const user of users) {
      const prefs = prefsOf(user);
      if (lib.isValidTimeZone(prefs.timeZone)) learnersWithTimeZone += 1;
      const progress = Object.hasOwn(all, user.id) ? store.getProgress(user.id) : null;
      if (!progress) continue;
      const status = habitSummary(user, progress, now);
      if (status.goal?.met) metGoalToday += 1;
      if (status.atRisk) atRiskNow += 1;
      if (status.streak > 0) {
        streakTotal += status.streak;
        withStreak += 1;
      }
      freezesHeld += status.freezes;
      if (status.repair) repairsOpen += 1;
      // The last 7 days. A freeze is used on a past day (today never is),
      // so today-7 to yesterday; a repair is completed on a day up to
      // today, so today-6 to today (one entry per repair).
      const settled = lib.settle(lib.streakFieldsOf(progress, r), status.day, r).state.habit;
      const weekAgo = lib.addDays(status.day, -7);
      freezesUsed7d += settled.frozenDays.filter((d) => d >= weekAgo).length;
      repairsDone7d += settled.repairedOn.filter((d) => d > weekAgo).length;
    }
    return {
      goalChoice,
      goalUnset: unset,
      metGoalToday,
      atRiskNow,
      avgStreak: withStreak > 0 ? Math.round((streakTotal / withStreak) * 10) / 10 : 0,
      learnersWithStreak: withStreak,
      freezesHeld,
      freezesUsed7d,
      repairsOpen,
      repairsDone7d,
      learnersWithTimeZone,
      learners: users.length
    };
  }

  return {
    rules,
    goalFor,
    habitSummary,
    streakFor,
    settledRow,
    recordSolveHabits,
    mergeHabitsFor,
    resetFields,
    userLearning,
    adminUpdate,
    goalChoices,
    engagement
  };
}
