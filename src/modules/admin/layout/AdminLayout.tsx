import React, { useEffect, useState } from 'react';
import { Navigate, NavLink, Outlet, useLocation } from 'react-router-dom';
import {
  BarChart3,
  BookOpen,
  FileSpreadsheet,
  Languages,
  LayoutDashboard,
  ListChecks,
  LogOut,
  Menu,
  ScrollText,
  Settings,
  Users,
  X
} from 'lucide-react';
import { useAdminAuth } from '../services/AdminAuthContext';
import { Spinner } from '../components/ui';

const NAV = [
  { icon: <LayoutDashboard size={20} />, label: 'Dashboard', path: '/admin', exact: true },
  { icon: <Users size={20} />, label: 'Users', path: '/admin/users' },
  { icon: <Languages size={20} />, label: 'Languages', path: '/admin/languages' },
  { icon: <BookOpen size={20} />, label: 'Stages', path: '/admin/stages' },
  { icon: <ListChecks size={20} />, label: 'Challenges', path: '/admin/challenges' },
  { icon: <BarChart3 size={20} />, label: 'Analytics', path: '/admin/analytics' },
  { icon: <FileSpreadsheet size={20} />, label: 'Excel Sync', path: '/admin/excel' },
  { icon: <ScrollText size={20} />, label: 'Audit Log', path: '/admin/audit-log' },
  { icon: <Settings size={20} />, label: 'Settings', path: '/admin/settings/security' }
];

/**
 * Route guard + shell for everything under /admin (except /admin/login).
 *
 * This is UI convenience only, not the security boundary: it just avoids
 * flashing admin screens at someone who isn't signed in as the
 * administrator. Every actual admin endpoint re-checks the session
 * server-side (server/admin-auth.js's requireAdminAuth against the live
 * admin record), so even if this redirect were deleted entirely, a request
 * with no admin token - or a learner's own token - would still get a 401
 * from every request the pages below make.
 */
export const AdminLayout: React.FC = () => {
  const { admin, loading, logout } = useAdminAuth();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const location = useLocation();

  useEffect(() => setDrawerOpen(false), [location.pathname]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-[#0d1117]">
        <Spinner label="Checking admin session…" />
      </div>
    );
  }
  if (!admin) return <Navigate to="/admin/login" replace />;

  const Nav = ({ onNavigate }: { onNavigate?: () => void }) => (
    <div className="w-64 h-full border-r border-black/5 dark:border-white/5 bg-white dark:bg-[#0d1117] flex flex-col">
      <div className="p-6 flex-1 overflow-y-auto">
        <div className="text-xl font-bold flex items-center gap-2 mb-1">
          <span className="text-[var(--color-primary)] font-mono">&lt;/&gt;</span>
          <span className="text-gray-900 dark:text-white">Devlingo</span>
        </div>
        <div className="text-xs font-semibold tracking-wide uppercase text-gray-400 dark:text-gray-500 mb-6">Admin</div>
        <nav className="space-y-1.5" aria-label="Admin">
          {NAV.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.exact}
              onClick={onNavigate}
              className={({ isActive }) =>
                `flex items-center space-x-3 px-3 py-2.5 rounded-lg transition-colors ${
                  isActive
                    ? 'bg-[var(--color-primary)]/10 text-[var(--color-primary)] font-medium border border-[var(--color-primary)]/20'
                    : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/5 border border-transparent'
                }`
              }
            >
              {item.icon}
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>
      </div>
      <div className="p-6 border-t border-black/5 dark:border-white/5">
        <div className="text-xs uppercase tracking-wide text-gray-400 dark:text-gray-500 mb-0.5">Signed in as</div>
        <div className="text-sm font-medium text-gray-900 dark:text-white truncate mb-3">{admin.userId}</div>
        <button
          type="button"
          onClick={logout}
          className="w-full flex items-center space-x-3 px-3 py-2 rounded-lg hover:bg-black/5 dark:hover:bg-white/5 transition-colors text-red-500 hover:text-red-600 dark:text-red-400 text-sm font-medium"
        >
          <LogOut size={18} />
          <span>Log out</span>
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-[#0b0f14] text-gray-900 dark:text-white font-sans">
      <aside className="hidden lg:block fixed left-0 top-0 h-screen w-64 z-40">
        <Nav />
      </aside>

      <header className="lg:hidden sticky top-0 z-40 flex items-center justify-between px-4 py-3 border-b border-black/5 dark:border-white/5 bg-white/90 dark:bg-[#0d1117]/90 backdrop-blur">
        <span className="text-lg font-bold flex items-center gap-2">
          <span className="text-[var(--color-primary)] font-mono">&lt;/&gt;</span>
          Devlingo Admin
        </span>
        <button
          type="button"
          onClick={() => setDrawerOpen(true)}
          className="p-2 rounded-lg text-gray-600 dark:text-gray-300 hover:bg-black/5 dark:hover:bg-white/5"
          aria-label="Open navigation"
        >
          <Menu size={22} />
        </button>
      </header>

      {drawerOpen && (
        <div className="lg:hidden fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label="Admin navigation">
          <div className="absolute inset-0 bg-black/50" onClick={() => setDrawerOpen(false)} />
          <div className="absolute left-0 top-0 h-full shadow-2xl">
            <Nav onNavigate={() => setDrawerOpen(false)} />
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

      <div className="lg:ml-64 min-h-screen">
        <main className="p-4 sm:p-8 max-w-6xl mx-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
};
