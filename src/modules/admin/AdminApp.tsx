import React from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { AdminAuthProvider } from './services/AdminAuthContext';
import { AdminLayout } from './layout/AdminLayout';
import { AdminLogin } from './pages/AdminLogin';
import { AdminDashboard } from './pages/AdminDashboard';
import { AdminUsers } from './pages/AdminUsers';
import { AdminBilling } from './pages/AdminBilling';
import { AdminLanguages } from './pages/AdminLanguages';
import { AdminStages } from './pages/AdminStages';
import { AdminUnits } from './pages/AdminUnits';
import { AdminChallenges } from './pages/AdminChallenges';
import { AdminAnalytics } from './pages/AdminAnalytics';
import { AdminAuditLog } from './pages/AdminAuditLog';
import { AdminExcelSettings } from './pages/AdminExcelSettings';
import { AdminSettingsSecurity } from './pages/AdminSettingsSecurity';
import { AdminRules } from './pages/AdminRules';
import { AdminFeedback } from './pages/AdminFeedback';
import { AdminTeaching } from './pages/AdminTeaching';
import { AdminLeagues } from './pages/AdminLeagues';

/**
 * The /admin route tree. Mounted by the app at `/admin/*`, so every path
 * below is relative to that. AdminLayout redirects to the login screen when
 * there is no valid admin session - a UX nicety; the server is the gate.
 */
export const AdminApp: React.FC = () => (
  <AdminAuthProvider>
    <Routes>
      <Route path="login" element={<AdminLogin />} />
      <Route element={<AdminLayout />}>
        <Route index element={<AdminDashboard />} />
        <Route path="users" element={<AdminUsers />} />
        <Route path="billing" element={<AdminBilling />} />
        <Route path="languages" element={<AdminLanguages />} />
        <Route path="stages" element={<AdminStages />} />
        {/* One stage's lessons grouped into units - opened from a stage row. */}
        <Route path="stages/:stageId/units" element={<AdminUnits />} />
        <Route path="challenges" element={<AdminChallenges />} />
        <Route path="analytics" element={<AdminAnalytics />} />
        {/* The learning rules (settings store). Not under settings/: that is the admin's own sign-in. */}
        <Route path="rules" element={<AdminRules />} />
        <Route path="rules/:sectionId" element={<AdminRules />} />
        {/* Wrong-answer notes across the bank: coverage, Gemini drafts, bulk save. */}
        <Route path="feedback" element={<AdminFeedback />} />
        {/* Learn-mode teaching cards: the built-in ones and the admin's own. */}
        <Route path="teaching" element={<AdminTeaching />} />
        {/* The weekly league: standings, close and reset, exclusions, tiers, past weeks. */}
        <Route path="leagues" element={<AdminLeagues />} />
        <Route path="excel" element={<AdminExcelSettings />} />
        <Route path="audit-log" element={<AdminAuditLog />} />
        <Route path="settings/security" element={<AdminSettingsSecurity />} />
      </Route>
      <Route path="*" element={<Navigate to="/admin" replace />} />
    </Routes>
  </AdminAuthProvider>
);
