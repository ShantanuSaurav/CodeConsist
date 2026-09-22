/**
 * Two rules that live in server/index.js itself and have no seam to call
 * into: the route that used to hand out a lifetime licence for nothing, and
 * the access log's redaction.
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
