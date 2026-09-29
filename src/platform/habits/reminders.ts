/* ==========================================================================
   In-app reminders: which one banner a learner sees, and its words.

   At most one banner at a time, in this order:
     1. welcome back   - away for a while (the longest tier that applies)
     2. streak broken  - a repair is on offer: how many lessons, by when
     3. freeze used    - a freeze kept the streak alive over a missed day
     4. at risk        - a live streak, today not counted yet, and late enough
     5. league result  - last week's place in the weekly league (Phase 6),
                         once that week has closed
   Each can be dismissed (the streak ones for the day, the league result for
   that week); the caller says which are.

   Texts come from `settings.reminders` through `fillCopy`, so every word is
   the admin's. Pure: the browser's HabitBanner renders what this returns.
   ========================================================================== */
import type { ReminderSettings, WelcomeBackTier } from '../settings/types';
import { fillCopy } from '../settings/copy';
import type { LeagueOutcome } from '@/types';
import type { HabitStatus } from './types';

export type HabitBannerKind = 'welcomeBack' | 'streakBroken' | 'freezeUsed' | 'atRisk' | 'leagueResult';

/** A learner's result in the last closed league week (LeagueView['lastResult']). */
export interface LeagueResultInfo {
  weekId: string;
  rank: number;
  xp: number;
  outcome: LeagueOutcome;
  /** The tier moved to or stayed in (tiers on), else null. */
  tierName: string | null;
}

export interface HabitBanner {
  kind: HabitBannerKind;
  title: string;
  body: string;
  /** The button's words (it opens the next lesson), or null for none. */
  cta: string | null;
  /** What dismissing it records: `${kind}:${day}` (`leagueResult:${weekId}` for the league). */
  key: string;
}

/**
 * Admin copy with every `{name}` taken out, with the comma or space before
 * it: "Welcome back, {name}!" reads "Welcome back!", and "{name}, you are
 * back" reads "You are back".
 */
export function withoutName(copy: string): string {
  if (!copy.includes('{name}')) return copy;
  const out = copy.replace(/[,\s]*\{name\}/g, '').replace(/^[,\s]+/, '');
  return out.charAt(0).toUpperCase() + out.slice(1);
}

/** The welcome-back message for a learner away `daysAway` days: the tier with the largest `minDays` that applies. */
export function welcomeBackTier(tiers: WelcomeBackTier[] | null | undefined, daysAway: number | null | undefined): WelcomeBackTier | null {
  if (!Array.isArray(tiers) || typeof daysAway !== 'number' || !Number.isFinite(daysAway)) return null;
  let best: WelcomeBackTier | null = null;
  for (const tier of tiers) {
    if (tier && daysAway >= tier.minDays && (!best || tier.minDays > best.minDays)) best = tier;
  }
  return best;
}

export interface BannerOptions {
  /**
   * The learner's name for `{name}`, or null for a guest: the placeholder
   * is then left out with the comma or space before it ("Welcome back,
   * {name}" reads "Welcome back").
   */
  name: string | null;
  /** Has the learner dismissed this banner today? */
  dismissed?: (key: string) => boolean;
  /** How a day key is written in a sentence (`{deadline}`, `{days}`); the key itself when left out. */
  formatDay?: (day: string) => string;
  /** Last week's league result (signed in, once that week closed), or null. */
  leagueResult?: LeagueResultInfo | null;
}

/**
 * Last week's league result as a banner, or null (off, or nothing to say).
 * With tiers the text says where the learner went; a tier outcome with no
 * tier name falls back to the plain sentence.
 */
export function leagueResultBanner(result: LeagueResultInfo | null | undefined, reminders: ReminderSettings): HabitBanner | null {
  const copy = reminders.leagueResult;
  if (!copy?.enabled || !result || !Number.isFinite(result.rank) || result.rank < 1) return null;
  const vars = { rank: result.rank, xp: result.xp, tier: result.tierName ?? '' };
  const template = result.outcome !== 'single' && result.tierName ? copy[result.outcome] : copy.single;
  const title = fillCopy(template, vars);
  if (!title) return null;
  return { kind: 'leagueResult', title, body: '', cta: null, key: `leagueResult:${result.weekId}` };
}

/**
 * The banner to show now, or null. Reads only the derived status (so it
 * agrees with every other screen) and the admin's reminder texts.
 */
export function pickHabitBanner(status: HabitStatus | null | undefined, reminders: ReminderSettings, options: BannerOptions): HabitBanner | null {
  const isDismissedAny = options.dismissed ?? (() => false);
  const league = leagueResultBanner(options.leagueResult, reminders);
  if (!status) return league && !isDismissedAny(league.key) ? league : null;
  const day = status.day;
  const format = options.formatDay ?? ((d: string) => d);
  const isDismissed = options.dismissed ?? (() => false);
  const candidates: HabitBanner[] = [];

  // 1. Welcome back: away at least the first tier's days, and not back yet today.
  if (reminders.welcomeBack.enabled && !status.activeToday) {
    const tier = welcomeBackTier(reminders.welcomeBack.tiers, status.daysAway);
    if (tier) {
      const vars = { name: options.name ?? '', days: status.daysAway ?? 0, bestStreak: status.bestStreak };
      const text = (copy: string) => fillCopy(options.name ? copy : withoutName(copy), vars);
      candidates.push({
        kind: 'welcomeBack',
        title: text(tier.title),
        body: text(tier.body),
        cta: reminders.welcomeBack.cta || null,
        key: `welcomeBack:${day}`
      });
    }
  }

  // 2. The streak ended and can still be repaired.
  if (status.repair && status.repair.remaining > 0) {
    candidates.push({
      kind: 'streakBroken',
      title: fillCopy(reminders.streakBroken.title, { lostStreak: status.repair.lostStreak }),
      body: fillCopy(reminders.streakBroken.body, { remaining: status.repair.remaining, deadline: format(status.repair.deadline) }),
      cta: reminders.streakBroken.cta || null,
      key: `streakBroken:${day}`
    });
  }

  // 3. A freeze covered a missed day.
  if (status.frozenNow.length > 0 && status.streak > 0) {
    candidates.push({
      kind: 'freezeUsed',
      title: fillCopy(reminders.freezeUsed, { streak: status.streak, days: status.frozenNow.map(format).join(', ') }),
      body: '',
      cta: null,
      key: `freezeUsed:${day}`
    });
  }

  // 4. At risk (habitStatus already applied `atRisk.enabled` and the hour).
  if (status.atRisk) {
    const covered = status.freezesEnabled && status.freezes > 0;
    candidates.push({
      kind: 'atRisk',
      title: fillCopy(reminders.atRisk.title, { streak: status.streak }),
      body: covered
        ? fillCopy(reminders.atRisk.bodyWithFreeze, { freezes: status.freezes })
        : fillCopy(reminders.atRisk.body, { streak: status.streak, hoursLeft: status.hoursLeft }),
      cta: reminders.atRisk.cta || null,
      key: `atRisk:${day}`
    });
  }

  // 5. Last week's league result: the least urgent, so it waits behind the streak.
  if (league) candidates.push(league);

  return candidates.find((banner) => !isDismissed(banner.key)) ?? null;
}
