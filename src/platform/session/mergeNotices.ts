/**
 * What a learner is told after a merge that did not take everything, and
 * the solves it held back (Phase 5).
 *
 * A merge can leave out a guest's (or an offline device's) work for two new
 * reasons: a solve in a stage the account has not opened (the stage order,
 * `droppedChallenges`), and a passed test-out that did not hold up when the
 * server checked it again (`claims.rejected`). Both are explained in plain
 * words; the held-back solves are also kept (`stats.heldChallenges`) so the
 * Learn page can say which lessons to do again once their stage opens.
 * Pure, so the wording can be tested without React.
 */
import type { MergeResponse } from '../api-client/api';
import type { AssessmentClaim } from '@/types';

/** Why a claim was not kept, as a learner reads it. */
const CLAIM_REASONS: Record<string, string> = {
  wrong: 'the answer did not pass when it was checked again',
  unverifiable: 'this server could not check the answer itself',
  'below-pass-mark': 'it was below the pass mark',
  hints: 'hints were used',
  disabled: 'test-outs are switched off',
  'not-reachable': 'that stage could not be reached from your progress',
  premium: 'it is in a premium stage this account has not unlocked',
  'already-cleared': 'you had already cleared it',
  'test-pending': "its lessons were already done - take the stage test itself",
  busy: 'the code runner was busy',
  'rate-limited': 'too many answers were checked in a short time',
  'over-cap': 'too many test-outs were sent at once',
  'not-a-test': 'it was not that stage\'s test',
  'unknown-stage': 'that stage is not available',
  invalid: 'it could not be read',
  unavailable: 'it could not be checked right now'
};

export function claimReasonText(reason: string): string {
  return CLAIM_REASONS[reason] ?? CLAIM_REASONS.unavailable;
}

/**
 * Why a claim was not checked that is no fault of the claim (the code
 * runner busy, the content not loaded, the account's limit reached): the
 * server keeps its test out of the merge, and the browser keeps the claim
 * and sends it again (server/progress-routes.js RETRY_CLAIM_REASONS).
 */
export const RETRY_CLAIM_REASONS: ReadonlySet<string> = new Set(['busy', 'unavailable', 'rate-limited']);

/**
 * The claims to keep and send again after a merge: the ones sent whose
 * rejection was in RETRY_CLAIM_REASONS. Undefined when there are none.
 */
export function claimsToRetry(
  sent: Readonly<Record<string, AssessmentClaim>> | undefined,
  claims: MergeResponse['claims']
): Record<string, AssessmentClaim> | undefined {
  const retry = new Set((claims?.rejected ?? []).filter((r) => r && RETRY_CLAIM_REASONS.has(r.reason)).map((r) => r.stageId));
  const kept: Record<string, AssessmentClaim> = {};
  for (const claim of Object.values(sent ?? {})) if (claim && retry.has(claim.stageId)) kept[claim.stageId] = claim;
  return Object.keys(kept).length ? kept : undefined;
}

/**
 * The toast about test-outs from guest play that were not kept, or null when
 * every claim held up (or none was sent). `stageName` turns an id into what
 * the path calls the stage.
 */
export function rejectedClaimsMessage(claims: MergeResponse['claims'], stageName: (stageId: string) => string): string | null {
  const all = (claims?.rejected ?? []).filter((r) => r && typeof r.stageId === 'string' && r.reason !== 'already-cleared');
  const rejected = all.filter((r) => !RETRY_CLAIM_REASONS.has(r.reason));
  const later = all.length - rejected.length;
  const again = later
    ? `${later} ${later === 1 ? 'test-out' : 'test-outs'} from guest play could not be checked just now - ${later === 1 ? 'it stays' : 'they stay'} on this device and ${later === 1 ? 'is' : 'are'} sent again next time you open the app.`
    : '';
  if (rejected.length === 0) return again || null;
  const parts = rejected.slice(0, 3).map((r) => `${stageName(r.stageId)} (${claimReasonText(r.reason)})`);
  const more = rejected.length > 3 ? `, and ${rejected.length - 3} more` : '';
  const n = rejected.length;
  const notAdded = `${n} ${n === 1 ? 'test-out' : 'test-outs'} from guest play ${n === 1 ? 'was' : 'were'} not added to your account: ${parts.join('; ')}${more}.`;
  return again ? `${notAdded} ${again}` : notAdded;
}

/**
 * The toast about solves the merge held back because their stage is not open
 * on the account yet, or null when there were none.
 */
export function heldChallengesMessage(dropped: readonly string[] | undefined): string | null {
  const n = Array.isArray(dropped) ? dropped.length : 0;
  if (n === 0) return null;
  return `${n} ${n === 1 ? 'solve was' : 'solves were'} not added to your account yet: ${n === 1 ? 'its stage is' : 'their stages are'} not open on it. The Learn page lists them.`;
}

/**
 * The held-back solves to keep showing: the ones held before and the ones
 * just dropped, minus any the account has solved since.
 */
export function nextHeldChallenges(previous: readonly string[] | undefined, dropped: readonly string[] | undefined, solved: readonly string[]): string[] {
  const done = new Set(solved);
  return [...new Set([...(previous ?? []), ...(dropped ?? [])])].filter((id) => typeof id === 'string' && !done.has(id));
}
