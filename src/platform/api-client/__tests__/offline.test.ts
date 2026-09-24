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
