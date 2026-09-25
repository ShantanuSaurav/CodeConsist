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
  source = await readFile(INDEX, 'utf8');
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
    expect(execute).toContain('stderr: runtimeUnavailableMessage(language)');
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
