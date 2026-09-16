/**
 * Composition root.
 *
 * The only file that knows every module. It wires providers, routes and the
 * few places where one module's UI needs another's data (reading links,
 * related roadmaps) - passed in as props here rather than imported across
 * module boundaries. See docs/adr/0001-modular-monolith.md.
 */
import React, { useEffect } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { ErrorBoundary, ToastProvider, Toasts } from '@/ui';
import { ThemeProvider } from '@/platform/theme';
import { SessionProvider, makeBundle } from '@/platform/session';
import { ROUTES } from '@/config/routes';

import { ALL_CHALLENGES, buildStages, ChallengesPage, LearnPage, PracticeHost } from '@/modules/challenges';
import { ArticlePage, ReadingPanel, resolveReading } from '@/modules/articles';
import { RoadmapDetailPage, RoadmapPage, roadmapLinksForStage } from '@/modules/roadmaps';
import { DashboardHome } from '@/modules/dashboard';
import { LeaderboardPage } from '@/modules/leaderboard';
import { AchievementsPage, BadgeToaster } from '@/modules/achievements';
import { PlaygroundPage } from '@/modules/playground';
import { AccountModals, SettingsPage } from '@/modules/account';
import { Landing } from '@/modules/landing';
import { DashboardLayout } from './layout/DashboardLayout';

/** The bundled content bank, built once at start-up. */
const CONTENT = makeBundle(buildStages(), ALL_CHALLENGES);

/** Reset scroll on navigation - the landing page is long. Hash links keep their target. */
const ScrollToTop: React.FC = () => {
  const { pathname, hash } = useLocation();
  useEffect(() => {
    if (!hash) window.scrollTo({ top: 0 });
  }, [pathname, hash]);
  return null;
};

const AppRoutes: React.FC = () => (
  <Routes>
    <Route path={ROUTES.landing} element={<Landing />} />

    {/* Short public URLs land on the real pages. */}
    <Route path="/learn" element={<Navigate to={ROUTES.learn} replace />} />
    <Route path="/practice" element={<Navigate to={ROUTES.playground} replace />} />
    <Route path="/challenges" element={<Navigate to={ROUTES.challenges} replace />} />
    <Route path="/roadmap" element={<Navigate to={ROUTES.roadmaps} replace />} />
    <Route path="/community" element={<Navigate to={ROUTES.leaderboard} replace />} />

    <Route path={ROUTES.dashboard} element={<DashboardLayout />}>
      <Route index element={<DashboardHome />} />
      <Route path="learn" element={<LearnPage readingFor={resolveReading} />} />
      <Route path="learn/:stageId/read" element={<ArticlePage relatedFor={roadmapLinksForStage} />} />
      <Route path="challenges" element={<ChallengesPage readingFor={resolveReading} />} />
      <Route path="practice" element={<PlaygroundPage />} />
      <Route path="roadmap" element={<RoadmapPage />} />
      <Route path="roadmap/:slug" element={<RoadmapDetailPage readingFor={resolveReading} />} />
      <Route path="leaderboard" element={<LeaderboardPage />} />
      <Route path="achievements" element={<AchievementsPage />} />
      <Route path="settings" element={<SettingsPage />} />
    </Route>

    <Route path="*" element={<Navigate to={ROUTES.landing} replace />} />
  </Routes>
);

export const App: React.FC = () => (
  <ErrorBoundary>
    <ThemeProvider>
      <ToastProvider>
        <SessionProvider content={CONTENT}>
          <BrowserRouter>
            <ScrollToTop />
            {/* The practice modal and its session wrap the routes so every page can open it. */}
            <PracticeHost readingSlot={(challenge, close) => <ReadingPanel challenge={challenge} onNavigate={close} />}>
              <AppRoutes />
            </PracticeHost>
            <AccountModals />
            <BadgeToaster />
            <Toasts />
          </BrowserRouter>
        </SessionProvider>
      </ToastProvider>
    </ThemeProvider>
  </ErrorBoundary>
);

export default App;
