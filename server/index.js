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
 *   - an optional, best-effort mirror of accounts into Excel (server/excel.js).
 */
import express from 'express';
import cors from 'cors';
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import http from 'node:http';
import path from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { existsSync } from 'node:fs';

import * as store from './db.js';
import { loadContent, getChallenge, contentSnapshot, applyLearnerOverrides, applyChallengeOverride } from './content.js';
import { compileTsModule } from './build.js';
import { createAdminRouter } from './admin.js';
import { initAuthSecret, signLearnerToken, verifyLearnerToken, signAdminToken } from './auth.js';
import { bootstrapAdminAccount, authenticateAdmin, publicAdmin, requireAdminAuth } from './admin-auth.js';
import * as excel from './excel.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
// Deliberately not `PORT`: dev harnesses set that for the *web* server, and the
// API silently fighting Vite for port 3000 is a miserable thing to debug.
const PORT = Number(process.env.API_PORT || 4000);

/**
 * Judge0 configuration. Server-side only - this is the one place these
 * credentials are read. `JUDGE0_API_URL` / `JUDGE0_API_KEY` / `JUDGE0_API_HOST`
 * are the current names; the `VITE_JUDGE0_*` names are accepted as a fallback
 * so a `.env` written for the previous (client-side) architecture keeps
 * working without edits - but note that only the server ever reads them now.
 */
const JUDGE0_API_URL = process.env.JUDGE0_API_URL || process.env.VITE_JUDGE0_API_URL;
const JUDGE0_API_KEY = process.env.JUDGE0_API_KEY || process.env.VITE_JUDGE0_API_KEY;
const JUDGE0_API_HOST = process.env.JUDGE0_API_HOST || process.env.VITE_JUDGE0_API_HOST || 'judge0-ce.p.rapidapi.com';
const JUDGE0_CONFIGURED = Boolean(
  JUDGE0_API_URL && JUDGE0_API_KEY &&
    !JUDGE0_API_URL.includes('your-judge0') && !JUDGE0_API_KEY.startsWith('your_')
);
const JUDGE0_LANGUAGE_IDS = { java: 62, c: 50, cpp: 54, go: 60 };

/* ------------------------------------------------------------ bootstrapping */

let grading;
let leveling;
let gradingPath;

async function bootstrap() {
  await store.load();

  gradingPath = await compileTsModule(path.join(ROOT, 'src', 'lib', 'grading.ts'), 'grading.mjs');
  const levelingPath = await compileTsModule(path.join(ROOT, 'src', 'lib', 'leveling.ts'), 'leveling.mjs');
  grading = await import(pathToFileURL(gradingPath).href);
  leveling = await import(pathToFileURL(levelingPath).href);

  await loadContent();

  // The administrator account is bootstrapped from ADMIN_USER_ID /
  // ADMIN_PASSWORD the very first time the server runs with none configured
  // yet - see server/admin-auth.js. It never touches the learner `users`
  // table and never runs again once an admin record exists.
  await bootstrapAdminAccount();
}

/* -------------------------------------------------------------------- app */

const app = express();
app.use(cors());
app.use(express.json({ limit: '256kb' }));

const asyncRoute = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

function publicUser(user) {
  return {
    id: user.id,
    email: user.email,
    username: user.username,
    isPremium: Boolean(user.isPremium),
    provider: 'local'
  };
}

function readToken(req) {
  const header = req.headers.authorization || '';
  return header.startsWith('Bearer ') ? header.slice(7) : null;
}

/** Attaches req.user when a valid LEARNER token is present; never rejects. */
function optionalAuth(req, _res, next) {
  const token = readToken(req);
  if (token) {
    try {
      const { sub } = verifyLearnerToken(token);
      req.user = store.findUserById(sub) || null;
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
    challenges: snapshot?.challenges.length ?? 0,
    stages: snapshot?.stages.length ?? 0,
    users: store.db().users.length,
    uptimeSeconds: Math.round(process.uptime()),
    // Never the credentials themselves - just whether Judge0 is wired up, and
    // which languages that unlocks, so the client can label the Playground
    // honestly without ever seeing the key.
    judge0: { configured: JUDGE0_CONFIGURED, languages: Object.keys(JUDGE0_LANGUAGE_IDS) }
  });
});

/* -------------------------------------------------------------------- auth */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

app.post(
  '/api/auth/register',
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

    const user = store.insertUser({
      id: crypto.randomUUID(),
      email,
      username,
      passwordHash,
      isPremium: false,
      createdAt: new Date().toISOString()
    });

    // Fire-and-forget: `syncUser` never throws and never blocks this
    // response - Excel being slow, misconfigured or entirely absent must
    // never be able to affect signup. See server/excel.js for the full
    // reasoning and server/db.js's `excelSync` for where failures land.
    excel.syncUser(store, user, store.getProgress(user.id), 'signup');

    res.status(201).json({ token: signLearnerToken(user), user: publicUser(user), progress: store.getProgress(user.id) });
  })
);

app.post(
  '/api/auth/login',
  asyncRoute(async (req, res) => {
    const email = String(req.body?.email ?? '').trim().toLowerCase();
    const password = String(req.body?.password ?? '');
    const user = store.findUserByEmail(email);

    // Same response either way so the endpoint cannot be used to enumerate accounts.
    const ok = user && (await bcrypt.compare(password, user.passwordHash));
    if (!ok) return res.status(401).json({ error: 'Email or password is incorrect.' });

    // Throttled so a chatty client logging in repeatedly does not hammer
    // Graph - a fresh sync on every login is not worth the API calls.
    if (!excel.shouldThrottle(store, user.id)) excel.syncUser(store, user, store.getProgress(user.id), 'login');

    res.json({ token: signLearnerToken(user), user: publicUser(user), progress: store.getProgress(user.id) });
  })
);

app.get('/api/auth/me', requireAuth, (req, res) => {
  res.json({ user: publicUser(req.user), progress: store.getProgress(req.user.id) });
});

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
    if (!result.ok) return res.status(401).json({ error: result.error });
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
  asyncRoute(async (_req, res) => {
    const snapshot = await loadContent();
    const overrides = store.getContentOverrides();
    const merged = applyLearnerOverrides(snapshot, overrides);
    const hiddenLanguages = Object.keys(overrides.languages).filter((id) => overrides.languages[id]?.hidden);
    res.json({ stages: merged.stages, challenges: merged.challenges, hiddenLanguages, builtAt: snapshot.builtAt });
  })
);

/* -------------------------------------------------------------- admin app */

// Every route inside createAdminRouter() is independently gated by
// requireAdminAuth (server/admin-auth.js), which verifies the admin bearer
// token against the live admin record - nothing about optionalAuth/req.user
// above is involved in, or a substitute for, that check.
app.use('/api/admin', createAdminRouter());

/* ---------------------------------------------------------------- progress */

function recalc(progress) {
  const today = leveling.dayKey();
  return {
    ...progress,
    level: leveling.levelFromXp(progress.xp),
    streak: leveling.currentStreak(progress.streak, progress.lastActiveDay, today)
  };
}

app.get('/api/progress', requireAuth, (req, res) => {
  res.json({ progress: recalc(store.getProgress(req.user.id)) });
});

/* ------------------------------------------------------------ verification */

/** Is `answer` correct for a non-code challenge? Pure, synchronous. */
function gradeAnswer(challenge, answer) {
  switch (challenge.type) {
    case 'quiz':
    case 'output_prediction':
      return Number(answer) === challenge.correctIndex;
    case 'multi_select':
      return Array.isArray(answer) && grading.sameSet(answer.map(Number), challenge.correctIndices ?? []);
    case 'fill_blank':
      return (
        Array.isArray(answer) &&
        answer.length === (challenge.blanks ?? []).length &&
        (challenge.blanks ?? []).every((b, i) =>
          grading.checkBlank(String(answer[i] ?? ''), b.answer, b.alternatives ?? [])
        )
      );
    case 'pseudocode_order':
      return (
        Array.isArray(answer) &&
        answer.length === (challenge.pseudocodeLines ?? []).length &&
        answer.every((line, i) => String(line) === challenge.pseudocodeLines[i])
      );
    default:
      return false;
  }
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

  if (challenge.language === 'javascript') {
    const result = await runJsInChild({
      code,
      entryFunction: challenge.entryFunction,
      testCases: challenge.testCases ?? []
    });
    return { ok: result.status === 'passed', verified: true, reason: 'Tests run by the server.' };
  }

  if (challenge.language === 'python') {
    const result = runPythonLocally(code, challenge.entryFunction, challenge.testCases ?? []);
    if (result.skipped) {
      return { ok: true, verified: false, reason: 'No local Python; accepted on the client report.' };
    }
    return { ok: result.passed, verified: true, reason: 'Tests run by the server (local CPython).' };
  }

  return { ok: false, verified: true, reason: `No server engine for ${challenge.language}.` };
}

/**
 * Record a solve. The server owns both the verdict and the XP maths: the client
 * says WHICH challenge, WHAT it answered, and how much help it took - never
 * whether it was right and never how much XP it earned.
 */
app.post(
  '/api/progress/solve',
  requireAuth,
  asyncRoute(async (req, res) => {
    const challengeId = String(req.body?.challengeId ?? '');
    const attempts = Math.max(1, Math.min(50, Number(req.body?.attempts ?? 1) || 1));
    const hintsUsed = Math.max(0, Math.min(10, Number(req.body?.hintsUsed ?? 0) || 0));

    const challenge = getChallengeMerged(challengeId);
    if (!challenge) return res.status(404).json({ error: 'Unknown challenge.' });

    const verdict = await verifySubmission(challenge, req.body ?? {});
    if (!verdict.ok) {
      return res.status(422).json({ error: 'That submission does not solve the challenge.', reason: verdict.reason });
    }

    const progress = store.getProgress(req.user.id);
    const today = leveling.dayKey();
    const previous = progress.attempts[challengeId];
    const score = leveling.scoreSolve(attempts, hintsUsed);

    // Re-solving is allowed and keeps your best score, but only pays XP once.
    const firstSolve = !progress.completedChallenges.includes(challengeId);
    const awarded = firstSolve ? leveling.xpForSolve(challenge.xpReward, attempts, hintsUsed) : 0;

    const next = {
      ...progress,
      xp: progress.xp + awarded,
      completedChallenges: firstSolve
        ? [...progress.completedChallenges, challengeId]
        : progress.completedChallenges,
      attempts: {
        ...progress.attempts,
        [challengeId]: {
          challengeId,
          score: Math.max(previous?.score ?? 0, score),
          attempts: (previous?.attempts ?? 0) + attempts,
          hintsUsed: (previous?.hintsUsed ?? 0) + hintsUsed,
          solvedAt: new Date().toISOString()
        }
      },
      streak: leveling.nextStreak(progress.streak, progress.lastActiveDay, today),
      lastActiveDay: today
    };
    next.bestStreak = Math.max(progress.bestStreak ?? 0, next.streak);
    next.level = leveling.levelFromXp(next.xp);
    next.completedStages = completedStagesFor(next.completedChallenges);

    store.setProgress(req.user.id, next);

    // Meaningful-progress-update trigger for Excel, throttled the same way
    // login is - a burst of solves in one session becomes one sync, not one
    // Graph call per challenge.
    if (!excel.shouldThrottle(store, req.user.id)) excel.syncUser(store, req.user, next, 'progress');

    res.json({ progress: next, awardedXp: awarded, score, firstSolve, verified: verdict.verified });
  })
);

/**
 * Merge a guest's local progress into the account they just signed into.
 *
 * The client says WHICH challenges it solved. The server decides what that is
 * worth, from its own content - it never copies an XP number, a level, or a
 * challenge id it has never heard of from the request body. The previous
 * version took max(xp) straight from the client, which both let anyone set
 * their own score and, when merging two genuinely separate pools, silently
 * discarded the smaller one while still marking its challenges solved.
 */
function completedStagesFor(completedIds) {
  const snapshot = contentSnapshot();
  const solved = new Set(completedIds);
  return snapshot.stages
    .filter((stage) => {
      const inStage = snapshot.challenges.filter((c) => c.stageId === stage.id);
      return inStage.length > 0 && inStage.every((c) => solved.has(c.id));
    })
    .map((stage) => stage.id);
}

const MAX_PLAUSIBLE_STREAK = 400;

app.post('/api/progress/merge', requireAuth, (req, res) => {
  const incoming = req.body?.progress ?? {};
  const current = store.getProgress(req.user.id);

  const known = new Set(current.completedChallenges ?? []);
  const incomingIds = Array.isArray(incoming.completedChallenges)
    ? incoming.completedChallenges.map(String)
    : [];

  // Only ids that exist, and only ones this account has not already been paid for.
  const newIds = [...new Set(incomingIds)].filter((id) => !known.has(id) && getChallenge(id));

  const incomingAttempts = incoming.attempts && typeof incoming.attempts === 'object' ? incoming.attempts : {};
  const attempts = { ...(current.attempts ?? {}) };
  let awarded = 0;

  for (const id of newIds) {
    const challenge = getChallengeMerged(id);
    const a = incomingAttempts[id] ?? {};
    const tries = Math.max(1, Math.min(50, Number(a.attempts) || 1));
    const hints = Math.max(0, Math.min(10, Number(a.hintsUsed) || 0));
    // Same maths as a live solve, so a guest is paid exactly what they would
    // have been paid signed in - no more for having been offline.
    awarded += leveling.xpForSolve(challenge.xpReward, tries, hints);
    attempts[id] = {
      challengeId: id,
      score: leveling.scoreSolve(tries, hints),
      attempts: tries,
      hintsUsed: hints,
      solvedAt: typeof a.solvedAt === 'string' ? a.solvedAt : new Date().toISOString()
    };
  }

  const completedChallenges = [...known, ...newIds];
  const clampStreak = (v) => Math.max(0, Math.min(MAX_PLAUSIBLE_STREAK, Number(v) || 0));
  const dayRe = /^\d{4}-\d{2}-\d{2}$/;

  const merged = {
    ...current,
    xp: current.xp + awarded,
    bestStreak: Math.max(current.bestStreak ?? 0, clampStreak(incoming.bestStreak)),
    streak: Math.max(current.streak ?? 0, clampStreak(incoming.streak)),
    lastActiveDay:
      [current.lastActiveDay, incoming.lastActiveDay]
        .filter((d) => typeof d === 'string' && dayRe.test(d))
        .sort()
        .pop() ?? null,
    completedChallenges,
    completedStages: completedStagesFor(completedChallenges),
    attempts
  };
  merged.level = leveling.levelFromXp(merged.xp);

  store.setProgress(req.user.id, merged);
  res.json({ progress: merged, mergedChallenges: newIds.length, awardedXp: awarded });
});

app.post('/api/progress/reset', requireAuth, (req, res) => {
  const fresh = { ...store.EMPTY_PROGRESS, attempts: {}, completedChallenges: [], completedStages: [] };
  store.setProgress(req.user.id, fresh);
  res.json({ progress: fresh });
});

app.post('/api/account/pro', requireAuth, (req, res) => {
  // No payment processor is wired up locally; this is the honest local stand-in
  // for a successful checkout webhook.
  req.user.isPremium = true;
  store.persist();
  res.json({ user: publicUser(req.user) });
});

/* ------------------------------------------------------------- leaderboard */

app.get('/api/leaderboard', (_req, res) => {
  // store.db().users never contains the administrator - see server/db.js's
  // separate `admin` field - so the leaderboard is learner-only by
  // construction, not by filtering something out here.
  const all = store.allProgress();
  const rows = store
    .db()
    .users.map((u) => {
      const p = all[u.id] ?? store.EMPTY_PROGRESS;
      return {
        username: u.username,
        xp: p.xp ?? 0,
        level: leveling.levelFromXp(p.xp ?? 0),
        streak: leveling.currentStreak(p.streak ?? 0, p.lastActiveDay ?? null),
        solved: (p.completedChallenges ?? []).length
      };
    })
    .sort((a, b) => b.xp - a.xp || b.solved - a.solved)
    .slice(0, 50);
  res.json({ leaderboard: rows });
});

/* ------------------------------------------------------------------ grading */

/** Authoritative check for non-code challenges, without recording anything. */
app.post(
  '/api/grade',
  asyncRoute(async (req, res) => {
    const challenge = getChallengeMerged(String(req.body?.challengeId ?? ''));
    if (!challenge) return res.status(404).json({ error: 'Unknown challenge.' });
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
  if (!exe) return { skipped: true };
  try {
    const out = execFileSync(exe, ['-c', PYTHON_HARNESS], {
      input: JSON.stringify({ code, entry: entryFunction }) + '\n' + JSON.stringify(testCases) + '\n',
      encoding: 'utf8',
      timeout: 15000,
      stdio: ['pipe', 'pipe', 'pipe']
    });
    return JSON.parse(out.trim().split('\n').pop());
  } catch {
    return { passed: false };
  }
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
 * Run one submission on a configured Judge0 instance. Server-side only - this
 * is the only function in the whole app that ever sees JUDGE0_API_KEY.
 */
async function runJudge0Remote(language, code) {
  const languageId = JUDGE0_LANGUAGE_IDS[language];
  if (!languageId) {
    return { status: 'error', engine: 'none', stderr: `${language} is not supported by the configured compiler.`, testResults: [] };
  }

  const encode = (str) => Buffer.from(str, 'utf8').toString('base64');
  const decode = (b64) => (b64 ? Buffer.from(b64, 'base64').toString('utf8') : '');

  const started = process.hrtime.bigint();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);

  let response;
  try {
    response = await fetch(`${JUDGE0_API_URL}/submissions?base64_encoded=true&wait=true`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-RapidAPI-Key': JUDGE0_API_KEY,
        'X-RapidAPI-Host': JUDGE0_API_HOST
      },
      body: JSON.stringify({ source_code: encode(code), language_id: languageId }),
      signal: controller.signal
    });
  } catch (e) {
    return {
      status: 'error',
      engine: 'none',
      stderr: `Could not reach the remote compiler: ${e?.message ?? e}`,
      testResults: []
    };
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    return { status: 'error', engine: 'judge0', stderr: `The compiler service replied ${response.status}.`, testResults: [] };
  }

  const data = await response.json();
  const compileOutput = decode(data.compile_output).trim();
  const stderr = decode(data.stderr).trim();
  const stdout = decode(data.stdout).trim();
  const elapsedMs = Number(process.hrtime.bigint() - started) / 1e6;
  const time = data.time ? `${(parseFloat(data.time) * 1000).toFixed(0)}ms (Judge0)` : `${elapsedMs.toFixed(0)}ms (Judge0)`;

  if (compileOutput) {
    return { status: 'error', engine: 'judge0', stderr: compileOutput, time, testResults: [] };
  }
  if (stderr || (data.status?.id && data.status.id > 3)) {
    return {
      status: 'error',
      engine: 'judge0',
      stderr: stderr || data.status?.description || 'Runtime error',
      stdout: stdout || undefined,
      time,
      testResults: []
    };
  }
  return { status: 'passed', engine: 'judge0', stdout: stdout || 'Program finished with no output.', time, testResults: [] };
}

app.post(
  '/api/execute',
  asyncRoute(async (req, res) => {
    const language = String(req.body?.language ?? 'javascript');
    const code = String(req.body?.code ?? '');
    const entryFunction = req.body?.entryFunction ? String(req.body.entryFunction) : undefined;
    const testCases = Array.isArray(req.body?.testCases) ? req.body.testCases.slice(0, 25) : [];

    if (code.length > 100_000) return res.status(413).json({ error: 'Submission is too large.' });

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
        // needs an external service.
        return res.status(501).json({
          status: 'error',
          engine: 'none',
          stderr:
            `Running ${language} needs a Judge0 endpoint. JavaScript and Python already work with no ` +
            'setup. To enable Java, C, C++ or Go, set JUDGE0_API_URL and JUDGE0_API_KEY in a .env file ' +
            'at the project root (see .env.example) and restart the API server.',
          testResults: []
        });
      }
      const result = await runJudge0Remote(language, code);
      return res.json(result);
    }

    const started = process.hrtime.bigint();
    const result = await runJsInChild({ code, entryFunction, testCases });
    const elapsed = Number(process.hrtime.bigint() - started) / 1e6;

    res.json({ ...result, engine: 'node-vm', time: `${elapsed.toFixed(0)}ms (Node sandbox)` });
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
      console.log(`\n  CodeQuest API listening on http://localhost:${actual}`);
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
