import { useEffect, useRef } from 'react';
import type { Stage, UserStats } from '@/types';
import { achievements, type Achievement, type BadgeOptions } from '@/platform/xp-leveling/insights';
import type { BadgeSettings } from '@/platform/settings';

/** Every badge already earned - the "seen" set a watcher starts from. */
export function seedSeen(stats: UserStats, stages: Stage[], badges?: BadgeSettings, options?: BadgeOptions): Set<string> {
  return new Set(achievements(stats, stages, badges, options).filter((a) => a.earnedAt).map((a) => a.id));
}

/**
 * Badges earned since `seen` was recorded. Pure, so it is testable without
 * React; the hook below is the thin stateful wrapper.
 */
export function newlyEarned(seen: ReadonlySet<string>, stats: UserStats, stages: Stage[], badges?: BadgeSettings, options?: BadgeOptions): Achievement[] {
  return achievements(stats, stages, badges, options).filter((a) => a.earnedAt && !seen.has(a.id));
}

export interface BadgeRules {
  badges?: BadgeSettings;
  options?: BadgeOptions;
  /**
   * The settings revision the badge rules came from. When it changes (an
   * admin lowered a tier, added a family), everything earned under the new
   * rules is taken as already seen: a rules edit must never set off a burst
   * of badge toasts.
   */
  revision?: number | null;
}

/**
 * Notices when a badge is newly earned and reports it - the toast lives in
 * the caller so this stays a hook over stats. It works from state, not from
 * a specific event, so a badge earned through a merge or a session restore is
 * announced too. Pass `ready = false` while the stages are not loaded yet.
 */
export function useNewBadges(
  stats: UserStats,
  stages: Stage[],
  onEarned: (badge: Achievement) => void,
  ready = true,
  rules: BadgeRules = {}
): void {
  const seen = useRef<Set<string> | null>(null);
  const seenRevision = useRef<number | null | undefined>(undefined);

  useEffect(() => {
    // Until the content bank arrives, stage badges cannot be judged; seeding
    // "seen" from an empty stage list would re-announce every one of them.
    if (!ready) return;
    if (seen.current === null || seenRevision.current !== rules.revision) {
      // First render, or new badge rules: everything already earned is old news.
      seen.current = seedSeen(stats, stages, rules.badges, rules.options);
      seenRevision.current = rules.revision;
      return;
    }
    for (const badge of newlyEarned(seen.current, stats, stages, rules.badges, rules.options)) {
      seen.current.add(badge.id);
      onEarned(badge);
    }
  }, [stats, stages, onEarned, ready, rules.badges, rules.options, rules.revision]);
}
