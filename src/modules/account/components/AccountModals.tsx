import React, { Suspense, useState } from 'react';
import { useAppEvent } from '@/platform/events';
import type { AppEvents } from '@/platform/events';
import { MOTION, useBodyScrollLock, usePresence } from '@/ui';

/*
 * The modals download the first time one is opened. Most visits never open
 * either, and this listener is mounted on every visit, so it stays tiny.
 */
const AuthModal = React.lazy(() => import('./AuthModal').then((m) => ({ default: m.AuthModal })));
const SubscriptionModal = React.lazy(() => import('./SubscriptionModal').then((m) => ({ default: m.SubscriptionModal })));

type UnlockRequest = NonNullable<AppEvents['account:openPro']>;

/**
 * Hosts the sign-in and unlock modals. Anything in the app opens them by
 * emitting account:openAuth / account:openPro - nobody imports this module
 * for it. The openPro payload (which stage was locked, which tab) rides
 * along so the modal can lead with the right offer.
 *
 * Each modal stays mounted for its exit animation (usePresence) and is then
 * unmounted, so the next open starts from a clean form as it always did.
 * The unlock payload is kept separately from the open flag, so the offer on
 * screen does not change under the learner while the dialog fades out.
 */
export const AccountModals: React.FC = () => {
  const [authOpen, setAuthOpen] = useState(false);
  const [unlockOpen, setUnlockOpen] = useState(false);
  const [unlock, setUnlock] = useState<UnlockRequest>({});
  useAppEvent('account:openAuth', () => setAuthOpen(true));
  useAppEvent('account:openPro', (payload) => {
    setUnlock(payload ?? {});
    setUnlockOpen(true);
  });
  useAppEvent('auth:signedIn', () => setAuthOpen(false));

  const auth = usePresence(authOpen, MOTION.base);
  const pro = usePresence(unlockOpen, MOTION.base);
  // Held for as long as either dialog is on screen, exit included: letting go
  // mid-fade brings a classic scrollbar back and shifts the page under the scrim.
  useBodyScrollLock(auth.mounted || pro.mounted);

  return (
    <Suspense fallback={null}>
      {auth.mounted && <AuthModal isOpen={authOpen} onClose={() => setAuthOpen(false)} />}
      {pro.mounted && (
        <SubscriptionModal
          isOpen={unlockOpen}
          onClose={() => setUnlockOpen(false)}
          stageId={unlock.stageId}
          trackId={unlock.trackId}
          initialTab={unlock.tab}
        />
      )}
    </Suspense>
  );
};
