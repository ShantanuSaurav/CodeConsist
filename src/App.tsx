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
import { AdminAuthProvider } from './admin/AdminAuthContext';
import { AdminLogin } from './admin/AdminLogin';
import { AdminLayout } from './admin/AdminLayout';
import { AdminDashboard } from './admin/AdminDashboard';
import { AdminUsers } from './admin/AdminUsers';
import { AdminLanguages } from './admin/AdminLanguages';
import { AdminStages } from './admin/AdminStages';
import { AdminChallenges } from './admin/AdminChallenges';
import { AdminAnalytics } from './admin/AdminAnalytics';
import { AdminAuditLog } from './admin/AdminAuditLog';
import { AdminExcelSettings } from './admin/AdminExcelSettings';
import { AdminSettingsSecurity } from './admin/AdminSettingsSecurity';

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
      {/* Its own session, its own token (see src/admin/adminApi.ts), issued by
          a completely separate administrator credential system (Admin User ID
          + Admin Password - see server/admin-auth.js) - entirely independent
          of the learner auth GameProvider manages above. Present everywhere
          but a no-op unless an admin token is already saved, so it costs the
          learner app nothing. */}
      <AdminAuthProvider>
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

            {/* Admin: backend-authorized, not gated by anything in this file -
                see server/admin-auth.js's requireAdminAuth, which verifies the
                admin bearer token against the single, separate admin record
                (never the learner `users` table) on every request. AdminLayout
                below just redirects to /admin/login when there is no valid
                admin session; it is a UX nicety, not the security boundary. */}
            <Route path="/admin/login" element={<AdminLogin />} />
            <Route path="/admin" element={<AdminLayout />}>
              <Route index element={<AdminDashboard />} />
              <Route path="users" element={<AdminUsers />} />
              <Route path="languages" element={<AdminLanguages />} />
              <Route path="stages" element={<AdminStages />} />
              <Route path="challenges" element={<AdminChallenges />} />
              <Route path="analytics" element={<AdminAnalytics />} />
              <Route path="excel" element={<AdminExcelSettings />} />
              <Route path="audit-log" element={<AdminAuditLog />} />
              <Route path="settings/security" element={<AdminSettingsSecurity />} />
            </Route>

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
          <Overlays />
        </BrowserRouter>
      </AdminAuthProvider>
    </GameProvider>
  </ErrorBoundary>
);

export default App;
