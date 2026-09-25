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
