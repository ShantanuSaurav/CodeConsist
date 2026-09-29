/**
 * The weekly league's admin routes (Phase 6). Mounted by server/admin.js
 * inside createAdminRouter, AFTER requireAdminAuth, so every route here is
 * behind the admin gate. Every change is audited.
 *
 *   GET   /leagues/weeks?limit=12
 *     -> { settings, current, weeks[] }: the league's switches, the week the
 *        default zone's today is in (stored or not yet), and one row per
 *        stored week, newest first - days, status, participants, total XP,
 *        when and by whom it closed.
 *   GET   /leagues/weeks/:id
 *     -> one week's standings: every learner with raw XP, the reset
 *        baseline, weekly XP, rank, exclusion, join time, time zone and -
 *        with tiers on - group, tier and zone (would move up or down); the
 *        groups; a closed week's results.
 *   POST  /leagues/weeks/:id/close    { confirm: <week id> }
 *   POST  /leagues/weeks/:id/reset    { confirm: <week id> }
 *     Close now (results written, tiers moved) / zero the board (each
 *     learner's XP so far becomes their baseline). The body must repeat the
 *     week id, else 400. Unknown week 404; a closed week 409.
 *   POST  /leagues/weeks/:id/exclude  { userId, excluded: boolean, reason? (<= 200) }
 *     Take a learner off a week's board, or put them back. Closed week 409.
 *   PATCH /leagues/members/:userId    { tierId }
 *     Move a learner to a tier (applies from the next week). Tiers only:
 *     409 while `league.tiers.enabled` is off.
 *
 * The service is server/leagues.js's, read per request through `getLearning`
 * (server/index.js's learningDeps): without it (a mocked test, before boot)
 * every route answers 503.
 */
import express from 'express';

/** Weeks listed by default, and at most. */
const DEFAULT_LIMIT = 12;
const MAX_LIMIT = 104;
/** An exclusion reason (server/leagues.js keeps at most this much). */
const REASON_MAX = 200;
/** How much of a reason goes into the audit log. */
const AUDIT_TEXT_MAX = 120;

function tierNameOf(tiers, tierId) {
  if (!tierId || !Array.isArray(tiers)) return null;
  return tiers.find((t) => t?.id === tierId)?.name ?? null;
}

function sumXp(rows) {
  return rows.reduce((sum, row) => sum + (Number.isFinite(row?.xp) ? row.xp : 0), 0);
}

/**
 * @param {object} deps
 * @param {() => ({ lib, settings, activity, leagues } | null)} deps.getLearning
 * @param {object} deps.store   server/db.js
 * @param {(req, action: string, target: string | null, details: object | null) => void} deps.audit
 */
export function createLeaguesAdminRouter({ getLearning, store, audit }) {
  const router = express.Router();

  /**
   * The learning services this router needs, or a 503 already sent. Weeks
   * past their final time close first (as on any learner read), so a week
   * whose results are final is shown closed and refuses changes with 409.
   */
  const withLeagues = (handler) => (req, res) => {
    const learning = getLearning?.() ?? null;
    if (!learning?.leagues || !learning.lib || !learning.settings || !learning.activity || typeof store.allLeagueWeeks !== 'function') {
      return res.status(503).json({ error: 'The weekly league is not available yet.' });
    }
    learning.leagues.closeDueWeeks(new Date());
    return handler(learning, req, res);
  };

  /** The confirmation a destructive week action needs: the week id, typed again. */
  function confirmed(req) {
    return typeof req.body?.confirm === 'string' && req.body.confirm === req.params.id;
  }

  /** One row of the week list. An open week's numbers are summed from the activity log now. */
  function weekRow(learning, week, now) {
    const closed = week.status === 'closed';
    let participants;
    let totalXp;
    let finalizeAt = null;
    if (closed) {
      const results = Array.isArray(week.results) ? week.results : [];
      participants = results.length;
      totalXp = sumXp(results);
    } else {
      const standing = learning.leagues.standings(week, now);
      const counted = standing ? standing.rows.filter((row) => row.rank !== null) : [];
      participants = counted.length;
      totalXp = sumXp(counted);
      finalizeAt = standing?.finalizeAt ?? null;
    }
    return {
      id: week.id,
      startDay: week.startDay,
      endDay: week.endDay,
      status: closed ? 'closed' : 'open',
      tiersEnabled: Boolean(week.rules?.tiersEnabled),
      participants,
      totalXp,
      finalizeAt,
      closedAt: week.closedAt ?? null,
      closedBy: week.closedBy ?? null
    };
  }

  /**
   * A week's standings for the admin page: every line the service ranks,
   * with the learner's time zone, the tier's name and - tiers on - where
   * the row stands in its group (up, down or neither), plus the groups and
   * a closed week's results.
   */
  function weekDetail(learning, weekId, now = new Date()) {
    const { lib, leagues, activity } = learning;
    const standing = leagues.standings(weekId, now);
    if (!standing) return null;
    const { week } = standing;
    const tiers = week.rules.tiers ?? [];
    const zoneByUser = new Map();
    if (week.rules.tiersEnabled) {
      for (const [groupId, group] of Object.entries(week.groups)) {
        const ranked = lib.rankLeague(standing.rows.filter((row) => row.groupId === groupId && !row.excluded && row.xp > 0));
        const tierIndex = lib.tierIndexOf(tiers, group?.tierId);
        ranked.forEach((row, i) => zoneByUser.set(row.userId, lib.zoneAt(i, row.xp, ranked.length, tierIndex, week.rules)));
      }
    }
    const rows = standing.rows.map((row) => {
      const user = store.findUserById(row.userId);
      return {
        ...row,
        tierName: tierNameOf(tiers, row.tierId),
        zone: zoneByUser.get(row.userId) ?? null,
        timeZone: user ? activity.zoneFor(user) : null,
        // The learner's tier record: where they play from the next week.
        memberTierId: store.getLeagueMember(row.userId)?.tierId ?? null
      };
    });
    const groups = Object.entries(week.groups).map(([id, group]) => ({
      id,
      tierId: group?.tierId ?? null,
      tierName: tierNameOf(tiers, group?.tierId),
      members: Array.isArray(group?.memberIds) ? group.memberIds.length : 0
    }));
    const results = week.results.map((row) => ({
      ...row,
      tierName: tierNameOf(tiers, row?.tierId),
      toTierName: tierNameOf(tiers, row?.toTierId)
    }));
    return {
      week: {
        id: week.id,
        startDay: week.startDay,
        endDay: week.endDay,
        weekStartsOn: week.weekStartsOn ?? null,
        status: week.status,
        createdAt: week.createdAt ?? null,
        closedAt: week.closedAt ?? null,
        closedBy: week.closedBy ?? null,
        resets: Array.isArray(week.resets) ? week.resets : [],
        rules: week.rules
      },
      finalizeAt: standing.finalizeAt,
      final: standing.final,
      participants: standing.participants,
      rows,
      groups,
      results
    };
  }

  router.get(
    '/leagues/weeks',
    withLeagues((learning, req, res) => {
      const raw = Number(req.query?.limit);
      const limit = Number.isInteger(raw) && raw > 0 ? Math.min(raw, MAX_LIMIT) : DEFAULT_LIMIT;
      const now = new Date();
      const rules = learning.settings.current().league;
      const today = learning.lib.dayKeyIn(learning.activity.zoneFor(null), now);
      const current = learning.leagues.weekOn(today, now);
      const stored = store.getLeagueWeek(current.id);
      const weeks = store
        .allLeagueWeeks()
        .slice()
        .reverse()
        .slice(0, limit)
        .map((week) => weekRow(learning, week, now));
      res.json({
        settings: {
          enabled: rules.enabled,
          weekStartsOn: rules.weekStartsOn,
          finalizeDelayHours: rules.finalizeDelayHours,
          boardSize: rules.boardSize,
          tiersEnabled: rules.tiers.enabled,
          tiers: rules.tiers.list.map((t) => ({ id: t.id, name: t.name }))
        },
        current: {
          id: current.id,
          startDay: current.startDay,
          endDay: current.endDay,
          stored: Boolean(stored),
          status: stored?.status === 'closed' ? 'closed' : 'open'
        },
        weeks
      });
    })
  );

  router.get(
    '/leagues/weeks/:id',
    withLeagues((learning, req, res) => {
      const detail = weekDetail(learning, req.params.id);
      if (!detail) return res.status(404).json({ error: 'There is no league week with that id.' });
      res.json(detail);
    })
  );

  router.post(
    '/leagues/weeks/:id/close',
    withLeagues((learning, req, res) => {
      if (!confirmed(req)) return res.status(400).json({ error: `Type the week id (${req.params.id}) to confirm.` });
      const result = learning.leagues.closeWeek(req.params.id, req.admin?.id ?? 'admin', new Date());
      if (!result.ok) return res.status(result.status).json({ error: result.error });
      audit(req, 'league.week.close', result.week.id, { weekId: result.week.id, participants: result.week.results.length });
      res.json(weekDetail(learning, result.week.id));
    })
  );

  router.post(
    '/leagues/weeks/:id/reset',
    withLeagues((learning, req, res) => {
      if (!confirmed(req)) return res.status(400).json({ error: `Type the week id (${req.params.id}) to confirm.` });
      const result = learning.leagues.resetWeek(req.params.id, req.admin?.id ?? 'admin', new Date());
      if (!result.ok) return res.status(result.status).json({ error: result.error });
      audit(req, 'league.week.reset', result.week.id, { weekId: result.week.id, affected: result.affected });
      res.json({ ...weekDetail(learning, result.week.id), affected: result.affected });
    })
  );

  router.post(
    '/leagues/weeks/:id/exclude',
    withLeagues((learning, req, res) => {
      const body = req.body ?? {};
      if (typeof body.userId !== 'string' || !body.userId) return res.status(400).json({ error: 'userId is required.' });
      if (typeof body.excluded !== 'boolean') return res.status(400).json({ error: 'excluded must be true or false.' });
      if (body.reason !== undefined && body.reason !== null && typeof body.reason !== 'string') {
        return res.status(400).json({ error: 'reason must be text.' });
      }
      const reason = typeof body.reason === 'string' ? body.reason.trim() : '';
      if (reason.length > REASON_MAX) return res.status(400).json({ error: `reason must be at most ${REASON_MAX} characters.` });
      const result = learning.leagues.exclude(req.params.id, body.userId, body.excluded, { by: req.admin?.id ?? null, reason }, new Date());
      if (!result.ok) return res.status(result.status).json({ error: result.error });
      const user = store.findUserById(body.userId);
      audit(req, body.excluded ? 'league.member.exclude' : 'league.member.reinstate', body.userId, {
        weekId: result.week.id,
        userId: body.userId,
        username: user?.username ?? null,
        wasExcluded: Boolean(result.before),
        ...(body.excluded && reason ? { reason: reason.slice(0, AUDIT_TEXT_MAX) } : {})
      });
      res.json(weekDetail(learning, result.week.id));
    })
  );

  router.patch(
    '/leagues/members/:userId',
    withLeagues((learning, req, res) => {
      if (!learning.settings.current().league.tiers.enabled) {
        return res.status(409).json({ error: 'Tiers are off. Turn them on in the league rules first.' });
      }
      const tierId = req.body?.tierId;
      if (typeof tierId !== 'string' || !tierId) return res.status(400).json({ error: 'tierId is required.' });
      const result = learning.leagues.setTier(req.params.userId, tierId, new Date());
      if (!result.ok) return res.status(result.status).json({ error: result.error });
      const user = store.findUserById(req.params.userId);
      audit(req, 'league.member.tier', req.params.userId, { userId: req.params.userId, username: user?.username ?? null, from: result.before, to: tierId });
      res.json({ member: { userId: req.params.userId, tierId: result.member.tierId, since: result.member.since ?? null }, before: result.before });
    })
  );

  return router;
}
