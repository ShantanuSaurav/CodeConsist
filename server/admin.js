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
import {
  contentSnapshot,
  applyChallengeOverride,
  applyStageOverride,
  allChallenges,
  getChallenge,
  authoredChallenge,
  isCustomChallenge,
  isModifiedChallenge
} from './content.js';
import { EXECUTABLE_LANGUAGES, generateChallengeId, mergeIssues, normalizeChallengeInput } from './custom-challenges.js';
import { requireAdminAuth, publicAdmin, updateAdminCredentials } from './admin-auth.js';
import * as excel from './excel.js';
import { GeminiError } from './ai.js';
import { AiInputError, KINDS as AI_KINDS, draftQuestion, findDuplicates, suggestQuestions } from './ai-questions.js';

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

/**
 * @param {object} deps - handed in by server/index.js once it has compiled the
 *   content schema and runners (a direct import would be a cycle):
 *   validateChallenge(candidate) -> { ok, challenge, issues[] } via the zod ChallengeSchema;
 *   runSolution(challenge, code) -> { status, testResults, stderr, reason };
 *   ai -> the Gemini client from server/ai.js ({ configured, model, generateJson }).
 */
export function createAdminRouter(deps = {}) {
  const router = express.Router();
  // Bodies are parsed by the app-level parser in server/index.js (256kb); a
  // second parser here would be a no-op. Per-field limits live in
  // server/custom-challenges.js so an oversized question gets a message
  // naming the field rather than a bare 413.
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
          challenges: allChallenges().length,
          stages: snapshot?.stages.length ?? 0,
          totalXpAwarded: totalXp,
          totalSolves: totalSolved,
          activeLast7Days
        },
        signupsByDay: last14Days,
        judge0Configured: process.env.JUDGE0_API_URL ? true : false,
        geminiConfigured: Boolean(deps.ai?.configured),
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
      const challenges = allChallenges().filter((c) => c.stageId === stage.id);
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
    const mostMissed = allChallenges()
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
      challengeCount: allChallenges().filter((c) =>
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
    const trackOf = new Map();
    for (const track of snapshot?.languageTracks ?? []) for (const id of track.stageIds) trackOf.set(id, track);
    const stages = (snapshot?.stages ?? [])
      .map((stage, i) => ({
        ...applyStageOverride(stage, overrides),
        trackId: trackOf.get(stage.id)?.id ?? null,
        trackLabel: trackOf.get(stage.id)?.label ?? null,
        challengeCount: allChallenges().filter((c) => c.stageId === stage.id && !c.isStageTest).length,
        hasTest: allChallenges().some((c) => c.stageId === stage.id && c.isStageTest),
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

  /**
   * One table row, the shape every challenge route answers with so the
   * console can drop a response straight into its list. Three states:
   * authored (from source), modified (an authored id replaced in the store)
   * and created (written in the console, no authored original).
   */
  function toRow(c) {
    const overrides = store.getContentOverrides().challenges;
    // The admin view always shows the ORIGINAL authored values alongside the
    // merged ones, so editing a field shows what it overrides - for a
    // modified question that is the untouched authored version, not the edit.
    const o = authoredChallenge(c.id) ?? c;
    return {
      ...applyChallengeOverride(c, overrides),
      hidden: Boolean(overrides[c.id]?.hidden),
      custom: isCustomChallenge(c.id),
      modified: isModifiedChallenge(c.id),
      original: { title: o.title, prompt: o.prompt, explanation: o.explanation, xpReward: o.xpReward, difficulty: o.difficulty }
    };
  }

  router.get('/content/challenges', (req, res) => {
    const stageId = req.query.stageId ? String(req.query.stageId) : null;
    // Authored order with modified ones in place, created ones last - the order learners see.
    let list = allChallenges();
    if (stageId) list = list.filter((c) => c.stageId === stageId);
    res.json({ challenges: list.map(toRow) });
  });

  /* ------------------------------------------------ admin-authored questions */

  /**
   * Check a question the admin is writing: tidy the form's body, run the
   * friendly field checks, then the zod ChallengeSchema, then - for code -
   * execute the reference solution against the test cases the way the
   * content validator does (and, for 'debug', make sure the broken starter
   * really fails). Nothing is saved. `preserve` is the authored original when
   * an authored question is being modified (see PRESERVED_FIELDS).
   */
  async function checkQuestion(body, id, preserve) {
    const snapshot = contentSnapshot();
    const stageIds = (snapshot?.stages ?? []).map((s) => s.id);
    const { candidate, issues: friendly } = normalizeChallengeInput(body, { stageIds, id, preserve });

    if (!deps.validateChallenge) return { ok: false, challenge: null, issues: [{ path: '', message: 'The server is still starting - try again in a moment.' }], verification: null };
    const schema = deps.validateChallenge(candidate);
    // The friendly check already explained any field it flagged; the schema's
    // terser wording is only added for fields it did not cover.
    const covered = new Set(friendly.map((i) => i.path.split('.')[0]));
    const issues = mergeIssues(friendly, schema.ok ? [] : schema.issues.filter((i) => !covered.has(i.path.split('.')[0])));
    if (issues.length) return { ok: false, challenge: null, issues, verification: null };

    const challenge = schema.challenge;
    const verification = { solution: null, starter: null };
    if ((challenge.type === 'code_runner' || challenge.type === 'debug') && deps.runSolution) {
      verification.solution = await deps.runSolution(challenge, challenge.solutionCode);
      const executable = EXECUTABLE_LANGUAGES.includes(challenge.language);
      if (executable && verification.solution.status !== 'passed' && verification.solution.status !== 'skipped') {
        const failed = (verification.solution.testResults ?? []).filter((t) => !t.passed).length;
        issues.push({
          path: 'solutionCode',
          message:
            verification.solution.status === 'error'
              ? `The solution could not run: ${String(verification.solution.stderr ?? '').split('\n')[0] || 'unknown error'}`
              : `The solution fails ${failed || 'some'} of the ${challenge.testCases.length} test cases - fix the solution or the expected values.`
        });
      }
      if (challenge.type === 'debug' && executable && verification.solution.status === 'passed') {
        verification.starter = await deps.runSolution(challenge, challenge.starterCode);
        if (verification.starter.status === 'passed') {
          issues.push({ path: 'starterCode', message: 'The starter code already passes every test - a debug question needs a real bug for the learner to find.' });
        }
      }
    }
    return { ok: issues.length === 0, challenge: issues.length ? null : challenge, issues, verification };
  }

  /** `?id=` names the question being edited, so an authored one is checked with its preserved fields. */
  router.post(
    '/content/challenges/validate',
    asyncRoute(async (req, res) => {
      const id = req.query.id ? String(req.query.id) : null;
      let preserve;
      if (id) {
        if (!getChallenge(id)) return res.status(404).json({ error: 'No such challenge.' });
        preserve = authoredChallenge(id) ?? undefined;
      }
      const result = await checkQuestion(req.body ?? {}, id ?? 'custom-preview', preserve);
      res.json({ ok: result.ok, issues: result.issues, verification: result.verification });
    })
  );

  router.post(
    '/content/challenges',
    asyncRoute(async (req, res) => {
      const body = req.body ?? {};
      const stageId = String(body.stageId ?? '');
      const existing = new Set(allChallenges().map((c) => c.id));
      const id = generateChallengeId(stageId || 'stage', String(body.title ?? ''), existing);
      const result = await checkQuestion(body, id);
      if (!result.ok) return res.status(422).json({ error: 'The question is not ready to save yet.', issues: result.issues, verification: result.verification });
      const saved = store.putCustomChallenge(result.challenge);
      audit(req, 'content.challenge.create', saved.id, { stageId: saved.stageId, type: saved.type, language: saved.language });
      res.status(201).json({ challenge: toRow(getChallenge(saved.id)), verification: result.verification });
    })
  );

  /**
   * Replace a question in full. A created one is simply overwritten; an
   * authored one becomes modified: the replacement is stored under the same
   * id (server/content.js serves it in the original's place) with the
   * authored concept/stage-test role carried over, and the presentational
   * overrides are cleared so the edit is not shadowed by an older PATCH.
   */
  router.put(
    '/content/challenges/:id',
    asyncRoute(async (req, res) => {
      const id = req.params.id;
      const authored = authoredChallenge(id);
      if (!authored && !isCustomChallenge(id)) return res.status(404).json({ error: 'No such challenge.' });

      const result = await checkQuestion(req.body ?? {}, id, authored ?? undefined);
      if (!result.ok) return res.status(422).json({ error: 'The question is not ready to save yet.', issues: result.issues, verification: result.verification });
      const saved = store.putCustomChallenge(result.challenge);
      // A full save supersedes any re-wording layered on top earlier (a PATCH
      // override), or the admin's new title would be shadowed by the old one.
      // setChallengeOverride merges, so `hidden` survives the clear.
      store.setChallengeOverride(id, { title: undefined, prompt: undefined, explanation: undefined, hints: undefined, tags: undefined, xpReward: undefined, difficulty: undefined });
      audit(req, 'content.challenge.replace', id, { stageId: saved.stageId, type: saved.type, language: saved.language, authored: Boolean(authored) });
      res.json({ challenge: toRow(getChallenge(id)), verification: result.verification });
    })
  );

  /** Put the authored original back: drops the stored replacement, keeps only `hidden`. */
  router.post('/content/challenges/:id/revert', (req, res) => {
    const id = req.params.id;
    if (!getChallenge(id)) return res.status(404).json({ error: 'No such challenge.' });
    if (!isModifiedChallenge(id)) {
      return res.status(409).json({ error: 'This question has not been edited here, so there is nothing to revert.' });
    }
    // deleteCustomChallenge also drops the override record, so hidden is re-applied by hand.
    const hidden = Boolean(store.getContentOverrides().challenges[id]?.hidden);
    store.deleteCustomChallenge(id);
    if (hidden) store.setChallengeOverride(id, { hidden: true });
    audit(req, 'content.challenge.revert', id, { hidden });
    res.json({ challenge: toRow(getChallenge(id)) });
  });

  router.delete('/content/challenges/:id', (req, res) => {
    const id = req.params.id;
    if (isCustomChallenge(id)) {
      store.deleteCustomChallenge(id);
      audit(req, 'content.challenge.delete', id, null);
      return res.json({ ok: true, deleted: true });
    }
    if (!getChallenge(id)) return res.status(404).json({ error: 'No such challenge.' });
    // Authored questions are TypeScript on disk; the server cannot delete a
    // source file. Removing one from the stage is the honest equivalent, and
    // it is reversible from the same screen.
    const modified = isModifiedChallenge(id);
    return res.status(409).json({
      error:
        'This question is authored in the source code, so it cannot be deleted from here. Remove it from the stage instead - learners will not see it, and you can restore it any time' +
        (modified ? ' - or revert it to the original.' : '.'),
      authored: true,
      modified
    });
  });

  router.patch('/content/challenges/:id', (req, res) => {
    // Authored or admin-authored - hide/unhide and the presentational fields work on both.
    const challenge = getChallenge(req.params.id);
    if (!challenge) return res.status(404).json({ error: 'No such challenge.' });

    // Only safe, presentational/operational fields are patched here. The
    // question's logic (options, correct answers, test cases) is changed
    // through PUT above instead, which runs the schema and executes the
    // solution the way validate-content.mjs does - a typo can never silently
    // break grading. `null` on any field clears that override back to the
    // authored original rather than being ignored, so an edit made here can
    // always be undone.
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

  /* --------------------------------------------------- ai question assistant */

  /**
   * Gemini helps the admin WRITE a question; it never saves one. Every draft
   * it produces is handed back to the console, which sends it through
   * /content/challenges/validate and /content/challenges like a hand-written
   * question - the same field checks, schema and solution run apply.
   *
   * A Gemini failure is an answer, not a crash: GeminiError (server/ai.js)
   * and AiInputError (server/ai-questions.js) carry the status to reply
   * with and a message written for the admin, so none of them reaches the
   * app-level 500 handler.
   */
  const aiRoute = (fn) =>
    asyncRoute(async (req, res) => {
      try {
        await fn(req, res);
      } catch (err) {
        if (err instanceof GeminiError || err instanceof AiInputError) {
          return res.status(err.status ?? 502).json({ error: err.message, notConfigured: err.status === 503 || undefined });
        }
        throw err;
      }
    });

  const notConfigured = (res) =>
    res.status(503).json({ error: 'Gemini is not configured - add GEMINI_API_KEY to .env at the project root and restart the API.', notConfigured: true });

  router.get('/ai/status', (_req, res) => {
    res.json({ configured: Boolean(deps.ai?.configured), model: deps.ai?.model ?? null });
  });

  router.post(
    '/ai/draft',
    aiRoute(async (req, res) => {
      const body = req.body ?? {};
      const kind = String(body.kind ?? '');
      const text = typeof body.text === 'string' ? body.text : '';
      if (!AI_KINDS.includes(kind)) return res.status(400).json({ error: `Pick a question type first (one of: ${AI_KINDS.join(', ')}).` });
      if (text.trim().length < 10) return res.status(400).json({ error: 'Describe the question in at least 10 characters.' });
      if (!deps.ai?.configured) return notConfigured(res);

      const stages = contentSnapshot()?.stages ?? [];
      const stageId = body.stageId ? String(body.stageId) : undefined;
      const result = await draftQuestion({ ai: deps.ai, kind, text, stageId, stages, bank: allChallenges() });
      // Only the kind, the stage and a size - never the admin's text itself.
      audit(req, 'ai.draft', result.draft.stageId, { kind, stageId: result.draft.stageId, chars: text.length });
      res.json(result);
    })
  );

  router.post(
    '/ai/duplicates',
    aiRoute(async (req, res) => {
      const body = req.body ?? {};
      const draft = body.draft && typeof body.draft === 'object' ? body.draft : null;
      if (!draft) return res.status(400).json({ error: 'Send the draft to check.' });
      if (!deps.ai?.configured) return notConfigured(res);

      const text = typeof body.text === 'string' ? body.text : '';
      const result = await findDuplicates({ ai: deps.ai, draft, text, bank: allChallenges(), stages: contentSnapshot()?.stages ?? [] });
      audit(req, 'ai.duplicates', null, { push: result.verdict.push, candidates: result.candidates.length });
      res.json(result);
    })
  );

  router.post(
    '/ai/suggest',
    aiRoute(async (req, res) => {
      const body = req.body ?? {};
      const stage = (contentSnapshot()?.stages ?? []).find((s) => s.id === String(body.stageId ?? ''));
      if (!stage) return res.status(400).json({ error: 'No such stage.' });
      const kind = body.kind ? String(body.kind) : null;
      if (kind && !AI_KINDS.includes(kind)) return res.status(400).json({ error: `"${kind}" is not a question type.` });
      if (!deps.ai?.configured) return notConfigured(res);

      const result = await suggestQuestions({ ai: deps.ai, stage, kind, count: body.count, bank: allChallenges() });
      audit(req, 'ai.suggest', stage.id, { stageId: stage.id, kind, count: result.suggestions.length });
      res.json(result);
    })
  );

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
