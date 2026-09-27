import React, { useCallback, useMemo } from 'react';
import { useSession } from '@/platform/session';
import { useToast } from '@/ui';
import { useNewBadges } from '../services/badgeWatcher';

/**
 * Mount once: toasts every badge the moment it is earned (with its tier, and
 * the badge sound). Renders nothing.
 *
 * While a lesson run is on screen the toast is held (`celebrateOrHold`): the
 * badge is marked seen at once, the run's end screen lists it, and the toast
 * only appears if the run is closed before that end screen.
 */
export const BadgeToaster: React.FC = () => {
  const { stats, stages, contentReady, settings, settingsRevision, playSound, celebrateOrHold } = useSession();
  const { notify } = useToast();
  const options = useMemo(() => ({ perfectRequiresNoHints: settings.units.perfectRequiresNoHints }), [settings.units.perfectRequiresNoHints]);
  useNewBadges(
    stats,
    stages,
    useCallback(
      (badge) => {
        celebrateOrHold(() => {
          notify(`Badge earned: ${badge.title}${badge.tierName ? ` (${badge.tierName})` : ''}`, 'success');
          playSound('badge');
        });
      },
      [notify, playSound, celebrateOrHold]
    ),
    contentReady,
    // A new settings revision re-reads what is already earned instead of toasting it.
    { badges: settings.badges, options, revision: settingsRevision }
  );
  return null;
};
