import React, { Suspense, useState } from 'react';
import { useAppEvent } from '@/platform/events';
import type { AppEvents } from '@/platform/events';
import { useBodyScrollLock } from '@/ui';

/*
 * The modals download the first time one is opened. Most visits never open
 * either, and this listener is mounted on every visit, so it stays tiny.
 */
const AuthModal = React.lazy(() => import('./AuthModal').then((m) => ({ default: m.AuthModal })));
const SubscriptionModal = React.lazy(() => import('./SubscriptionModal').then((m) => ({ default: m.SubscriptionModal })));

/**
 * Hosts the sign-in and unlock modals. Anything in the app opens them by
 * emitting account:openAuth / account:openPro - nobody imports this module
 * for it. The openPro payload (which stage was locked, which tab) rides
 * along so the modal can lead with the right offer.
 */
export const AccountModals: React.FC = () => {
  const [authOpen, setAuthOpen] = useState(false);
  const [unlock, setUnlock] = useState<AppEvents['account:openPro'] | null>(null);
  useAppEvent('account:openAuth', () => setAuthOpen(true));
  useAppEvent('account:openPro', (payload) => setUnlock(payload ?? {}));
  useAppEvent('auth:signedIn', () => setAuthOpen(false));
  useBodyScrollLock(authOpen || unlock !== null);

  return (
    <Suspense fallback={null}>
      {authOpen && <AuthModal isOpen onClose={() => setAuthOpen(false)} />}
      {unlock && (
        <SubscriptionModal isOpen onClose={() => setUnlock(null)} stageId={unlock.stageId} trackId={unlock.trackId} initialTab={unlock.tab} />
      )}
    </Suspense>
  );
};
