import React, { useCallback } from 'react';
import { useSession } from '@/platform/session';
import { useToast } from '@/ui';
import { useNewBadges } from '../services/badgeWatcher';

/**
 * Mount once: toasts every badge the moment it is earned. Renders nothing.
 * A badge is news, not a party - it uses the ordinary toast (rise in, slide
 * out), with no confetti or sound of its own.
 */
export const BadgeToaster: React.FC = () => {
  const { stats, stages, contentReady } = useSession();
  const { notify } = useToast();
  useNewBadges(
    stats,
    stages,
    useCallback((badge) => notify(`Badge earned: ${badge.title}`, 'success'), [notify]),
    contentReady
  );
  return null;
};
