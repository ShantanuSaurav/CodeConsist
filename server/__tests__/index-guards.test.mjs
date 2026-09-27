/**
 * Rules that live in server/index.js itself and have no seam to call into:
 * the route that used to hand out a lifetime licence for nothing, the access
 * log's redaction, the grade route's refusal to grade stage tests, and the
 * runtime-unavailable answer from /api/execute.
 *
 * server/index.js binds a port the moment it is imported, so these read the
 * source instead of making a request. That is a weaker test than an HTTP one
 * - but both rules are one line away from being taken back out by accident,
 * and this fails the moment either is.
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';

const INDEX = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../index.js');

let source;

beforeAll(async () => {
  // Line endings depend on the checkout (git may write CRLF on Windows).
  source = (await readFile(INDEX, 'utf8')).replace(/\r\n/g, '\n');
});

/** The source of one `app.<method>(path, ...)` handler, up to the next top-level route. */
function handlerSource(routePath) {
  const start = source.indexOf(`'${routePath}'`);
  expect(start, `route ${routePath} in server/index.js`).toBeGreaterThan(-1);
  const end = source.indexOf('\napp.', start);
  return source.slice(start, end === -1 ? undefined : end);
}

describe('the grade route is not an answer key for stage tests', () => {
  it('refuses a stage test before grading anything', () => {
    // POST /api/grade is public and answers right/wrong plus the
    // explanation. For a stage test that is a free oracle for the gate
    // between stages.
    const grade = handlerSource('/api/grade');
    expect(grade).toMatch(/if \(challenge\.isStageTest\)[\s\S]*?status\(400\)[\s\S]*?reason: 'stage-test'/);
    expect(grade.indexOf('isStageTest')).toBeLessThan(grade.indexOf('gradeAnswer('));
  });
});

describe('a missing compiler is explained to learners, not to developers', () => {
  it('sends the Judge0 setup steps as devHint and a plain sentence as stderr', () => {
    const execute = handlerSource('/api/execute');
    expect(execute).toContain("reason: 'runtime-unavailable'");
    // The sentence itself is admin-editable copy (`copy.runtime.unavailable`).
    expect(execute).toMatch(/stderr: runtimeUnavailableMessage\(language, \(name\) => copyText\('runtime\.unavailable'/);
    expect(execute).toContain('devHint: judge0SetupHint(language)');
    expect(execute).not.toContain('stderr: judge0SetupHint(');
  });
});

describe('nothing grants a licence for free', () => {
  it('has no route that simply sets the Pro flag', () => {
    // POST /api/account/pro used to set `isPremium: true` for whoever asked,
    // and server/billing.js reads that flag as a lifetime licence - so one
    // authenticated request walked past the Razorpay signature check, the
    // test-mode guard and the admin grant alike. A Pro licence is bought
    // through POST /api/billing/orders like everything else.
    expect(source).not.toMatch(/app\.(?:post|put|patch)\(\s*['"]\/api\/account\/pro['"]/);
    expect(source).not.toMatch(/updateUser\([^)]*isPremium:\s*true/);
  });
});

describe('the access log keeps credentials out', () => {
  it('redacts every credential-bearing query parameter', () => {
    // Exercise the pattern the server actually uses, lifted out of the file,
    // so widening it later cannot quietly narrow it.
    const literal = source.match(/(\/\(\[\?&\][^\n]*?\/[a-z]*)[,)]/)?.[1];
    expect(literal, 'the access log redaction in server/index.js').toBeTruthy();
    const lastSlash = literal.lastIndexOf('/');
    const pattern = new RegExp(literal.slice(1, lastSlash), literal.slice(lastSlash + 1));

    const line = '/api/auth/oauth/google/callback?code=4/0AeanS0b&state=xZ8&ticket=tk-1&token=jwt.abc';
    // An authorization code that was never exchanged is still redeemable by
    // anyone holding the client secret, and a session token in a log is a
    // session token someone can use.
    expect(line.replace(pattern, '$1[redacted]')).toBe(
      '/api/auth/oauth/google/callback?code=[redacted]&state=[redacted]&ticket=[redacted]&token=[redacted]'
    );
  });
});

describe('the progress routes live in their own router', () => {
  it('mounts createProgressRouter and no longer defines the routes inline', () => {
    // Moved to server/progress-routes.js so they can be tested over HTTP
    // (server/__tests__/progress-routes.test.mjs). A copy left behind here
    // would shadow the tested one.
    expect(source).toMatch(/app\.use\(\s*'\/api',\s*createProgressRouter\(/);
    for (const route of ['/api/progress/solve', '/api/progress/merge', '/api/progress/reset', '/api/progress']) {
      expect(source).not.toMatch(new RegExp(`app\\.(?:get|post)\\(\\s*'${route.replace(/\//g, '\\/')}'`));
    }
    expect(source).toContain('createActivityRouter(');
  });

  it('wraps /auth/me in the same recalculation as GET /progress', () => {
    const me = handlerSource('/api/auth/me');
    expect(me).toContain('recalcForUser(');
  });

  it('wraps /auth/login in it too, so the browser adopts the streak as the server counts it', () => {
    const login = handlerSource('/api/auth/login');
    expect(login).toContain('recalcForUser(');
    expect(login).not.toContain('progress: store.getProgress(');
  });
});

describe('a request body over the JSON limit', () => {
  it('is answered 413, not 500 - so a merge can go up again without its activity log', () => {
    const handler = source.slice(source.indexOf('app.use((err, _req, res, _next)'));
    expect(handler.indexOf("err?.type === 'entity.too.large'")).toBeGreaterThan(-1);
    const tooLarge = handler.indexOf('status(413)');
    expect(tooLarge).toBeGreaterThan(-1);
    expect(tooLarge).toBeLessThan(handler.indexOf('status(500)'));
  });
});

describe('learners notice a settings change', () => {
  it('reports the settings revision on /api/health and serves GET /api/settings', () => {
    const health = handlerSource('/api/health');
    expect(health).toContain('settingsRevision');
    expect(source).toMatch(/app\.use\(\s*'\/api',\s*createSettingsRouter\(/);
  });

  it('compiles the shared learning rules at boot and backfills activity after the content loads', () => {
    expect(source).toContain("'server-lib.ts'), 'learning.mjs'");
    const bootstrap = source.slice(source.indexOf('async function bootstrap()'), source.indexOf('/* -------------------------------------------------------------------- app */'));
    expect(bootstrap.indexOf('backfillAll(')).toBeGreaterThan(bootstrap.indexOf('await loadContent()'));
  });
});

/* --------------------------------------------- trust and access (Phase 1T) */

describe('the premium lock is wired into every route that credits or grades a lesson', () => {
  it('gates the solve and the merge through the progress router', () => {
    // The routes themselves live in server/progress-routes.js (HTTP tests in
    // premium-gate.test.mjs); this is the wiring that hands them the gate.
    const progress = source.slice(source.indexOf('createProgressRouter({'), source.indexOf('/* ---------------------------------------------------------------- activity */'));
    expect(progress).toMatch(/checkSolveAccess: \(user, challenge\) => checkSolveAccess\(user, challenge, premiumContext\('solve'\)\)/);
    expect(progress).toMatch(/mergeAccess: \(user\) => mergeAccess\(user, premiumContext\('merge'\)\)/);
  });

  it('gates /api/grade before it grades anything', () => {
    const grade = handlerSource('/api/grade');
    expect(grade).toMatch(/checkSolveAccess\(req\.user \?\? null, challenge, premiumContext\('grade'\)\)/);
    expect(grade.indexOf('checkSolveAccess(')).toBeLessThan(grade.indexOf('gradeAnswer('));
    expect(grade).toContain('status(403)');
  });

  it('goes through billing.js premiumGate (server/progression.js)', async () => {
    const progression = await readFile(path.resolve(path.dirname(INDEX), 'progression.js'), 'utf8');
    expect(progression).toContain('premiumGate(user, challenge, ctx)');
  });

  it('sends stubs for locked stages from /api/content, never cached', () => {
    const content = handlerSource('/api/content');
    expect(content).toContain('lockedStub(');
    expect(content).toContain('lockedStageIds');
    expect(content).toContain("'private, no-store'");
    expect(content).toMatch(/res\.set\('Vary', 'Authorization'\)/);
  });
});

describe('cross-site requests', () => {
  it('has no bare cors() any more - an allow-list and a foreign-origin guard instead', () => {
    expect(source).not.toMatch(/app\.use\(\s*cors\(/);
    expect(source).not.toMatch(/import cors from 'cors'/);
    expect(source).toContain('app.use(corsPolicy.corsMiddleware())');
    // The guard sits in front of the webhook router, so every write passes it.
    expect(source.indexOf('app.use(corsPolicy.foreignOriginGuard())')).toBeGreaterThan(-1);
    expect(source.indexOf('app.use(corsPolicy.foreignOriginGuard())')).toBeLessThan(source.indexOf("app.use('/api', createWebhookRouter("));
  });
});

describe('the client address', () => {
  it('sets trust proxy from the live hop count', () => {
    expect(source).toMatch(/app\.set\('trust proxy', trustProxyFn\(/);
    expect(source.indexOf("app.set('trust proxy'")).toBeLessThan(source.indexOf('app.use('));
  });

  it('logs the trusted address, not a header anyone can type', () => {
    const logger = source.slice(source.indexOf('// Request logging middleware'), source.indexOf("app.use('/api', createWebhookRouter("));
    expect(logger).not.toContain('cf-connecting-ip');
    expect(logger).not.toContain("headers['x-forwarded-for']");
    expect(logger).toContain('clientIp(req)');
  });
});

describe('rate limits', () => {
  it('counts every sign-in for an email before bcrypt runs, and clears the count on success', () => {
    // Counting only after a failure let a burst of parallel guesses all pass
    // a check that merely looked (bcrypt yields in between). The middleware
    // counts each attempt as it arrives - "counts before the handler awaits"
    // in rate-limit.test.mjs covers the concurrency itself.
    const login = handlerSource('/api/auth/login');
    expect(login).toContain("limitBy('login.ip', byAddress)");
    const count = login.indexOf("limitBy('login.account', loginEmailOf)");
    expect(count).toBeGreaterThan(-1);
    expect(count).toBeLessThan(login.indexOf('bcrypt.compare('));
    expect(login).not.toContain("limiter.peek('login.account'");
    expect(login).not.toContain("limiter.hit('login.account'");
    expect(login).toContain('const email = loginEmailOf(req)');
    expect(login.indexOf("limiter.reset('login.account', email)")).toBeGreaterThan(login.indexOf('bcrypt.compare('));
  });

  it('limits sign-up, password change, code runs, solves and small writes', () => {
    const register = handlerSource('/api/auth/register');
    expect(register).toContain("limitBy('register.ip', byAddress)");
    expect(register).toContain("limitBy('register.global'");
    expect(handlerSource('/api/auth/password')).toContain("limitBy('passwordChange.account', byAccount)");
    const execute = handlerSource('/api/execute');
    expect(execute).toContain("limitBy('execute.account', byAccount)");
    expect(execute).toContain("limitBy('execute.ip', byAddress)");
    expect(source).toContain("solveLimit: limitBy('solve.account', byAccount)");
    expect(source).toContain("writeLimit: limitBy('write.account', byAccount)");
    expect(source).toContain("limit: limitBy('passwordReset.ip', byAddress)");
  });

  it('runs every code execution in a slot and answers busy with 503', () => {
    const execute = handlerSource('/api/execute');
    expect(execute).toContain('slots.run(() => runJudge0Submission(');
    expect(execute).toMatch(/slots\.run\(async \(\) => \{[\s\S]*?runJsInChild\(/);
    expect(execute).toContain('err instanceof BusyError');
    const verify = source.slice(source.indexOf('async function verifySubmission('), source.indexOf('function completedStagesFor('));
    expect(verify).toMatch(/slots\.run\(\(\) =>\s*runJsInChild\(/);
    expect(verify).toContain('slots.run(() => runPythonLocally(');
    const busy = source.slice(source.indexOf('function sendBusy('), source.indexOf("app.post(\n  '/api/execute'"));
    expect(busy).toContain('status(503)');
    expect(busy).toContain("reason: 'busy'");
  });
});

describe('sessions and password resets', () => {
  it('drops a learner token signed before the account’s last password reset', () => {
    const auth = source.slice(source.indexOf('function optionalAuth('), source.indexOf('function requireAuth('));
    expect(auth).toContain('learnerTokenIsCurrent(payload, user)');
  });

  it('mounts the reset-link routes', () => {
    expect(source).toMatch(/app\.use\(\s*'\/api',\s*createPasswordResetRouter\(/);
  });
});

describe('units and preferences (Phase 2)', () => {
  it('builds the units service at boot and sends each stage its units from /api/content', () => {
    expect(source).toContain('learningDeps.units = createUnitsService(');
    expect(handlerSource('/api/content')).toContain('learningDeps.units.attachUnits(');
  });

  it('mounts PATCH /api/me/preferences behind the small-writes limit', () => {
    expect(source).toMatch(/createPreferencesRouter\(\{[^}]*writeLimit: limitBy\('write\.account'/);
  });

  it('sends the preferences through publicPreferences, never timeZoneSetAt', () => {
    expect(source).toContain('preferences: publicPreferences(store.normalizePreferences(user.preferences))');
  });
});
