/**
 * The admin API - every route here is mounted at /api/admin/* and every
 * route requires a valid ADMINISTRATOR session token, verified by
 * `requireAdminAuth` (server/admin-auth.js) against the single, separate
 * `admin` record in server/db.js.
 *
 * This is the one and only gate. There is no client-side "if (isAdmin)"
 * anywhere that matters: the React admin app (src/admin) calls these
 * endpoints and renders whatever they return, but it could be deleted
 * entirely and a learner's token - or no token at all - would still get a
 * 401 from every single route below. `requireAdminAuth` re-derives
 * authorization from the live admin record on every request, including
 * checking that the token's `credentialsVersion` still matches (so a
 * credential change invalidates every previously issued admin token
 * immediately) - never from anything the client asserts about itself.
 *
 * A learner's own bearer token (from /api/auth/login) is a structurally
 * different token and will never pass `requireAdminAuth` - there is no
 * shared "role" field being checked here, because there is no longer any
 * such field at all (see server/db.js: an administrator is not a row in
 * `users`).
 */
import express from 'express';
import * as store from './db.js';
import { contentSnapshot, applyChallengeOverride, applyStageOverride } from './content.js';
import { requireAdminAuth, publicAdmin, updateAdminCredentials } from './admin-auth.js';
import * as excel from './excel.js';

const asyncRoute = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

/** Never the passwordHash. Adds the small progress summary the Users page needs. */
function adminUserRow(user) {
  const progress = store.getProgress(user.id);
  return {
    id: user.id,
    email: user.email,
    username: user.username,
    isPremium: Boolean(user.isPremium),
    createdAt: user.createdAt ?? null,
    xp: progress.xp,
    level: progress.level,
    streak: progress.streak,
    completedChallenges: progress.completedChallenges.length,
    completedStages: progress.completedStages.length,
    lastActiveDay: progress.lastActiveDay
  };
}

export function createAdminRouter() {
  const router = express.Router();
  router.use(express.json({ limit: '256kb' }));
  router.use(requireAdminAuth);

  function audit(req, action, target, details) {
    store.appendAudit({
      adminId: req.admin.id,
      adminUsername: req.admin.userId,
      action,
      target,
      // `details` is built by each route below from ids/flags/numbers only -
      // never from a request body field that could carry a secret, and
      // never the password/hash/token itself even for credential-change
      // events (see the /settings/credentials route below).
      details: details ?? null
    });
  }

  /* -------------------------------------------------------------- who am I */
  router.get('/me', (req, res) => {
    res.json({ admin: publicAdmin(req.admin) });
  });

  /* ------------------------------------------------------------- dashboard */
  router.get(
    '/dashboard',
    asyncRoute(async (_req, res) => {
      const snapshot = contentSnapshot();
      const users = store.allUsers();
      const allProgress = store.allProgress();
      const now = Date.now();
      const DAY = 24 * 60 * 60 * 1000;

      let totalXp = 0;
      let totalSolved = 0;
      let activeLast7Days = 0;
      for (const user of users) {
        const p = allProgress[user.id];
        if (!p) continue;
        totalXp += p.xp ?? 0;
        totalSolved += (p.completedChallenges ?? []).length;
        if (p.lastActiveDay) {
          const last = new Date(`${p.lastActiveDay}T00:00:00Z`).getTime();
          if (!Number.isNaN(last) && now - last <= 7 * DAY) activeLast7Days += 1;
        }
      }

      const signupsByDay = {};
      for (const user of users) {
        if (!user.createdAt) continue;
        const day = String(user.createdAt).slice(0, 10);
        signupsByDay[day] = (signupsByDay[day] ?? 0) + 1;
      }
      const last14Days = Array.from({ length: 14 }, (_, i) => {
        const d = new Date(now - (13 - i) * DAY);
        const key = d.toISOString().slice(0, 10);
        return { day: key, signups: signupsByDay[key] ?? 0 };
      });

      res.json({
        totals: {
          // Learner accounts only - the administrator is never a row in
          // `users` (see server/db.js), so there is nothing to exclude here.
          users: users.length,
          premium: users.filter((u) => u.isPremium).length,
          challenges: snapshot?.challenges.length ?? 0,
          stages: snapshot?.stages.length ?? 0,
          totalXpAwarded: totalXp,
          totalSolves: totalSolved,
          activeLast7Days
        },
        signupsByDay: last14Days,
        judge0Configured: process.env.JUDGE0_API_URL ? true : false,
        excel: excel.excelSettingsSummary()
      });
    })
  );

  /* ----------------------------------------------------------------- users */
  router.get('/users', (req, res) => {
    const q = String(req.query.q ?? '').trim().toLowerCase();
    let rows = store.allUsers().map(adminUserRow);
    if (q) {
      rows = rows.filter((u) => u.username.toLowerCase().includes(q) || u.email.toLowerCase().includes(q));
    }
    rows.sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''));
    res.json({ users: rows });
  });

  router.patch('/users/:id', (req, res) => {
    const target = store.findUserById(req.params.id);
    if (!target) return res.status(404).json({ error: 'No such user.' });

    const patch = {};
    const changes = {};

    if (req.body?.isPremium !== undefined) {
      const isPremium = Boolean(req.body.isPremium);
      if (isPremium !== Boolean(target.isPremium)) {
        patch.isPremium = isPremium;
        changes.isPremium = { from: Boolean(target.isPremium), to: isPremium };
      }
    }
    if (typeof req.body?.username === 'string') {
      const username = req.body.username.trim();
      if (username.length >= 2 && username.length <= 24 && username !== target.username) {
        const clash = store.findUserByUsername(username);
        if (clash && clash.id !== target.id) return res.status(409).json({ error: 'That username is taken.' });
        patch.username = username;
        changes.username = { from: target.username, to: username };
      }
    }

    if (Object.keys(patch).length === 0) return res.json({ user: adminUserRow(target) });

    const updated = store.updateUser(target.id, patch);
    audit(req, 'user.update', target.id, changes);
    res.json({ user: adminUserRow(updated) });
  });

  router.delete('/users/:id', (req, res) => {
    const target = store.findUserById(req.params.id);
    if (!target) return res.status(404).json({ error: 'No such user.' });
    store.deleteUser(target.id);
    audit(req, 'user.delete', target.id, { username: target.username, email: target.email });
    res.json({ ok: true });
  });

  /* ------------------------------------------------------------- analytics */
  router.get('/analytics', (_req, res) => {
    const snapshot = contentSnapshot();
    const allProgress = store.allProgress();
    const users = store.allUsers();

    const solvedCount = new Map(); // challengeId -> number of users who solved it
    const attemptCount = new Map(); // challengeId -> number of users who attempted it
    for (const user of users) {
      const p = allProgress[user.id];
      if (!p) continue;
      for (const id of p.completedChallenges ?? []) solvedCount.set(id, (solvedCount.get(id) ?? 0) + 1);
      for (const id of Object.keys(p.attempts ?? {})) attemptCount.set(id, (attemptCount.get(id) ?? 0) + 1);
    }

    const byLanguage = {};
    const byStage = [];
    for (const stage of snapshot?.stages ?? []) {
      const challenges = (snapshot?.challenges ?? []).filter((c) => c.stageId === stage.id);
      let solved = 0;
      for (const c of challenges) solved += solvedCount.get(c.id) ?? 0;
      byStage.push({
        stageId: stage.id,
        name: stage.name,
        language: stage.language,
        challengeCount: challenges.length,
        totalSolves: solved
      });
      byLanguage[stage.language] = (byLanguage[stage.language] ?? 0) + challenges.length;
    }

    // Attempted-but-rarely-solved is the honest signal for "this one is too
    // hard or badly worded" - never invented, always derived from real attempts.
    const mostMissed = (snapshot?.challenges ?? [])
      .map((c) => {
        const attempts = attemptCount.get(c.id) ?? 0;
        const solved = solvedCount.get(c.id) ?? 0;
        return { id: c.id, title: c.title, stageId: c.stageId, attempts, solved };
      })
      .filter((r) => r.attempts >= 3 && r.solved < r.attempts)
      .sort((a, b) => b.attempts - a.attempts - (b.solved - a.solved))
      .slice(0, 15);

    res.json({ byStage, challengesByLanguage: byLanguage, mostMissed });
  });

  /* ------------------------------------------------------------- audit log */
  router.get('/audit-log', (req, res) => {
    const limit = Math.max(1, Math.min(500, Number(req.query.limit) || 100));
    res.json({ entries: store.listAudit({ limit }) });
  });

  /* -------------------------------------------------------- content: langs */
  router.get('/content/languages', (_req, res) => {
    const snapshot = contentSnapshot();
    const overrides = store.getContentOverrides().languages;
    const tracks = (snapshot?.languageTracks ?? []).map((track) => ({
      ...track,
      hidden: Boolean(overrides[track.id]?.hidden),
      stageCount: (snapshot?.stages ?? []).filter((s) => track.stageIds.includes(s.id)).length,
      challengeCount: (snapshot?.challenges ?? []).filter((c) =>
        track.stageIds.includes(c.stageId)
      ).length
    }));
    res.json({ languages: tracks });
  });

  router.patch('/content/languages/:id', (req, res) => {
    const patch = {};
    if (req.body?.hidden !== undefined) patch.hidden = Boolean(req.body.hidden);
    const result = store.setLanguageOverride(req.params.id, patch);
    audit(req, 'content.language.update', req.params.id, patch);
    res.json({ override: result });
  });

  /* ------------------------------------------------------- content: stages */
  router.get('/content/stages', (_req, res) => {
    const snapshot = contentSnapshot();
    const overrides = store.getContentOverrides().stages;
    const stages = (snapshot?.stages ?? [])
      .map((stage, i) => ({
        ...applyStageOverride(stage, overrides),
        challengeCount: (snapshot?.challenges ?? []).filter((c) => c.stageId === stage.id && !c.isStageTest).length,
        hasTest: (snapshot?.challenges ?? []).some((c) => c.stageId === stage.id && c.isStageTest),
        hidden: Boolean(overrides[stage.id]?.hidden),
        order: overrides[stage.id]?.order ?? i,
        // The admin view always shows the ORIGINAL authored values alongside
        // the merged ones, so editing a field shows what it overrides.
        original: { name: stage.name, description: stage.description, icon: stage.icon, isPremium: Boolean(stage.isPremium) }
      }))
      .sort((a, b) => a.order - b.order);
    res.json({ stages });
  });

  router.patch('/content/stages/:id', (req, res) => {
    if (!contentSnapshot()?.stages.some((s) => s.id === req.params.id)) {
      return res.status(404).json({ error: 'No such stage.' });
    }

    // Presentational fields plus visibility/pricing/order - never `language`
    // (see applyStageOverride's doc comment for why a live language move is
    // unsafe here) and never the stage's challenges/test, which are edited
    // through /content/challenges instead. A field sent as `null` clears that
    // override back to the authored original, rather than being ignored -
    // otherwise an edit here could never be undone from the admin UI.
    const patch = {};
    if (req.body?.name === null) patch.name = undefined;
    else if (typeof req.body?.name === 'string' && req.body.name.trim()) patch.name = req.body.name.trim().slice(0, 80);
    if (req.body?.description === null) patch.description = undefined;
    else if (typeof req.body?.description === 'string' && req.body.description.trim()) {
      patch.description = req.body.description.trim().slice(0, 400);
    }
    if (req.body?.icon === null) patch.icon = undefined;
    else if (typeof req.body?.icon === 'string') patch.icon = req.body.icon.trim().slice(0, 8) || undefined;
    if (req.body?.hidden !== undefined) patch.hidden = Boolean(req.body.hidden);
    if (req.body?.isPremium !== undefined) patch.isPremium = req.body.isPremium === null ? undefined : Boolean(req.body.isPremium);
    if (req.body?.order !== undefined) patch.order = Number(req.body.order);

    const result = store.setStageOverride(req.params.id, patch);
    audit(req, 'content.stage.update', req.params.id, patch);
    res.json({ override: result });
  });

  /** Move a stage up (-1) or down (+1) among its own language track. */
  router.post('/content/stages/:id/reorder', (req, res) => {
    const snapshot = contentSnapshot();
    const direction = req.body?.direction === 'down' ? 1 : -1;
    const track = (snapshot?.languageTracks ?? []).find((t) => t.stageIds.includes(req.params.id));
    if (!track) return res.status(404).json({ error: 'No such stage.' });

    const overrides = store.getContentOverrides().stages;
    const ordered = [...track.stageIds].sort(
      (a, b) => (overrides[a]?.order ?? track.stageIds.indexOf(a)) - (overrides[b]?.order ?? track.stageIds.indexOf(b))
    );
    const index = ordered.indexOf(req.params.id);
    const swapWith = index + direction;
    if (swapWith < 0 || swapWith >= ordered.length) return res.json({ ok: true }); // already at an end

    const a = ordered[index];
    const b = ordered[swapWith];
    // Re-number the whole track 0..n-1 so future reorders stay well-defined,
    // rather than accumulating fractional/duplicate order values over time.
    ordered[index] = b;
    ordered[swapWith] = a;
    ordered.forEach((stageId, i) => store.setStageOverride(stageId, { order: i }));
    audit(req, 'content.stage.reorder', req.params.id, { direction: direction === 1 ? 'down' : 'up' });
    res.json({ ok: true });
  });

  /* --------------------------------------------------- content: challenges */
  router.get('/content/challenges', (req, res) => {
    const snapshot = contentSnapshot();
    const overrides = store.getContentOverrides().challenges;
    const stageId = req.query.stageId ? String(req.query.stageId) : null;

    let list = snapshot?.challenges ?? [];
    if (stageId) list = list.filter((c) => c.stageId === stageId);

    const rows = list.map((c) => ({
      ...applyChallengeOverride(c, overrides),
      hidden: Boolean(overrides[c.id]?.hidden),
      // The admin view always shows the ORIGINAL authored values alongside
      // the merged ones, so editing a field shows what it overrides.
      original: { title: c.title, prompt: c.prompt, explanation: c.explanation, xpReward: c.xpReward, difficulty: c.difficulty }
    }));
    res.json({ challenges: rows });
  });

  router.patch('/content/challenges/:id', (req, res) => {
    const snapshot = contentSnapshot();
    const challenge = snapshot?.byId?.get(req.params.id);
    if (!challenge) return res.status(404).json({ error: 'No such challenge.' });

    // Only safe, presentational/operational fields are editable here. The
    // question's logic (options, correct answers, test cases) stays in the
    // authored TypeScript so it keeps going through validate-content.mjs's
    // safety net (it actually EXECUTES every JS/Python solution) - see
    // docs/CONTENT_AUTHORING.md. Faking a full editor for that here would
    // let a typo silently break grading with nothing to catch it.
    // `null` on any field clears that override back to the authored original
    // rather than being ignored, so an edit made here can always be undone.
    const patch = {};
    for (const field of ['title', 'prompt', 'explanation']) {
      if (req.body?.[field] === null) patch[field] = undefined;
      else if (typeof req.body?.[field] === 'string' && req.body[field].trim()) patch[field] = req.body[field].trim();
    }
    if (req.body?.hints === null) patch.hints = undefined;
    else if (Array.isArray(req.body?.hints)) patch.hints = req.body.hints.map(String).filter(Boolean).slice(0, 6);
    if (req.body?.tags === null) patch.tags = undefined;
    else if (Array.isArray(req.body?.tags)) patch.tags = req.body.tags.map(String).filter(Boolean).slice(0, 8);
    if (req.body?.xpReward === null) patch.xpReward = undefined;
    else if (req.body?.xpReward !== undefined) {
      const xp = Number(req.body.xpReward);
      if (Number.isFinite(xp) && xp >= 0 && xp <= 1000) patch.xpReward = xp;
    }
    if (req.body?.difficulty === null) patch.difficulty = undefined;
    else if (['easy', 'medium', 'hard'].includes(req.body?.difficulty)) patch.difficulty = req.body.difficulty;
    if (req.body?.hidden !== undefined) patch.hidden = Boolean(req.body.hidden);

    const result = store.setChallengeOverride(req.params.id, patch);
    audit(req, 'content.challenge.update', req.params.id, patch);
    res.json({ override: result });
  });

  /* ------------------------------------------------------------------ excel */
  router.get('/excel/status', (_req, res) => {
    res.json({ ...excel.excelSettingsSummary(), sync: store.getExcelSync() });
  });

  router.post(
    '/excel/test-connection',
    asyncRoute(async (req, res) => {
      const result = await excel.testConnection();
      audit(req, 'excel.test-connection', null, { ok: result.ok });
      res.json(result);
    })
  );

  router.post(
    '/excel/sync-now',
    asyncRoute(async (req, res) => {
      const result = await excel.syncAllUsers(store);
      audit(req, 'excel.sync-all', null, { synced: result.synced, failed: result.failed });
      res.json(result);
    })
  );

  router.post(
    '/excel/retry-failed',
    asyncRoute(async (req, res) => {
      const result = await excel.retryFailed(store);
      audit(req, 'excel.retry-failed', null, { retried: result.retried, stillFailing: result.stillFailing });
      res.json(result);
    })
  );

  /* -------------------------------------------------------- settings: creds */

  /**
   * Change the Admin User ID and/or Password. Requires the CURRENT password
   * even though this route is already behind requireAdminAuth - a live
   * session token is not enough on its own to change the credentials that
   * govern every future session. On success every previously issued admin
   * token (including the one used for this very request) stops working, so
   * the client must sign in again with the new credentials - see
   * server/admin-auth.js's updateAdminCredentials for how that invalidation
   * works.
   */
  router.patch(
    '/settings/credentials',
    asyncRoute(async (req, res) => {
      const { currentPassword, newUserId, newPassword, confirmNewPassword } = req.body ?? {};
      if (!currentPassword) return res.status(400).json({ error: 'Current password is required.' });
      if (newPassword && newPassword !== confirmNewPassword) {
        return res.status(400).json({ error: 'New password and confirmation do not match.' });
      }

      const result = await updateAdminCredentials(req.admin, { currentPassword, newUserId, newPassword });
      if (!result.ok) return res.status(400).json({ error: result.error });

      // Only boolean change flags - never the old or new User ID/password/hash.
      audit(req, 'admin.credentials.update', result.admin.id, {
        changedUserId: result.changed.userId,
        changedPassword: result.changed.password
      });

      res.json({
        admin: publicAdmin(result.admin),
        changed: result.changed,
        message: 'Credentials updated. Please sign in again with your new credentials.'
      });
    })
  );

  return router;
}
