import { describe, expect, it, vi } from 'vitest';
import type { Stage, UserStats } from '@/types';
import { eventBus } from '@/platform/events';
import { DEFAULT_SETTINGS } from '@/platform/settings';
import { newlyEarned, seedSeen } from '../services/badgeWatcher';

const stats = (solved: string[]): UserStats => ({
  xp: solved.length * 40,
  level: 1,
  streak: 1,
  bestStreak: 1,
  lastActiveDay: '2026-09-17',
  completedChallenges: solved,
  completedStages: [],
  seenConcepts: [],
  attempts: Object.fromEntries(
    solved.map((id, i) => [id, { challengeId: id, score: 100, attempts: 1, hintsUsed: 0, solvedAt: `2026-09-17T10:0${i}:00.000Z` }])
  )
});

describe('badge watcher', () => {
  it('reports only badges earned since the seen set', () => {
    const first = newlyEarned(new Set(), stats(['a']), [] as Stage[]);
    expect(first.map((b) => b.id)).toEqual(['first-solve']);

    const seen = new Set(first.map((b) => b.id));
    expect(newlyEarned(seen, stats(['a']), [])).toEqual([]);

    const ten = newlyEarned(seen, stats(Array.from({ length: 10 }, (_, i) => `c${i}`)), []);
    expect(ten.map((b) => b.id)).toEqual(['solved-10']);
  });
});

/**
 * Cross-module integration through the bus: a solve announced by the session
 * reaches a subscriber that knows nothing about who emitted it.
 */
describe('challenge:completed over the event bus', () => {
  it('reaches every subscriber with the payload', () => {
    const leaderboardRefresh = vi.fn();
    const off = eventBus.on('challenge:completed', (p) => {
      if (p.xpEarned > 0) leaderboardRefresh(p.challenge.id);
    });

    eventBus.emit('challenge:completed', {
      challenge: { id: 'stage-1-a01' } as any,
      xpEarned: 40,
      attempts: 1,
      hintsUsed: 0,
      firstTime: true
    });
    eventBus.emit('challenge:completed', { challenge: { id: 'stage-1-a01' } as any, xpEarned: 0, attempts: 1, hintsUsed: 0, firstTime: false });

    expect(leaderboardRefresh).toHaveBeenCalledTimes(1);
    expect(leaderboardRefresh).toHaveBeenCalledWith('stage-1-a01');
    off();
    expect(eventBus.listenerCount('challenge:completed')).toBe(0);
  });
});

/* ------------------------------------------------------------ Phase 2 */

describe('tiered badges', () => {
  const withStreak = (best: number): UserStats => ({ ...stats(['a']), bestStreak: best, lastActiveDay: '2026-09-20' });

  it('reports each tier with its name, family and progress, under the old ids', () => {
    const earned = newlyEarned(new Set(['first-solve']), withStreak(8), []);
    expect(earned.map((b) => [b.id, b.tierName, b.family])).toEqual([
      ['streak-3', 'Bronze', 'streak'],
      ['streak-7', 'Silver', 'streak']
    ]);
    expect(earned[1].progress).toEqual({ value: 8, next: 7, previous: 3 });
  });

  it('bursts nothing after the badge rules change: the watcher reseeds from what is earned', () => {
    // An admin lowers the first streak tier from 3 to 1 days: under the new
    // rules `streak-1` is earned at once, but it is not news.
    const lowered = { ...DEFAULT_SETTINGS.badges, families: DEFAULT_SETTINGS.badges.families.map((f) => (f.id === 'streak' ? { ...f, tiers: [1, 3, 7] } : f)) };
    const learner = withStreak(2);
    const before = seedSeen(learner, [], DEFAULT_SETTINGS.badges);
    expect(newlyEarned(before, learner, [], lowered).map((b) => b.id)).toEqual(['streak-1']);
    const reseeded = seedSeen(learner, [], lowered);
    expect(newlyEarned(reseeded, learner, [], lowered)).toEqual([]);
  });

  it('leaves a switched-off family out', () => {
    const off = { ...DEFAULT_SETTINGS.badges, families: DEFAULT_SETTINGS.badges.families.map((f) => (f.id === 'streak' ? { ...f, enabled: false } : f)) };
    expect(newlyEarned(new Set(), withStreak(30), [], off).some((b) => b.family === 'streak')).toBe(false);
  });
});
