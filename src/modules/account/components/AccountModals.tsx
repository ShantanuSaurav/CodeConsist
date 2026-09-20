import React, { Suspense, useState } from 'react';
import { useAppEvent } from '@/platform/events';
import { useBodyScrollLock } from '@/ui';

/*
 * The modals download the first time one is opened. Most visits never open
 * either, and this listener is mounted on every visit, so it stays tiny.
 */
const AuthModal = React.lazy(() => import('./AuthModal').then((m) => ({ default: m.AuthModal })));
const SubscriptionModal = React.lazy(() => import('./SubscriptionModal').then((m) => ({ default: m.SubscriptionModal })));

/**
 * Hosts the sign-in and Pro modals. Anything in the app opens them by emitting
 * account:openAuth / account:openPro - nobody imports this module for it.
 */
export const AccountModals: React.FC = () => {
  const [authOpen, setAuthOpen] = useState(false);
  const [proOpen, setProOpen] = useState(false);
  useAppEvent('account:openAuth', () => setAuthOpen(true));
  useAppEvent('account:openPro', () => setProOpen(true));
  useAppEvent('auth:signedIn', () => setAuthOpen(false));
  useBodyScrollLock(authOpen || proOpen);

  return (
    <Suspense fallback={null}>
      {authOpen && <AuthModal isOpen onClose={() => setAuthOpen(false)} />}
      {proOpen && <SubscriptionModal isOpen onClose={() => setProOpen(false)} />}
    </Suspense>
  );
};
