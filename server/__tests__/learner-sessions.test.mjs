import { describe, expect, it } from 'vitest';
import { clientDescription, sessionRows, touchSession } from '../learner-sessions.js';
import { learnerTokenIsCurrent } from '../auth.js';

const request = headers => ({ get: key => headers[key] });
describe('learner session activity', () => {
  it('distinguishes native devices, mobile web and desktop web', () => {
    expect(clientDescription(request({ 'x-codeconsist-client': 'android' })).platform).toBe('Android app');
    expect(clientDescription(request({ 'user-agent': 'Mozilla/5.0 (iPhone) Safari/605' }))).toEqual({ platform: 'Mobile web', browser: 'Safari' });
    expect(clientDescription(request({ 'user-agent': 'Mozilla/5.0 Chrome/130 Edg/130' }))).toEqual({ platform: 'Desktop web', browser: 'Edge' });
  });
  it('throttles activity writes and retains unexpired revocations beyond history limits', () => {
    const user = { id: 'one', tokenVersion: 0 };
    const now = Date.now();
    const payload = { sub: 'one', jti: 'revoked', iat: Math.floor(now / 1000), exp: Math.floor(now / 1000) + 3600, tv: 0 };
    const req = request({ 'x-codeconsist-client': 'android' });
    expect(touchSession(user, payload, req, now)).toBe(true);
    expect(touchSession(user, payload, req, now + 100)).toBe(false);
    user.sessions[0].signedOutAt = new Date(now).toISOString();
    for (let i = 0; i < 110; i++) touchSession(user, { ...payload, jti: `other-${i}` }, req, now + 200 + i);
    expect(learnerTokenIsCurrent(payload, user)).toBe(false);
    expect(sessionRows(user, now).find(row => row.id === 'revoked').status).toBe('Signed out');
    expect(learnerTokenIsCurrent({ ...payload, jti: 'other-109' }, user)).toBe(true);
    user.tokenVersion++;
    expect(sessionRows(user, now).find(row => row.id === 'other-109').status).toBe('Session reset');
  });
});
