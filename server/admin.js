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
  applyLearnerOverrides,
  applyStageOverride,
  allChallenges,
  getChallenge,
  authoredChallenge,
  isCustomChallenge,
  isModifiedChallenge,
  feedbackBasisKey,
  hasFeedbackOverride,
  isFeedbackStale,
  conceptAssignments
} from './content.js';
import {
  authoredConceptIndex,
  conceptIdFor,
  generateConceptKey,
  normalizeAnchor,
  normalizeConceptInput,
  resolveAnchor
} from './concept-cards.js';
import { createSettingsAdminRouter } from './settings-routes.js';
import {
  EXECUTABLE_LANGUAGES,
  FEEDBACK_MAX,
  generateChallengeId,
  mergeIssues,
  normalizeChallengeInput,
  wrongAnswerIssues,
  wrongAnswerRows
} from './custom-challenges.js';
import { requireAdminAuth, publicAdmin, updateAdminCredentials } from './admin-auth.js';
import * as excel from './excel.js';
import { GeminiError } from './ai.js';
import { AiInputError, FEEDBACK_KINDS, KINDS as AI_KINDS, MAX_FEEDBACK_IDS, draftFeedback, draftQuestion, findDuplicates, suggestQuestions } from './ai-questions.js';
import {
  BillingError,
  CURRENCY,
  DEFAULT_PRICES,
  MAX_PRICE,
  MIN_PRICE,
  certificateNameFrom,
  entitlementsFor,
  grant,
  priceFor,
  revenueSummary,
  revokeOrder,
  trackLabel
} from './billing.js';
import { activeResetLink, createPasswordResetAdminRouter } from './password-reset.js';
import { ipDiagnostics } from './client-ip.js';
import { BUCKETS, BUCKET_SETTING } from './rate-limit.js';
import { premiumGateStats, progressionGateStats } from './progression.js';
import { assessmentAdminView, clearAssessmentCooldown, onboardingAnalytics } from './assessment-routes.js';

const asyncRoute = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

/* --------------------------------------------------- wrong-answer notes */

const OPTION_TYPES = ['quiz', 'output_prediction', 'multi_select'];
/** How many questions one bulk save of notes may carry. */
export const MAX_FEEDBACK_BULK = 50;
const letter = (i) => String.fromCharCode(65 + i);

/**
 * Check the wrong-answer notes sent for one question and tidy them:
 * `optionFeedback` (one note per option) and `blankFeedback` (per blank,
 * `{ wrongAnswers: [{ answer, feedback }] }`). `null` clears either. Returns
 * `{ issues, set }`: `set` holds what to store, with `null` meaning "no notes".
 * Nothing here can touch grading - the notes are text beside the question.
 */
export function feedbackEdit(challenge, body) {
  const issues = [];
  const set = {};
  const b = body && typeof body === 'object' ? body : {};

  if (b.optionFeedback !== undefined) {
    const count = challenge.options?.length ?? 0;
    if (b.optionFeedback === null) set.optionFeedback = null;
    else if (!OPTION_TYPES.includes(challenge.type)) {
      issues.push({ path: 'optionFeedback', message: 'Only multiple-choice, select-all and predict-the-output questions have a note per option.' });
    } else if (!Array.isArray(b.optionFeedback) || b.optionFeedback.some((n) => n !== null && typeof n !== 'string')) {
      issues.push({ path: 'optionFeedback', message: 'Send the notes as a list of text, one per option.' });
    } else if (b.optionFeedback.length !== count) {
      issues.push({ path: 'optionFeedback', message: `This question has ${count} options, so it takes ${count} notes - one per option, empty for none.` });
    } else {
      const notes = b.optionFeedback.map((n) => String(n ?? '').trim());
      notes.forEach((note, i) => {
        if (note.length > FEEDBACK_MAX) issues.push({ path: `optionFeedback.${i}`, message: `The note on option ${letter(i)} is too long (max ${FEEDBACK_MAX} characters).` });
      });
      set.optionFeedback = notes.some(Boolean) ? notes : null;
    }
  }

  if (b.blankFeedback !== undefined) {
    const blanks = challenge.blanks ?? [];
    if (b.blankFeedback === null) set.blankFeedback = null;
    else if (challenge.type !== 'fill_blank') {
      issues.push({ path: 'blankFeedback', message: 'Only fill-in-the-blank questions have wrong answers per blank.' });
    } else if (!Array.isArray(b.blankFeedback) || b.blankFeedback.length !== blanks.length) {
      issues.push({ path: 'blankFeedback', message: `This question has ${blanks.length} blank${blanks.length === 1 ? '' : 's'}, so send one entry per blank.` });
    } else {
      const rows = blanks.map((_, i) => wrongAnswerRows(b.blankFeedback[i]?.wrongAnswers));
      rows.forEach((list, i) => issues.push(...wrongAnswerIssues({ ...blanks[i], wrongAnswers: list }, i)));
      set.blankFeedback = rows.some((list) => list.length) ? rows.map((list) => ({ wrongAnswers: list })) : null;
    }
  }
  return { issues, set };
}

/** Does this request body carry wrong-answer notes? */
const sendsFeedback = (body) => body?.optionFeedback !== undefined || body?.blankFeedback !== undefined;

/** A question with notes laid on it - the record a created or modified question stores. */
function withNotes(challenge, set) {
  const next = { ...challenge };
  if ('optionFeedback' in set) {
    if (set.optionFeedback) next.optionFeedback = set.optionFeedback;
    else delete next.optionFeedback;
  }
  if ('blankFeedback' in set && Array.isArray(next.blanks)) {
    next.blanks = next.blanks.map((blank, i) => {
      const { wrongAnswers, ...rest } = blank;
      const rows = set.blankFeedback?.[i]?.wrongAnswers ?? [];
      return rows.length ? { ...rest, wrongAnswers: rows } : rest;
    });
  }
  return next;
}

/**
 * The notes that give the answer away, as warnings for the admin (never a
 * refusal: a leaking note is simply held back until the answer is shown).
 * Uses the shared rule (src/platform/grading-engine/feedback.ts) when the
 * learning bundle is loaded; none before that.
 */
export function feedbackWarnings(challenge, leaksOf) {
  if (typeof leaksOf !== 'function') return [];
  const warnings = [];
  for (const key of leaksOf(challenge)) {
    const option = /^o(\d+)$/.exec(key);
    if (option) {
      warnings.push({ path: `optionFeedback.${option[1]}`, message: `The note on option ${letter(Number(option[1]))} contains the right answer - learners see it only once the answer is shown.` });
      continue;
    }
    const blank = /^b(\d+)\.(\d+)$/.exec(key);
    if (blank) {
      const answer = challenge.blanks?.[Number(blank[1])]?.wrongAnswers?.[Number(blank[2])]?.answer ?? '';
      warnings.push({
        path: `blanks.${blank[1]}.wrongAnswers.${blank[2]}`,
        message: `Blank ${Number(blank[1]) + 1}: the note for "${answer}" names the right answer - learners see it only once the answer is shown.`
      });
    }
  }
  return warnings;
}

/** For the audit log: how many notes changed, never their text. */
function feedbackAuditOf(set) {
  const details = {};
  if ('optionFeedback' in set) details.optionNotes = set.optionFeedback ? set.optionFeedback.filter(Boolean).length : 0;
  if ('blankFeedback' in set) details.wrongAnswers = set.blankFeedback ? set.blankFeedback.reduce((n, b) => n + b.wrongAnswers.length, 0) : 0;
  return details;
}

/**
 * The learner's live reset link, for the Users table's badge. A store
 * without reset records (an older mocked store in a test) means none.
 */
function resetLinkOf(userId) {
  try {
    return activeResetLink(store, userId);
  } catch {
    return null;
  }
}

/**
 * Never the passwordHash. Adds the small progress summary the Users page
 * needs, plus HOW the account signs in - `identities` is provider ids only
 * ('google', 'github') and `hasPassword` is a boolean. A password exists in
 * this database exclusively as a bcrypt hash, which no route returns and no
 * administrator can read or recover; the Users page says so in as many words.
 */
function adminUserRow(user, deps = {}) {
  const progress = store.getProgress(user.id);
  // The level is always derived from XP with the CURRENT curve (an admin may
  // have changed it since the row was written); without the learning
  // services (a test, or before boot) the stored value is shown.
  const learning = deps.learning;
  const level = learning?.lib && learning.settings ? learning.lib.levelFromXp(progress.xp, learning.settings.current().levels) : progress.level;
  // The streak as the learner sees it today (their zone, freezes applied)
  // and the goal that applies to them. Without the habits service (a test
  // that mocks the store, or before boot) the stored streak is shown.
  let streak = progress.streak;
  let goal = null;
  if (learning?.habits) {
    try {
      streak = learning.habits.streakFor(user, progress);
      const option = learning.habits.goalFor(user);
      goal = option ? { id: option.id, label: option.label, chosen: Boolean(store.normalizePreferences(user.preferences).dailyGoalId) } : null;
    } catch {
      /* keep the stored streak */
    }
  }
  return {
    id: user.id,
    email: user.email,
    username: user.username,
    // The effective licence: the legacy flag OR a paid lifetime order.
    isPremium: entitlementsFor(user.id, user).lifetime,
    identities: store.identityProviders(user),
    hasPassword: Boolean(user.passwordHash),
    lastLoginAt: user.lastLoginAt ?? null,
    createdAt: user.createdAt ?? null,
    xp: progress.xp,
    level,
    streak,
    // The daily goal that applies (null when goals are off, or without the
    // habits service); `chosen` is false for a learner on the default.
    goal,
    completedChallenges: progress.completedChallenges.length,
    completedStages: progress.completedStages.length,
    lastActiveDay: progress.lastActiveDay,
    // When a password reset link is live, and until when - never the link.
    activeResetLink: resetLinkOf(user.id)
  };
}

/**
 * Who a rate-limit key belongs to, for the admin's status card: account
 * buckets are keyed by user id, `login.account` by email. Addresses stay as
 * they are.
 */
function usernameForKey(bucket, key) {
  try {
    if (bucket === 'login.account') return store.findUserByEmail(key)?.username ?? null;
    if (bucket.endsWith('.account')) return store.findUserById(key)?.username ?? null;
  } catch {
    /* a store without users */
  }
  return null;
}

/**
 * "Most missed": the questions the largest share of learners got wrong,
 * from the activity store's per-learner miss summaries (server/activity.js).
 *
 * The old version counted `attempts` keys - but those are written only on a
 * solve, so "attempted more than solved" could never happen and the list was
 * always empty. A miss is now recorded as a miss (and never as an attempt).
 *
 *   learners  - learners who missed it or solved it
 *   missedBy  - learners with at least one miss
 *   missRate  - missedBy / learners
 * Only questions at least `retention.mostMissedMinLearners` learners missed
 * are listed. `attempts` (= learners) and `solved` keep the old keys working.
 */
function mostMissedRows(deps) {
  const learning = deps.learning;
  if (!learning?.lib || typeof store.allActivity !== 'function') return [];
  const lib = learning.lib;
  const minLearners = learning.settings?.current().retention.mostMissedMinLearners ?? 3;
  const users = store.allUsers();
  const liveUsers = new Set(users.map((u) => u.id));
  const allProgress = store.allProgress();

  const missed = new Map(); // challengeId -> { users: Set, totalMisses, revealed, keys: Map }
  for (const [userId, raw] of Object.entries(store.allActivity())) {
    if (!liveUsers.has(userId)) continue;
    const log = lib.normalizeActivityLog(raw);
    for (const [id, summary] of Object.entries(log.misses)) {
      const row = missed.get(id) ?? { users: new Set(), totalMisses: 0, revealed: 0, keys: new Map() };
      row.users.add(userId);
      row.totalMisses += summary.count;
      row.revealed += summary.revealed;
      for (const [key, count] of Object.entries(summary.keys)) row.keys.set(key, (row.keys.get(key) ?? 0) + count);
      missed.set(id, row);
    }
  }

  const byId = new Map(allChallenges().map((c) => [c.id, c]));
  const rows = [];
  for (const [id, agg] of missed) {
    const challenge = byId.get(id);
    if (!challenge || agg.users.size < minLearners) continue;
    let solved = 0;
    let solvedOnly = 0;
    for (const user of users) {
      if (!(allProgress[user.id]?.completedChallenges ?? []).includes(id)) continue;
      solved += 1;
      if (!agg.users.has(user.id)) solvedOnly += 1;
    }
    const learners = agg.users.size + solvedOnly;
    rows.push({
      id,
      title: challenge.title,
      stageId: challenge.stageId,
      learners,
      missedBy: agg.users.size,
      missRate: learners > 0 ? Math.round((agg.users.size / learners) * 100) / 100 : 0,
      totalMisses: agg.totalMisses,
      revealed: agg.revealed,
      topWrong: [...agg.keys.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([key, count]) => ({ key, label: lib.missKeyLabel(challenge, key), count })),
      attempts: learners,
      solved
    });
  }
  return rows.sort((a, b) => b.missRate - a.missRate || b.totalMisses - a.totalMisses || b.missedBy - a.missedBy).slice(0, 15);
}

/**
 * "Stage 03 · Variables" for a stage id - the name learners see (an admin's
 * rename included), else the authored one (a stage hidden since) - or the id
 * itself when the content has no such stage (removed since).
 */
function stageNamer() {
  const snapshot = contentSnapshot();
  if (!snapshot) return (id) => id;
  const byId = new Map((snapshot.stages ?? []).map((s) => [s.id, s]));
  for (const s of applyLearnerOverrides(snapshot, store.getContentOverrides(), { concepts: false }).stages) byId.set(s.id, s);
  return (id) => {
    const s = byId.get(id);
    return s ? `Stage ${String(s.index).padStart(2, '0')} · ${s.name}` : id;
  };
}

/**
 * Facts the rules page needs to judge a change: what the learner-facing bank
 * holds (to warn when the top rank is out of reach), which engines this
 * server has, and every learner's XP (to preview how many would change level).
 */
function settingsContext(deps) {
  const snapshot = contentSnapshot();
  const overrides = store.getContentOverrides();
  const merged = snapshot ? applyLearnerOverrides(snapshot, overrides) : { stages: [], challenges: [] };
  const premium = new Set(merged.stages.filter((s) => s.isPremium).map((s) => s.id));
  const hiddenTracks = new Set(Object.keys(overrides.languages ?? {}).filter((id) => overrides.languages[id]?.hidden));
  let totalXp = 0;
  let freeXp = 0;
  for (const c of merged.challenges) {
    const xp = Number(c.xpReward) || 0;
    totalXp += xp;
    if (!premium.has(c.stageId)) freeXp += xp;
  }
  const allProgress = store.allProgress();
  // Units learners see, and the most the perfect-unit bonus could ever pay
  // out in total with the current setting.
  const unitCount = deps.learning?.units ? deps.learning.units.unitCount() : null;
  const perfectBonusXp = deps.learning?.settings?.current().units.perfectBonusXp ?? 0;
  return {
    content: {
      lessons: merged.challenges.filter((c) => !c.isStageTest).length,
      tests: merged.challenges.filter((c) => c.isStageTest).length,
      stages: merged.stages.length,
      tracks: (snapshot?.languageTracks ?? []).filter((t) => !hiddenTracks.has(t.id)).length,
      freeStages: merged.stages.length - premium.size,
      premiumStages: premium.size,
      totalXp,
      freeXp,
      unitCount,
      maxPerfectBonusXp: unitCount === null ? null : unitCount * perfectBonusXp
    },
    runtime: deps.learning?.runtimeInfo?.() ?? { pythonVerifiable: false, judge0Languages: [] },
    levels: { learnerXp: store.allUsers().map((u) => Number(allProgress[u.id]?.xp) || 0) },
    // How many learners chose each daily goal ("N learners chose this"), and
    // how many follow the default. Null without the habits service.
    goals: deps.learning?.habits ? deps.learning.habits.goalChoices() : null,
    // Phase 5: every track's stages and their tests, for the placement and
    // test-out sections - which stages to use or leave out, whether this
    // server can check each test itself (null: not known yet), and the test
    // to open in the question editor.
    path: {
      tracks: (snapshot?.languageTracks ?? []).map((t) => ({ id: t.id, label: t.label, hidden: hiddenTracks.has(t.id), stageIds: [...(t.stageIds ?? [])] })),
      stages: merged.stages.map((stage) => {
        const test = merged.challenges.find((c) => c.stageId === stage.id && c.isStageTest) ?? null;
        return {
          id: stage.id,
          index: stage.index,
          name: stage.name,
          isPremium: Boolean(stage.isPremium),
          test: test
            ? {
                id: test.id,
                title: test.title,
                type: test.type,
                language: test.language,
                verifiable: typeof deps.learning?.canVerify === 'function' ? Boolean(deps.learning.canVerify(test)) : null
              }
            : null
        };
      })
    }
  };
}

/**
 * @param {object} deps - handed in by server/index.js once it has compiled the
 *   content schema and runners (a direct import would be a cycle):
 *   validateChallenge(candidate) -> { ok, challenge, issues[] } via the zod ChallengeSchema;
 *   runSolution(challenge, code) -> { status, testResults, stderr, reason };
 *   ai -> the Gemini client from server/ai.js ({ configured, model, generateJson });
 *   billing -> { provider } from server/payments.js, the same instance the learner routes use;
 *   learning -> { lib, settings, activity, units, habits, runtimeInfo } (server/index.js's learningDeps):
 *     the rules store, each learner's activity, streaks and goals, and the
 *     shared rule code. Read per request; routes that need it answer 503
 *     while it is missing.
 *   access -> { limiter, slots, cors, hops, bootedAt } (server/index.js's adminDeps.access):
 *     the live rate-limit counters, code-runner slots and CORS policy behind
 *     the Limits & access page.
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

  /* ----------------------------------------------------------- rules store */
  // GET/PUT /settings and GET /settings/context - server/settings-routes.js.
  // Mounted here, after requireAdminAuth, so it sits behind the same gate as
  // everything else in this file. (PATCH /settings/credentials below is the
  // admin's own sign-in, a different thing that happens to share a prefix.)
  router.use(
    createSettingsAdminRouter({
      getService: () => deps.learning?.settings ?? null,
      audit,
      getContext: () => settingsContext(deps)
    })
  );

  /* ------------------------------------------------------- limits & access */
  // The live side of the `access` settings section: what the server derives
  // for the admin's own request, the rate-limit counters (with an Unblock per
  // key), the code-runner slots, the CORS allow-list and what it recorded,
  // and the premium lock's blocks since boot. All in memory - a restart
  // clears it. `deps.access` is { limiter, slots, cors, hops } from index.js;
  // without it (a test, before boot) these answer 503.
  const setting = (path, fallback) => {
    try {
      const value = deps.learning?.settings?.get(path);
      return value === undefined ? fallback : value;
    } catch {
      return fallback;
    }
  };

  router.get('/access/status', (req, res) => {
    const access = deps.access;
    if (!access?.limiter) return res.status(503).json({ error: 'Limits are not available yet.' });
    const hops = Number(access.hops?.() ?? setting('access.network.trustProxyHops', 0)) || 0;
    const limiterStats = access.limiter.stats();
    const buckets = {};
    for (const bucket of BUCKETS) {
      const live = limiterStats.buckets[bucket] ?? { blocked: 0, lastBlockedAt: null, keys: 0, top: [] };
      buckets[bucket] = {
        ...live,
        setting: BUCKET_SETTING[bucket],
        rule: setting(`access.rateLimit.${BUCKET_SETTING[bucket]}`, null),
        top: live.top.map((row) => ({ ...row, username: usernameForKey(bucket, row.key) }))
      };
    }
    res.json({
      ip: ipDiagnostics(req, hops),
      limiter: { mode: setting('access.rateLimit.mode', 'enforce'), trackedKeys: limiterStats.trackedKeys, buckets },
      slots: access.slots?.stats() ?? null,
      cors: access.cors?.status() ?? null,
      premium: { mode: setting('access.premiumGate', 'enforce'), ...premiumGateStats() },
      // The stage-order gates (Phase 5): what they refused, or - in log mode -
      // would have refused, since boot and in the last 24 hours.
      progression: {
        solveGate: setting('access.solveGate', 'log'),
        mergeGate: setting('access.mergeGate', 'log'),
        ...progressionGateStats()
      },
      bootedAt: access.bootedAt ?? null
    });
  });

  /** Unblock: forget one key's count in a bucket (or the whole bucket). */
  router.post('/access/rate-limits/reset', (req, res) => {
    const limiter = deps.access?.limiter;
    if (!limiter) return res.status(503).json({ error: 'Limits are not available yet.' });
    const bucket = String(req.body?.bucket ?? '');
    if (!BUCKETS.includes(bucket)) return res.status(400).json({ error: 'Unknown rate-limit bucket.' });
    const key = req.body?.key === undefined || req.body?.key === null || req.body?.key === '' ? null : String(req.body.key).slice(0, 200);
    const cleared = limiter.reset(bucket, key ?? undefined);
    audit(req, 'security.rate-limit.reset', bucket, { bucket, key, cleared });
    res.json({ ok: true, cleared });
  });

  /* ------------------------------------------------------- password resets */
  // POST /users/:id/password-reset, GET /users/:id/password-resets,
  // POST /password-resets/:id/revoke - server/password-reset.js. The token is
  // in the one response that issues it, and in no audit row.
  router.use(
    createPasswordResetAdminRouter({
      store,
      audit,
      ttlMinutes: () => setting('access.passwordResetTtlMinutes', 1440)
    })
  );

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
          premium: users.filter((u) => entitlementsFor(u.id, u).lifetime).length,
          challenges: allChallenges().length,
          stages: snapshot?.stages.length ?? 0,
          totalXpAwarded: totalXp,
          totalSolves: totalSolved,
          activeLast7Days
        },
        signupsByDay: last14Days,
        judge0Configured: process.env.JUDGE0_API_URL ? true : false,
        geminiConfigured: Boolean(deps.ai?.configured),
        excel: excel.excelSettingsSummary(),
        revenue: revenueSummary(store.allOrders()),
        razorpayMode: deps.billing?.provider?.mode ?? 'test'
      });
    })
  );

  /* ----------------------------------------------------------------- users */
  router.get('/users', (req, res) => {
    const q = String(req.query.q ?? '').trim().toLowerCase();
    let rows = store.allUsers().map((user) => adminUserRow(user, deps));
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

    if (Object.keys(patch).length === 0) return res.json({ user: adminUserRow(target, deps) });

    const updated = store.updateUser(target.id, patch);
    audit(req, 'user.update', target.id, changes);
    res.json({ user: adminUserRow(updated, deps) });
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
    for (const user of users) {
      const p = allProgress[user.id];
      if (!p) continue;
      for (const id of p.completedChallenges ?? []) solvedCount.set(id, (solvedCount.get(id) ?? 0) + 1);
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

    // Practice sessions over the last 7 days (each learner's own days): who
    // practised, and the review XP it paid. Null before the review service exists.
    let practice = null;
    try {
      practice = deps.learning?.review ? deps.learning.review.practiceStats() : null;
    } catch {
      practice = null;
    }
    res.json({ byStage, challengesByLanguage: byLanguage, mostMissed: mostMissedRows(deps), practice });
  });

  /**
   * One question's wrong answers across every learner: the most common wrong
   * answers (from each learner's top keys) and the latest recorded misses.
   * Answers only - never who gave them.
   */
  router.get('/analytics/challenges/:id/misses', (req, res) => {
    const lib = deps.learning?.lib;
    if (!lib) return res.status(503).json({ error: 'Activity is not available yet.' });
    const challenge = getChallenge(req.params.id);
    if (!challenge) return res.status(404).json({ error: 'No such challenge.' });
    const id = challenge.id;

    const liveUsers = new Set(store.allUsers().map((u) => u.id));
    const keys = new Map();
    const recent = [];
    let missedBy = 0;
    let totalMisses = 0;
    let revealed = 0;
    for (const [userId, raw] of Object.entries(store.allActivity())) {
      if (!liveUsers.has(userId)) continue;
      const log = lib.normalizeActivityLog(raw);
      const summary = Object.hasOwn(log.misses, id) ? log.misses[id] : null;
      if (summary) {
        missedBy += 1;
        totalMisses += summary.count;
        revealed += summary.revealed;
        for (const [key, count] of Object.entries(summary.keys)) keys.set(key, (keys.get(key) ?? 0) + count);
      }
      for (const entry of log.missLog) if (entry.challengeId === id) recent.push(entry);
    }

    res.json({
      challenge: { id, title: challenge.title, type: challenge.type, stageId: challenge.stageId, options: challenge.options ?? null },
      missedBy,
      totalMisses,
      revealed,
      answers: [...keys.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([key, count]) => ({ key, label: lib.missKeyLabel(challenge, key), count })),
      recent: recent
        .sort((a, b) => Date.parse(b.at) - Date.parse(a.at))
        .slice(0, 20)
        .map((entry) => ({
          at: entry.at,
          day: entry.day,
          context: entry.context,
          final: entry.final,
          answer: lib.describeMissAnswer(challenge, entry.answer)
        }))
    });
  });

  /**
   * One learner's time zone, recent days and most-missed questions, and -
   * with the habits service - their preferences, streak, freezes, repair
   * offer and goal (`{ preferences, habit, summary, strip }`), for the Users
   * page drawer.
   */
  function learningView(target) {
    const learning = deps.learning;
    const view = learning.activity.learning(target);
    return {
      ...view,
      ...(learning.habits ? learning.habits.userLearning(target) : {}),
      // Phase 5: the first-run setup and its answers, stages tested out of,
      // the newest test-outs and placements, and the cooldowns cleared.
      setup: assessmentAdminView(store, learning.lib, target, { stageName: stageNamer() }),
      misses: view.misses.map((m) => {
        const challenge = getChallenge(m.challengeId);
        const topKey = Object.entries(m.keys ?? {}).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
        return {
          ...m,
          title: challenge?.title ?? m.challengeId,
          stageId: challenge?.stageId ?? null,
          topWrong: challenge && topKey ? learning.lib.missKeyLabel(challenge, topKey) : null
        };
      })
    };
  }

  router.get('/users/:id/learning', (req, res) => {
    const target = store.findUserById(req.params.id);
    if (!target) return res.status(404).json({ error: 'No such user.' });
    const learning = deps.learning;
    if (!learning?.activity || !learning.lib) return res.status(503).json({ error: 'Activity is not available yet.' });
    res.json(learningView(target));
  });

  /**
   * "Clear test-out cooldowns" (Phase 5): every test-out and placement this
   * learner started before now stops counting towards their limits and
   * waits - for one stage (`{ stageId }`), a placement on one track
   * (`placement:<trackId>`), or everything (no body). Nothing they passed is
   * touched. Audited. Answers with the drawer's view.
   */
  router.post('/users/:id/assessments/clear-cooldown', (req, res) => {
    const target = store.findUserById(req.params.id);
    if (!target) return res.status(404).json({ error: 'No such user.' });
    const learning = deps.learning;
    if (!learning?.activity || !learning.lib || typeof store.getAssessmentLog !== 'function') {
      return res.status(503).json({ error: 'Test-outs are not available yet.' });
    }
    const raw = req.body?.stageId;
    let stageId = null;
    if (raw !== undefined && raw !== null && raw !== '') {
      const snapshot = contentSnapshot();
      const stageIds = new Set((snapshot?.stages ?? []).map((s) => s.id));
      const trackIds = new Set((snapshot?.languageTracks ?? []).map((t) => `placement:${t.id}`));
      if (typeof raw !== 'string' || raw.length > 80 || !(stageIds.has(raw) || trackIds.has(raw))) {
        return res.status(400).json({ error: 'stageId must be a stage id, "placement:<track id>", or left out for everything.' });
      }
      stageId = raw;
    }
    clearAssessmentCooldown(store, learning.lib, target.id, stageId);
    audit(req, 'assessment.cooldown.clear', target.id, { username: target.username, stageId: stageId ?? '*' });
    res.json(learningView(store.findUserById(target.id) ?? target));
  });

  /**
   * The first-run setup and placement across every account, for the
   * Analytics card: finished and dismissed, the answers, placements and
   * test-out pass rates (server/assessment-routes.js onboardingAnalytics).
   * Guests are not counted - their answers never reach the server.
   */
  router.get('/analytics/onboarding', (_req, res) => {
    const learning = deps.learning;
    if (!learning?.lib || !learning.settings || typeof store.allAssessmentLogs !== 'function') {
      return res.status(503).json({ error: 'Onboarding numbers are not available yet.' });
    }
    const allProgress = store.allProgress();
    const logs = store.allAssessmentLogs() ?? {};
    res.json(
      onboardingAnalytics({
        users: store.allUsers(),
        progressOf: (id) => (Object.hasOwn(allProgress, id) ? allProgress[id] : null),
        logOf: (id) => (Object.hasOwn(logs, id) ? logs[id] : null),
        lib: learning.lib,
        settings: learning.settings.current(),
        stageName: stageNamer()
      })
    );
  });

  /**
   * Support edits to one learner's streak and goal: freezes held, the streak
   * (a value and its last day), the daily goal, and forgetting the time zone.
   * Range-checked by server/habits.js (`adminUpdate`), audited with every
   * value's before and after. Answers with the drawer's view.
   */
  router.patch('/users/:id/learning', (req, res) => {
    const target = store.findUserById(req.params.id);
    if (!target) return res.status(404).json({ error: 'No such user.' });
    const learning = deps.learning;
    if (!learning?.habits || !learning.activity || !learning.lib) return res.status(503).json({ error: 'Streaks are not available yet.' });
    const result = learning.habits.adminUpdate(target, req.body);
    if (!result.ok) return res.status(result.status).json({ error: result.error });
    if (Object.keys(result.changes).length > 0) audit(req, 'learning.user.update', target.id, { username: target.username, changes: result.changes });
    res.json({ ...learningView(store.findUserById(target.id) ?? target), changed: Object.keys(result.changes) });
  });

  /**
   * Goals and streaks across every learner: goal choices, goals met today,
   * streaks at risk now, the average streak, freezes held and used this
   * week, repairs open and done. The "who this affects" lines on the goal,
   * streak and reminder settings, and the dashboard's Engagement card.
   */
  router.get('/analytics/engagement', (_req, res) => {
    const habits = deps.learning?.habits;
    if (!habits) return res.status(503).json({ error: 'Streaks are not available yet.' });
    res.json(habits.engagement());
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
    // An older mocked store has no `units`; read it defensively.
    const unitOverrides = store.getContentOverrides().units ?? {};
    const units = deps.learning?.units ?? null;
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
        // Units as learners see them (null before the units service exists),
        // and whether an admin regrouped this stage.
        unitCount: units ? units.unitsForStage(stage.id).length : null,
        unitsCustomized: Object.hasOwn(unitOverrides, stage.id),
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

  /* ---------------------------------------------------- content: units */
  // A stage's lessons grouped into units: the admin's own grouping, stored
  // in contentOverrides.units, or the default one (server/units.js). Every
  // lesson - hidden ones included - must be in exactly one unit, so
  // unhiding a question never orphans it; the stage test is in none.
  const unitsService = (res) => {
    const units = deps.learning?.units;
    if (!units || !deps.learning?.lib || !deps.learning?.settings) {
      res.status(503).json({ error: 'Units are not available yet. Try again in a moment.' });
      return null;
    }
    return units;
  };
  const stageExists = (id) => Boolean(contentSnapshot()?.stages.some((s) => s.id === id));

  router.get('/content/stages/:id/units', (req, res) => {
    const units = unitsService(res);
    if (!units) return;
    if (!stageExists(req.params.id)) return res.status(404).json({ error: 'No such stage.' });
    res.json(units.adminView(req.params.id));
  });

  router.put('/content/stages/:id/units', (req, res) => {
    const units = unitsService(res);
    if (!units) return;
    const stageId = req.params.id;
    if (!stageExists(stageId)) return res.status(404).json({ error: 'No such stage.' });

    const { lessons, testIds } = units.adminLessons(stageId);
    const check = deps.learning.lib.validateUnitOverride(stageId, lessons, req.body ?? {}, units.cfg(), {
      testIds,
      stageOf: (id) => getChallenge(id)?.stageId ?? null
    });
    if (check.issues.length) {
      return res.status(422).json({ error: 'The units are not ready to save yet.', issues: check.issues, warnings: check.warnings });
    }

    // New units get `${stageId}:m<n>` from a counter that only goes up, so an
    // id deleted in the editor is never handed to a different unit.
    const existing = store.getUnitOverride(stageId);
    let nextSeq = Number.isInteger(existing?.nextSeq) && existing.nextSeq > 0 ? existing.nextSeq : 1;
    const taken = new Set(check.units.map((u) => u.id).filter(Boolean));
    const saved = check.units.map((unit) => {
      let id = unit.id;
      while (!id) {
        const candidate = `${stageId}:m${nextSeq++}`;
        if (!taken.has(candidate)) id = candidate;
      }
      taken.add(id);
      return { id, name: unit.name, ...(unit.description ? { description: unit.description } : {}), challengeIds: [...unit.challengeIds] };
    });
    store.setUnitOverride(stageId, { units: saved, nextSeq, updatedAt: new Date().toISOString() });
    audit(req, 'content.units.update', stageId, { stageId, units: saved.length });
    res.json(units.adminView(stageId));
  });

  router.delete('/content/stages/:id/units', (req, res) => {
    const units = unitsService(res);
    if (!units) return;
    const stageId = req.params.id;
    if (!stageExists(stageId)) return res.status(404).json({ error: 'No such stage.' });
    const had = Boolean(store.getUnitOverride(stageId));
    store.setUnitOverride(stageId, null);
    audit(req, 'content.units.reset', stageId, { stageId, had });
    res.json(units.adminView(stageId));
  });

  /* --------------------------------------------------- content: challenges */

  /**
   * One table row, the shape every challenge route answers with so the
   * console can drop a response straight into its list. Three states:
   * authored (from source), modified (an authored id replaced in the store)
   * and created (written in the console, no authored original).
   */
  function toRow(c, assigned = conceptAssignments().assigned) {
    const overrides = store.getContentOverrides().challenges;
    const override = Object.hasOwn(overrides, c.id) ? overrides[c.id] : null;
    // The admin view always shows the ORIGINAL authored values alongside the
    // merged ones, so editing a field shows what it overrides - for a
    // modified question that is the untouched authored version, not the edit.
    const o = authoredChallenge(c.id) ?? c;
    // Notes written for options (or blanks) the source has since changed:
    // set aside for learners, and shown here so they can be looked at again.
    const feedbackStale = isFeedbackStale(c, override);
    return {
      ...applyChallengeOverride(c, overrides),
      hidden: Boolean(override?.hidden),
      custom: isCustomChallenge(c.id),
      modified: isModifiedChallenge(c.id),
      original: {
        title: o.title,
        prompt: o.prompt,
        explanation: o.explanation,
        xpReward: o.xpReward,
        difficulty: o.difficulty,
        hints: o.hints ?? [],
        tags: o.tags ?? []
      },
      feedbackStale,
      ...(feedbackStale ? { staleFeedback: { optionFeedback: override.optionFeedback ?? null, blankFeedback: override.blankFeedback ?? null } } : {}),
      // The teaching card this lesson carries, if any: a built-in concept's
      // id, or the key of an admin's card (server/concept-cards.js).
      conceptKey: assigned.get(c.id)?.key ?? null
    };
  }

  /**
   * Store checked notes for one question. A built-in question keeps its
   * source logic live: the notes go in its override with the basis they
   * were written against. A created or modified question keeps them in its
   * own stored record, re-checked by the content schema (nothing is run -
   * notes never change grading). Returns `{ ok, issues, override, challenge }`.
   */
  function saveFeedback(id, set) {
    const raw = getChallenge(id);
    if (isCustomChallenge(id) || isModifiedChallenge(id)) {
      if (!deps.validateChallenge) return { ok: false, issues: [{ path: '', message: 'The server is still starting - try again in a moment.' }] };
      const check = deps.validateChallenge(withNotes(raw, set));
      if (!check.ok) return { ok: false, issues: check.issues };
      store.putCustomChallenge(check.challenge);
      return { ok: true, issues: [], override: store.getContentOverrides().challenges[id] ?? null, challenge: getChallenge(id) };
    }
    const override = store.setChallengeOverride(id, feedbackOverridePatch(id, raw, set));
    return { ok: true, issues: [], override, challenge: applyChallengeOverride(raw, store.getContentOverrides().challenges) };
  }

  /** The override fields for notes on a built-in question: the notes, and the basis they were written against. */
  function feedbackOverridePatch(id, raw, set) {
    const current = store.getContentOverrides().challenges[id] ?? {};
    const patch = {};
    if ('optionFeedback' in set) patch.optionFeedback = set.optionFeedback ?? undefined;
    if ('blankFeedback' in set) patch.blankFeedback = set.blankFeedback ?? undefined;
    patch.feedbackBasis = hasFeedbackOverride({ ...current, ...patch }) ? feedbackBasisKey(raw) : undefined;
    return patch;
  }

  router.get('/content/challenges', (req, res) => {
    const stageId = req.query.stageId ? String(req.query.stageId) : null;
    // Authored order with modified ones in place, created ones last - the order learners see.
    let list = allChallenges();
    if (stageId) list = list.filter((c) => c.stageId === stageId);
    const { assigned } = conceptAssignments();
    res.json({ challenges: list.map((c) => toRow(c, assigned)) });
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
      // The same goes for wrong-answer notes: the wizard sent the merged ones
      // in the body, so they are in the stored question now.
      store.setChallengeOverride(id, {
        title: undefined,
        prompt: undefined,
        explanation: undefined,
        hints: undefined,
        tags: undefined,
        xpReward: undefined,
        difficulty: undefined,
        optionFeedback: undefined,
        blankFeedback: undefined,
        feedbackBasis: undefined
      });
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

    // Wrong-answer notes (`optionFeedback`, `blankFeedback`): checked
    // first, so a refused note saves nothing at all. On a built-in question
    // they are stored beside the basis they were written against; a created
    // or modified question keeps them in its own record.
    let notes = null;
    if (sendsFeedback(req.body)) {
      const { issues, set } = feedbackEdit(challenge, req.body);
      if (issues.length) return res.status(400).json({ error: issues[0].message, issues });
      notes = set;
      if (isCustomChallenge(challenge.id) || isModifiedChallenge(challenge.id)) {
        const saved = saveFeedback(challenge.id, set);
        if (!saved.ok) return res.status(400).json({ error: saved.issues[0]?.message ?? 'The notes do not fit this question.', issues: saved.issues });
      } else {
        Object.assign(patch, feedbackOverridePatch(challenge.id, challenge, set));
      }
    }

    const result = store.setChallengeOverride(req.params.id, patch);
    const { optionFeedback, blankFeedback, feedbackBasis, ...plain } = patch;
    audit(req, 'content.challenge.update', req.params.id, notes ? { ...plain, ...feedbackAuditOf(notes) } : patch);
    const served = applyChallengeOverride(getChallenge(req.params.id), store.getContentOverrides().challenges);
    res.json({ override: result, warnings: notes ? feedbackWarnings(served, deps.learning?.lib?.feedbackLeaks) : [] });
  });

  /**
   * Save the notes for many questions at once - the Answer feedback page's
   * "Save accepted". `{ items: [{ id, optionFeedback?, blankFeedback? }] }`,
   * at most MAX_FEEDBACK_BULK. Each question is saved on its own: the ones
   * that pass come back as `rows`, the rest as `issues` naming their id.
   */
  router.post('/content/challenges/feedback', (req, res) => {
    const items = req.body?.items;
    if (!Array.isArray(items) || items.length === 0) return res.status(400).json({ error: 'Send the notes to save as a list of items.' });
    if (items.length > MAX_FEEDBACK_BULK) return res.status(400).json({ error: `At most ${MAX_FEEDBACK_BULK} questions per save.` });

    const rows = [];
    const issues = [];
    const warnings = [];
    const seen = new Set();
    for (const item of items) {
      const id = typeof item?.id === 'string' ? item.id : '';
      const challenge = id ? getChallenge(id) : null;
      if (!challenge) {
        issues.push({ id, path: '', message: 'No such question.' });
        continue;
      }
      if (seen.has(id)) {
        issues.push({ id, path: '', message: 'This question is in the list twice.' });
        continue;
      }
      seen.add(id);
      if (!sendsFeedback(item)) {
        issues.push({ id, path: '', message: 'No notes were sent for this question.' });
        continue;
      }
      const checked = feedbackEdit(challenge, item);
      if (checked.issues.length) {
        issues.push(...checked.issues.map((i) => ({ id, ...i })));
        continue;
      }
      const saved = saveFeedback(id, checked.set);
      if (!saved.ok) {
        issues.push(...saved.issues.map((i) => ({ id, ...i })));
        continue;
      }
      rows.push(toRow(getChallenge(id)));
      warnings.push(...feedbackWarnings(saved.challenge, deps.learning?.lib?.feedbackLeaks).map((w) => ({ id, ...w })));
    }
    if (rows.length) audit(req, 'content.challenge.feedback', null, { saved: rows.length, refused: new Set(issues.map((i) => i.id)).size, ids: rows.map((r) => r.id) });
    res.json({ rows, issues, warnings });
  });

  /* ------------------------------------------------------- teaching cards */

  /**
   * The Teaching page: every built-in concept and every card an admin wrote
   * (server/concept-cards.js), where each lands, and what learners get.
   * Built-in concepts keep their lesson; an edit is stored under the
   * concept's own id and can be reverted. Created cards go before a lesson,
   * at the start of a stage or at the start of a unit - one concept per
   * lesson. Nothing here touches grading.
   */
  const unitFirstLesson = (unitId) => deps.learning?.units?.firstLessonOf?.(unitId) ?? null;

  /** The lessons learners see, in order, before any card is applied. */
  function learnerLessons() {
    const snapshot = contentSnapshot();
    return snapshot ? applyLearnerOverrides(snapshot, store.getContentOverrides(), { concepts: false }).challenges : [];
  }

  function cardList() {
    return store.allConceptCards();
  }

  /** Every key in use: the cards' and the built-in concepts' ids (a new key must be none of them). */
  function usedKeys(bank) {
    return [...cardList().map((card) => card.key), ...authoredConceptIndex(bank).keys()];
  }

  /**
   * One row per concept: its key, where it is, what it says, where it came
   * from ('authored' | 'modified' | 'created'), whether it is hidden, and -
   * `problem` - why learners do not get it: its lesson is hidden or gone
   * ('anchor-missing'), or the lesson has another concept ('lesson-has-concept').
   */
  function conceptRows() {
    const bank = allChallenges();
    const byId = new Map(bank.map((c) => [c.id, c]));
    const cards = cardList();
    const index = authoredConceptIndex(bank);
    const forLearners = conceptAssignments(learnerLessons(), { bank, cards });
    const placedKeys = new Map([...forLearners.assigned.entries()].map(([lessonId, entry]) => [entry.key, lessonId]));
    const rows = [];

    for (const [key, lessonId] of index) {
      const lesson = byId.get(lessonId);
      const card = store.getConceptCard(key);
      const served = placedKeys.has(key);
      rows.push({
        key,
        anchor: { kind: 'lesson', challengeId: lessonId },
        concept: card?.concept ?? lesson?.concept ?? null,
        source: card?.concept ? 'modified' : 'authored',
        hidden: Boolean(card?.hidden),
        revision: Number.isInteger(card?.revision) ? card.revision : 0,
        lessonId,
        lessonTitle: lesson?.title ?? lessonId,
        stageId: lesson?.stageId ?? null,
        orphaned: !served,
        problem: served ? null : 'anchor-missing',
        updatedAt: card?.updatedAt ?? null
      });
    }
    for (const card of cards) {
      if (index.has(card.key)) continue;
      const placedOn = placedKeys.get(card.key) ?? null;
      // Not placed for learners: name the lesson it would go on anyway (a hidden one, say).
      const lessonId = placedOn ?? resolveAnchor(card.anchor, bank, { unitFirstLesson });
      const lesson = lessonId ? byId.get(lessonId) : null;
      rows.push({
        key: card.key,
        anchor: card.anchor,
        concept: card.concept ?? null,
        source: 'created',
        hidden: Boolean(card.hidden),
        revision: Number.isInteger(card.revision) ? card.revision : 0,
        lessonId: lessonId ?? null,
        lessonTitle: lesson?.title ?? null,
        stageId: lesson?.stageId ?? card.anchor?.stageId ?? null,
        orphaned: !placedOn,
        problem: placedOn ? null : forLearners.unplaced.get(card.key) ?? 'anchor-missing',
        updatedAt: card.updatedAt ?? null
      });
    }
    return { rows, forLearners };
  }

  /** One card's row, as the list returns it. */
  const conceptRowOf = (key) => conceptRows().rows.find((row) => row.key === key) ?? null;

  /** The lesson an anchor lands on (hidden lessons too, for a lesson anchor), or an issue. */
  function anchorTarget(anchor, bank) {
    if (anchor.kind === 'lesson') {
      const lesson = bank.find((c) => c.id === anchor.challengeId);
      if (!lesson) return { issue: { path: 'anchor.challengeId', message: 'No such lesson.' } };
      if (lesson.isStageTest) return { issue: { path: 'anchor.challengeId', message: 'A stage test cannot carry a teaching card - pick a lesson.' } };
      return { lessonId: lesson.id };
    }
    if (anchor.kind === 'stage') {
      const stage = (contentSnapshot()?.stages ?? []).find((s) => s.id === anchor.stageId);
      if (!stage) return { issue: { path: 'anchor.stageId', message: 'No such stage.' } };
      return { lessonId: resolveAnchor(anchor, learnerLessons()) };
    }
    if (!deps.learning?.units) return { issue: { path: 'anchor.unitId', message: 'Units are not available yet - try again in a moment.' } };
    const lessonId = unitFirstLesson(anchor.unitId);
    if (!lessonId) return { issue: { path: 'anchor.unitId', message: 'No such unit (or it has no lessons learners see).' } };
    return { lessonId };
  }

  /** Tidy and check a concept served as `id`: the friendly checks, then the schema. */
  function checkConcept(body, id) {
    const { candidate, issues } = normalizeConceptInput(body, { id });
    if (!deps.validateConcept) return { ok: false, concept: null, issues: [{ path: '', message: 'The server is still starting - try again in a moment.' }] };
    const schema = deps.validateConcept(candidate);
    const covered = new Set(issues.map((i) => i.path.split('.')[0]));
    const all = mergeIssues(issues, schema.ok ? [] : schema.issues.filter((i) => !covered.has(i.path.split('.')[0])));
    return all.length ? { ok: false, concept: null, issues: all } : { ok: true, concept: schema.concept, issues: [] };
  }

  /** The concept already on this lesson (built-in or a placed card), other than `exceptKey`. */
  function conceptOnLesson(lessonId, exceptKey, bank) {
    const { assigned } = conceptAssignments(bank, { bank });
    const entry = assigned.get(lessonId);
    return entry && entry.key !== exceptKey ? entry.key : null;
  }

  router.get('/content/concepts', (req, res) => {
    const stageId = req.query.stageId ? String(req.query.stageId) : null;
    const { rows, forLearners } = conceptRows();
    const bank = allChallenges();
    const learners = learnerLessons();
    const hiddenIds = new Set(
      Object.entries(store.getContentOverrides().challenges)
        .filter(([, o]) => o?.hidden)
        .map(([id]) => id)
    );
    // "2 of 20 lessons have teaching": the lessons learners see, and how many get a concept.
    const coverage = (contentSnapshot()?.stages ?? []).map((stage) => {
      const lessons = learners.filter((c) => c.stageId === stage.id && !c.isStageTest);
      const withConcept = lessons.filter((c) => {
        const entry = forLearners.assigned.get(c.id);
        return entry && !entry.hidden;
      }).length;
      return { stageId: stage.id, name: stage.name, lessons: lessons.length, withConcept };
    });
    const body = { rows: stageId ? rows.filter((row) => row.stageId === stageId) : rows, coverage };
    if (stageId) {
      const { assigned } = conceptAssignments(bank, { bank });
      body.lessons = bank
        .filter((c) => c.stageId === stageId && !c.isStageTest)
        .map((c) => {
          const entry = assigned.get(c.id);
          return {
            id: c.id,
            title: c.title,
            type: c.type,
            hidden: hiddenIds.has(c.id),
            concept: entry ? { key: entry.key, source: entry.source, hidden: entry.hidden, title: entry.concept?.title ?? '' } : null
          };
        });
      body.units = (deps.learning?.units?.unitsForStage?.(stageId) ?? []).map((u) => ({ id: u.id, name: u.name, firstLessonId: u.challengeIds[0] ?? null }));
    }
    res.json(body);
  });

  router.post('/content/concepts/validate', (req, res) => {
    const key = typeof req.body?.key === 'string' && req.body.key ? req.body.key : 'concept-preview';
    const anchor = req.body?.anchor === undefined ? null : normalizeAnchor(req.body.anchor);
    const result = checkConcept(req.body?.concept, key);
    res.json({ ok: result.ok && !(anchor && anchor.issues.length), issues: [...(anchor?.issues ?? []), ...result.issues], concept: result.concept });
  });

  router.post('/content/concepts', (req, res) => {
    const bank = allChallenges();
    const { anchor, issues: anchorIssues } = normalizeAnchor(req.body?.anchor);
    if (!anchor) return res.status(422).json({ error: anchorIssues[0].message, issues: anchorIssues });
    const target = anchorTarget(anchor, bank);
    if (target.issue) return res.status(422).json({ error: target.issue.message, issues: [target.issue] });
    // One concept per lesson: edit the one that is there instead.
    const existing = target.lessonId ? conceptOnLesson(target.lessonId, null, bank) : null;
    if (existing) {
      return res.status(409).json({ error: 'That lesson already has a teaching card - edit that one instead.', existingKey: existing, lessonId: target.lessonId });
    }
    const key = generateConceptKey(req.body?.concept?.title, usedKeys(bank));
    const checked = checkConcept(req.body?.concept, conceptIdFor(key, 0));
    if (!checked.ok) return res.status(422).json({ error: 'The card is not ready to save yet.', issues: checked.issues });
    store.putConceptCard({ key, concept: checked.concept, anchor, hidden: false, revision: 0 });
    audit(req, 'content.concept.create', key, { anchor: anchor.kind, lessonId: target.lessonId ?? null });
    res.status(201).json({ card: conceptRowOf(key) });
  });

  router.put('/content/concepts/:key', (req, res) => {
    const key = String(req.params.key);
    const bank = allChallenges();
    const index = authoredConceptIndex(bank);
    const record = store.getConceptCard(key);
    const builtIn = index.has(key);
    if (!builtIn && !record) return res.status(404).json({ error: 'No such teaching card.' });

    // A built-in concept stays on its own lesson; a created card may move.
    let anchor = builtIn ? { kind: 'lesson', challengeId: index.get(key) } : record.anchor;
    if (!builtIn && req.body?.anchor !== undefined) {
      const next = normalizeAnchor(req.body.anchor);
      if (!next.anchor) return res.status(422).json({ error: next.issues[0].message, issues: next.issues });
      const target = anchorTarget(next.anchor, bank);
      if (target.issue) return res.status(422).json({ error: target.issue.message, issues: [target.issue] });
      const existing = target.lessonId ? conceptOnLesson(target.lessonId, key, bank) : null;
      if (existing) return res.status(409).json({ error: 'That lesson already has a teaching card - edit that one instead.', existingKey: existing, lessonId: target.lessonId });
      anchor = next.anchor;
    }
    // "Show it again": a new served id, so learners who saw it see the new version.
    const revision = (Number.isInteger(record?.revision) ? record.revision : 0) + (req.body?.showAgain === true ? 1 : 0);
    const checked = checkConcept(req.body?.concept, conceptIdFor(key, revision));
    if (!checked.ok) return res.status(422).json({ error: 'The card is not ready to save yet.', issues: checked.issues });
    store.putConceptCard({ key, concept: checked.concept, anchor, hidden: Boolean(record?.hidden), revision });
    audit(req, 'content.concept.update', key, { builtIn, anchor: anchor.kind, showAgain: req.body?.showAgain === true });
    res.json({ card: conceptRowOf(key) });
  });

  /** A built-in concept back as it shipped (still hidden, if it was). */
  router.post('/content/concepts/:key/revert', (req, res) => {
    const key = String(req.params.key);
    const index = authoredConceptIndex(allChallenges());
    if (!index.has(key)) return res.status(409).json({ error: 'Only a built-in concept can be reverted - a card written here can be edited or deleted.' });
    const record = store.getConceptCard(key);
    if (!record?.concept) return res.status(409).json({ error: 'This concept has not been edited, so there is nothing to revert.' });
    if (record.hidden) store.putConceptCard({ key, anchor: record.anchor, hidden: true });
    else store.deleteConceptCard(key);
    audit(req, 'content.concept.revert', key, { hidden: Boolean(record.hidden) });
    res.json({ card: conceptRowOf(key) });
  });

  /** Hide or show a concept (built-in or created). */
  router.patch('/content/concepts/:key', (req, res) => {
    const key = String(req.params.key);
    if (typeof req.body?.hidden !== 'boolean') return res.status(400).json({ error: 'Send `hidden` as true or false.' });
    const hidden = req.body.hidden;
    const index = authoredConceptIndex(allChallenges());
    const record = store.getConceptCard(key);
    if (!index.has(key) && !record) return res.status(404).json({ error: 'No such teaching card.' });
    if (index.has(key) && !record?.concept && !hidden) store.deleteConceptCard(key);
    else store.putConceptCard({ ...(record ?? { key, anchor: { kind: 'lesson', challengeId: index.get(key) } }), hidden });
    audit(req, 'content.concept.update', key, { hidden });
    res.json({ card: conceptRowOf(key) });
  });

  /** Delete a card written here. A built-in concept is hidden or reverted instead. */
  router.delete('/content/concepts/:key', (req, res) => {
    const key = String(req.params.key);
    if (authoredConceptIndex(allChallenges()).has(key)) {
      return res.status(409).json({ error: 'This concept is built in, so it cannot be deleted - hide it, or revert your edit.', builtIn: true });
    }
    if (!store.getConceptCard(key)) return res.status(404).json({ error: 'No such teaching card.' });
    store.deleteConceptCard(key);
    audit(req, 'content.concept.delete', key, null);
    res.json({ ok: true, deleted: true });
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

  /**
   * Gemini drafts wrong-answer notes for 1-10 questions (option or blank
   * kinds). Nothing is saved: the Answer feedback page shows each draft to
   * accept, edit or reject, and saves the accepted ones through the bulk
   * route above. Each draft comes back with the notes that would give the
   * answer away already flagged.
   */
  router.post(
    '/ai/feedback',
    aiRoute(async (req, res) => {
      const ids = req.body?.ids;
      if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ error: 'Pick at least one question.' });
      if (ids.length > MAX_FEEDBACK_IDS) return res.status(400).json({ error: `At most ${MAX_FEEDBACK_IDS} questions per draft.` });
      const unique = [...new Set(ids.map((id) => String(id ?? '')))];
      const overrides = store.getContentOverrides().challenges;
      const challenges = [];
      for (const id of unique) {
        const raw = getChallenge(id);
        if (!raw) return res.status(400).json({ error: `No such question: ${id}.` });
        if (!FEEDBACK_KINDS.includes(raw.type)) {
          return res.status(400).json({ error: `"${raw.title}" has no options or blanks to write notes for.` });
        }
        challenges.push(applyChallengeOverride(raw, overrides));
      }
      if (!deps.ai?.configured) return notConfigured(res);

      const result = await draftFeedback({ ai: deps.ai, challenges, leaks: deps.learning?.lib?.feedbackLeaks });
      audit(req, 'ai.feedback', null, { count: challenges.length });
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

  /* ---------------------------------------------------------------- billing */

  /**
   * Prices, grants and revokes. A BillingError (server/billing.js) carries
   * the status to reply with and a message written for the admin - "You
   * already have access to this." on a duplicate grant, say - so none of
   * them reaches the app-level 500 handler.
   */
  const billingRoute = (fn) =>
    asyncRoute(async (req, res) => {
      try {
        await fn(req, res);
      } catch (err) {
        if (err instanceof BillingError) return res.status(err.status ?? 400).json({ error: err.message });
        throw err;
      }
    });

  const billingMode = () => deps.billing?.provider?.mode ?? 'test';

  /** Every price the console can set, resolved to its effective value, plus the ids it can price. */
  function pricingView() {
    const snapshot = contentSnapshot();
    const overrides = store.getContentOverrides();
    const stageOverrides = overrides.stages;
    const languageOverrides = overrides.languages;
    const pricing = store.getPricing();
    // `hidden` rides along because a grant goes through the learner-visible
    // catalog: a hidden track or stage can be priced but not granted, and the
    // console says so rather than letting the admin hit "Unknown product."
    const tracks = (snapshot?.languageTracks ?? []).map((t) => ({ id: t.id, label: t.label, hidden: Boolean(languageOverrides?.[t.id]?.hidden) }));
    // Premium after admin overrides, hidden ones included - a price can be
    // set before a stage is shown to learners.
    const premiumStages = (snapshot?.stages ?? [])
      .map((s) => applyStageOverride(s, stageOverrides))
      .filter((s) => s.isPremium)
      .map((s) => ({ id: s.id, name: s.name, index: s.index, hidden: Boolean(stageOverrides?.[s.id]?.hidden) }));
    return {
      pricing: {
        lifetime: priceFor({ kind: 'lifetime' }, pricing),
        tracks: Object.fromEntries(tracks.map((t) => [t.id, priceFor({ kind: 'track', trackId: t.id }, pricing)])),
        stages: Object.fromEntries(premiumStages.map((s) => [s.id, priceFor({ kind: 'stage', stageId: s.id }, pricing)])),
        certificates: Object.fromEntries(tracks.map((t) => [t.id, priceFor({ kind: 'certificate', trackId: t.id }, pricing)]))
      },
      // The sparse record as stored, so the console can tell a set price from a default.
      custom: pricing,
      defaults: DEFAULT_PRICES,
      currency: CURRENCY,
      mode: billingMode(),
      catalogKeys: { tracks, premiumStages }
    };
  }

  router.get('/billing/pricing', (_req, res) => {
    res.json(pricingView());
  });

  /**
   * Set prices in paise. `null` on any key puts it back to the default.
   * Whole numbers within [MIN_PRICE, MAX_PRICE] only, and only for ids
   * that exist - a typo cannot price a stage nobody has.
   */
  router.put('/billing/pricing', (req, res) => {
    const body = req.body ?? {};
    const snapshot = contentSnapshot();
    const trackIds = new Set((snapshot?.languageTracks ?? []).map((t) => t.id));
    const stageIds = new Set((snapshot?.stages ?? []).map((s) => s.id));
    const patch = {};
    const problems = [];
    const price = (value, label) => {
      if (value === null) return null;
      if (!Number.isInteger(value) || value < MIN_PRICE || value > MAX_PRICE) {
        problems.push(`${label}: enter a whole number of paise between ${MIN_PRICE} and ${MAX_PRICE.toLocaleString('en-IN')}.`);
        return undefined;
      }
      return value;
    };

    if (body.lifetime !== undefined) {
      const v = price(body.lifetime, 'Lifetime licence');
      if (v !== undefined) patch.lifetime = v;
    }
    for (const [kind, known, label] of [
      ['tracks', trackIds, 'Track'],
      ['stages', stageIds, 'Stage'],
      ['certificates', trackIds, 'Certificate for track']
    ]) {
      if (body[kind] === undefined) continue;
      if (!body[kind] || typeof body[kind] !== 'object' || Array.isArray(body[kind])) {
        problems.push(`${kind}: expected an object of id to paise.`);
        continue;
      }
      patch[kind] = {};
      for (const [id, value] of Object.entries(body[kind])) {
        if (!known.has(id)) {
          problems.push(`${label} "${id}" does not exist.`);
          continue;
        }
        const v = price(value, `${label} "${id}"`);
        if (v !== undefined) patch[kind][id] = v;
      }
    }
    if (problems.length) return res.status(400).json({ error: problems[0], issues: problems });

    store.setPricing(patch);
    audit(req, 'billing.pricing.update', null, patch);
    res.json(pricingView());
  });

  /** Newest first, capped. `q` matches the order id, product, learner or gateway ids. */
  router.get('/billing/orders', (req, res) => {
    const status = String(req.query.status ?? '').trim();
    const userId = String(req.query.userId ?? '').trim();
    const q = String(req.query.q ?? '').trim().toLowerCase();
    const users = new Map(store.allUsers().map((u) => [u.id, u]));

    let rows = store.allOrders();
    if (status) rows = rows.filter((o) => o.status === status);
    if (userId) rows = rows.filter((o) => o.userId === userId);
    rows = rows.map((o) => {
      const user = users.get(o.userId);
      return { ...o, username: user?.username ?? null, email: user?.email ?? null };
    });
    if (q) {
      rows = rows.filter((r) =>
        [r.id, r.productKey, r.username, r.email, r.providerOrderId, r.providerPaymentId].some((v) => String(v ?? '').toLowerCase().includes(q))
      );
    }
    res.json({ orders: rows.slice(0, 500) });
  });

  /** Give a product away (paid offline, goodwill). Same rules as a purchase, no gateway. */
  router.post(
    '/billing/grant',
    billingRoute(async (req, res) => {
      const body = req.body ?? {};
      const target = store.findUserById(String(body.userId ?? ''));
      if (!target) return res.status(404).json({ error: 'No such user.' });

      const name = certificateNameFrom(body.certificateName);
      if (name.error) return res.status(400).json({ error: name.error });

      const result = grant({
        adminUserId: req.admin.id,
        userId: target.id,
        product: body.product,
        note: body.note,
        certificateName: name.name,
        snapshot: contentSnapshot(),
        overrides: store.getContentOverrides()
      });
      audit(req, 'billing.grant', target.id, { userId: target.id, productKey: result.order.productKey });
      res.status(201).json(result);
    })
  );

  router.post(
    '/billing/orders/:id/revoke',
    billingRoute(async (req, res) => {
      const { order } = revokeOrder(req.params.id, req.admin.id);
      audit(req, 'billing.revoke', order.id, { userId: order.userId, productKey: order.productKey });
      res.json({ order });
    })
  );

  router.get('/billing/certificates', (_req, res) => {
    const users = new Map(store.allUsers().map((u) => [u.id, u]));
    const snapshot = contentSnapshot();
    res.json({
      certificates: store.allCertificates().map((c) => ({
        ...c,
        trackLabel: trackLabel(c.trackId, snapshot),
        revoked: Boolean(c.revokedAt),
        username: users.get(c.userId)?.username ?? null
      }))
    });
  });

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
