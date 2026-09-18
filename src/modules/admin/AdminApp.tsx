import React from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { AdminAuthProvider } from './services/AdminAuthContext';
import { AdminLayout } from './layout/AdminLayout';
import { AdminLogin } from './pages/AdminLogin';
import { AdminDashboard } from './pages/AdminDashboard';
import { AdminUsers } from './pages/AdminUsers';
import { AdminLanguages } from './pages/AdminLanguages';
import { AdminStages } from './pages/AdminStages';
import { AdminChallenges } from './pages/AdminChallenges';
import { AdminAnalytics } from './pages/AdminAnalytics';
import { AdminAuditLog } from './pages/AdminAuditLog';
import { AdminExcelSettings } from './pages/AdminExcelSettings';
import { AdminSettingsSecurity } from './pages/AdminSettingsSecurity';

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
        <Route path="languages" element={<AdminLanguages />} />
        <Route path="stages" element={<AdminStages />} />
        <Route path="challenges" element={<AdminChallenges />} />
        <Route path="analytics" element={<AdminAnalytics />} />
        <Route path="excel" element={<AdminExcelSettings />} />
        <Route path="audit-log" element={<AdminAuditLog />} />
        <Route path="settings/security" element={<AdminSettingsSecurity />} />
      </Route>
      <Route path="*" element={<Navigate to="/admin" replace />} />
    </Routes>
  </AdminAuthProvider>
);
