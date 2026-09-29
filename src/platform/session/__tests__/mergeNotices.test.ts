import { describe, expect, it } from 'vitest';
import type { AssessmentClaim } from '@/types';
import { claimReasonText, claimsToRetry, heldChallengesMessage, nextHeldChallenges, rejectedClaimsMessage } from '../mergeNotices';

const name = (id: string) => ({ 'stage-2': 'Stage 02', 'stage-3': 'Stage 03' })[id] ?? id;

describe('what a learner is told after a merge (P5)', () => {
  it('says nothing when every claim held up, or none was sent', () => {
    expect(rejectedClaimsMessage(undefined, name)).toBeNull();
    expect(rejectedClaimsMessage({ accepted: ['stage-2'], rejected: [] }, name)).toBeNull();
    // Already cleared on the account is not news.
    expect(rejectedClaimsMessage({ accepted: [], rejected: [{ stageId: 'stage-2', reason: 'already-cleared' }] }, name)).toBeNull();
  });

  it('names each stage a claim was not kept for, and why, in plain words', () => {
    const one = rejectedClaimsMessage({ accepted: [], rejected: [{ stageId: 'stage-2', reason: 'wrong' }] }, name);
    expect(one).toBe('1 test-out from guest play was not added to your account: Stage 02 (the answer did not pass when it was checked again).');
    const many = rejectedClaimsMessage(
      {
        accepted: [],
        rejected: [
          { stageId: 'stage-2', reason: 'unverifiable' },
          { stageId: 'stage-3', reason: 'premium' },
          { stageId: 'stage-4', reason: 'hints' },
          { stageId: 'stage-5', reason: 'something-new' }
        ]
      },
      name
    );
    expect(many).toContain('4 test-outs from guest play were not added');
    expect(many).toContain('Stage 03 (it is in a premium stage this account has not unlocked)');
    expect(many).toContain(', and 1 more.');
    // An unknown reason still reads as a sentence.
    expect(claimReasonText('something-new')).toBe(claimReasonText('unavailable'));
  });

  it('keeps the claims the server could not check just now, to send again - and says so', () => {
    const claim = (stageId: string): AssessmentClaim => ({ kind: 'test-out', stageId, testId: `${stageId}-test`, attempts: 1, hintsUsed: 0, answer: 0, at: '2026-09-28T10:00:00.000Z' });
    const sent = { 'stage-2': claim('stage-2'), 'stage-3': claim('stage-3'), 'stage-4': claim('stage-4'), 'stage-5': claim('stage-5') };
    const result = {
      accepted: ['stage-5'],
      rejected: [
        { stageId: 'stage-2', reason: 'busy' },
        { stageId: 'stage-3', reason: 'wrong' },
        { stageId: 'stage-4', reason: 'rate-limited' }
      ]
    };
    expect(claimsToRetry(sent, result)).toEqual({ 'stage-2': sent['stage-2'], 'stage-4': sent['stage-4'] });
    expect(claimsToRetry(sent, { accepted: ['stage-2'], rejected: [{ stageId: 'stage-3', reason: 'wrong' }] })).toBeUndefined();
    expect(claimsToRetry(undefined, result)).toBeUndefined();

    const message = rejectedClaimsMessage(result, name);
    expect(message).toContain('1 test-out from guest play was not added to your account: Stage 03 (the answer did not pass when it was checked again).');
    expect(message).toContain('2 test-outs from guest play could not be checked just now - they stay on this device and are sent again next time you open the app.');
    expect(rejectedClaimsMessage({ accepted: [], rejected: [{ stageId: 'stage-2', reason: 'unavailable' }] }, name)).toBe(
      '1 test-out from guest play could not be checked just now - it stays on this device and is sent again next time you open the app.'
    );
  });

  it('tells the learner about held-back solves and where to find them', () => {
    expect(heldChallengesMessage(undefined)).toBeNull();
    expect(heldChallengesMessage([])).toBeNull();
    expect(heldChallengesMessage(['a'])).toBe('1 solve was not added to your account yet: its stage is not open on it. The Learn page lists them.');
    expect(heldChallengesMessage(['a', 'b'])).toContain('2 solves were not added');
  });

  it('remembers held-back solves until the account has solved them', () => {
    expect(nextHeldChallenges(['a', 'b'], ['b', 'c'], ['a'])).toEqual(['b', 'c']);
    expect(nextHeldChallenges(undefined, undefined, [])).toEqual([]);
    expect(nextHeldChallenges(['a'], [], ['a'])).toEqual([]);
  });
});
