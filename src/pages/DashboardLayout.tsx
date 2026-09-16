import React, { useEffect, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Menu, X } from 'lucide-react';
import { Sidebar } from '../components/layout/Sidebar';
import { useGame } from '../context/GameContext';

/**
 * The app shell: fixed sidebar on desktop, a drawer on small screens.
 *
 * Guests are welcome here - progress lives in the browser until they sign in,
 * and the banner says so rather than bouncing them to the landing page.
 */
export const DashboardLayout: React.FC = () => {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const { user, stats, openAuthModal, serverStatus } = useGame();
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
    <div className="min-h-screen bg-white dark:bg-[#0d1117] text-gray-900 dark:text-white font-sans selection:bg-[var(--color-primary)]/30">
      {/* Desktop sidebar */}
      <aside className="hidden lg:block fixed left-0 top-0 h-screen w-64 z-40">
        <Sidebar />
      </aside>

      {/* Mobile top bar + drawer */}
      <header className="lg:hidden sticky top-0 z-40 flex items-center justify-between px-4 py-3 border-b border-black/5 dark:border-white/5 bg-white/90 dark:bg-[#0d1117]/90 backdrop-blur">
        <span className="text-lg font-bold flex items-center gap-2">
          <span className="text-[var(--color-primary)] font-mono">&lt;/&gt;</span>
          Devlingo
        </span>
        <button
          type="button"
          onClick={() => setDrawerOpen(true)}
          className="p-2 rounded-lg text-gray-600 dark:text-gray-300 hover:bg-black/5 dark:hover:bg-white/5"
          aria-label="Open navigation"
          aria-expanded={drawerOpen}
        >
          <Menu size={22} />
        </button>
      </header>

      {drawerOpen && (
        <div className="lg:hidden fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label="Navigation">
          <div className="absolute inset-0 bg-black/50" onClick={() => setDrawerOpen(false)} />
          <div className="absolute left-0 top-0 h-full shadow-2xl">
            <Sidebar onNavigate={() => setDrawerOpen(false)} />
          </div>
          <button
            type="button"
            onClick={() => setDrawerOpen(false)}
            className="absolute top-3 left-[17rem] p-2 rounded-full bg-white dark:bg-[#161b22] text-gray-700 dark:text-gray-200 shadow"
            aria-label="Close navigation"
          >
            <X size={18} />
          </button>
        </div>
      )}

      <div className="lg:ml-64 min-h-screen flex flex-col">
        {isGuest && (
          <div className="px-4 sm:px-8 py-2.5 text-sm bg-[var(--color-primary)]/10 border-b border-[var(--color-primary)]/20 text-gray-700 dark:text-gray-200 flex flex-wrap items-center justify-between gap-2">
            <span>
              You are practising as a guest — progress is saved in this browser
              {stats.completedChallenges.length > 0 ? ` (${stats.completedChallenges.length} solved so far)` : ''}.
              {serverStatus === 'offline' && ' The API is offline, so accounts are unavailable right now.'}
            </span>
            {serverStatus !== 'offline' && (
              <button
                type="button"
                onClick={openAuthModal}
                className="font-semibold text-[var(--color-primary)] hover:underline"
              >
                Sign in to sync →
              </button>
            )}
          </div>
        )}
        <main className="flex-1">
          <Outlet />
        </main>
      </div>
    </div>
  );
};
