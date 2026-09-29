/**
 * The weekly league - the server side of src/platform/league/league.ts (the
 * same rules, compiled into learning.mjs and handed in as `lib`).
 *
 *   noteLeagueXp   a learner earned league XP on a day (solve, test-out,
 *                  Practice, a goal bonus - or a merge, when merged XP
 *                  counts): the week that day is in is created if needed,
 *                  their join time is recorded and, with tiers on, they are
 *                  put in a group of their tier.
 *   standings      a week's board: every learner's raw league XP (the sum of
 *                  their days' `leagueXp` in the week, in their own zone),
 *                  the admin's reset baseline, the weekly XP (never
 *                  negative), exclusion, join time, group and tier, ranked.
 *   closeWeek      writes the results (and, with tiers, each group's moves
 *                  up and down) and closes the week; a closed week is 409.
 *   closeDueWeeks  closes every open week past `finalizeAt` - lazily on
 *                  reads and on a timer in server/index.js. Never throws.
 *   resetWeek      zeroes the board: each learner's current XP becomes their
 *                  baseline. The activity log itself is left alone.
 *   exclude        takes a learner off (or back on) a week's board.
 *   setTier        moves a learner to a tier (it applies from the next week).
 *   view           GET /api/leagues/current's LeagueView.
 *
 * A week's XP is never stored: it is summed from the activity log each time,
 * so a merged or corrected day changes the board without bookkeeping here.
 * Every function is synchronous; the routes call them after their last
 * `await`, in the same tick as the progress and activity writes.
 */

const DAY_MS = 86_400_000;
/** The most days a week can span (a stored week is at most 7; this bounds a damaged one). */
const MAX_WEEK_DAYS = 14;
/** An admin's reason for excluding someone. */
const REASON_MAX = 200;
/** Admin resets remembered on a week. */
const RESETS_KEPT = 20;

function plainObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function own(map, key) {
  return map && typeof map === 'object' && Object.hasOwn(map, key) ? map[key] : undefined;
}

/** Write one entry into a keyed map, safely for any key (see server/db.js defineEntry). */
function define(map, key, value) {
  Object.defineProperty(map, key, { value, writable: true, enumerable: true, configurable: true });
  return value;
}

function copy(value) {
  return JSON.parse(JSON.stringify(value));
}

/** A stored week with every field present (a copy - the stored one is never changed in place). */
function normalizeWeek(raw) {
  const week = copy(plainObject(raw));
  week.status = week.status === 'closed' ? 'closed' : 'open';
  week.groups = plainObject(week.groups);
  week.joinedAt = plainObject(week.joinedAt);
  week.baseline = plainObject(week.baseline);
  week.excluded = plainObject(week.excluded);
  week.results = Array.isArray(week.results) ? week.results : [];
  week.rules = plainObject(week.rules);
  week.rules.tiers = Array.isArray(week.rules.tiers) ? week.rules.tiers : [];
  return week;
}

/**
 * @param {object} deps
 * @param {object} deps.lib       the compiled src/platform/server-lib.ts
 * @param {object} deps.store     server/db.js
 * @param {object} deps.settings  server/settings.js's service
 * @param {object} deps.activity  server/activity.js's service (zones and days)
 * @param {object} [deps.habits]  server/habits.js's service (the streak column)
 * @param {(msg: string) => void} [deps.logError]
 */
export function createLeaguesService({ lib, store, settings, activity, habits = null, logError = (msg) => console.error(msg) }) {
  const rules = () => settings.current().league;

  function usersById() {
    return new Map(store.allUsers().map((u) => [u.id, u]));
  }

  /** A new (not yet stored) week over `span`, with today's tier rules. */
  function newWeek(span, now) {
    const league = rules();
    return {
      id: span.id,
      startDay: span.startDay,
      endDay: span.endDay,
      weekStartsOn: lib.weekStartDay(league.weekStartsOn),
      // Tier changes apply from the next week: this week keeps these.
      rules: lib.tierRulesFrom(league),
      status: 'open',
      createdAt: now.toISOString(),
      groups: {},
      joinedAt: {},
      baseline: {},
      excluded: {},
      resets: [],
      closedAt: null,
      closedBy: null,
      results: []
    };
  }

  /** The week `day` is in: the stored one that covers it, else the one the rule gives (not stored). */
  function weekOn(day, now = new Date()) {
    const span = lib.weekFor(day, rules().weekStartsOn, store.allLeagueWeeks());
    const stored = store.getLeagueWeek(span.id);
    return stored ? normalizeWeek(stored) : newWeek(span, now);
  }

  /** When a week's results become final (ms). */
  function finalAt(week) {
    return lib.finalizeAt(week.endDay, rules().finalizeDelayHours);
  }

  /** A learner's league XP on each day of the week (their own days - the log is in their zone). */
  function rawXp(userId, week) {
    const log = store.getActivity(userId);
    const days = log && typeof log.days === 'object' && log.days ? log.days : null;
    if (!days || !lib.isDayKey(week.startDay) || !lib.isDayKey(week.endDay)) return 0;
    const xp = [];
    let day = week.startDay;
    for (let i = 0; i < MAX_WEEK_DAYS && day <= week.endDay; i += 1, day = lib.addDays(day, 1)) {
      if (Object.hasOwn(days, day)) xp.push(lib.normalizeDay(days[day]).leagueXp);
    }
    return lib.weeklyLeagueXp(xp);
  }

  /** The tier a learner plays in under a week's rules: their record's, else the lowest. */
  function tierIdFor(userId, weekRules) {
    const tiers = weekRules.tiers ?? [];
    if (tiers.length === 0) return null;
    return tiers[lib.tierIndexOf(tiers, store.getLeagueMember(userId)?.tierId)].id;
  }

  /**
   * Every learner on a week's board or known to it: `{ userId, username,
   * rawXp, baseline, xp, excluded, joinedAt, groupId, tierId, rank }`. `rank`
   * (competition style) is set for those who count - XP above 0, not
   * excluded - and null for the rest. Ranked rows come first, in board order.
   */
  function linesOf(week, users = usersById()) {
    const lines = [];
    for (const user of users.values()) {
      const raw = rawXp(user.id, week);
      const excluded = own(week.excluded, user.id) ?? null;
      const joinedAt = own(week.joinedAt, user.id);
      const groupId = lib.groupOf(week.groups, user.id);
      const baselineRaw = Number(own(week.baseline, user.id));
      const baseline = Number.isFinite(baselineRaw) && baselineRaw > 0 ? baselineRaw : 0;
      if (raw <= 0 && !excluded && !joinedAt && !groupId) continue;
      lines.push({
        userId: user.id,
        username: user.username,
        rawXp: raw,
        baseline,
        xp: lib.weeklyLeagueXp([raw], baseline),
        excluded: excluded ? { by: excluded.by ?? null, at: excluded.at ?? null, reason: excluded.reason ?? '' } : null,
        joinedAt: typeof joinedAt === 'string' ? joinedAt : null,
        groupId,
        tierId: groupId ? week.groups[groupId]?.tierId ?? null : null
      });
    }
    const counted = lib.rankLeague(lines.filter((l) => !l.excluded && l.xp > 0));
    const rest = lines.filter((l) => l.excluded || l.xp <= 0).map((l) => ({ ...l, rank: null }));
    return [...counted, ...rest];
  }

  /**
   * A closed week's board: the results it closed with, in their order and
   * ranks. XP a learner earns on a day of that week after an early close
   * ("Close week now") still lands on their day row, but never changes a board
   * whose results are final.
   */
  function resultLines(week, users = usersById()) {
    return (Array.isArray(week.results) ? week.results : [])
      .filter((r) => r && typeof r.userId === 'string' && Number.isInteger(r.rank))
      .map((r) => ({
        userId: r.userId,
        username: users.get(r.userId)?.username ?? r.username,
        rawXp: Number(r.xp) || 0,
        baseline: 0,
        xp: Number(r.xp) || 0,
        excluded: null,
        joinedAt: null,
        groupId: r.groupId ?? null,
        tierId: r.tierId ?? null,
        rank: r.rank
      }));
  }

  /**
   * A week's standings, for the admin's week page and the tests: the week
   * (stored, or - for an id no week has yet - null) and every line.
   */
  function standings(weekOrId, now = new Date()) {
    const week = typeof weekOrId === 'string' ? store.getLeagueWeek(weekOrId) : weekOrId;
    if (!week) return null;
    const normal = normalizeWeek(week);
    const lines = linesOf(normal);
    return {
      week: normal,
      finalizeAt: new Date(finalAt(normal)).toISOString(),
      final: finalAt(normal) <= now.getTime(),
      participants: lines.filter((l) => l.rank !== null).length,
      rows: lines
    };
  }

  /**
   * A learner earned league XP on `day` (their own day). When that day's row
   * has some and its week is still open (and not past its final time), the
   * week is stored if new, their join time recorded once and - with tiers on
   * for this week - they join a group of their tier. Idempotent. Never throws:
   * the league must never cost a learner their solve.
   */
  function noteLeagueXp(user, day, now = new Date()) {
    try {
      const league = rules();
      if (!league.enabled || !user?.id || !lib.isDayKey(day)) return null;
      const log = store.getActivity(user.id);
      const row = log?.days && Object.hasOwn(log.days, day) ? lib.normalizeDay(log.days[day]) : null;
      if (!row || row.leagueXp <= 0) return null;

      const span = lib.weekFor(day, league.weekStartsOn, store.allLeagueWeeks());
      const stored = store.getLeagueWeek(span.id);
      if (stored?.status === 'closed') return null;
      const week = stored ? normalizeWeek(stored) : newWeek(span, now);
      // A merged day from a week long gone never opens that week again, nor joins one whose results are final.
      if (finalAt(week) <= now.getTime()) return null;

      let changed = !stored;
      if (!own(week.joinedAt, user.id)) {
        define(week.joinedAt, user.id, now.toISOString());
        changed = true;
      }
      if (week.rules.tiersEnabled && !lib.groupOf(week.groups, user.id)) {
        const tierId = tierIdFor(user.id, week.rules);
        if (tierId) {
          week.groups = lib.assignGroup(week.groups, tierId, user.id, week.rules.groupSize).groups;
          if (!store.getLeagueMember(user.id)) store.setLeagueMember(user.id, { tierId, since: now.toISOString() });
          changed = true;
        }
      }
      if (changed) store.putLeagueWeek(week);
      return week;
    } catch (err) {
      logError(`[leagues] could not record league XP: ${err?.message ?? err}`);
      return null;
    }
  }

  /** Closed weeks past `retention.leagueWeeksKept` go, oldest first. Open weeks are never deleted. */
  function prune() {
    const keep = settings.current().retention.leagueWeeksKept;
    const closed = store.allLeagueWeeks().filter((w) => w.status === 'closed');
    for (const week of closed.slice(0, Math.max(0, closed.length - keep))) store.deleteLeagueWeek(week.id);
  }

  /**
   * The results of one group of a tiered week, and the tier each learner
   * moves to. Only those who count (XP above 0, not excluded - as the board
   * and its zones show them) are ranked; a member left at 0 XP (after an
   * admin reset) has no result and stays in their tier.
   */
  function groupResults(week, groupId, lines) {
    const group = week.groups[groupId];
    const tierIndex = lib.tierIndexOf(week.rules.tiers, group.tierId);
    const ranked = lib.rankLeague(lines.filter((l) => l.groupId === groupId && l.rank !== null));
    const outcomes = lib.groupOutcomes(ranked, tierIndex, week.rules);
    return ranked.map((entry, i) => ({
      userId: entry.userId,
      username: entry.username,
      xp: entry.xp,
      rank: entry.rank,
      groupId,
      tierId: group.tierId,
      outcome: outcomes[i].outcome,
      toTierId: outcomes[i].toTierId
    }));
  }

  /**
   * Learners whose tier just changed, taken out of the group they already
   * joined in a later week that is still open (they earned XP in it before
   * this week closed) and put in a group of their new tier there.
   */
  function rehome(afterDay, moved) {
    if (moved.length === 0) return;
    for (const stored of store.allLeagueWeeks()) {
      if (stored?.status === 'closed' || !(stored?.startDay > afterDay)) continue;
      const week = normalizeWeek(stored);
      if (!week.rules.tiersEnabled) continue;
      let changed = false;
      for (const userId of moved) {
        const from = lib.groupOf(week.groups, userId);
        const tierId = tierIdFor(userId, week.rules);
        if (!from || !tierId || week.groups[from].tierId === tierId) continue;
        const left = week.groups[from].memberIds.filter((m) => m !== userId);
        if (left.length > 0) define(week.groups, from, { ...week.groups[from], memberIds: left });
        else delete week.groups[from];
        week.groups = lib.assignGroup(week.groups, tierId, userId, week.rules.groupSize).groups;
        changed = true;
      }
      if (changed) store.putLeagueWeek(week);
    }
  }

  /**
   * Close a week: write its results and mark it closed. With tiers on (as
   * the week started), each group's top learners move up and bottom ones
   * down - their tier records change now, for the next week (and a learner
   * who already joined the next week moves to a group of the new tier). A
   * learner an admin moved to another tier during the week keeps the admin's
   * tier. `by` is 'auto' (the timer, a read) or the admin's id.
   */
  function closeWeek(id, by = 'auto', now = new Date()) {
    const stored = store.getLeagueWeek(String(id ?? ''));
    if (!stored) return { ok: false, status: 404, error: 'There is no league week with that id.' };
    if (stored.status === 'closed') return { ok: false, status: 409, error: 'That week is already closed.' };
    const week = normalizeWeek(stored);
    const lines = linesOf(week);
    let results;
    if (week.rules.tiersEnabled) {
      results = Object.keys(week.groups).flatMap((groupId) => groupResults(week, groupId, lines));
      const at = now.toISOString();
      const moved = [];
      for (const row of results) {
        const current = tierIdFor(row.userId, week.rules);
        if (current && current !== row.tierId) {
          // Their record no longer names the tier they played in: an admin moved
          // them (Move tier) during the week. That wins, and the result says so.
          const from = lib.tierIndexOf(week.rules.tiers, row.tierId);
          const to = lib.tierIndexOf(week.rules.tiers, current);
          row.toTierId = current;
          row.outcome = to > from ? 'promoted' : to < from ? 'demoted' : 'stayed';
          continue;
        }
        if (!row.toTierId || row.toTierId === row.tierId) continue;
        store.setLeagueMember(row.userId, { tierId: row.toTierId, since: at });
        moved.push(row.userId);
      }
      rehome(week.endDay, moved);
    } else {
      results = lines
        .filter((l) => l.rank !== null)
        .map((l) => ({ userId: l.userId, username: l.username, xp: l.xp, rank: l.rank, groupId: null, tierId: null, outcome: 'single', toTierId: null }));
    }
    week.results = results;
    week.status = 'closed';
    week.closedAt = now.toISOString();
    week.closedBy = String(by ?? 'auto');
    store.putLeagueWeek(week);
    prune();
    return { ok: true, week };
  }

  /**
   * Close every open week whose results are final by `now`. Lazily on reads
   * and on the timer; idempotent (a closed week is skipped). Never throws -
   * a failure is logged and the next run tries again. Returns the ids closed.
   */
  function closeDueWeeks(now = new Date()) {
    const closed = [];
    try {
      const at = now.getTime();
      for (const week of store.allLeagueWeeks()) {
        if (week?.status === 'closed' || !lib.isDayKey(week?.endDay)) continue;
        if (finalAt(week) > at) continue;
        try {
          if (closeWeek(week.id, 'auto', now).ok) closed.push(week.id);
        } catch (err) {
          logError(`[leagues] could not close week ${week.id}: ${err?.message ?? err}`);
        }
      }
    } catch (err) {
      logError(`[leagues] could not check for weeks to close: ${err?.message ?? err}`);
    }
    return closed;
  }

  /**
   * An open week that can still change, or why not: 404 unknown, 409 closed -
   * or past its final time (its results are final; the next close run, or
   * the next read, writes them).
   */
  function openWeek(id, now = new Date()) {
    const stored = store.getLeagueWeek(String(id ?? ''));
    if (!stored) return { ok: false, status: 404, error: 'There is no league week with that id.' };
    if (stored.status === 'closed') return { ok: false, status: 409, error: 'That week is already closed.' };
    const week = normalizeWeek(stored);
    if (lib.isDayKey(week.endDay) && finalAt(week) <= now.getTime()) {
      return { ok: false, status: 409, error: 'That week is over and its results are final.' };
    }
    return { ok: true, week };
  }

  /**
   * Zero a week's board: every learner's league XP so far becomes their
   * baseline, so only what they earn from now on counts. The days themselves
   * are not touched. Returns how many learners it zeroed.
   */
  function resetWeek(id, by, now = new Date()) {
    const found = openWeek(id, now);
    if (!found.ok) return found;
    const week = found.week;
    let affected = 0;
    for (const user of store.allUsers()) {
      const raw = rawXp(user.id, week);
      if (raw <= 0) continue;
      define(week.baseline, user.id, raw);
      affected += 1;
    }
    week.resets = [...(Array.isArray(week.resets) ? week.resets : []), { at: now.toISOString(), by: String(by ?? '') }].slice(-RESETS_KEPT);
    store.putLeagueWeek(week);
    return { ok: true, week, affected };
  }

  /** Take a learner off a week's board (`excluded: true`) or put them back. */
  function exclude(id, userId, excluded, { by = null, reason = '' } = {}, now = new Date()) {
    const found = openWeek(id, now);
    if (!found.ok) return found;
    if (!store.findUserById(String(userId ?? ''))) return { ok: false, status: 404, error: 'There is no such learner.' };
    const week = found.week;
    const key = String(userId);
    const before = own(week.excluded, key) ?? null;
    if (excluded) define(week.excluded, key, { by: by ? String(by) : null, at: now.toISOString(), reason: String(reason ?? '').slice(0, REASON_MAX) });
    else delete week.excluded[key];
    store.putLeagueWeek(week);
    return { ok: true, week, before };
  }

  /** Move a learner to a tier of the current list. Their group this week stays; it applies from the next. */
  function setTier(userId, tierId, now = new Date()) {
    if (!store.findUserById(String(userId ?? ''))) return { ok: false, status: 404, error: 'There is no such learner.' };
    const tiers = rules().tiers.list;
    if (!tiers.some((t) => t.id === tierId)) return { ok: false, status: 400, error: `tierId must be one of: ${tiers.map((t) => t.id).join(', ')}.` };
    const before = store.getLeagueMember(userId)?.tierId ?? null;
    const member = store.setLeagueMember(userId, { tierId, since: now.toISOString() });
    return { ok: true, member, before };
  }

  /**
   * The learner's result in last week - the closed week that ends the day
   * before `week` starts - or null. An older week (no one played the weeks
   * in between, or last week has not closed yet) is not "last week".
   */
  function lastResultFor(userId, week) {
    const closed = store.allLeagueWeeks().filter((w) => w.status === 'closed' && w.endDay < week.startDay);
    const last = closed[closed.length - 1];
    if (!last || last.endDay !== lib.addDays(week.startDay, -1)) return null;
    const row = (Array.isArray(last.results) ? last.results : []).find((r) => r?.userId === userId);
    if (!row) return null;
    const tiers = Array.isArray(last.rules?.tiers) ? last.rules.tiers : [];
    const tierName = row.toTierId ? tiers.find((t) => t.id === row.toTierId)?.name ?? null : null;
    return { weekId: last.id, rank: row.rank, xp: row.xp, outcome: row.outcome ?? 'single', tierName };
  }

  /**
   * GET /api/leagues/current: the week the viewer's today is in, its board
   * (their group's, with tiers on) cut to `league.boardSize`, their own place
   * even outside it, and last week's result. A guest's today is in `tz` when
   * it is a valid zone, else the default zone; a guest is never ranked.
   */
  function view(user, { tz = null, now = new Date() } = {}) {
    const league = rules();
    if (!league.enabled) {
      return { enabled: false, week: null, tiersEnabled: false, tier: null, zones: null, rows: [], me: null, participants: 0, lastResult: null };
    }
    closeDueWeeks(now);
    const zone = user ? activity.zoneFor(user) : lib.isValidTimeZone(tz) ? tz : activity.zoneFor(null);
    const day = user ? activity.todayFor(user, undefined, now) : lib.dayKeyIn(zone, now);
    const week = weekOn(day, now);
    const users = usersById();
    const closed = week.status === 'closed';
    const lines = closed ? resultLines(week, users) : linesOf(week, users);
    const counted = lines.filter((l) => l.rank !== null);

    let board = counted;
    let tier = null;
    let tierIndex = 0;
    const mine = user ? lines.find((l) => l.userId === user.id) : null;
    if (week.rules.tiersEnabled && mine?.groupId && week.groups[mine.groupId]) {
      const group = week.groups[mine.groupId];
      tierIndex = lib.tierIndexOf(week.rules.tiers, group.tierId);
      const found = week.rules.tiers[tierIndex];
      tier = { id: found.id, name: found.name, index: tierIndex, count: week.rules.tiers.length };
      const members = counted.filter((l) => l.groupId === mine.groupId);
      // A closed group keeps the ranks it closed with.
      board = closed ? members : lib.rankLeague(members);
    }
    const zoneAt = (i, entry) => (tier ? lib.zoneAt(i, entry.xp, board.length, tierIndex, week.rules) : null);
    const size = league.boardSize;
    const progress = store.allProgress();
    const streakOf = (userId) => {
      const u = users.get(userId);
      try {
        // As the all-time board shows it: this learner's today, freezes applied.
        return u && habits ? habits.streakFor(u, Object.hasOwn(progress, u.id) ? progress[u.id] : store.EMPTY_PROGRESS, now) : 0;
      } catch {
        return 0;
      }
    };
    const rows = board.slice(0, size).map((entry, i) => ({
      rank: entry.rank,
      username: entry.username,
      xp: entry.xp,
      streak: streakOf(entry.userId),
      isYou: Boolean(user && entry.userId === user.id),
      zone: zoneAt(i, entry)
    }));
    const at = user ? board.findIndex((entry) => entry.userId === user.id) : -1;
    const me = at === -1 ? null : { rank: board[at].rank, xp: board[at].xp, zone: zoneAt(at, board[at]), inRows: at < size };
    const leftToday = lib.msUntilLocalMidnight(now, zone);
    const daysAfter = Math.max(0, lib.daysBetween(day, week.endDay));
    return {
      enabled: true,
      week: {
        id: week.id,
        startDay: week.startDay,
        endDay: week.endDay,
        status: week.status,
        endsInMs: week.status === 'closed' ? 0 : leftToday + daysAfter * DAY_MS,
        finalizesInMs: Math.max(0, finalAt(week) - now.getTime())
      },
      tiersEnabled: Boolean(week.rules.tiersEnabled),
      tier,
      zones: tier ? lib.groupZones(board.length, week.rules) : null,
      rows,
      me,
      participants: board.length,
      lastResult: user ? lastResultFor(user.id, week) : null
    };
  }

  /** For the admin's user drawer: the learner's tier and their place this week. */
  function summaryFor(user, now = new Date()) {
    const today = activity.todayFor(user, undefined, now);
    const week = weekOn(today, now);
    const line = linesOf(week).find((l) => l.userId === user.id) ?? null;
    const league = rules();
    const tierId = store.getLeagueMember(user.id)?.tierId ?? null;
    return {
      enabled: league.enabled,
      tiersEnabled: league.tiers.enabled,
      tierId,
      tierName: tierId ? league.tiers.list.find((t) => t.id === tierId)?.name ?? null : null,
      week: { id: week.id, startDay: week.startDay, endDay: week.endDay, xp: line?.xp ?? 0, rank: line?.rank ?? null, excluded: Boolean(line?.excluded) }
    };
  }

  return { rules, weekOn, standings, noteLeagueXp, closeWeek, closeDueWeeks, resetWeek, exclude, setTier, view, summaryFor, lastResultFor };
}
