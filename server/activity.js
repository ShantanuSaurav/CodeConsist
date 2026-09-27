/**
 * Each learner's days and wrong answers - the server side of
 * src/platform/activity/log.ts.
 *
 * Days are counted in the LEARNER's time zone:
 *   - `zoneFor(user)`: their stored zone, else `streak.defaultTimeZone`, else
 *     the server's own zone (which is what every day was before zones).
 *   - `captureZone(req, user)`: write routes store the browser's
 *     `X-Time-Zone` header on first sight, or when it changed and the
 *     cooldown (`streak.timeZoneChangeCooldownHours`) has passed. Invalid
 *     values are ignored. Read routes never change the zone.
 *   - `todayFor(user, progress)`: the local day, but never earlier than the
 *     last day anything was recorded on - flipping zones back and forth
 *     cannot replay a day.
 *
 * Everything here is synchronous. The routes call it after their last
 * `await`, in the same tick as `setProgress`, so two requests can never
 * interleave between reading a log and writing it back.
 */

const MINUTE = 60_000;

function plainObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

/**
 * @param {object} deps
 * @param {object} deps.lib        the compiled src/platform/server-lib.ts
 * @param {object} deps.store      server/db.js
 * @param {object} deps.settings   server/settings.js's service
 * @param {(id: string) => object | null} deps.getChallengeMerged
 * @param {(challenge: object, answer: unknown) => boolean} deps.gradeAnswer  the authoritative non-code grader
 * @param {() => string | null} [deps.serverZone]  the process's own zone
 */
export function createActivityService({ lib, store, settings, getChallengeMerged, gradeAnswer, serverZone }) {
  const ownZone = serverZone ?? (() => lib.browserTimeZone());

  const rules = () => lib.activityRulesFrom(settings.current().retention);
  const prefsOf = (user) => store.normalizePreferences?.(user?.preferences) ?? plainObject(user?.preferences);

  /** A progress row WITHOUT creating one (store.getProgress inserts on a miss). */
  function progressOf(userId) {
    const all = store.allProgress();
    return Object.hasOwn(all, String(userId)) ? all[String(userId)] : null;
  }

  function zoneFor(user) {
    const own = prefsOf(user).timeZone;
    if (lib.isValidTimeZone(own)) return own;
    const fallback = settings.current().streak.defaultTimeZone;
    if (lib.isValidTimeZone(fallback)) return fallback;
    return ownZone();
  }

  /** Store the browser's zone when it is new, or changed after the cooldown. Returns whether it was stored. */
  function captureZone(req, user, now = new Date()) {
    if (!user?.id) return false;
    const header = typeof req?.get === 'function' ? req.get('x-time-zone') : req?.headers?.['x-time-zone'];
    if (!lib.isValidTimeZone(header)) return false;
    const prefs = prefsOf(user);
    if (prefs.timeZone === header) return false;
    if (lib.isValidTimeZone(prefs.timeZone)) {
      const setAt = Date.parse(prefs.timeZoneSetAt ?? '');
      const cooldown = settings.current().streak.timeZoneChangeCooldownHours * 60 * MINUTE;
      if (Number.isFinite(setAt) && now.getTime() - setAt < cooldown) return false;
    }
    const at = now.toISOString();
    store.updateUser(user.id, { preferences: { ...prefs, timeZone: header, timeZoneSetAt: at, updatedAt: at } });
    return true;
  }

  /**
   * The learner's current day: local in their zone, but never before the
   * last day already recorded - and never after the latest day it can be
   * anywhere on Earth, so one forged date cannot stick forever. The same
   * rule as the browser's `todayKey` (src/platform/time/days.ts `learnerDay`).
   */
  function todayFor(user, progress = progressOf(user?.id), now = new Date()) {
    const stored = store.getActivity(user?.id);
    return lib.learnerDay(zoneFor(user), [stored?.lastDay, progress?.lastActiveDay], now);
  }

  function lookup(id) {
    const challenge = getChallengeMerged(id);
    return challenge ? { isStageTest: Boolean(challenge.isStageTest), xpReward: challenge.xpReward } : null;
  }

  /** Days rebuilt from the progress row's solve times, for a log that predates this store. */
  function backfilled(user, log, now = new Date()) {
    const s = settings.current();
    const zone = zoneFor(user);
    const days = lib.backfillFromAttempts(progressOf(user.id)?.attempts, lookup, zone, s.xp, {
      maxAttempts: s.xp.maxAttemptsCounted,
      maxHints: s.xp.maxHintsCounted
    });
    return lib.withBackfill(log, days, now.toISOString(), rules(), lib.dayKeyIn(zone, now));
  }

  /** The learner's log, normalized - and backfilled once if it never was (not saved here). */
  function load(user, now = new Date()) {
    const log = lib.normalizeActivityLog(store.getActivity(user.id));
    return log.backfilledAt ? log : backfilled(user, log, now);
  }

  function save(user, log) {
    const clean = { ...log };
    delete clean.ownerId;
    store.putActivity(user.id, clean);
    return clean;
  }

  /**
   * A verified solve: the day row it lands on, after it. A solve that
   * completed a unit counts in the day's `units`, and its perfect-unit bonus
   * in `perfectBonusXp` (and `xp`).
   */
  function recordSolve(user, { challengeId, isTest, firstSolve, awardedXp, unitCompleted = false, perfectBonusXp = 0, day, at }) {
    const log = lib.applyActivityEvent(
      load(user),
      {
        type: 'solve',
        challengeId,
        isTest: Boolean(isTest),
        firstSolve: Boolean(firstSolve),
        awardedXp,
        unitCompleted: Boolean(unitCompleted),
        perfectBonusXp: Number(perfectBonusXp) || 0
      },
      { day, at, rules: rules() }
    );
    save(user, log);
    return lib.dayRow(log, day);
  }

  /**
   * Wrong answers, already validated and reduced by the route
   * (`{ challengeId, answer, keys, context, final, at }`). A miss from the
   * current local day lands on `today`; an older one (queued offline) on its
   * own day. The daily caps drop the rest.
   */
  function recordMisses(user, items, now = new Date()) {
    const retention = settings.current().retention;
    const zone = zoneFor(user);
    const today = todayFor(user, progressOf(user.id), now);
    const localNow = lib.dayKeyIn(zone, now);
    const caps = { perDay: retention.missesPerDay, perItemPerDay: retention.missesPerItemPerDay };
    let log = load(user, now);
    let accepted = 0;
    let dropped = 0;
    const touched = new Set();

    for (const item of items) {
      const localDay = lib.dayKeyIn(zone, new Date(item.at));
      const day = localDay >= localNow || localDay > today ? today : localDay;
      const duplicate = log.missLog.some((e) => e.challengeId === item.challengeId && e.at === item.at);
      if (duplicate || !lib.missAllowed(log, item.challengeId, day, caps)) {
        dropped += 1;
        continue;
      }
      log = lib.applyActivityEvent(
        log,
        { type: 'miss', challengeId: item.challengeId, context: item.context, answer: item.answer, final: item.final, keys: item.keys },
        { day, at: item.at, rules: rules() }
      );
      accepted += 1;
      touched.add(item.challengeId);
    }

    if (accepted > 0) save(user, log);
    const misses = {};
    for (const id of touched) Object.defineProperty(misses, id, { value: log.misses[id], enumerable: true, writable: true, configurable: true });
    return { accepted, dropped, today: lib.dayRow(log, today), misses };
  }

  /**
   * Fold a guest's (or this account's offline) log into the account. Nothing
   * received is taken on trust:
   *   - a miss-log entry needs a known challenge and a time that is not in
   *     the future; its day is worked out again from that time in the
   *     account's zone (the day sent is ignored), its answer must reduce
   *     cleanly, and a non-code answer the grader accepts is dropped - a
   *     correct answer is never recorded as a miss;
   *   - a miss summary needs a known challenge and a last time that is not in
   *     the future; only real wrong-answer keys survive, a correct last answer
   *     is dropped, and `codeOnly` follows the challenge;
   *   - the daily caps (`retention.missesPerDay`, `missesPerItemPerDay`)
   *     bound the entries taken, a day's mistakes and a summary's counts.
   */
  function merge(user, incoming, { credits = [], today, now = new Date() }) {
    const retention = settings.current().retention;
    const maxChars = retention.answerMaxChars;
    const latest = now.getTime() + 5 * MINUTE;
    const zone = zoneFor(user);
    const localNow = lib.dayKeyIn(zone, now);
    const acceptEntry = (entry) => {
      const challenge = getChallengeMerged(entry.challengeId);
      const at = Date.parse(entry.at);
      if (!challenge || !(at <= latest)) return null;
      // As recordMisses does it: a miss from the current local day lands on
      // `today` (which a zone flip may have moved ahead); an older one on its own day.
      const localDay = lib.dayKeyIn(zone, new Date(at));
      const day = localDay >= localNow || localDay > today ? today : localDay;
      if (!entry.answer) return { ...entry, day, answer: null };
      const answer = lib.normalizeMissAnswer(challenge, entry.answer, maxChars);
      if (!answer) return null;
      if (answer.kind !== 'code' && gradeAnswer(challenge, lib.rawAnswerFromMiss(challenge, answer))) return null;
      return { ...entry, day, answer };
    };
    const acceptMiss = (id, summary) => {
      const challenge = getChallengeMerged(id);
      if (!challenge || !(Date.parse(summary.lastAt) <= latest)) return null;
      return lib.checkMissSummary(challenge, summary, { maxChars, grade: gradeAnswer });
    };
    const log = lib.mergeActivityLogs(load(user, now), incoming, {
      today,
      rules: rules(),
      credits,
      acceptEntry,
      acceptMiss,
      caps: { perDay: retention.missesPerDay, perItemPerDay: retention.missesPerItemPerDay }
    });
    return save(user, log);
  }

  /**
   * `GET /api/activity`: the days from `from` (default 97 days before today,
   * at most 400) through today, every miss summary, and the zone they are in.
   */
  function view(user, { from, now = new Date() } = {}) {
    const today = todayFor(user, progressOf(user.id), now);
    let start = lib.isDayKey(from) ? from : lib.addDays(today, -97);
    if (lib.daysBetween(start, today) > 400) start = lib.addDays(today, -400);
    if (start > today) start = today;
    const log = load(user, now);
    const days = {};
    for (const day of Object.keys(log.days)) if (day >= start && day <= today) days[day] = log.days[day];
    return { timeZone: zoneFor(user), today, from: start, days, misses: log.misses, lastDay: log.lastDay };
  }

  /** A progress reset clears the wrong answers; the days stay (they are history). */
  function reset(user) {
    const log = load(user);
    save(user, { ...log, misses: {}, missLog: [] });
  }

  /** For the admin's user drawer: zone, the last 14 weeks, and the most-missed questions. */
  function learning(user, now = new Date()) {
    const today = todayFor(user, progressOf(user.id), now);
    const log = load(user, now);
    const from = lib.addDays(today, -97);
    const days = {};
    for (const day of Object.keys(log.days)) if (day >= from && day <= today) days[day] = log.days[day];
    const misses = Object.entries(log.misses)
      .sort(([, a], [, b]) => b.count - a.count || Date.parse(b.lastAt) - Date.parse(a.lastAt))
      .slice(0, 20)
      .map(([challengeId, summary]) => ({ challengeId, ...summary }));
    return { timeZone: zoneFor(user), timeZoneSetAt: prefsOf(user).timeZoneSetAt ?? null, today, from, days, misses };
  }

  /**
   * One pass at boot: every account with solves but no backfilled log gets
   * its days rebuilt from `attempts`. Idempotent - a log that has been
   * backfilled is never touched again. Returns how many were filled.
   */
  function backfillAll(now = new Date()) {
    let filled = 0;
    for (const user of store.allUsers()) {
      const stored = store.getActivity(user.id);
      if (stored?.backfilledAt) continue;
      const attempts = progressOf(user.id)?.attempts;
      if (!stored && !(attempts && Object.keys(attempts).length)) continue;
      save(user, backfilled(user, lib.normalizeActivityLog(stored), now));
      filled += 1;
    }
    return filled;
  }

  return { zoneFor, captureZone, todayFor, recordSolve, recordMisses, merge, view, reset, learning, backfillAll, load, rules };
}
