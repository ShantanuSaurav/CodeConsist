import React from 'react';
import { X } from 'lucide-react';
import { useSession } from '@/platform/session';
import { pickHabitBanner } from '@/platform/habits';
import type { HabitBannerKind } from '@/platform/habits';
import { formatDayLabel } from '@/platform/time/days';
import { intents } from '@/platform/events';
import { Button } from '@/ui';

const TONE: Record<HabitBannerKind, string> = {
  welcomeBack: '',
  streakBroken: 'tone-warning',
  freezeUsed: 'tone-info',
  atRisk: 'tone-warning',
  leagueResult: 'tone-info'
};

/**
 * One in-app reminder at a time, under the guest banner: welcome back, a
 * broken streak that can still be repaired, a freeze that kept the streak
 * alive, a streak at risk this evening, or last week's league result - in
 * that order of priority. Each can be dismissed (for the day; the league
 * result for good). Every word is the admin's
 * (`settings.reminders`); which one shows is the habits engine's call
 * (`pickHabitBanner`), from the same derived status every screen reads.
 */
export const HabitBanner: React.FC = () => {
  const { habits, settings, user, league, isHabitBannerDismissed, dismissHabitBanner } = useSession();
  // A guest has no name: a "{name}" in the admin's text is left out.
  const name = user && user.provider !== 'guest' ? user.username : null;
  const banner = pickHabitBanner(habits, settings.reminders, {
    name,
    dismissed: isHabitBannerDismissed,
    formatDay: (day) => formatDayLabel(day),
    // Last week's result, once that week has closed (signed in; the league on).
    leagueResult: name && league?.enabled ? league.lastResult : null
  });
  if (!banner) return null;
  const dismissLabel = banner.kind === 'leagueResult' ? 'Dismiss' : 'Dismiss for today';
  return (
    <div className={`habit-banner ${TONE[banner.kind]}`.trim()} role="status" data-banner={banner.kind}>
      <div className="habit-banner-text">
        <span className="habit-banner-title">{banner.title}</span>
        {banner.body && <span className="habit-banner-body">{banner.body}</span>}
      </div>
      <div className="habit-banner-actions">
        {banner.cta && (
          <Button variant="primary" size="sm" onClick={() => intents.openPractice()}>
            {banner.cta}
          </Button>
        )}
        <Button variant="ghost" size="sm" icon onClick={() => dismissHabitBanner(banner.key)} aria-label={dismissLabel} title={dismissLabel}>
          <X size={15} />
        </Button>
      </div>
    </div>
  );
};
