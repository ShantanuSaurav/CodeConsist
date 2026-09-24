import { afterEach, describe, expect, it, vi } from 'vitest';
import { AdminApiError, adminApi } from '../services/adminApi';

/**
 * The admin sign-in form showed ngrok's "endpoint is offline" HTML as its
 * error whenever the laptop's tunnel was down. The admin API only ever answers
 * JSON, so a non-JSON reply means the server is unreachable.
 */
const NGROK_OFFLINE_PAGE =
  '<!DOCTYPE html>\n<html class="h-full" lang="en-US" dir="ltr">\n  <head>\n    <meta charset="utf-8">\n' +
  '<link rel="preload" href="https://assets.ngrok.com/fonts/euclid-square/EuclidSquare-Regular-WebS.woff" as="font">' +
  '</head><body>The endpoint is offline. (ERR_NGROK_3200)</body></html>';

function answer(body: string, status: number, contentType: string) {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(body, { status, headers: { 'Content-Type': contentType } })));
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('admin API client when the server is offline', () => {
  it("reports ngrok's offline page as 'server offline', never as HTML", async () => {
    answer(NGROK_OFFLINE_PAGE, 404, 'text/html');
    const err = await adminApi.login('some-admin', 'not-a-real-password').catch((e) => e);
    expect(err).toBeInstanceOf(AdminApiError);
    expect(err.status).toBe(0);
    expect(err.message).toMatch(/offline/i);
    expect(err.message).not.toMatch(/<|DOCTYPE|ngrok/i);
  });

  it("still shows the server's own JSON error for a wrong login", async () => {
    answer(JSON.stringify({ error: 'Incorrect Admin User ID or password.' }), 401, 'application/json');
    const err = await adminApi.login('some-admin', 'not-a-real-password').catch((e) => e);
    expect(err).toBeInstanceOf(AdminApiError);
    expect(err.status).toBe(401);
    expect(err.message).toBe('Incorrect Admin User ID or password.');
  });
});
