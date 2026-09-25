/**
 * Levels and rank titles bound to the CURRENT settings (`settings.levels`),
 * so every screen shows the curve and titles the admin set - not the
 * built-in defaults. Use this rather than importing levelFromXp/rankTitle
 * from xp-leveling directly in a component.
 */
import { useMemo } from 'react';
import { levelFromXp, levelProgress, xpForLevel } from '../xp-leveling/leveling';
import { nextRankLevel, rankTitle } from '../xp-leveling/insights';
import { useSession } from './SessionProvider';

export interface Leveling {
  levelFromXp: (xp: number) => number;
  levelProgress: (xp: number) => ReturnType<typeof levelProgress>;
  xpForLevel: (level: number) => number;
  rankTitle: (level: number) => string;
  nextRankLevel: (level: number) => number | null;
}

export function useLeveling(): Leveling {
  const { settings } = useSession();
  const levels = settings.levels;
  return useMemo(
    () => ({
      levelFromXp: (xp: number) => levelFromXp(xp, levels),
      levelProgress: (xp: number) => levelProgress(xp, levels),
      xpForLevel: (level: number) => xpForLevel(level, levels),
      rankTitle: (level: number) => rankTitle(level, levels.ranks),
      nextRankLevel: (level: number) => nextRankLevel(level, levels.ranks)
    }),
    [levels]
  );
}
