import React, { Suspense, useEffect, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Menu, X } from 'lucide-react';
import { Sidebar } from './Sidebar';
import { HabitChip } from './HabitChip';
import { HabitBanner } from './HabitBanner';
import { useSession } from '@/platform/session';
import { useCopy } from '@/platform/settings';
import { intents } from '@/platform/events';
import { DevHint, DevlingoLogo, PageSkeleton } from '@/ui';

/**
 * The app shell: fixed sidebar on desktop, a drawer on small screens.
 *
 * Guests are welcome here - progress lives in the browser until they sign in,
 * and the banner says so rather than bouncing them to the landing page.
 *
 * Pages render inside one Suspense (their chunk may still be downloading)
 * behind one content gate (the bank may still be downloading). Doing both
 * here, once, means no page ever sees an empty stage list and mistakes it
 * for a missing stage.
 */
export const DashboardLayout: React.FC = () => {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const { user, stats, serverStatus, contentReady } = useSession();
  const copy = useCopy();
  const openAuthModal = intents.openAuth;
  const location = useLocation();
  const isGuest = !user || user.provider === 'guest';

  // Route changes close the drawer; so does Escape.
  useEffect(() => setDrawerOpen(false), [location.pathname]);
  useEffect(() => {
    if (!drawerOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setDrawerOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [drawerOpen]);

  return (
    <div className="min-h-screen bg-bg text-fg">
      {/* Desktop sidebar */}
      <aside className="hidden lg:block fixed left-0 top-0 h-screen w-64 z-40">
        <Sidebar />
      </aside>

      {/* Mobile top bar + drawer */}
      <header className="lg:hidden sticky top-0 z-40 flex items-center justify-between gap-2 h-12 px-4 border-b border-border bg-surface">
        <DevlingoLogo size="sm" wordmark />
        {/* The streak and today's goal, one tap from the goal card. */}
        <HabitChip compact className="ml-auto" />
        <button
          type="button"
          onClick={() => setDrawerOpen(true)}
          className="btn btn-ghost btn-sm btn-icon"
          aria-label="Open navigation"
          aria-expanded={drawerOpen}
        >
          <Menu size={18} />
        </button>
      </header>

      {drawerOpen && (
        <div className="lg:hidden fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label="Navigation">
          <div className="absolute inset-0 bg-black/50" onClick={() => setDrawerOpen(false)} />
          <div className="absolute left-0 top-0 h-full shadow-dialog">
            <Sidebar onNavigate={() => setDrawerOpen(false)} />
          </div>
          <button
            type="button"
            onClick={() => setDrawerOpen(false)}
            className="btn btn-secondary btn-sm btn-icon absolute top-3 left-[17rem]"
            aria-label="Close navigation"
          >
            <X size={16} />
          </button>
        </div>
      )}

      <div className="lg:ml-64 min-h-screen flex flex-col">
        {/* Signed in, the sidebar's sync mark says so too - but phones hide the sidebar. */}
        {(isGuest || serverStatus === 'offline') && (
          <div
            className="px-4 sm:px-8 h-10 text-sm bg-surface border-b border-border text-fg-secondary flex items-center justify-between gap-3"
            role={serverStatus === 'offline' ? 'status' : undefined}
            data-testid={serverStatus === 'offline' ? 'offline-banner' : undefined}
          >
            <span className="truncate">
              {serverStatus === 'offline' ? (
                <>
                  {copy('copy.offline.banner')}
                  <DevHint> The API is offline: start it with npm run dev:api.</DevHint>
                </>
              ) : (
                <>
                  Practising as a guest — progress is saved in this browser
                  {stats.completedChallenges.length > 0 ? ` (${stats.completedChallenges.length} solved so far)` : ''}.
                </>
              )}
            </span>
            {serverStatus !== 'offline' && (
              <button type="button" onClick={openAuthModal} className="shrink-0 font-medium text-fg hover:text-accent">
                Sign in to sync
              </button>
            )}
          </div>
        )}
        {/* One in-app reminder at a time: welcome back, a streak to repair, a freeze used, a streak at risk. */}
        <HabitBanner />
        <main className="flex-1">
          {contentReady ? (
            <Suspense fallback={<PageSkeleton />}>
              <Outlet />
            </Suspense>
          ) : (
            <PageSkeleton label="Loading your lessons" />
          )}
        </main>
      </div>
    </div>
  );
};
