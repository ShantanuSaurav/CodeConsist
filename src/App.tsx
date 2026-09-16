import React, { useEffect } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { GameProvider, useGame } from './context/GameContext';
import { ErrorBoundary } from './components/ErrorBoundary';
import { Landing } from './pages/Landing';
import { DashboardLayout } from './pages/DashboardLayout';
import { DashboardHome } from './pages/DashboardHome';
import { LearnPage } from './pages/LearnPage';
import { ChallengesPage } from './pages/ChallengesPage';
import { PlaygroundPage } from './pages/PlaygroundPage';
import { RoadmapPage } from './pages/RoadmapPage';
import { LeaderboardPage } from './pages/LeaderboardPage';
import { AchievementsPage } from './pages/AchievementsPage';
import { SettingsPage } from './pages/SettingsPage';
import { PracticeModal } from './components/PracticeModal';
import { AuthModal } from './components/ui/AuthModal';
import { SubscriptionModal } from './components/SubscriptionModal';
import { Toasts } from './components/Toasts';

/** Reset scroll on navigation - the landing page is long. */
const ScrollToTop: React.FC = () => {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [pathname]);
  return null;
};

/** Modals and toasts live above every route. */
const Overlays: React.FC = () => {
  const { isAuthModalOpen, closeAuthModal, isSubModalOpen, closeSubModal } = useGame();
  return (
    <>
      <PracticeModal />
      <AuthModal isOpen={isAuthModalOpen} onClose={closeAuthModal} />
      <SubscriptionModal isOpen={isSubModalOpen} onClose={closeSubModal} />
      <Toasts />
    </>
  );
};

export const App: React.FC = () => (
  <ErrorBoundary>
    <GameProvider>
      <BrowserRouter>
        <ScrollToTop />
        <Routes>
          <Route path="/" element={<Landing />} />

          {/* Short public URLs land on the real pages. */}
          <Route path="/learn" element={<Navigate to="/dashboard/learn" replace />} />
          <Route path="/practice" element={<Navigate to="/dashboard/practice" replace />} />
          <Route path="/challenges" element={<Navigate to="/dashboard/challenges" replace />} />
          <Route path="/roadmap" element={<Navigate to="/dashboard/roadmap" replace />} />
          <Route path="/community" element={<Navigate to="/dashboard/leaderboard" replace />} />

          <Route path="/dashboard" element={<DashboardLayout />}>
            <Route index element={<DashboardHome />} />
            <Route path="learn" element={<LearnPage />} />
            <Route path="challenges" element={<ChallengesPage />} />
            <Route path="practice" element={<PlaygroundPage />} />
            <Route path="roadmap" element={<RoadmapPage />} />
            <Route path="leaderboard" element={<LeaderboardPage />} />
            <Route path="achievements" element={<AchievementsPage />} />
            <Route path="settings" element={<SettingsPage />} />
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        <Overlays />
      </BrowserRouter>
    </GameProvider>
  </ErrorBoundary>
);

export default App;
