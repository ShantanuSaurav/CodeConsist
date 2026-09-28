/* ==========================================================================
   The review schedule: where each solved question sits in a small Leitner
   system, and how one Practice-session answer moves it.

   `progress.review[id]` is written only for a question that was reviewed or
   whose answer was shown. Every other solved question has a DERIVED state
   (`reviewStateOf`): a first-try solve starts in `initialBox.clean`, one that
   took help in `initialBox.assisted`, due that many days after its solve. So
   an existing learner needs no migration, and nothing is stored for a
   question that is never reviewed.

   Pure and shared: the server (src/platform/server-lib.ts) and the browser
   (a guest's, or an offline learner's, Practice) run exactly this.
   ========================================================================== */
import type { ChallengeAttempt, ReviewItemState, ReviewOutcome } from '@/types';
import type { ReviewSettings } from '../settings/types';
import { addDays, dayKeyIn, isDayKey } from '../time/days';
import { DEFAULT_REVIEW_SETTINGS } from './defaults';

/** The part of the review settings the schedule reads. */
export type ScheduleRules = Pick<ReviewSettings, 'intervalsDays' | 'wrongResetsToBox' | 'initialBox'>;

/** The progress fields the review rules read (a server row or the browser's stats). */
export interface ReviewProgress {
  completedChallenges?: readonly string[] | null;
  attempts?: Record<string, Partial<ChallengeAttempt>> | null;
  review?: Record<string, unknown> | null;
}

function hasOwn(map: object | null | undefined, key: string): boolean {
  return Boolean(map) && Object.prototype.hasOwnProperty.call(map, key);
}

function define<T>(map: Record<string, T>, key: string, value: T): void {
  Object.defineProperty(map, key, { value, writable: true, enumerable: true, configurable: true });
}

function plainObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function isoOrUndefined(value: unknown): string | undefined {
  return typeof value === 'string' && value && !Number.isNaN(Date.parse(value)) ? value : undefined;
}

/** The interval list in force: whole days, at least 1 - or the defaults when it is unusable. */
export function intervalsOf(rules: Pick<ScheduleRules, 'intervalsDays'> | null | undefined): number[] {
  const list = Array.isArray(rules?.intervalsDays) ? rules!.intervalsDays.map((n) => Math.floor(Number(n))).filter((n) => Number.isFinite(n) && n >= 1) : [];
  return list.length > 0 ? list : [...DEFAULT_REVIEW_SETTINGS.intervalsDays];
}

/** A box index inside the current list - the admin may have shortened it since it was stored. */
export function clampBox(box: unknown, rules: Pick<ScheduleRules, 'intervalsDays'> | null | undefined): number {
  const last = intervalsOf(rules).length - 1;
  const n = Math.floor(Number(box));
  return Number.isFinite(n) ? Math.max(0, Math.min(last, n)) : 0;
}

/** A stored schedule entry made safe, or null when it is not one. */
export function normalizeReviewState(raw: unknown): ReviewItemState | null {
  const src = plainObject(raw);
  const box = Math.floor(Number(src.box));
  if (!Number.isFinite(box) || box < 0 || !isDayKey(src.due)) return null;
  const state: ReviewItemState = { box, due: src.due };
  const last = isoOrUndefined(src.last);
  if (last) state.last = last;
  if (isDayKey(src.paid)) state.paid = src.paid;
  return state;
}

/** Every usable entry of a stored `review` map (own keys only; `__proto__` stays an ordinary key). */
export function normalizeReviewMap(raw: unknown): Record<string, ReviewItemState> {
  const src = plainObject(raw);
  const out: Record<string, ReviewItemState> = {};
  for (const id of Object.keys(src)) {
    const state = id ? normalizeReviewState(src[id]) : null;
    if (state) define(out, id, state);
  }
  return out;
}

/**
 * Where a question sits on the schedule: its stored entry (the box clamped to
 * the current list), else the state derived from its solve - or null when it
 * was never solved and never reviewed. `zone` is the learner's (the solve
 * day is counted there); `today` stands in for a solve time that is missing.
 */
export function reviewStateOf(
  progress: ReviewProgress | null | undefined,
  challengeId: string,
  rules: ScheduleRules = DEFAULT_REVIEW_SETTINGS,
  options: { zone?: string | null; today?: string | null } = {}
): ReviewItemState | null {
  const stored = hasOwn(progress?.review, challengeId) ? normalizeReviewState(progress!.review![challengeId]) : null;
  if (stored) return { ...stored, box: clampBox(stored.box, rules) };
  const attempt = hasOwn(progress?.attempts, challengeId) ? plainObject(progress!.attempts![challengeId]) : null;
  if (!attempt) return null;
  const list = intervalsOf(rules);
  const box = clampBox(Number(attempt.score) >= 100 ? rules.initialBox?.clean : rules.initialBox?.assisted, rules);
  const solvedAt = isoOrUndefined(attempt.solvedAt);
  const solvedDay = solvedAt ? dayKeyIn(options.zone ?? null, new Date(solvedAt)) : isDayKey(options.today) ? options.today : null;
  if (!solvedDay) return null;
  return { box, due: addDays(solvedDay, list[box]) };
}

/**
 * How the first answer to a question in a session went: wrong (to the end),
 * or right only after its answer was shown, is `missed`; right on the first
 * check with no hint is `clean`; any other right answer is `assisted`.
 */
export function outcomeOf(answer: { correct: boolean; attempts?: number; hintsUsed?: number; revealed?: boolean }): ReviewOutcome {
  if (!answer.correct || answer.revealed) return 'missed';
  return (Number(answer.attempts) || 1) <= 1 && (Number(answer.hintsUsed) || 0) <= 0 ? 'clean' : 'assisted';
}

/**
 * One review result on a question's schedule:
 *   clean     one box up (never past the last),
 *   assisted  the same box,
 *   missed    back to `wrongResetsToBox`,
 * due `intervalsDays[box]` days from `today`. The day XP was last paid is kept.
 */
export function applyReviewResult(
  state: ReviewItemState | null | undefined,
  outcome: ReviewOutcome,
  rules: ScheduleRules,
  today: string,
  at: string
): ReviewItemState {
  const list = intervalsOf(rules);
  const from = state ? clampBox(state.box, rules) : clampBox(rules.initialBox?.assisted, rules);
  const box =
    outcome === 'clean' ? Math.min(list.length - 1, from + 1) : outcome === 'assisted' ? from : clampBox(rules.wrongResetsToBox, rules);
  const next: ReviewItemState = { box, due: addDays(today, list[box]), last: at };
  if (state?.paid) next.paid = state.paid;
  return next;
}

/**
 * A received `review` map (a guest's, or this account's offline copy) folded
 * into the account's. Nothing is taken on trust:
 *   - only questions `known` says exist;
 *   - an entry needs a `last` time that is not in the future, and wins only
 *     when it is newer than the account's own;
 *   - its box is clamped to the current list, and its due day may not be
 *     further off than the longest interval from today;
 *   - `paid` is never taken from the browser (it only ever stops XP, and
 *     the merge's own review-log pricing sets it).
 */
export function mergeReviewStates(
  server: unknown,
  incoming: unknown,
  ctx: { known: (id: string) => boolean; rules: ScheduleRules; today: string; now: Date }
): Record<string, ReviewItemState> {
  const ours = normalizeReviewMap(server);
  const theirs = normalizeReviewMap(incoming);
  const latestMs = ctx.now.getTime() + 5 * 60_000;
  const list = intervalsOf(ctx.rules);
  const furthest = addDays(ctx.today, Math.max(...list));
  const out: Record<string, ReviewItemState> = {};
  for (const id of Object.keys(ours)) define(out, id, ours[id]);
  for (const id of Object.keys(theirs)) {
    const entry = theirs[id];
    if (!ctx.known(id) || !entry.last || Date.parse(entry.last) > latestMs) continue;
    const own = hasOwn(out, id) ? out[id] : null;
    if (own?.last && Date.parse(own.last) >= Date.parse(entry.last)) continue;
    const next: ReviewItemState = { box: clampBox(entry.box, ctx.rules), due: entry.due > furthest ? furthest : entry.due, last: entry.last };
    if (own?.paid) next.paid = own.paid;
    define(out, id, next);
  }
  return out;
}
