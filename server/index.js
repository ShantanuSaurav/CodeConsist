/**
 * CodeQuest API server.
 *
 * Runs entirely on a laptop: `npm run dev` starts this alongside Vite. No
 * database service, no cloud account, no native modules. It owns
 *   - accounts (bcrypt + JWT),
 *   - progress, XP, levels, streaks and the leaderboard,
 *   - authoritative grading of quiz answers,
 *   - real sandboxed JavaScript execution in a child process,
 *   - a separate administrator credential system (server/admin-auth.js),
 *   - one-time purchases through Razorpay, or an explicit test mode
 *     (server/payments.js, server/billing.js, server/billing-routes.js),
 *   - an optional, best-effort mirror of accounts into Excel (server/excel.js).
 */
// Must stay the first import - see server/env.js.
// Environment and admin credentials loaded.
import './env.js';
import express from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import http from 'node:http';
import path from 'node:path';
import { spawn, execFile, execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { existsSync } from 'node:fs';

import * as store from './db.js';
import {
  loadContent,
  getChallenge,
  contentSnapshot,
  applyLearnerOverrides,
  applyChallengeOverride,
  allChallenges,
  lockedStub,
  setUnitFirstLessonResolver
} from './content.js';
import { compileTsModule } from './build.js';
import { runSqlInChild, prepareSqlEngine } from './sql.js';
import { createAdminRouter } from './admin.js';
import { createGeminiClient } from './ai.js';
import { initAuthSecret, signLearnerToken, verifyLearnerToken, signAdminToken, learnerTokenIsCurrent } from './auth.js';
import { bootstrapAdminAccount, authenticateAdmin, publicAdmin, requireAdminAuth } from './admin-auth.js';
import * as excel from './excel.js';
import { createPaymentProvider } from './payments.js';
import { entitlementsFor, setCertificateTestOutRule, stageAccessFor, unlockedStageIds } from './billing.js';
import { clientIp, trustProxyFn } from './client-ip.js';
import { createCorsPolicy } from './cors-policy.js';
import { BUCKET_SETTING, BusyError, createExecutionSlots, createLimiter, limitCheck, rateLimit } from './rate-limit.js';
import { acceptClaims, checkSolveAccess, completedStagesFor as clearedStagesFor, filterMerge, mergeAccess, verifyClaims } from './progression.js';
import { createAssessmentRouter } from './assessment-routes.js';
import { createPasswordResetRouter } from './password-reset.js';
import { createBillingRouter, createWebhookRouter } from './billing-routes.js';
import { createOAuthProviders, PROVIDER_IDS } from './oauth.js';
import { createOAuthRouter } from './oauth-routes.js';
import { clearDraftForSolve, createDraftsRouter } from './drafts-routes.js';
import { createSettingsService } from './settings.js';
import { createSettingsRouter } from './settings-routes.js';
import { createActivityService } from './activity.js';
import { createActivityRouter } from './activity-routes.js';
import { createProgressRouter, habitsForUser, recalcForUser } from './progress-routes.js';
import { createUnitsService } from './units.js';
import { createHabitsService } from './habits.js';
import { createPreferencesRouter, publicPreferences } from './preferences-routes.js';
import { createReviewRouter, createReviewService } from './review-routes.js';
import { createLeaguesService } from './leagues.js';
import { createLeaguesRouter } from './leagues-routes.js';
import {
  JUDGE0_LANGUAGE_IDS,
  JUDGE0_STDIN_LIMIT,
  buildRuntimes,
  judge0SetupHint,
  resolveJudge0Config,
  runJudge0Submission,
  runtimeUnavailableMessage
} from './judge0.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
// Deliberately not `PORT`: dev harnesses set that for the *web* server, and the
const PORT = Number(process.env.PORT || process.env.API_PORT || 4000);
/** How often the weekly league closes weeks past their final time (server/leagues.js closeDueWeeks). */
const LEAGUE_CLOSE_EVERY_MS = 10 * 60_000;

/**
 * Judge0 configuration. Server-side only - server/judge0.js is the one place
 * these credentials are read, and this file never sees more of the endpoint
 * than `configured`, the mode and the host. A key is optional: a URL alone
 * means a self-hosted instance, which is the free option and the one that
 * keeps learners' code off the public internet (docs/RUNNING-JAVA-C-CPP.md).
 */
const judge0Config = resolveJudge0Config();
const JUDGE0_CONFIGURED = judge0Config.configured;

if (judge0Config.reason === 'bad-url') {
  // Loud at boot rather than silent until the first submission: the usual
  // cause is `localhost:2358` with the scheme left off, which is two seconds
  // to fix if anyone says so.
  console.warn('[judge0] JUDGE0_API_URL is not a usable http(s) URL - Java, C, C++ and Go stay disabled.');
} else if (judge0Config.reason === 'placeholder') {
  console.warn('[judge0] JUDGE0_API_URL/JUDGE0_API_KEY still hold the .env.example placeholder values - Java, C, C++ and Go stay disabled.');
}

/**
 * The payment gateway. Reads RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET /
 * RAZORPAY_WEBHOOK_SECRET from .env (server/env.js ran first). With none
 * set it runs in test mode: orders complete through an explicit, clearly
 * labelled step and no money moves - see server/payments.js. Shared with
 * the admin router so both sides agree on the mode.
 */
const billingDeps = { provider: createPaymentProvider() };

/**
 * "Continue with Google" / "Continue with GitHub". Reads GOOGLE_CLIENT_ID /
 * GOOGLE_CLIENT_SECRET / GITHUB_CLIENT_ID / GITHUB_CLIENT_SECRET from .env
 * (server/env.js ran first). With none set both providers are null, the
 * browser is told `{ google: false, github: false }` and simply shows no
 * buttons - email + password is completely unaffected. The secrets are read
 * here and in server/oauth.js only; nothing about them reaches the client.
 */
const oauthProviders = createOAuthProviders();

/* ------------------------------------------------------------ bootstrapping */

let grading;
let leveling;
let gradingPath;
/**
 * What the admin router needs from this file and cannot import (it would be
 * a cycle): the schema the authored content is validated with, the same
 * runners that grade learners' code, and the Gemini client behind the AI
 * question assistant. Filled in by bootstrap() below; the router reads them
 * per request, so mounting it before bootstrap is fine.
 */
const adminDeps = { validateChallenge: null, validateConcept: null, runSolution: null, ai: null, billing: billingDeps, learning: null };

/**
 * The learning-loop services, filled in by bootstrap():
 *   lib      - src/platform/server-lib.ts compiled to learning.mjs: the same
 *              settings, day, XP and activity rules the browser runs;
 *   settings - server/settings.js: the admin's rules over the defaults;
 *   activity - server/activity.js: each learner's days and wrong answers;
 *   units    - server/units.js: each stage's lessons grouped into units (the
 *              admin's grouping or the default), for the bank, the
 *              perfect-unit bonus and the admin units editor;
 *   habits   - server/habits.js: streaks, freezes, repair and the daily goal
 *              (the same engine the browser runs), for the solve and merge
 *              pipelines, the leaderboard and the admin's user drawer;
 *   review   - server/review-routes.js: Practice sessions, the review
 *              schedule's "answer shown" reset, the merge's review step and
 *              the admin's Practice numbers;
 *   leagues  - server/leagues.js: the weekly league (who joined which week,
 *              standings from the activity log, closing weeks, the admin's
 *              reset and exclusions);
 *   runtimeInfo - which engines this server has, for the admin's rules page.
 *   canVerify - can this server check a stage test's answer itself (the
 *     placement and test-out sections show it per stage; Phase 5).
 * Routers read it per request, so mounting them before bootstrap is fine.
 */
const learningDeps = { lib: null, settings: null, activity: null, units: null, habits: null, review: null, leagues: null, runtimeInfo: null, canVerify: null };
adminDeps.learning = learningDeps;

/**
 * One effective setting (src/platform/settings), read per request so an
 * admin's change applies to the next one. `fallback` covers the moment
 * before bootstrap has built the settings service.
 */
function setting(path, fallback) {
  try {
    const value = learningDeps.settings?.get(path);
    return value === undefined || value === null ? fallback : value;
  } catch {
    return fallback;
  }
}

/** A piece of site copy with its `{tokens}` filled, for a server-side message - or `fallback` before bootstrap. */
function copyText(key, vars = {}, fallback = '') {
  try {
    return learningDeps.settings?.copyText(key, vars) || fallback;
  } catch {
    return fallback;
  }
}

/* ----------------------------------------------------------- limits & access */

/**
 * The abuse limits (server/rate-limit.js), the code-runner slots and the CORS
 * policy (server/cors-policy.js). All state is in memory and every number is
 * read live from the admin's `access` settings. `adminDeps.access` hands the
 * same instances to the admin router's Limits & access page.
 */
const limiter = createLimiter();
const slots = createExecutionSlots({
  config: () => setting('access.execution', { maxConcurrent: 4, maxQueued: 20, queueWaitMs: 10_000 })
});
const corsPolicy = createCorsPolicy({
  getMode: () => setting('access.cors.mode', 'report'),
  getExtraOrigins: () => setting('access.cors.extraOrigins', [])
});
const trustedHops = () => setting('access.network.trustProxyHops', 2);
adminDeps.access = { limiter, slots, cors: corsPolicy, hops: trustedHops, bootedAt: new Date().toISOString() };

/** The friendly 429 sentence (`copy.limits.tooMany`). */
function tooManyMessage(minutes) {
  return copyText('limits.tooMany', { minutes }, `Too many attempts - wait ${minutes} min and try again.`);
}

/** The live rule for a bucket (`access.rateLimit.<key>`), or null (no limit) before bootstrap. */
function ruleFor(bucket) {
  return setting(`access.rateLimit.${BUCKET_SETTING[bucket]}`, null);
}

function limitMode() {
  return setting('access.rateLimit.mode', 'enforce');
}

/** Rate-limit middleware over one bucket, keyed by `key(req)` (null skips - fails open). */
function limitBy(bucket, key) {
  return rateLimit({ limiter, bucket, rule: () => ruleFor(bucket), key, mode: limitMode, message: tooManyMessage });
}

/** One count against a bucket, by hand (`limitCheck`): `(req) => { allowed, ... }`. */
function chargeBy(bucket, key) {
  return limitCheck({ limiter, bucket, rule: () => ruleFor(bucket), key, mode: limitMode });
}

/** Per-address limits use the address the trusted proxies vouch for; unknown skips them. */
const byAddress = (req) => clientIp(req);
const byAccount = (req) => req.user?.id ?? null;

/**
 * What the premium gate needs, built once per request: the content, the
 * admin's overrides, the `access.premiumGate` mode and which route asks.
 */
function premiumContext(route) {
  return {
    snapshot: contentSnapshot(),
    overrides: store.getContentOverrides(),
    mode: setting('access.premiumGate', 'enforce'),
    route
  };
}

/**
 * The premium gate's context plus the stage order (Phase 5): the
 * `access.solveGate` mode, the shared rules and the learner's row, so
 * server/progression.js can build their stages the way their browser does.
 */
function progressionContext(route) {
  return {
    ...premiumContext(route),
    lib: learningDeps.lib,
    solveGate: setting('access.solveGate', 'log'),
    progressFor: (user) => store.getProgress(user.id)
  };
}

/**
 * What the merge and the assessment routes judge the stage order against:
 * the content and its overrides, and whether the premium gate enforces.
 * Null until the content and the shared rules are loaded.
 */
function progressionContent() {
  const snapshot = contentSnapshot();
  if (!snapshot || !learningDeps.lib) return null;
  return { snapshot, overrides: store.getContentOverrides(), premiumEnforced: setting('access.premiumGate', 'enforce') !== 'log' };
}

/**
 * The ids of the tracks learners are shown (an admin can unpublish one):
 * what a learner's `trackId` preference may be. Null before the content loads.
 */
function learnerTrackIds() {
  const snapshot = contentSnapshot();
  if (!snapshot) return null;
  const languages = store.getContentOverrides().languages ?? {};
  return (snapshot.languageTracks ?? []).filter((t) => !(Object.hasOwn(languages, t.id) && languages[t.id]?.hidden)).map((t) => t.id);
}

/**
 * The concept ids learners are served (authored ones and the admin's
 * teaching cards, as re-shown): all a `seenConcepts` list may hold. Null
 * before the content loads.
 */
function knownConceptIds() {
  const snapshot = contentSnapshot();
  if (!snapshot) return null;
  const merged = applyLearnerOverrides(snapshot, store.getContentOverrides());
  return new Set(merged.challenges.map((c) => c.concept?.id).filter((id) => typeof id === 'string' && id));
}

async function bootstrap() {
  await store.load();

  // Reads GEMINI_API_KEY / GEMINI_MODEL from .env (server/env.js). Unset is
  // fine: the client reports `configured: false` and the console explains.
  adminDeps.ai = createGeminiClient();

  gradingPath = await compileTsModule(path.join(ROOT, 'src', 'platform', 'grading-engine', 'grading.ts'), 'grading.mjs');
  await prepareSqlEngine();
  const levelingPath = await compileTsModule(path.join(ROOT, 'src', 'platform', 'xp-leveling', 'leveling.ts'), 'leveling.mjs');
  grading = await import(pathToFileURL(gradingPath).href);
  leveling = await import(pathToFileURL(levelingPath).href);

  const learningPath = await compileTsModule(path.join(ROOT, 'src', 'platform', 'server-lib.ts'), 'learning.mjs');
  learningDeps.lib = await import(pathToFileURL(learningPath).href);
  learningDeps.settings = createSettingsService({
    store,
    lib: learningDeps.lib,
    // The tracks and stages, for the checks that need the content (a
    // placement stage must be a stage of its track) - on save only.
    contentFacts: () => {
      const snapshot = contentSnapshot();
      if (!snapshot) return null;
      return {
        tracks: (snapshot.languageTracks ?? []).map((t) => ({ id: t.id, stageIds: [...(t.stageIds ?? [])] })),
        stageIds: (snapshot.stages ?? []).map((s) => s.id)
      };
    }
  });
  // A stage cleared by a test-out counts toward a certificate only when the
  // admin says so (`testOut.countsTowardCertificate`) - server/billing.js.
  setCertificateTestOutRule(() => setting('testOut.countsTowardCertificate', false) === true);
  learningDeps.activity = createActivityService({
    lib: learningDeps.lib,
    store,
    settings: learningDeps.settings,
    getChallengeMerged,
    gradeAnswer
  });
  // Resolved lazily against the content snapshot (loaded below), cached per state.
  learningDeps.units = createUnitsService({ store, lib: learningDeps.lib, settings: learningDeps.settings });
  learningDeps.habits = createHabitsService({
    lib: learningDeps.lib,
    store,
    settings: learningDeps.settings,
    activity: learningDeps.activity
  });
  learningDeps.leagues = createLeaguesService({
    lib: learningDeps.lib,
    store,
    settings: learningDeps.settings,
    activity: learningDeps.activity,
    habits: learningDeps.habits
  });
  learningDeps.review = createReviewService({
    lib: learningDeps.lib,
    store,
    settings: learningDeps.settings,
    activity: learningDeps.activity,
    habits: learningDeps.habits,
    getChallengeMerged,
    leagues: learningDeps.leagues
  });
  // A teaching card anchored to "the start of a unit" lands on that unit's
  // first lesson, as the units service groups the stage (server/content.js).
  setUnitFirstLessonResolver((unitId) => learningDeps.units?.firstLessonOf(unitId) ?? null);
  learningDeps.runtimeInfo = () => ({
    pythonVerifiable: Boolean(findPython()),
    judge0Languages: JUDGE0_CONFIGURED ? Object.keys(JUDGE0_LANGUAGE_IDS) : []
  });
  learningDeps.canVerify = serverCanVerify;

  // The admin console creates questions against the SAME zod schema the
  // authored TypeScript is validated with, so a question written in the
  // browser can never be something the renderer or grader would choke on.
  const schemaPath = await compileTsModule(path.join(ROOT, 'src', 'modules', 'challenges', 'schema.ts'), 'challenge-schema.mjs');
  const { ChallengeSchema, ConceptSchema } = await import(pathToFileURL(schemaPath).href);
  adminDeps.validateChallenge = (candidate) => {
    const result = ChallengeSchema.safeParse(candidate);
    if (result.success) return { ok: true, challenge: result.data, issues: [] };
    return { ok: false, challenge: null, issues: result.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })) };
  };
  // Teaching cards are checked against the same schema an authored concept is.
  adminDeps.validateConcept = (candidate) => {
    const result = ConceptSchema.safeParse(candidate);
    if (result.success) return { ok: true, concept: result.data, issues: [] };
    return { ok: false, concept: null, issues: result.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })) };
  };
  adminDeps.runSolution = runSolutionAgainstTests;

  await loadContent();

  // One pass, once per account: days rebuilt from the solve times already in
  // `attempts`, for every learner whose history predates the activity log.
  // Lossy on purpose (old solve times were overwritten by re-solves) and
  // marked `source: 'backfill'`. Idempotent, so every later boot is a no-op.
  const backfilled = learningDeps.activity.backfillAll();
  if (backfilled > 0) console.log(`[activity] rebuilt the day history of ${backfilled} account(s) from their solves`);

  // The administrator account is bootstrapped from ADMIN_USER_ID /
  // ADMIN_PASSWORD the very first time the server runs with none configured
  // yet - see server/admin-auth.js. It never touches the learner `users`
  // table and never runs again once an admin record exists.
  await bootstrapAdminAccount();
}

/* -------------------------------------------------------------------- app */

const app = express();

// Who a request came from: trust exactly the configured number of proxies in
// front of this server (Vercel, then the tunnel), read per request so an
// admin's change applies at once - see server/client-ip.js. Everything that
// needs the client's address (the access log, the per-address rate limits,
// the OAuth state store) asks clientIp(req), never a raw header.
app.set('trust proxy', trustProxyFn(trustedHops));

// Which other sites may read our answers - an allow-list, not `cors()` for
// everyone. The app itself calls /api on its own origin and never needs it.
app.use(corsPolicy.corsMiddleware());

// Request logging middleware for terminal visibility
app.use((req, res, next) => {
  const start = Date.now();
  const timestamp = new Date().toLocaleTimeString('en-US', { hour12: false });
  // The trusted-proxy view of the address, not a header anyone can type.
  const ip = clientIp(req) ?? req.socket.remoteAddress ?? 'unknown';
  const method = req.method;
  // Sign-in URLs carry credentials in the query: the `ticket` that authorises
  // connecting a provider, and the `code`/`state` the provider sends back. A
  // credential in a log file is a credential someone can use - an authorization
  // code that never got exchanged is still redeemable. Log that the parameter
  // was there, never what it was.
  const url = String(req.originalUrl || req.url).replace(
    /([?&](?:token|ticket|code|state)=)[^&]*/gi,
    '$1[redacted]'
  );

  res.on('finish', () => {
    const duration = Date.now() - start;
    const status = res.statusCode;

    let statusColor = '\x1b[32m'; // green 2xx
    if (status >= 500) statusColor = '\x1b[31m'; // red 5xx
    else if (status >= 400) statusColor = '\x1b[33m'; // yellow 4xx
    else if (status >= 300) statusColor = '\x1b[36m'; // cyan 3xx

    const reset = '\x1b[0m';
    const dim = '\x1b[2m';
    const bold = '\x1b[1m';

    console.log(
      `${dim}[${timestamp}]${reset} ` +
      `${bold}${method.padEnd(7)}${reset} ` +
      `${url.padEnd(30)} ` +
      `${statusColor}${status}${reset} ` +
      `${dim}${duration}ms${reset} ` +
      `${dim}(${ip})${reset}`
    );
  });

  next();
});

// A write from a page on another site (a browser always sends `Origin` on
// one) is recorded - and refused once `access.cors.mode` is 'enforce'.
// Webhooks and scripts send no Origin and pass straight through.
app.use(corsPolicy.foreignOriginGuard());

// Razorpay signs the RAW webhook body, so this must run before the JSON
// parser below turns it into an object - see server/billing-routes.js.
app.use('/api', createWebhookRouter(billingDeps));

app.use(express.json({ limit: '256kb' }));

const asyncRoute = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

/**
 * The account shape the client keeps. `isPremium` and `unlockedStages`
 * are derived from paid orders on every call (server/billing.js) - never a
 * cached flag - so a purchase or an admin revoke shows on the next request.
 * `unlockedStages` is already expanded: a bought track lists its stages.
 *
 * `identities` is provider IDS ONLY and `hasPassword` is a boolean: the
 * identity records and the bcrypt hash never leave the server. There is no
 * branch anywhere in this file that puts `passwordHash` in a response.
 */
function publicUser(user) {
  const entitlements = entitlementsFor(user.id, user);
  // Before the content has loaded there are no tracks to expand against.
  const tracks = contentSnapshot()?.languageTracks ?? [];
  const identities = store.identityProviders(user);
  return {
    id: user.id,
    email: user.email,
    username: user.username,
    isPremium: entitlements.lifetime,
    unlockedStages: [...unlockedStageIds(entitlements, tracks)],
    provider: 'local',
    identities,
    // How this account can be signed into, so the client can offer "set a
    // password" to a Google/GitHub-only learner and refuse to disconnect
    // somebody's only way back in.
    hasPassword: Boolean(user.passwordHash),
    createdAt: user.createdAt ?? null,
    lastLoginAt: user.lastLoginAt ?? null,
    avatarUrl: avatarFor(user),
    // The learner's own choices - the zone their days are counted in (null
    // until a browser has reported one), sound on or off, ... - every field
    // null until chosen. When the zone was set stays on the server.
    preferences: publicPreferences(store.normalizePreferences(user.preferences)),
    // The first-run setup: finished, dismissed, or null (not yet seen). A
    // learner with progress is never sent to it whatever this says.
    onboarding: store.normalizeOnboarding(user.onboarding)
  };
}

/** The picture a provider gave us, if any - first linked wins, and it is only ever a URL. */
function avatarFor(user) {
  for (const id of store.identityProviders(user)) {
    const url = user.identities?.[id]?.avatarUrl;
    if (typeof url === 'string' && url) return url;
  }
  return null;
}

function readToken(req) {
  const header = req.headers.authorization || '';
  return header.startsWith('Bearer ') ? header.slice(7) : null;
}

/**
 * Attaches req.user when a valid LEARNER token is present; never rejects.
 * A token signed before the account's last password reset (an older `tv`)
 * is not a session any more - see server/auth.js learnerTokenIsCurrent.
 */
function optionalAuth(req, _res, next) {
  const token = readToken(req);
  if (token) {
    try {
      const payload = verifyLearnerToken(token);
      const user = store.findUserById(payload.sub) || null;
      req.user = user && learnerTokenIsCurrent(payload, user) ? user : null;
    } catch {
      req.user = null;
    }
  }
  next();
}

function requireAuth(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Sign in to continue.' });
  next();
}

app.use(optionalAuth);

/* ------------------------------------------------------------------ health */

app.get('/api/health', (_req, res) => {
  const snapshot = contentSnapshot();
  res.json({
    ok: true,
    challenges: allChallenges().length,
    stages: snapshot?.stages.length ?? 0,
    users: store.db().users.length,
    uptimeSeconds: Math.round(process.uptime()),
    // Never the credentials themselves - just whether Judge0 is wired up, and
    // which languages that unlocks, so the client can label the Playground
    // honestly without ever seeing the key.
    judge0: { configured: JUDGE0_CONFIGURED, languages: Object.keys(JUDGE0_LANGUAGE_IDS) },
    // The same answer per language, plus what would actually run each one.
    // `judge0` above stays exactly as it was because clients already shipped
    // read it; this is the key that can say "Node sandbox" and "CPython
    // (WebAssembly)" as well, and tell a free self-hosted judge from a
    // rate-limited hosted one. Names and versions only - no URL, no host,
    // no key (server/judge0.js).
    runtimes: buildRuntimes(judge0Config),
    // Learners refetch GET /api/settings when this differs from what they
    // have cached, so an admin's change reaches every open tab within one
    // probe. Absent only before bootstrap.
    settingsRevision: learningDeps.settings ? learningDeps.settings.revision() : undefined
  });
});

/* ---------------------------------------------------------------- settings */

// The learner-facing rules: XP, levels, streak - never the admin-only
// sections. No auth: guests play by the same rules.
app.use('/api', createSettingsRouter({ getService: () => learningDeps.settings }));

/* -------------------------------------------------------------------- auth */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

app.post(
  '/api/auth/register',
  // Per address (generous: a campus shares one), then a cap on sign-ups from
  // everywhere, which no forged header gets round.
  limitBy('register.ip', byAddress),
  limitBy('register.global', () => 'all'),
  asyncRoute(async (req, res) => {
    const email = String(req.body?.email ?? '').trim().toLowerCase();
    const username = String(req.body?.username ?? '').trim();
    const password = String(req.body?.password ?? '');

    if (!EMAIL_RE.test(email)) return res.status(400).json({ error: 'That email address does not look right.' });
    if (username.length < 2 || username.length > 24) {
      return res.status(400).json({ error: 'Username must be between 2 and 24 characters.' });
    }
    if (!/^[a-zA-Z0-9_. -]+$/.test(username)) {
      return res.status(400).json({ error: 'Username can only contain letters, numbers, spaces, dots, dashes and underscores.' });
    }
    if (password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters.' });

    if (store.findUserByEmail(email)) {
      return res.status(409).json({ error: 'An account with that email already exists.' });
    }
    if (store.findUserByUsername(username)) {
      return res.status(409).json({ error: 'That username is taken.' });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    // bcrypt took tens of milliseconds and yielded the event loop; another
    // registration for the same email may have landed meanwhile. Re-check
    // synchronously, right before the insert, so two concurrent sign-ups
    // cannot both pass the earlier check and create duplicate accounts.
    if (store.findUserByEmail(email) || store.findUserByUsername(username)) {
      return res.status(409).json({ error: 'That email or username was just taken.' });
    }

    const now = new Date().toISOString();
    const user = store.insertUser({
      id: crypto.randomUUID(),
      email,
      username,
      passwordHash,
      isPremium: false,
      createdAt: now,
      // Registering is a sign-in too, and a brand new account has no provider
      // linked to it yet - "Continue with Google" adds one later.
      lastLoginAt: now,
      lastSeenAt: now,
      identities: {}
    });

    // Fire-and-forget: `syncUser` never throws and never blocks this
    // response - Excel being slow, misconfigured or entirely absent must
    // never be able to affect signup. See server/excel.js for the full
    // reasoning and server/db.js's `excelSync` for where failures land.
    excel.syncUser(store, user, store.getProgress(user.id), 'signup');

    console.log(`\x1b[32m[AUTH]\x1b[0m New learner registered: "${username}" (${email})`);

    res.status(201).json({ token: signLearnerToken(user), user: publicUser(user), progress: store.getProgress(user.id) });
  })
);

/**
 * A bcrypt hash of a value nothing can match, compared against whenever there
 * is no real hash to compare against - an unknown email, or an account that
 * signs in with Google/GitHub and has no password at all. Without it, those
 * two cases would answer far faster than a wrong password and the timing
 * alone would say which emails have accounts. Same guard, same reasoning as
 * server/admin-auth.js.
 */
const NO_PASSWORD_HASH = bcrypt.hashSync('no-password-on-this-account', 10);

/** The email a sign-in is for, normalised the one way the limit and the lookup both use. */
const loginEmailOf = (req) => String(req.body?.email ?? '').trim().toLowerCase();

app.post(
  '/api/auth/login',
  limitBy('login.ip', byAddress),
  // Sign-ins per email, COUNTED before the password is compared, so a
  // guessing loop stops costing bcrypt time once it is refused. It has to
  // count here rather than after a failure: bcrypt yields the event loop, and
  // a burst of parallel guesses would all pass a check that only looked,
  // before any of them had failed and been counted. A correct password clears
  // the count below, so in effect this is failed sign-ins per email. Keyed by
  // the email whether or not an account has it, so a 429 says nothing about
  // which addresses exist; a blank email skips it (and fails the lookup).
  limitBy('login.account', loginEmailOf),
  asyncRoute(async (req, res) => {
    const email = loginEmailOf(req);
    const password = String(req.body?.password ?? '');
    const user = store.findUserByEmail(email);

    // An account with no password (created through Google or GitHub) is not a
    // special case here: it compares against the dummy hash and gets exactly
    // the same generic failure as a wrong password, so this route never says
    // "that address exists, just not with a password".
    const passwordOk = await bcrypt.compare(password, user?.passwordHash || NO_PASSWORD_HASH);
    // Same response either way so the endpoint cannot be used to enumerate accounts.
    if (!user || !user.passwordHash || !passwordOk) {
      return res.status(401).json({ error: 'Email or password is incorrect.' });
    }

    // A correct password clears the email's count.
    limiter.reset('login.account', email);
    store.recordLogin(user.id);

    // Throttled so a chatty client logging in repeatedly does not hammer
    // Graph - a fresh sync on every login is not worth the API calls.
    if (!excel.shouldThrottle(store, user.id)) excel.syncUser(store, user, store.getProgress(user.id), 'login');

    console.log(`\x1b[32m[AUTH]\x1b[0m Learner "${user.username}" logged in.`);

    // Level and streak as they stand today in the learner's own zone, like
    // /auth/me: the browser adopts this streak as it is - with the derived
    // streak and goal status (freezes applied) beside it.
    res.json({
      token: signLearnerToken(user),
      user: publicUser(user),
      progress: recalcForUser({ store, learningDeps }, user),
      habits: habitsForUser({ store, learningDeps }, user)
    });
  })
);

app.get('/api/auth/me', requireAuth, (req, res) => {
  // Throttled to once every five minutes inside the store, so a client that
  // polls this route does not rewrite db.json each time.
  store.touchLastSeen(req.user.id);
  // Level and streak as they stand today in the learner's own zone, like
  // GET /api/progress - a stale streak is not shown as alive - and the
  // derived streak and goal status (freezes applied) beside it.
  res.json({
    user: publicUser(req.user),
    progress: recalcForUser({ store, learningDeps }, req.user),
    habits: habitsForUser({ store, learningDeps }, req.user)
  });
});

/**
 * Set or change the learner's OWN password. This is how an account created
 * through Google or GitHub gains one - `currentPassword` is required only
 * when there is already a password to prove knowledge of, and the response
 * carries the account, never anything derived from either password.
 */
app.post(
  '/api/auth/password',
  requireAuth,
  // A stolen session guessing the current password gets a handful of tries.
  limitBy('passwordChange.account', byAccount),
  asyncRoute(async (req, res) => {
    const currentPassword = String(req.body?.currentPassword ?? '');
    const newPassword = String(req.body?.newPassword ?? '');

    if (newPassword.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters.' });

    if (req.user.passwordHash) {
      const ok = await bcrypt.compare(currentPassword, req.user.passwordHash);
      if (!ok) return res.status(401).json({ error: 'Your current password is incorrect.' });
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);
    const updated = store.updateUser(req.user.id, { passwordHash });
    res.json({ user: publicUser(updated) });
  })
);

// There is deliberately no /api/account/pro here any more. It set
// `isPremium: true` for whoever asked, and `entitlementsFor` reads that flag
// as a lifetime licence - so one authenticated request bought everything,
// past the Razorpay signature check, the test-mode guard and the admin grant
// alike. A Pro licence is now bought like every other product, through
// POST /api/billing/orders with `{ product: { kind: 'lifetime' } }`.

/**
 * Disconnect a provider from the learner's own account. Refused with a reason
 * when it would leave them with no way to sign in at all (see
 * server/db.js's unlinkIdentity) - losing access to your own progress because
 * a button was one click away is not an acceptable outcome.
 */
app.delete('/api/auth/oauth/:provider', requireAuth, (req, res) => {
  const provider = String(req.params.provider);
  if (!PROVIDER_IDS.includes(provider)) return res.status(404).json({ error: 'That sign-in option is not available.' });

  const result = store.unlinkIdentity(req.user.id, provider);
  if (!result.ok) return res.status(409).json({ error: result.reason });
  res.json({ user: publicUser(result.user) });
});

/**
 * Password reset links an administrator issued from Users (no email here):
 * POST /api/auth/password-reset/inspect and POST /api/auth/password-reset.
 * No auth - the token in the body is the credential - and a per-address
 * limit. A reset bumps the account's token version, which signs out every
 * other session, and answers exactly like a login. See server/password-reset.js.
 */
app.use(
  '/api',
  createPasswordResetRouter({
    store,
    publicUser,
    signLearnerToken,
    progressFor: (user) => recalcForUser({ store, learningDeps }, user),
    limiter,
    limit: limitBy('passwordReset.ip', byAddress)
  })
);

/**
 * Google / GitHub sign-in. Mounted here rather than inside the auth section
 * above because it owns three routes and its own single-use state store; the
 * password routes above stay exactly as they were, and remain the fallback
 * when no provider is configured.
 */
app.use(
  '/api',
  createOAuthRouter({
    providers: oauthProviders,
    store,
    signLearnerToken,
    publicUser,
    verifyLearnerToken,
    // Same fire-and-forget mirror, same throttle, as register/login above.
    syncUser: (user, progress, reason) => {
      if (reason === 'signup' || !excel.shouldThrottle(store, user.id)) excel.syncUser(store, user, progress, reason);
    }
  })
);

/* --------------------------------------------------------- admin sign-in */

/**
 * The administrator's own sign-in - entirely separate from /api/auth/*
 * above: a different credential store (server/db.js's single `admin`
 * record, never the `users` table), a different token shape, and a single,
 * deliberately generic error message so a failed attempt never reveals
 * whether the User ID exists, which factor was wrong, or that the account
 * is temporarily locked out. See server/admin-auth.js for the full
 * mechanism, including the bootstrap-from-.env flow.
 */
app.post(
  '/api/admin-auth/login',
  asyncRoute(async (req, res) => {
    const userId = String(req.body?.userId ?? '');
    const password = String(req.body?.password ?? '');
    const result = await authenticateAdmin(userId, password);
    if (!result.ok) {
      console.warn(`\x1b[33m[ADMIN AUTH]\x1b[0m Failed login attempt for user "${userId}": ${result.error}`);
      return res.status(401).json({ error: result.error });
    }
    console.log(`\x1b[32m[ADMIN AUTH]\x1b[0m Administrator "${userId}" successfully authenticated.`);
    res.json({ token: signAdminToken(result.admin), admin: publicAdmin(result.admin) });
  })
);

/** Re-validates the admin session against the live record - never a cached role/flag. */
app.get('/api/admin-auth/me', requireAdminAuth, (req, res) => {
  res.json({ admin: publicAdmin(req.admin) });
});

/* ----------------------------------------------------------------- content */

app.get(
  '/api/content',
  asyncRoute(async (req, res) => {
    const snapshot = await loadContent();
    const overrides = store.getContentOverrides();
    // Includes the admin-authored questions (server/content.js). Each stage
    // carries its units (ids and names), resolved after the overrides so a
    // hidden lesson is in none of them - server/units.js.
    const learnerView = applyLearnerOverrides(snapshot, overrides);
    const merged = learningDeps.units ? learningDeps.units.attachUnits(learnerView) : learnerView;
    const hiddenLanguages = Object.keys(overrides.languages).filter((id) => overrides.languages[id]?.hidden);
    // A premium stage this viewer has not unlocked comes as stubs - its place
    // in the path (id, title, type) and nothing that answers it. With the
    // gate in 'log' mode (the emergency switch) nothing is withheld.
    const enforcing = setting('access.premiumGate', 'enforce') !== 'log';
    const access = stageAccessFor(req.user ?? null, { snapshot, overrides });
    const lockedStageIds = enforcing ? access.lockedStageIds : [];
    const locked = new Set(lockedStageIds);
    // Different for every viewer now: never cached by a CDN or shared.
    res.set('Cache-Control', 'private, no-store');
    res.set('Vary', 'Authorization');
    res.json({
      stages: merged.stages,
      challenges: merged.challenges.map((challenge) => (locked.has(challenge.stageId) ? lockedStub(challenge) : challenge)),
      languageTracks: snapshot.languageTracks ?? [],
      hiddenLanguages,
      lockedStageIds,
      builtAt: snapshot.builtAt
    });
  })
);

/* -------------------------------------------------------------- admin app */

// Every route inside createAdminRouter() is independently gated by
// requireAdminAuth (server/admin-auth.js), which verifies the admin bearer
// token against the live admin record - nothing about optionalAuth/req.user
// above is involved in, or a substitute for, that check.
app.use('/api/admin', createAdminRouter(adminDeps));

/* ------------------------------------------------------------------ drafts */

// Saved coding sessions: the code a learner typed but has not solved yet,
// restored in one call when they sign back in. `getChallengeMerged` is handed
// over so a draft can only exist for a lesson this server really serves - the
// same lookup /api/progress/solve does below. `getProgress` goes with it so a
// save for an already-solved lesson is a no-op there too.
app.use('/api', createDraftsRouter({ requireAuth, getChallengeMerged, getProgress: store.getProgress }));

/* ------------------------------------------------------------ verification */

/**
 * Is `answer` correct for a non-code challenge? Pure, synchronous. The rule
 * itself is src/platform/grading-engine/grading.ts's `gradeAnswer`, so the
 * solve route, the grade route and the activity routes (which refuse a
 * "miss" that is actually right) can never disagree.
 */
function gradeAnswer(challenge, answer) {
  return grading.gradeAnswer(challenge, answer);
}

/** getChallenge() plus any live admin edit to its safe, presentational fields. */
function getChallengeMerged(id) {
  const raw = getChallenge(id);
  if (!raw) return null;
  return applyChallengeOverride(raw, store.getContentOverrides().challenges);
}

/**
 * Decide whether a submission genuinely solves the challenge, using only
 * things the server controls. Returns { ok, verified, reason }.
 *
 *   verified=true   the server checked it itself
 *   verified=false  the server has no engine for it (Python without a local
 *                   CPython) and is taking the client's word - reported
 *                   honestly rather than pretended
 *
 * Before this existed /api/progress/solve took a challengeId and paid out.
 * One fetch loop from the browser console marked all 200 challenges solved.
 */
async function verifySubmission(challenge, body) {
  const isCode = challenge.type === 'code_runner' || challenge.type === 'debug';

  if (!isCode) {
    if (body.answer === undefined) return { ok: false, verified: true, reason: 'No answer was submitted.' };
    return { ok: gradeAnswer(challenge, body.answer), verified: true, reason: 'Answer checked by the server.' };
  }

  const code = typeof body.code === 'string' ? body.code : '';
  if (!code.trim()) return { ok: false, verified: true, reason: 'No code was submitted.' };
  if (code.length > 100_000) return { ok: false, verified: true, reason: 'Submission is too large.' };

  if (challenge.language === 'html' || challenge.uiPreview) {
    return { ok: true, verified: false, reason: 'DOM and UI tests verified in browser sandbox.' };
  }

  // Code runs in an execution slot (server/rate-limit.js), like /api/execute:
  // at most a few child processes at once, a short queue, then BusyError -
  // which the solve route answers 503 "busy" without recording anything.

  // TypeScript runs through the same sandbox: the runner strips nothing, so
  // only type-annotation-free TS passes - the same rule the client applies.
  if (challenge.language === 'javascript' || challenge.language === 'typescript') {
    const result = await slots.run(() =>
      runJsInChild({
        code,
        entryFunction: challenge.entryFunction,
        testCases: challenge.testCases ?? []
      })
    );
    return { ok: result.status === 'passed', verified: true, reason: 'Tests run by the server.' };
  }

  if (challenge.language === 'python') {
    const result = await slots.run(() => runPythonLocally(code, challenge.entryFunction, challenge.testCases ?? []));
    if (result.skipped) {
      return { ok: true, verified: false, reason: 'No local Python; accepted on the client report.' };
    }
    return { ok: result.passed, verified: true, reason: 'Tests run by the server (local CPython).' };
  }

  if (challenge.language === 'sql') {
    const result = await slots.run(() => runSqlInChild({ code, testCases: challenge.testCases ?? [] }));
    return { ok: result.status === 'passed', verified: true, reason: 'SQL tests run by the server in isolated SQLite databases.' };
  }

  return { ok: false, verified: true, reason: `No server engine for ${challenge.language}.` };
}

/**
 * Which stages a set of solved ids completes. The learner-facing view:
 * authored + admin-authored questions, minus anything an admin hid - the same
 * list the client counts against - and, from Phase 5, a stage tested out of
 * with a record that `clears` (server/progression.js owns the rule).
 */
function completedStagesFor(completedIds, testedOut) {
  return clearedStagesFor(completedIds, testedOut, { snapshot: contentSnapshot(), overrides: store.getContentOverrides() });
}

/**
 * Can this server check a stage test's answer itself? Answer-graded ones,
 * JavaScript and TypeScript always; Python with a local CPython; nothing
 * else (a DOM test is checked in the browser, Java and C++ code have no
 * server engine in verifySubmission). With `access.requireServerVerification`
 * on, a test-out of a test it cannot check is refused up front (503).
 */
function serverCanVerify(challenge) {
  if (challenge.type !== 'code_runner' && challenge.type !== 'debug') return true;
  if (challenge.language === 'html' || challenge.uiPreview) return false;
  if (challenge.language === 'javascript' || challenge.language === 'typescript') return true;
  if (challenge.language === 'sql') return true;
  if (challenge.language === 'python') return Boolean(findPython());
  return false;
}

/* ---------------------------------------------------------------- progress */

// GET /api/progress, POST /api/progress/solve, /merge and /reset - see
// server/progress-routes.js for the order each runs in and
// server/progress-rules.js for the rules. The server owns the verdict and the
// XP maths: the client says WHICH challenge, WHAT it answered and how much
// help it took - never whether it was right or what it earned.
app.use(
  '/api',
  createProgressRouter({
    requireAuth,
    store,
    learningDeps,
    getChallenge,
    getChallengeMerged,
    verifySubmission,
    completedStagesFor,
    clearDraftForSolve,
    // Meaningful-progress-update trigger for Excel, throttled the same way
    // login is - a burst of solves in one session becomes one sync, not one
    // Graph call per challenge.
    onProgress: (user, progress) => {
      if (!excel.shouldThrottle(store, user.id)) excel.syncUser(store, user, progress, 'progress');
    },
    solveLimit: limitBy('solve.account', byAccount),
    // The premium lock (server/progression.js -> billing.js premiumGate):
    // checked before any code runs, and on every id a merge would credit.
    // Then the stage order under `access.solveGate` (Phase 5).
    checkSolveAccess: (user, challenge) => checkSolveAccess(user, challenge, progressionContext('solve')),
    mergeAccess: (user) => mergeAccess(user, premiumContext('merge')),
    // A guest's test-out claims and the merge's stage order (`access.mergeGate`).
    progressionContext: progressionContent,
    progression: { verifyClaims, acceptClaims, filterMerge },
    // A merge counts as a solve for the limits: the request itself, and each
    // guest claim whose answer it runs - so a merge is never a way round
    // `solve.account`, or a way to fill the code-runner slots.
    mergeLimit: limitBy('solve.account', byAccount),
    chargeClaimRun: chargeBy('solve.account', byAccount),
    // Teaching already shown follows the account (Phase 5): POST
    // /progress/concepts and the merge keep served concepts only.
    knownConceptIds,
    learnerTracks: learnerTrackIds,
    writeLimit: limitBy('write.account', byAccount)
  })
);

/* ------------------------------------------------------------- assessments */

// Test-out and placement (server/assessment-routes.js): the learner's own
// test-outs and placements, their limits and cooldowns, and a pass recorded
// through the same applySolveCore as a solve. Submits share the solve limit.
app.use(
  '/api',
  createAssessmentRouter({
    requireAuth,
    store,
    learningDeps,
    getChallengeMerged,
    verifySubmission,
    completedStagesFor,
    clearDraftForSolve,
    progressionContext: progressionContent,
    canVerify: serverCanVerify,
    onProgress: (user, progress) => {
      if (!excel.shouldThrottle(store, user.id)) excel.syncUser(store, user, progress, 'progress');
    },
    submitLimit: limitBy('solve.account', byAccount),
    writeLimit: limitBy('write.account', byAccount)
  })
);

/* ---------------------------------------------------------------- activity */

// A learner's days (in their own time zone) and their wrong answers. A miss
// is graded here too, so a correct answer can never be recorded as one.
app.use(
  '/api',
  createActivityRouter({ requireAuth, learningDeps, gradeAnswer, getChallengeMerged, writeLimit: limitBy('write.account', byAccount) })
);

/* ------------------------------------------------------------------ review */

/**
 * What a learner may practise: the bank they are served (hidden stages and
 * questions left out, admin edits and teaching cards applied) minus premium
 * stages they have not unlocked - with the gate in 'log' mode nothing is
 * withheld, as in /api/content. Stage tests and kinds outside
 * `review.itemTypes` are left out by the review router.
 */
function visibleBankFor(user) {
  const snapshot = contentSnapshot();
  if (!snapshot) return { stageIds: [], challenges: [] };
  const overrides = store.getContentOverrides();
  const view = applyLearnerOverrides(snapshot, overrides);
  const enforcing = setting('access.premiumGate', 'enforce') !== 'log';
  const locked = new Set(enforcing ? stageAccessFor(user ?? null, { snapshot, overrides }).lockedStageIds : []);
  return {
    stageIds: view.stages.filter((s) => !locked.has(s.id)).map((s) => s.id),
    challenges: view.challenges.filter((c) => !locked.has(c.stageId))
  };
}

// POST /api/review/session and /api/review/answer: Practice sessions over
// mistakes, due questions and weak solves (server/review-routes.js). An
// answer is verified like a solve and priced by the server.
app.use(
  '/api',
  createReviewRouter({
    requireAuth,
    learningDeps,
    visibleBankFor,
    verifySubmission: (challenge, body) => verifySubmission(challenge, body),
    getChallengeMerged,
    writeLimit: limitBy('write.account', byAccount)
  })
);

/* ------------------------------------------------------------- preferences */

// PATCH /api/me/preferences: the learner's own choices, stored on the
// account so they survive a progress reset (server/preferences-routes.js).
// The goal options and the zone cooldown come from the settings, per request.
app.use(
  '/api',
  createPreferencesRouter({
    requireAuth,
    publicUser,
    store,
    writeLimit: limitBy('write.account', byAccount),
    learningDeps,
    // A learner's track (Phase 5) must be one they are shown.
    learnerTracks: learnerTrackIds
  })
);

/* ----------------------------------------------------------------- billing */

// One-time purchases (lifetime licence, a track, a stage, a certificate) and
// the public certificate check. Every "mark paid" path lives behind a
// verified signature, the explicit test-mode step or an admin grant - there
// is no route that simply sets a flag any more.
app.use('/api', createBillingRouter({ ...billingDeps, requireAuth, optionalAuth, publicUser }));

/* ------------------------------------------------------------- leaderboard */

app.get('/api/leaderboard', (req, res) => {
  // store.db().users never contains the administrator - see server/db.js's
  // separate `admin` field - so the leaderboard is learner-only by
  // construction, not by filtering something out here.
  const all = store.allProgress();
  const { lib, settings, habits, leagues } = learningDeps;
  const rules = settings.current();
  const levels = rules.levels;
  const now = new Date();
  // Weeks past their final time close on any board read, not only on the timer.
  leagues?.closeDueWeeks(now);
  const viewerId = req.user?.id ?? null;
  const sorted = store
    .db()
    .users.map((u) => {
      const p = all[u.id] ?? store.EMPTY_PROGRESS;
      return {
        username: u.username,
        xp: p.xp ?? 0,
        level: lib.levelFromXp(p.xp ?? 0, levels),
        // As of THIS learner's today, in their own zone, with their freezes
        // applied (server/habits.js) - the number their own screens show.
        streak: habits.streakFor(u, p, now),
        solved: (p.completedChallenges ?? []).length,
        isYou: viewerId !== null && u.id === viewerId
      };
    })
    .sort((a, b) => b.xp - a.xp || b.solved - a.solved);
  // The viewer's own place, worked out before the board is cut, so a
  // learner below the shown rows still sees where they stand.
  const at = viewerId === null ? -1 : sorted.findIndex((row) => row.isYou);
  const me = at === -1 ? null : { rank: at + 1, ...sorted[at] };
  res.json({ leaderboard: sorted.slice(0, rules.league.boardSize), me });
});

/* ----------------------------------------------------------- weekly league */

// GET /api/leagues/current (the global optionalAuth above): the weekly board.
app.use('/api', createLeaguesRouter({ learningDeps }));

/* ------------------------------------------------------------------ grading */

/** Authoritative check for non-code challenges, without recording anything. */
app.post(
  '/api/grade',
  asyncRoute(async (req, res) => {
    const challenge = getChallengeMerged(String(req.body?.challengeId ?? ''));
    if (!challenge) return res.status(404).json({ error: 'Unknown challenge.' });
    // Right/wrong plus the explanation is the lesson's content: a premium
    // lesson is graded only for someone who has unlocked it. Same gate, same
    // 403 as a solve (server/progression.js -> billing.js premiumGate).
    const access = checkSolveAccess(req.user ?? null, challenge, premiumContext('grade'));
    if (!access.ok) {
      return res.status(403).json({
        error: copyText('premium.lockedSolve', {}, 'This lesson is part of a premium stage.'),
        reason: access.reason,
        stageId: access.stageId
      });
    }
    // A public route that answers right/wrong plus the explanation, for free
    // and as often as asked, is an answer key for the stage tests - which are
    // the gate between stages. They are graded only by a real solve.
    if (challenge.isStageTest) {
      return res.status(400).json({ error: 'Stage tests are graded when you submit them.', reason: 'stage-test' });
    }
    if (challenge.type === 'code_runner' || challenge.type === 'debug') {
      return res.status(400).json({ error: `${challenge.type} is graded by running its tests.` });
    }
    res.json({ correct: gradeAnswer(challenge, req.body?.answer), explanation: challenge.explanation });
  })
);

/* ------------------------------------------------------------ local python */

let pythonExe;
/** A local CPython, found once. undefined = not probed, null = none. */
function findPython() {
  if (pythonExe !== undefined) return pythonExe;
  pythonExe = null;
  for (const candidate of ['python3', 'python', 'py']) {
    try {
      const out = execFileSync(candidate, ['-c', 'import sys; print(sys.version_info[0])'], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
        timeout: 5000
      });
      if (out.trim().startsWith('3')) {
        pythonExe = candidate;
        break;
      }
    } catch {
      /* next */
    }
  }
  if (pythonExe) console.log(`[python] using ${pythonExe} to verify Python solves`);
  else console.log('[python] no local CPython - Python solves will be accepted on the client report');
  return pythonExe;
}

// Evaluates the source ONCE and calls the entry per case, matching the browser
// (Pyodide) and the validator, so a mutable-default-argument bug is observable
// everywhere or nowhere.
const PYTHON_HARNESS = [
  'import json, sys',
  '_src = json.loads(sys.stdin.readline())',
  '_cases = json.loads(sys.stdin.readline())',
  '_ns = {}',
  'try:',
  '    exec(_src["code"], _ns)',
  'except Exception:',
  '    print(json.dumps({"passed": False})); sys.exit(0)',
  '_fn = _ns.get(_src["entry"])',
  'if not callable(_fn):',
  '    print(json.dumps({"passed": False})); sys.exit(0)',
  '_ok = True',
  'for _tc in _cases:',
  '    try:',
  '        _v = _fn(*eval("(" + _tc["input"] + ",)", _ns))',
  '        try:',
  '            _got = json.dumps(_v)',
  '        except TypeError:',
  '            _got = json.dumps(repr(_v))',
  '        _exp = _tc["expected"].replace("True", "true").replace("False", "false").replace("None", "null")',
  '        try:',
  '            _same = json.loads(_got) == json.loads(_exp)',
  '        except Exception:',
  '            _same = _got.strip() == _tc["expected"].strip()',
  '        if not _same:',
  '            _ok = False',
  '    except Exception:',
  '        _ok = False',
  'print(json.dumps({"passed": _ok}))'
].join('\n');

/**
 * Run a Python submission against its tests with the local interpreter, the
 * same way the content validator does. { skipped: true } when there is none.
 */
function runPythonLocally(code, entryFunction, testCases) {
  const exe = findPython();
  if (!exe) return Promise.resolve({ skipped: true });
  // Asynchronous on purpose: a solution that sleeps must not freeze every
  // other request for the length of the timeout.
  return new Promise((resolve) => {
    const child = execFile(
      exe,
      ['-c', PYTHON_HARNESS],
      { encoding: 'utf8', timeout: 15000, windowsHide: true, maxBuffer: 1024 * 1024 },
      (err, out) => {
        if (err) return resolve({ passed: false });
        try {
          resolve(JSON.parse(String(out).trim().split('\n').pop()));
        } catch {
          resolve({ passed: false });
        }
      }
    );
    child.stdin.on('error', () => {});
    child.stdin.end(JSON.stringify({ code, entry: entryFunction }) + '\n' + JSON.stringify(testCases) + '\n');
  });
}

/**
 * Run a reference solution against a question's test cases, the way the
 * validator does for authored content. Used by the admin console before it
 * saves a coding question, so a broken one never reaches a learner.
 * Returns { status: 'passed' | 'failed' | 'error' | 'skipped', testResults, stderr, reason }.
 */
async function runSolutionAgainstTests(challenge, code) {
  const testCases = challenge.testCases ?? [];
  if (challenge.language === 'sql') return runSqlInChild({ code, testCases });
  if (challenge.language === 'javascript' || challenge.language === 'typescript') {
    const result = await runJsInChild({ code, entryFunction: challenge.entryFunction, testCases });
    return { ...result, reason: 'Run by the server sandbox.' };
  }
  if (challenge.language === 'python') {
    const result = await runPythonLocally(code, challenge.entryFunction, testCases);
    if (result.skipped) return { status: 'skipped', testResults: [], stderr: '', reason: 'No local Python on this server, so the solution could not be executed here.' };
    return { status: result.passed ? 'passed' : 'failed', testResults: [], stderr: '', reason: 'Run with the local CPython.' };
  }
  if (challenge.language === 'html' || challenge.uiPreview) {
    return { status: 'skipped', testResults: [], stderr: '', reason: 'Frontend questions run in the learner\'s browser; the server cannot execute them.' };
  }
  return { status: 'skipped', testResults: [], stderr: '', reason: `No server engine for ${challenge.language}.` };
}

/* ---------------------------------------------------------------- execution */

const EXECUTION_TIMEOUT_MS = 8000;

function runJsInChild(payload) {
  return new Promise((resolve) => {
    const child = spawn(
      process.execPath,
      ['--max-old-space-size=128', path.join(HERE, 'runner', 'js-runner.mjs')],
      { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true }
    );

    let out = '';
    let errOut = '';
    let settled = false;

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill('SIGKILL');
      resolve({
        status: 'error',
        stderr: `Execution timed out after ${EXECUTION_TIMEOUT_MS}ms. Check for an infinite loop.`,
        testResults: []
      });
    }, EXECUTION_TIMEOUT_MS);

    child.stdout.on('data', (d) => (out += d));
    child.stderr.on('data', (d) => (errOut += d));

    child.on('error', (e) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ status: 'error', stderr: `Could not start the sandbox: ${e.message}`, testResults: [] });
    });

    child.on('close', () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        resolve(JSON.parse(out));
      } catch {
        resolve({
          status: 'error',
          stderr: errOut.trim() || 'The sandbox produced no readable output.',
          testResults: []
        });
      }
    });

    child.stdin.end(JSON.stringify({ ...payload, gradingPath: pathToFileURL(gradingPath).href }));
  });
}

/**
 * Every code-runner slot is taken and the queue is full (or the wait ran
 * out): say so in the shape a run result has, so the Playground and the
 * practice modal show it like any other failed run. Nothing ran.
 */
function sendBusy(res) {
  return res.status(503).json({
    status: 'error',
    engine: 'none',
    reason: 'busy',
    stderr: copyText('limits.busy', {}, 'The code runner is busy - try again in a moment.'),
    testResults: []
  });
}

app.post(
  '/api/execute',
  // Per account for signed-in learners, per address for everyone (a guest
  // has only the address); code only runs inside an execution slot below.
  limitBy('execute.account', byAccount),
  limitBy('execute.ip', byAddress),
  asyncRoute(async (req, res) => {
    const language = String(req.body?.language ?? 'javascript');
    const code = String(req.body?.code ?? '');
    const entryFunction = req.body?.entryFunction ? String(req.body.entryFunction) : undefined;
    const testCases = Array.isArray(req.body?.testCases) ? req.body.testCases.slice(0, 25) : [];
    // Optional, and only Judge0 languages can use it: the JavaScript sandbox
    // calls a function with arguments and Python runs in the browser, so
    // neither has a stdin to feed. Capped rather than rejected - a beginner's
    // Scanner program needs a line or two, and silently trimming a runaway
    // paste beats a 413 nobody can act on.
    const stdin = typeof req.body?.stdin === 'string' ? req.body.stdin.slice(0, JUDGE0_STDIN_LIMIT) : '';

    if (code.length > 100_000) return res.status(413).json({ error: 'Submission is too large.' });

    if (language === 'sql') {
      try {
        return res.json(await slots.run(() => runSqlInChild({ code, testCases })));
      } catch (err) {
        if (err instanceof BusyError) return sendBusy(res);
        throw err;
      }
    }

    if (language === 'python') {
      // The browser runs Python itself (Pyodide) - there is nothing for the
      // server to do here, and it should never have been asked.
      return res.status(501).json({
        status: 'error',
        engine: 'none',
        stderr: 'Python runs in the browser (Pyodide), not on the server.',
        testResults: []
      });
    }

    if (language !== 'javascript' && language !== 'typescript') {
      if (!JUDGE0_LANGUAGE_IDS[language]) {
        return res.status(501).json({
          status: 'error',
          engine: 'none',
          stderr: `${language} is not supported yet.`,
          testResults: []
        });
      }
      if (!JUDGE0_CONFIGURED) {
        // Be honest rather than pretending to compile. JavaScript and Python
        // keep working with zero setup; this is the one thing that genuinely
        // needs a sandbox we do not own. `stderr` is what a learner reads;
        // the setup steps (which lead with the free local judge - see
        // server/judge0.js) travel as `devHint`, which the client shows in a
        // development build only.
        return res.status(501).json({
          status: 'error',
          engine: 'none',
          reason: 'runtime-unavailable',
          // The admin-editable sentence (`copy.runtime.unavailable`).
          stderr: runtimeUnavailableMessage(language, (name) => copyText('runtime.unavailable', { language: name })),
          devHint: judge0SetupHint(language),
          testResults: []
        });
      }
      try {
        const result = await slots.run(() => runJudge0Submission(judge0Config, { language, code, stdin }));
        return res.json(result);
      } catch (err) {
        if (err instanceof BusyError) return sendBusy(res);
        throw err;
      }
    }

    try {
      // Timed inside the slot: the wait for one is not the program's time.
      const { result, elapsed } = await slots.run(async () => {
        const started = process.hrtime.bigint();
        const out = await runJsInChild({ code, entryFunction, testCases });
        return { result: out, elapsed: Number(process.hrtime.bigint() - started) / 1e6 };
      });

      res.json({ ...result, engine: 'node-vm', time: `${elapsed.toFixed(0)}ms (Node sandbox)` });
    } catch (err) {
      if (err instanceof BusyError) return sendBusy(res);
      throw err;
    }
  })
);

/* ------------------------------------------------- the built frontend (prod) */

// In dev, Vite serves the app and proxies /api here. After `npm run build` there
// is a dist/ to serve, which makes `npm start` a single self-contained process
// rather than an API with no app in front of it.
const DIST = path.join(ROOT, 'dist');

if (existsSync(DIST)) {
  app.use(express.static(DIST, { index: false, maxAge: '1h' }));

  // SPA fallback: any GET that is not an API call and not a real file gets
  // index.html, so deep links and refreshes work. This also covers /admin and
  // /admin/login: the admin app is a client-side route tree in the same SPA
  // bundle, not a second server or a second build.
  app.use((req, res, next) => {
    if (req.method !== 'GET' || req.path.startsWith('/api/')) return next();
    res.sendFile(path.join(DIST, 'index.html'), (err) => {
      if (err) next(err);
    });
  });
}

/* ------------------------------------------------------------------ errors */

app.use((req, res) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: `No route for ${req.method} ${req.path}` });
  }
  res
    .status(404)
    .type('text/plain')
    .send(
      existsSync(DIST)
        ? 'Not found.'
        : 'No built frontend here. Run `npm run dev` for development, or `npm run build` first.'
    );
});

app.use((err, _req, res, _next) => {
  // A body over the JSON limit is the request's problem, not the server's:
  // say 413, so a client can send less (a merge retries without its
  // activity log) instead of reading it as an outage.
  if (err?.type === 'entity.too.large') return res.status(413).json({ error: 'That request is too large.' });
  console.error('[api] unhandled error:', err);
  res.status(500).json({ error: 'Something went wrong on the server.' });
});

/* ------------------------------------------------------------------- start */

bootstrap()
  .then(async () => {
    await initAuthSecret();

    // Build the server explicitly so the error handler is attached BEFORE the
    // bind is attempted. Passing a callback to app.listen() logs success from a
    // listener registered in the same tick as the failure path, which prints a
    // cheerful "listening on 4000" immediately above "port 4000 is in use".
    const server = http.createServer(app);

    server.on('listening', () => {
      const snapshot = contentSnapshot();
      const bound = server.address();
      const actual = typeof bound === 'object' && bound ? bound.port : PORT;
      console.log(`\n  CodeConsist API listening on http://localhost:${actual}`);
      console.log(`  ${snapshot.challenges.length} challenges - ${store.db().users.length} accounts`);
      if (existsSync(DIST)) console.log('  serving the built app from dist/');
      console.log('');
    });

    // `node --watch` restarts us before the previous process has released the
    // socket, so the first bind after an edit usually loses. Exiting on the
    // first EADDRINUSE turns that into a respawn loop that prints the same
    // error forever, so wait the old process out before giving up.
    // Backs off to roughly five seconds in total: long enough to outlast a
    // watch restart on a slow machine, short enough that a genuinely occupied
    // port still reports quickly.
    const BIND_RETRY_MS = [250, 400, 650, 1000, 1400, 1800];
    let bindAttempt = 0;

    server.on('error', (err) => {
      if (err.code !== 'EADDRINUSE') {
        console.error('[api] server error:', err);
        process.exit(1);
      }

      const wait = BIND_RETRY_MS[bindAttempt++];
      if (wait !== undefined) {
        // Deliberately NOT unref'd: with no listening socket this timer is the
        // only thing holding the event loop open, so unref'ing it makes the
        // process exit silently instead of retrying.
        setTimeout(() => server.listen(PORT), wait);
        return;
      }

      console.error(
        `\n  Port ${PORT} is still in use after ${BIND_RETRY_MS.length + 1} attempts.\n` +
          `  Stop whatever is on it, or put API_PORT=4001 in a .env file and restart.\n` +
          `  (Set VITE_API_PROXY=http://localhost:4001 there too so the web app can find it.)\n`
      );
      process.exit(1);
    });

    // The weekly league: weeks past their final time close once now, then
    // every ten minutes (and lazily on any board read). Unref'd, so it never
    // keeps the process alive; closeDueWeeks never throws, and this guard
    // makes sure a failure is logged rather than taking the server down.
    const closeDueLeagueWeeks = () => {
      try {
        const closed = learningDeps.leagues?.closeDueWeeks(new Date()) ?? [];
        if (closed.length) console.log(`[leagues] closed ${closed.join(', ')}`);
      } catch (err) {
        console.error('[leagues] could not close due weeks:', err?.message ?? err);
      }
    };
    closeDueLeagueWeeks();
    setInterval(closeDueLeagueWeeks, LEAGUE_CLOSE_EVERY_MS).unref();

    server.listen(PORT);
  })
  .catch((err) => {
    console.error('Failed to start the API server:', err);
    process.exit(1);
  });

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, async () => {
    await store.persistNow();
    process.exit(0);
  });
}
