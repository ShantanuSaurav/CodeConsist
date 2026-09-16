import { useEffect, useRef } from 'react';
import type { Stage, UserStats } from '@/types';
import { achievements, type Achievement } from '@/platform/xp-leveling/insights';

/**
 * Badges earned since `seen` was recorded. Pure, so it is testable without
 * React; the hook below is the thin stateful wrapper.
 */
export function newlyEarned(seen: ReadonlySet<string>, stats: UserStats, stages: Stage[]): Achievement[] {
  return achievements(stats, stages).filter((a) => a.earnedAt && !seen.has(a.id));
}

/**
 * Notices when a badge is newly earned and reports it - the toast lives in
 * the caller so this stays a hook over stats. It works from state, not from
 * a specific event, so a badge earned through a merge or a session restore is
 * announced too.
 */
export function useNewBadges(stats: UserStats, stages: Stage[], onEarned: (badge: Achievement) => void): void {
  const seen = useRef<Set<string> | null>(null);

  useEffect(() => {
    if (seen.current === null) {
      // First render: everything already earned is old news.
      seen.current = new Set(achievements(stats, stages).filter((a) => a.earnedAt).map((a) => a.id));
      return;
    }
    for (const badge of newlyEarned(seen.current, stats, stages)) {
      seen.current.add(badge.id);
      onEarned(badge);
    }
  }, [stats, stages, onEarned]);
}
