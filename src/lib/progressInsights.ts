/* ==========================================================================
   Derived facts about a player's progress that several screens share:
   rank titles, today's activity, the activity heatmap, recent achievements.
   Pure functions over UserStats and content so they are trivial to test.
   ========================================================================== */
import type { Challenge, Stage, UserStats } from '../types';
import { dayKey } from './leveling';

/** A name for each band of levels. Purely cosmetic. */
export function rankTitle(level: number): string {
  if (level >= 20) return 'Principal Engineer';
  if (level >= 15) return 'Staff Engineer';
  if (level >= 10) return 'Senior Developer';
  if (level >= 6) return 'Developer';
  if (level >= 3) return 'Junior Developer';
  return 'Apprentice';
}

/** The level at which the next rank title starts, or null at the top. */
export function nextRankLevel(level: number): number | null {
  for (const threshold of [3, 6, 10, 15, 20]) if (level < threshold) return threshold;
  return null;
}

/** Local day key for an ISO timestamp. */
export function dayOf(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : dayKey(d);
}

/** Challenge ids solved on a given local day (default today). */
export function solvedOn(stats: UserStats, day: string = dayKey()): string[] {
  return Object.values(stats.attempts)
    .filter((a) => dayOf(a.solvedAt) === day)
    .map((a) => a.challengeId);
}

/** XP earned on a given day, from the challenges' rewards and the recorded score. */
export function xpEarnedOn(stats: UserStats, byId: (id: string) => Challenge | undefined, day: string = dayKey()): number {
  let total = 0;
  for (const a of Object.values(stats.attempts)) {
    if (dayOf(a.solvedAt) !== day) continue;
    const c = byId(a.challengeId);
    if (c) total += Math.round((c.xpReward * a.score) / 100);
  }
  return total;
}

export interface HeatCell {
  day: string;
  count: number;
  /** 0-4 intensity bucket for colouring. */
  level: 0 | 1 | 2 | 3 | 4;
}

/**
 * GitHub-style activity grid: `weeks` columns of seven days ending today.
 * Returned column-major (weeks[w][d]), oldest week first, Monday first.
 */
export function activityGrid(stats: UserStats, weeks = 14): HeatCell[][] {
  const counts = new Map<string, number>();
  for (const a of Object.values(stats.attempts)) {
    const day = dayOf(a.solvedAt);
    if (day) counts.set(day, (counts.get(day) ?? 0) + 1);
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  // Monday = 0 … Sunday = 6, so the grid lines up with a normal week.
  const weekday = (today.getDay() + 6) % 7;
  const start = new Date(today);
  start.setDate(today.getDate() - weekday - (weeks - 1) * 7);

  const grid: HeatCell[][] = [];
  for (let w = 0; w < weeks; w++) {
    const column: HeatCell[] = [];
    for (let d = 0; d < 7; d++) {
      const date = new Date(start);
      date.setDate(start.getDate() + w * 7 + d);
      const key = dayKey(date);
      const count = date > today ? 0 : counts.get(key) ?? 0;
      const level = count === 0 ? 0 : count <= 2 ? 1 : count <= 5 ? 2 : count <= 9 ? 3 : 4;
      column.push({ day: key, count, level });
    }
    grid.push(column);
  }
  return grid;
}

export interface Achievement {
  id: string;
  title: string;
  detail: string;
  /** ISO timestamp it was earned, for ordering; null if not yet. */
  earnedAt: string | null;
  kind: 'streak' | 'stage' | 'first' | 'xp' | 'test';
}

/**
 * Milestones with the timestamp they were actually reached, most recent
 * first. Unearned milestones are appended with earnedAt null so a screen can
 * show what is next.
 */
export function achievements(stats: UserStats, stages: Stage[]): Achievement[] {
  const attempts = Object.values(stats.attempts).sort((a, b) => a.solvedAt.localeCompare(b.solvedAt));
  const out: Achievement[] = [];

  out.push({
    id: 'first-solve',
    kind: 'first',
    title: 'First solve',
    detail: 'Solved your first challenge',
    earnedAt: attempts[0]?.solvedAt ?? null
  });

  for (const n of [10, 50, 100, 200]) {
    out.push({
      id: `solved-${n}`,
      kind: 'xp',
      title: `${n} challenges solved`,
      detail: `Cleared ${n} lessons and tests`,
      earnedAt: attempts[n - 1]?.solvedAt ?? null
    });
  }

  for (const stage of stages) {
    const test = stage.test;
    const passed = test ? stats.attempts[test.id] : undefined;
    out.push({
      id: `stage-${stage.id}`,
      kind: 'stage',
      title: `Stage ${stage.index} cleared`,
      detail: test ? `Passed "${test.title}"` : stage.name,
      earnedAt: stage.state === 'Completed' ? passed?.solvedAt ?? attempts[attempts.length - 1]?.solvedAt ?? null : null
    });
  }

  for (const n of [3, 7, 14, 30]) {
    out.push({
      id: `streak-${n}`,
      kind: 'streak',
      title: `${n}-day streak`,
      detail: `Practised ${n} days in a row`,
      // Streak history is not stored, so the best streak is the only evidence.
      earnedAt: stats.bestStreak >= n ? stats.lastActiveDay ?? null : null
    });
  }

  return out.sort((a, b) => {
    if (a.earnedAt && b.earnedAt) return b.earnedAt.localeCompare(a.earnedAt);
    if (a.earnedAt) return -1;
    if (b.earnedAt) return 1;
    return 0;
  });
}

/** "3 days ago", "today", … for an ISO timestamp. */
export function relativeDay(iso: string, now: Date = new Date()): string {
  const day = dayOf(iso);
  if (!day) return '';
  const then = new Date(day + 'T00:00:00');
  const today = new Date(dayKey(now) + 'T00:00:00');
  const diff = Math.round((today.getTime() - then.getTime()) / 86_400_000);
  if (diff <= 0) return 'today';
  if (diff === 1) return 'yesterday';
  if (diff < 30) return `${diff} days ago`;
  const months = Math.round(diff / 30);
  return months === 1 ? 'a month ago' : `${months} months ago`;
}

/** Time-of-day greeting. */
export function greeting(now: Date = new Date()): string {
  const h = now.getHours();
  if (h < 5) return 'Burning the midnight oil';
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}
