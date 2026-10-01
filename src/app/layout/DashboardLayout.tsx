import React, { Suspense, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Menu, X } from 'lucide-react';
import { Sidebar } from './Sidebar';
import { useSession } from '@/platform/session';
import { intents } from '@/platform/events';
import { DevlingoLogo, MOTION, PageSkeleton, useFocusTrap, usePresence } from '@/ui';

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
 *
 * Motion: the sidebar never moves. Each navigation replays a short fade-and-
 * rise on the page stage (.page-enter), and content that arrives after a
 * skeleton fades in (.content-fade-in). The drawer slides in and out.
 */
export const DashboardLayout: React.FC = () => {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const drawer = usePresence(drawerOpen, MOTION.base);
  const drawerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const { user, stats, serverStatus, contentReady } = useSession();
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
  // The drawer is a modal dialog: focus moves in (onto the current page's
  // link), Tab stays inside, and closing hands focus back to the menu button
  // while the drawer is still sliding out - inert by then, so a Tab cannot
  // land on a link that is leaving.
  useFocusTrap(drawerRef, drawerOpen, () => drawerRef.current?.querySelector<HTMLElement>('.nav-item.is-active'));

  // Replay the page entrance on every pathname change. The stage element is
  // never remounted (no `key`), so the Suspense boundary inside keeps its
  // transition behaviour - the old page stays up until the next chunk is
  // ready - and no page is torn down and re-fetched just to animate. Runs
  // before paint, so the new page's first frame is already the start frame.
  useLayoutEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    stage.classList.remove('page-enter');
    void stage.offsetWidth;
    stage.classList.add('page-enter');
    // Content mounted in this same commit (a first visit with the chunk
    // ready) would start its own fade on top, and the two opacities would
    // multiply. The stage's entrance already covers it, so end that fade.
    // Content that lands later, after a skeleton, still fades in.
    stage.querySelector('.content-fade-in')?.getAnimations?.().forEach((a) => a.finish());
  }, [location.pathname]);

  return (
    <div className="min-h-screen bg-bg text-fg">
      {/* Desktop sidebar */}
      <aside className="hidden lg:block fixed left-0 top-0 h-screen w-64 z-40">
        <Sidebar />
      </aside>

      {/* Mobile top bar + drawer */}
      <header className="lg:hidden sticky top-0 z-40 flex items-center justify-between h-12 px-4 border-b border-border bg-surface">
        <DevlingoLogo size="sm" wordmark />
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

      {drawer.mounted && (
        <div
          ref={drawerRef}
          className={`lg:hidden fixed inset-0 z-50 outline-none ${drawer.state === 'closed' ? 'pointer-events-none' : ''}`.trim()}
          role="dialog"
          aria-modal="true"
          aria-label="Navigation"
          tabIndex={-1}
          {...(drawer.state === 'closed' ? { inert: '' } : {})}
        >
          <div className="overlay-backdrop absolute inset-0" data-state={drawer.state} onClick={() => setDrawerOpen(false)} />
          <div className="drawer-surface absolute left-0 top-0 h-full shadow-dialog" data-state={drawer.state}>
            <Sidebar onNavigate={() => setDrawerOpen(false)} />
          </div>
          <button
            type="button"
            onClick={() => setDrawerOpen(false)}
            className="presence-fade drawer-companion btn btn-secondary btn-sm btn-icon absolute top-3 left-[17rem]"
            data-state={drawer.state}
            aria-label="Close navigation"
          >
            <X size={16} />
          </button>
        </div>
      )}

      <div className="lg:ml-64 min-h-screen flex flex-col">
        {isGuest && (
          <div className="anim-fade px-4 sm:px-8 h-10 text-sm bg-surface border-b border-border text-fg-secondary flex items-center justify-between gap-3">
            <span className="truncate">
              Practising as a guest — progress is saved in this browser
              {stats.completedChallenges.length > 0 ? ` (${stats.completedChallenges.length} solved so far)` : ''}.
              {serverStatus === 'offline' && ' The API is offline, so accounts are unavailable right now.'}
            </span>
            {serverStatus !== 'offline' && (
              <button
                type="button"
                onClick={openAuthModal}
                className="shrink-0 font-medium text-fg underline decoration-border-strong underline-offset-4 transition-colors hover:text-accent hover:decoration-accent"
              >
                Sign in to sync
              </button>
            )}
          </div>
        )}
        <main className="flex-1">
          <div ref={stageRef} className="page-enter">
            {contentReady ? (
              <Suspense fallback={<PageSkeleton />}>
                <div className="content-fade-in">
                  <Outlet />
                </div>
              </Suspense>
            ) : (
              <PageSkeleton label="Loading your lessons" />
            )}
          </div>
        </main>
      </div>
    </div>
  );
};
