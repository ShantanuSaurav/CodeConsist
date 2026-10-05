import React, { Suspense, useEffect, useRef, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Moon, Sun, X } from 'lucide-react';
import { useSession } from '@/platform/session';
import { useCopy } from '@/platform/settings';
import { useTheme } from '@/platform/theme';
import { intents } from '@/platform/events';
import { Button, DevHint, DevlingoLogo, PageSkeleton, useBodyScrollLock, useFocusTrap } from '@/ui';
import { HabitBanner } from './HabitBanner';
import { AccountSummary, NavigationLinks, TopBar, TrackPicker } from './Navigation';
import './shell.css';

export const DashboardLayout: React.FC = () => {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const { user, stats, serverStatus, contentReady, logout } = useSession();
  const { theme, toggleTheme } = useTheme();
  const copy = useCopy();
  const location = useLocation();
  const drawerRef = useRef<HTMLDivElement>(null);
  const isGuest = !user || user.provider === 'guest';
  useFocusTrap(drawerRef, drawerOpen);
  useBodyScrollLock(drawerOpen);
  useEffect(() => setDrawerOpen(false), [location.pathname, location.hash]);
  useEffect(() => {
    const media = window.matchMedia('(min-width: 1024px)');
    const closeOnDesktop = () => { if (media.matches) setDrawerOpen(false); };
    media.addEventListener('change', closeOnDesktop);
    return () => media.removeEventListener('change', closeOnDesktop);
  }, []);

  return (
    <div className="app-shell">
      <a href="#main-content" className="app-skip-link">Skip to content</a>
      <div className="app-atmosphere" aria-hidden="true" />
      <NavigationLinks rail />
      <TopBar drawerOpen={drawerOpen} onOpen={() => setDrawerOpen(true)} />
      <div id="app-navigation-sheet" className="app-sheet" data-state={drawerOpen ? 'open' : 'closed'} aria-hidden={!drawerOpen} {...(!drawerOpen ? { inert: '' } : {})}>
        <div className={drawerOpen ? 'app-sheet-backdrop bg-scrim' : 'app-sheet-backdrop'} onClick={() => setDrawerOpen(false)} />
        <div ref={drawerRef} className="app-sheet-panel" role="dialog" aria-modal={drawerOpen || undefined} aria-label="Navigation" tabIndex={-1} onKeyDown={(event) => { if (event.key === 'Escape' && !event.defaultPrevented) { event.stopPropagation(); setDrawerOpen(false); } }}>
          <div className="app-sheet-heading"><DevlingoLogo size="sm" wordmark /><Button variant="ghost" icon onClick={() => setDrawerOpen(false)} aria-label="Close navigation"><X size={18} /></Button></div>
          <TrackPicker />
          <NavigationLinks onNavigate={() => setDrawerOpen(false)} />
          <AccountSummary />
          <div className="app-sheet-actions"><Button variant="ghost" onClick={toggleTheme}>{theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}{theme === 'dark' ? 'Light mode' : 'Dark mode'}</Button><Button variant="secondary" onClick={() => { setDrawerOpen(false); if (isGuest) window.setTimeout(() => intents.openAuth(), 0); else void logout(); }}>{isGuest ? 'Sign in to sync' : 'Sign out'}</Button></div>
        </div>
      </div>
      <div className="app-content">
        <div className="app-notices">
          {(isGuest || serverStatus === 'offline') && <div className="app-notice" role={serverStatus === 'offline' ? 'status' : undefined} data-testid={serverStatus === 'offline' ? 'offline-banner' : undefined}>
            <span>{serverStatus === 'offline' ? <>{copy('copy.offline.banner')}<DevHint> The API is offline: start it with npm run dev:api.</DevHint></> : <>Practising as a guest — progress is saved in this browser{stats.completedChallenges.length > 0 ? ` (${stats.completedChallenges.length} solved so far)` : ''}.</>}</span>
            {serverStatus !== 'offline' && <button type="button" onClick={() => intents.openAuth()} className="app-notice-action">Sign in to sync <span aria-hidden="true">↗</span></button>}
          </div>}
          <HabitBanner />
        </div>
        <main id="main-content" tabIndex={-1} className="app-main">
          {contentReady ? <Suspense fallback={<PageSkeleton />}><Outlet /></Suspense> : <PageSkeleton label="Loading your lessons" />}
        </main>
      </div>
    </div>
  );
};
