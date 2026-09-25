import { afterEach, describe, expect, it, vi } from 'vitest';
import { api, ApiError, OfflineError } from '../api';

/**
 * When the laptop's tunnel is down, Vercel still forwards /api/* to ngrok, and
 * ngrok answers with its own "endpoint is offline" web page (404, text/html,
 * ERR_NGROK_3200). The login form used to print the first 300 characters of
 * that page's HTML as the error. The API only ever answers JSON, so anything
 * else must read as "server offline" - and never show up as text.
 */
const NGROK_OFFLINE_PAGE =
  '<!DOCTYPE html>\n<html class="h-full" lang="en-US" dir="ltr">\n  <head>\n    <meta charset="utf-8">\n' +
  '<link rel="preload" href="https://assets.ngrok.com/fonts/euclid-square/EuclidSquare-Regular-WebS.woff" as="font">' +
  '</head><body>The endpoint botany-subtext-chevron.ngrok-free.dev is offline. (ERR_NGROK_3200)</body></html>';

function answer(body: string, status: number, contentType: string) {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(body, { status, headers: { 'Content-Type': contentType } })));
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('learner API client when the server is offline', () => {
  it("turns ngrok's offline page into an OfflineError", async () => {
    answer(NGROK_OFFLINE_PAGE, 404, 'text/html');
    const err = await api.login('someone@example.com', 'not-a-real-password').catch((e) => e);
    expect(err).toBeInstanceOf(OfflineError);
  });

  it('never puts the HTML into the message a learner sees', async () => {
    answer(NGROK_OFFLINE_PAGE, 404, 'text/html');
    const err: Error = await api.health().catch((e) => e);
    expect(err.message).not.toMatch(/<|DOCTYPE|ngrok/i);
    expect(err.message).toMatch(/offline/i);
  });

  it('treats a non-JSON success page the same way', async () => {
    answer('<html><body>Vercel error</body></html>', 200, 'text/html');
    await expect(api.health()).rejects.toBeInstanceOf(OfflineError);
  });

  it("still passes the API's own JSON errors through unchanged", async () => {
    answer(JSON.stringify({ error: 'Wrong email or password.' }), 401, 'application/json');
    const err = await api.login('someone@example.com', 'not-a-real-password').catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.message).toBe('Wrong email or password.');
  });
});

describe("the learner's time zone", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  /** Capture the headers of the one request a call makes. */
  function capture() {
    const seen: Record<string, string>[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init: RequestInit) => {
        seen.push({ ...(init.headers as Record<string, string>) });
        return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      })
    );
    return seen;
  }

  it('goes with every request as X-Time-Zone', async () => {
    const seen = capture();
    await api.health();
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    expect(seen[0]['X-Time-Zone']).toBe(zone);
  });

  it('is simply left out when Intl throws, and the request still works', async () => {
    const seen = capture();
    vi.spyOn(Intl, 'DateTimeFormat').mockImplementation(() => {
      throw new Error('broken Intl');
    });
    await expect(api.health()).resolves.toEqual({ ok: true });
    expect(seen[0]['X-Time-Zone']).toBeUndefined();
    expect(seen[0]['ngrok-skip-browser-warning']).toBe('true');
  });
});

describe('a merge the server finds too large', () => {
  const json = (body: unknown, status: number) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
  const log = { days: {}, misses: {}, missLog: [] };

  it('goes up again without its activity log, so a sign-in or sign-out never loses the solves', async () => {
    const bodies: unknown[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init: RequestInit) => {
        bodies.push(JSON.parse(String(init.body)));
        return bodies.length === 1 ? json({ error: 'That request is too large.' }, 413) : json({ progress: { xp: 40 } }, 200);
      })
    );
    const res = await api.mergeProgress({ completedChallenges: ['c1'] }, log);
    expect(res.progress.xp).toBe(40);
    expect(bodies).toEqual([{ progress: { completedChallenges: ['c1'] }, activity: log }, { progress: { completedChallenges: ['c1'] } }]);
  });

  it('does not retry any other refusal', async () => {
    const fetch = vi.fn(async () => json({ error: 'Something went wrong on the server.' }, 500));
    vi.stubGlobal('fetch', fetch);
    await expect(api.mergeProgress({ completedChallenges: ['c1'] }, log)).rejects.toBeInstanceOf(ApiError);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
