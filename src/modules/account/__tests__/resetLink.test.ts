import { describe, expect, it } from 'vitest';
import { ApiError, OfflineError } from '@/platform/api-client/api';
import { failedCheckView, pickResetToken } from '../pages/resetLink';

describe('pickResetToken', () => {
  it('reads the token from the fragment', () => {
    expect(pickResetToken('#token=abc123', null)).toBe('abc123');
    expect(pickResetToken('token=abc123', null)).toBe('abc123');
    expect(pickResetToken('#token=%20abc123%20', null)).toBe('abc123');
  });

  it('prefers a new link pasted into the same tab over the one already captured', () => {
    // Only the fragment changes, so nothing reloads: the old (perhaps dead)
    // link must not keep answering for the new one.
    expect(pickResetToken('#token=new-link', 'old-link')).toBe('new-link');
  });

  it('keeps the captured token once the fragment is gone (a retry, a second mount)', () => {
    expect(pickResetToken('', 'old-link')).toBe('old-link');
    expect(pickResetToken('#token=', 'old-link')).toBe('old-link');
    expect(pickResetToken('#other=1', 'old-link')).toBe('old-link');
    expect(pickResetToken('', null)).toBe('');
  });
});

describe('failedCheckView', () => {
  it('never calls a link dead because the check itself failed', () => {
    // A campus shares one address: 10 checks per 15 minutes is easy to hit.
    const tooMany = new ApiError('Too many attempts - try again in 12 minutes.', 429, { reason: 'rate-limited', retryAfterSeconds: 700 });
    expect(failedCheckView(tooMany)).toEqual({ kind: 'unchecked', message: 'Too many attempts - try again in 12 minutes.' });
    expect(failedCheckView(new ApiError('Server error.', 500))).toEqual({ kind: 'unchecked', message: 'Server error.' });
    expect(failedCheckView(new ApiError('This origin is not allowed.', 403))).toEqual({ kind: 'unchecked', message: 'This origin is not allowed.' });
    expect(failedCheckView(new ApiError('', 502))).toEqual({ kind: 'unchecked', message: 'Could not check this link right now.' });
    expect(failedCheckView('boom')).toEqual({ kind: 'unchecked', message: 'Could not check this link right now.' });
  });

  it('shows the offline state when the server could not be reached', () => {
    expect(failedCheckView(new OfflineError())).toEqual({ kind: 'offline' });
  });
});
