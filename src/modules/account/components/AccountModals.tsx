import React, { useState } from 'react';
import { useAppEvent } from '@/platform/events';
import { useBodyScrollLock } from '@/ui';
import { AuthModal } from './AuthModal';
import { SubscriptionModal } from './SubscriptionModal';

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
    <>
      <AuthModal isOpen={authOpen} onClose={() => setAuthOpen(false)} />
      <SubscriptionModal isOpen={proOpen} onClose={() => setProOpen(false)} />
    </>
  );
};
