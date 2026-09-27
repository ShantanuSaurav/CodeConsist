/* ==========================================================================
   In-app reminders: which one banner a learner sees, and its words.

   At most one banner at a time, in this order:
     1. welcome back   - away for a while (the longest tier that applies)
     2. streak broken  - a repair is on offer: how many lessons, by when
     3. freeze used    - a freeze kept the streak alive over a missed day
     4. at risk        - a live streak, today not counted yet, and late enough
   Each can be dismissed for the day; the caller says which are.

   Texts come from `settings.reminders` through `fillCopy`, so every word is
   the admin's. Pure: the browser's HabitBanner renders what this returns.
   ========================================================================== */
import type { ReminderSettings, WelcomeBackTier } from '../settings/types';
import { fillCopy } from '../settings/copy';
import type { HabitStatus } from './types';

export type HabitBannerKind = 'welcomeBack' | 'streakBroken' | 'freezeUsed' | 'atRisk';

export interface HabitBanner {
  kind: HabitBannerKind;
  title: string;
  body: string;
  /** The button's words (it opens the next lesson), or null for none. */
  cta: string | null;
  /** What dismissing it for the day records: `${kind}:${day}`. */
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
}

/**
 * The banner to show now, or null. Reads only the derived status (so it
 * agrees with every other screen) and the admin's reminder texts.
 */
export function pickHabitBanner(status: HabitStatus | null | undefined, reminders: ReminderSettings, options: BannerOptions): HabitBanner | null {
  if (!status) return null;
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

  return candidates.find((banner) => !isDismissed(banner.key)) ?? null;
}
