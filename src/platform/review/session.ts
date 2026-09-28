/* ==========================================================================
   Building a Practice session: which solved questions to go over now.

   Three buckets, in priority order:
     1. mistakes - an open miss (never cleared by a clean review answer)
        whose last miss was before today and inside `mistakeWindowDays`,
        most missed first; at most `mix.mistakes`;
     2. due      - due on the schedule (./schedule `reviewStateOf`) on or
        before today, longest overdue first; at most `mix.due`;
     3. weak     - never reviewed, and solved with a low score or many
        hints, lowest score first; they fill the session up to
        `sessionSize.max`.
   A session smaller than `sessionSize.min` is topped up from the mistakes and
   due questions the mix left out. Only questions the learner has solved,
   never a stage test, never a kind outside `itemTypes`, and never one seen
   today: missed today, or already practised today (its schedule entry was
   answered or paid today) - so a question answered with help, whose mistake
   stays open, is not served again straight away, and a session (and its
   bonus) cannot be built twice from the same question in one day. It comes
   back from tomorrow. The order is shuffled with a seed, so the same seed
   builds the same session.

   Pure and shared by the server (POST /api/review/session) and the browser
   (a guest's, or an offline learner's, session - id `local-<ts>`).
   ========================================================================== */
import type { Challenge, MissSummary, ReviewItem, ReviewReason } from '@/types';
import type { ReviewSettings } from '../settings/types';
import { addDays, dayKeyIn, daysBetween, isDayKey } from '../time/days';
import { normalizeReviewState, reviewStateOf } from './schedule';
import type { ReviewProgress } from './schedule';

/** What the builder needs to know about a question in the bank. */
export type ReviewBankItem = Pick<Challenge, 'id' | 'type' | 'stageId'> & Partial<Pick<Challenge, 'isStageTest' | 'locked'>>;

/** What the builder reads from a learner's miss summaries. */
export type ReviewMiss = Pick<MissSummary, 'open' | 'lastDay' | 'count'> & Partial<Pick<MissSummary, 'lastAt'>>;

export interface BuildReviewSessionInput {
  progress: ReviewProgress | null | undefined;
  /** `activity.misses`: the learner's miss summaries. */
  misses?: Record<string, ReviewMiss> | null;
  /** The questions this learner may see (the server leaves out premium stages they have not unlocked). */
  bank: readonly ReviewBankItem[];
  settings: ReviewSettings;
  /** The learner's day. */
  today: string;
  seed: string | number;
  /** The learner's zone (solve days are counted in it). */
  zone?: string | null;
  /** Only this stage's questions ("Practice this stage"). */
  stageId?: string | null;
}

export interface ReviewSessionPlan {
  items: ReviewItem[];
  /** The earliest day after today a question falls due - "next review" when there is nothing now. */
  nextDueDay: string | null;
  /** How many questions each bucket held before the mix and the size limits. */
  pool: Record<ReviewReason, number>;
}

function hasOwn(map: object | null | undefined, key: string): boolean {
  return Boolean(map) && Object.prototype.hasOwnProperty.call(map, key);
}

function whole(value: unknown, fallback: number, min = 0): number {
  const n = Math.floor(Number(value));
  return Number.isFinite(n) ? Math.max(min, n) : fallback;
}

/** A 32-bit hash of the seed (FNV-1a). */
function hashSeed(seed: string | number): number {
  const text = String(seed);
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** A small seeded generator (mulberry32): the same seed gives the same sequence. */
function randomFrom(seed: string | number): () => number {
  let a = hashSeed(seed);
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A copy of `list` in an order fixed by `seed` (Fisher-Yates). */
export function seededShuffle<T>(list: readonly T[], seed: string | number): T[] {
  const out = [...list];
  const next = randomFrom(seed);
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * The questions a session may use: solved, not a stage test, not a locked
 * stub, of an allowed kind (and in the stage, when one is asked for).
 */
export function reviewCandidates(input: Pick<BuildReviewSessionInput, 'progress' | 'bank' | 'settings' | 'stageId'>): ReviewBankItem[] {
  const types = new Set(Array.isArray(input.settings.itemTypes) ? input.settings.itemTypes : []);
  const solved = new Set(input.progress?.completedChallenges ?? []);
  const seen = new Set<string>();
  return input.bank.filter((c) => {
    if (!c || seen.has(c.id)) return false;
    seen.add(c.id);
    if (c.isStageTest || c.locked || !types.has(c.type) || !solved.has(c.id)) return false;
    return !input.stageId || c.stageId === input.stageId;
  });
}

/** Build a session (see the top of this file). */
export function buildReviewSession(input: BuildReviewSessionInput): ReviewSessionPlan {
  const s = input.settings;
  const today = input.today;
  const misses = input.misses ?? {};
  const scheduleOptions = { zone: input.zone ?? null, today };
  const missOf = (id: string): ReviewMiss | null => (hasOwn(misses, id) ? misses[id] : null);
  const windowDays = whole(s.mistakeWindowDays, 30, 1);

  const tomorrow = addDays(today, 1);
  /** An open mistake that counts on `day`: last missed before it, inside the window. */
  const isMistakeOn = (miss: ReviewMiss | null, day: string): boolean =>
    Boolean(miss && miss.open && isDayKey(miss.lastDay) && miss.lastDay < day && daysBetween(miss.lastDay, day) <= windowDays);
  /** Practised today: its stored schedule entry was answered (`last`) or paid today. */
  const practisedToday = (id: string): boolean => {
    const stored = hasOwn(input.progress?.review, id) ? normalizeReviewState(input.progress!.review![id]) : null;
    if (!stored) return false;
    return stored.paid === today || (stored.last !== undefined && dayKeyIn(input.zone ?? null, new Date(stored.last)) === today);
  };

  const mistakes: Array<{ id: string; count: number; lastAt: number }> = [];
  const due: Array<{ id: string; due: string }> = [];
  const weak: Array<{ id: string; score: number }> = [];
  let nextDueDay: string | null = null;
  /** The earlier of the day so far and `day`, when `day` is after today. */
  const earliest = (sofar: string | null, day: string): string | null => (day > today && (!sofar || day < sofar) ? day : sofar);

  for (const c of reviewCandidates(input)) {
    const miss = missOf(c.id);
    const state = reviewStateOf(input.progress, c.id, s, scheduleOptions);
    // Seen today (missed, or practised): not again until tomorrow - as a
    // mistake when one is still open, else on its schedule.
    if (miss?.lastDay === today || practisedToday(c.id)) {
      if (isMistakeOn(miss, tomorrow)) nextDueDay = earliest(nextDueDay, tomorrow);
      else if (state) nextDueDay = earliest(nextDueDay, state.due > today ? state.due : tomorrow);
      continue;
    }
    if (state) nextDueDay = earliest(nextDueDay, state.due);

    if (miss && isMistakeOn(miss, today)) {
      mistakes.push({ id: c.id, count: Number(miss.count) || 0, lastAt: Date.parse(miss.lastAt ?? '') || 0 });
      continue;
    }
    if (state && state.due <= today) {
      due.push({ id: c.id, due: state.due });
      continue;
    }
    const reviewed = hasOwn(input.progress?.review, c.id);
    const attempt = hasOwn(input.progress?.attempts, c.id) ? input.progress!.attempts![c.id] : null;
    if (!reviewed && attempt) {
      const score = Number(attempt.score);
      const hints = Number(attempt.hintsUsed) || 0;
      if ((Number.isFinite(score) && score < s.weak.scoreBelow) || hints >= s.weak.hintsAtLeast) {
        weak.push({ id: c.id, score: Number.isFinite(score) ? score : 0 });
      }
    }
  }

  const byId = (a: { id: string }, b: { id: string }) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  mistakes.sort((a, b) => b.count - a.count || b.lastAt - a.lastAt || byId(a, b));
  due.sort((a, b) => (a.due < b.due ? -1 : a.due > b.due ? 1 : byId(a, b)));
  weak.sort((a, b) => a.score - b.score || byId(a, b));

  const max = whole(s.sessionSize?.max, 8, 1);
  const min = Math.min(max, whole(s.sessionSize?.min, 5, 1));
  const takeMistakes = Math.min(mistakes.length, whole(s.mix?.mistakes, 3));
  const takeDue = Math.min(due.length, whole(s.mix?.due, 4));

  const picked: ReviewItem[] = [
    ...mistakes.slice(0, takeMistakes).map((m) => ({ challengeId: m.id, reason: 'mistake' as const })),
    ...due.slice(0, takeDue).map((d) => ({ challengeId: d.id, reason: 'due' as const }))
  ].slice(0, max);
  for (const w of weak) {
    if (picked.length >= max) break;
    picked.push({ challengeId: w.id, reason: 'weak' });
  }
  // Too small a session: the mistakes and due questions the mix left out come in, up to the minimum.
  const leftovers: ReviewItem[] = [
    ...mistakes.slice(takeMistakes).map((m) => ({ challengeId: m.id, reason: 'mistake' as const })),
    ...due.slice(takeDue).map((d) => ({ challengeId: d.id, reason: 'due' as const }))
  ];
  for (const item of leftovers) {
    if (picked.length >= min) break;
    picked.push(item);
  }

  return {
    items: seededShuffle(picked, input.seed),
    nextDueDay,
    pool: { mistake: mistakes.length, due: due.length, weak: weak.length }
  };
}
