/**
 * Composition root.
 *
 * The only file that knows every module. It wires providers, routes and the
 * few places where one module's UI needs another's data (reading links,
 * related roadmaps) - passed in as props here rather than imported across
 * module boundaries. See docs/adr/0001-modular-monolith.md.
 *
 * Almost everything below is loaded on demand (ADR 0006). The shell chunk
 * holds the providers, the router, the dashboard frame and the practice
 * modal - the things every visit needs. Each screen is its own chunk, and
 * the challenge bank is another, fetched while the first screen paints.
 */
import React, { Suspense, useEffect } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { AppSplash, ErrorBoundary, ToastProvider, Toasts } from '@/ui';
import { ThemeProvider } from '@/platform/theme';
import { SessionProvider } from '@/platform/session';
import { intents } from '@/platform/events';
import { ROUTES } from '@/config/routes';
import { PracticeHost } from '@/modules/challenges';
import { AccountModals } from '@/modules/account';
import { BadgeToaster } from '@/modules/achievements';
import { DashboardLayout } from './layout/DashboardLayout';
import { useContentBundle } from './content';
import { lazyPage } from './lazy';

/* Screens - one chunk each; screens that compose two modules live in ./routes. */
const Landing = lazyPage(() => import('@/modules/landing'), 'Landing');
const DashboardHome = lazyPage(() => import('@/modules/dashboard'), 'DashboardHome');
const LearnRoute = lazyPage(() => import('./routes/LearnRoute'), 'LearnRoute');
const ChallengesRoute = lazyPage(() => import('./routes/ChallengesRoute'), 'ChallengesRoute');
const ArticleRoute = lazyPage(() => import('./routes/ArticleRoute'), 'ArticleRoute');
const RoadmapPage = lazyPage(() => import('@/modules/roadmaps'), 'RoadmapPage');
const RoadmapDetailRoute = lazyPage(() => import('./routes/RoadmapDetailRoute'), 'RoadmapDetailRoute');
const PlaygroundPage = lazyPage(() => import('@/modules/playground'), 'PlaygroundPage');
const LeaderboardPage = lazyPage(() => import('@/modules/leaderboard'), 'LeaderboardPage');
const AchievementsPage = lazyPage(() => import('@/modules/achievements'), 'AchievementsPage');
const SettingsPage = lazyPage(() => import('@/modules/account'), 'SettingsPage');
/* Outside the dashboard frame: the certificate prints as one clean sheet, and verification needs no sign-in. */
const CertificatePage = lazyPage(() => import('@/modules/account'), 'CertificatePage');
const VerifyPage = lazyPage(() => import('@/modules/account'), 'VerifyPage');
/* Where a Google / GitHub sign-in comes back to, before the dashboard takes over. */
const OAuthCallbackPage = lazyPage(() => import('@/modules/account'), 'OAuthCallbackPage');
/* The administrator console - a separate session and its own chunk, fetched only on /admin. */
const AdminApp = lazyPage(() => import('@/modules/admin'), 'AdminApp');

/* The reading panel inside the practice modal - the articles arrive when a modal first opens. */
const ReadingPanel = lazyPage(() => import('@/modules/articles'), 'ReadingPanel');

/**
 * A Google / GitHub sign-in that failed comes back to `/?auth_error=…`. Open
 * the sign-in modal so the reason shows up where the learner can do something
 * about it; the modal reads the message and clears it from the address bar.
 */
const AuthErrorWatcher: React.FC = () => {
  useEffect(() => {
    if (new URLSearchParams(window.location.search).has('auth_error')) intents.openAuth();
  }, []);
  return null;
};

/** Reset scroll on navigation - the landing page is long. Hash links keep their target. */
const ScrollToTop: React.FC = () => {
  const { pathname, hash } = useLocation();
  useEffect(() => {
    if (!hash) window.scrollTo({ top: 0 });
  }, [pathname, hash]);
  return null;
};

/**
 * The dashboard layout renders each page inside its own Suspense, so the
 * sidebar stays put while a page chunk downloads; only the landing page
 * (which has no frame) falls back to the splash.
 */
const AppRoutes: React.FC = () => (
  <Routes>
    <Route
      path={ROUTES.landing}
      element={
        <Suspense fallback={<AppSplash />}>
          <Landing />
        </Suspense>
      }
    />

    {/* Short public URLs land on the real pages. */}
    <Route path="/learn" element={<Navigate to={ROUTES.learn} replace />} />
    <Route path="/practice" element={<Navigate to={ROUTES.playground} replace />} />
    <Route path="/challenges" element={<Navigate to={ROUTES.challenges} replace />} />
    <Route path="/roadmap" element={<Navigate to={ROUTES.roadmaps} replace />} />
    <Route path="/community" element={<Navigate to={ROUTES.leaderboard} replace />} />

    <Route path={ROUTES.dashboard} element={<DashboardLayout />}>
      <Route index element={<DashboardHome />} />
      <Route path="learn" element={<LearnRoute />} />
      <Route path="learn/:stageId/read" element={<ArticleRoute />} />
      <Route path="challenges" element={<ChallengesRoute />} />
      <Route path="practice" element={<PlaygroundPage />} />
      <Route path="roadmap" element={<RoadmapPage />} />
      <Route path="roadmap/:slug" element={<RoadmapDetailRoute />} />
      <Route path="leaderboard" element={<LeaderboardPage />} />
      <Route path="achievements" element={<AchievementsPage />} />
      <Route path="settings" element={<SettingsPage />} />
    </Route>

    <Route
      path={ROUTES.authCallback}
      element={
        <Suspense fallback={<AppSplash />}>
          <OAuthCallbackPage />
        </Suspense>
      }
    />

    {/* A learner's own certificate (the server answers 404 to anyone else) and
        the public check of one. Both full-page, no dashboard chrome. */}
    <Route
      path="/certificates/:id"
      element={
        <Suspense fallback={<AppSplash />}>
          <CertificatePage />
        </Suspense>
      }
    />
    <Route
      path="/verify/:code"
      element={
        <Suspense fallback={<AppSplash />}>
          <VerifyPage />
        </Suspense>
      }
    />

    {/* Admin: backend-authorized, not gated by anything in this file - every
        /api/admin/* route verifies the admin bearer token against the live
        admin record (server/admin-auth.js). The client-side redirect to
        /admin/login inside AdminApp is a UX nicety, not the security boundary. */}
    <Route
      path={`${ROUTES.admin}/*`}
      element={
        <Suspense fallback={<AppSplash />}>
          <AdminApp />
        </Suspense>
      }
    />

    <Route path="*" element={<Navigate to={ROUTES.landing} replace />} />
  </Routes>
);

/** Everything under the providers; split out so the content hook can throw into the ErrorBoundary. */
const Shell: React.FC = () => {
  const content = useContentBundle();
  return (
    <SessionProvider content={content}>
      <BrowserRouter>
        <ScrollToTop />
        {/* The practice modal and its session wrap the routes so every page can open it. */}
        <PracticeHost
          readingSlot={(challenge, close) => (
            <Suspense fallback={null}>
              <ReadingPanel challenge={challenge} onNavigate={close} />
            </Suspense>
          )}
        >
          <AppRoutes />
        </PracticeHost>
        <AccountModals />
        {/* After AccountModals on purpose: sibling effects run in document
            order, so the modal is listening before this asks it to open. */}
        <AuthErrorWatcher />
        <BadgeToaster />
        <Toasts />
      </BrowserRouter>
    </SessionProvider>
  );
};

export const App: React.FC = () => (
  <ErrorBoundary>
    <ThemeProvider>
      <ToastProvider>
        <Shell />
      </ToastProvider>
    </ThemeProvider>
  </ErrorBoundary>
);

export default App;
