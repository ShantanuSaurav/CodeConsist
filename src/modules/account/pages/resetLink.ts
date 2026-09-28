import { OfflineError } from '@/platform/api-client/api';

/**
 * The two decisions /reset-password makes about its link, kept apart from the
 * page so they can be tested without a browser.
 */

/**
 * The token to use: the one in the address bar (`#token=...`) when there is
 * one, else the one this page load already captured. A new link pasted into
 * the same tab changes only the fragment - nothing reloads - so the fresh
 * token must win, or the learner keeps seeing the old (perhaps dead) link.
 */
export function pickResetToken(hash: string, captured: string | null): string {
  const raw = hash.startsWith('#') ? hash.slice(1) : hash;
  const fresh = (new URLSearchParams(raw).get('token') ?? '').trim();
  return fresh || captured || '';
}

/**
 * What a link check that FAILED shows. Never the dead-link view: the server
 * answers a dead link with a 200 and `valid: false`, so an error here is a
 * refusal to check (too many checks from this address, which a campus
 * shares), a server fault or a blocked origin. The link may be fine - offer
 * to check again.
 */
export function failedCheckView(err: unknown): { kind: 'offline' } | { kind: 'unchecked'; message: string } {
  if (err instanceof OfflineError) return { kind: 'offline' };
  return { kind: 'unchecked', message: err instanceof Error && err.message ? err.message : 'Could not check this link right now.' };
}
