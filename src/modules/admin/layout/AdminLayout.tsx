import React, { useEffect, useState } from 'react';
import { Navigate, NavLink, Outlet, useLocation } from 'react-router-dom';
import {
  BarChart3,
  BookOpen,
  CreditCard,
  FileSpreadsheet,
  Languages,
  LayoutDashboard,
  ListChecks,
  LogOut,
  Menu,
  ScrollText,
  ShieldCheck,
  Users,
  X
} from 'lucide-react';
import { useAdminAuth } from '../services/AdminAuthContext';
import { Spinner } from '../components/ui';
import { DevlingoLogo } from '@/ui';

const ICON = 16;

const GROUPS: Array<{ label: string; items: Array<{ icon: React.ReactNode; label: string; path: string; exact?: boolean }> }> = [
  {
    label: 'Overview',
    items: [
      { icon: <LayoutDashboard size={ICON} />, label: 'Dashboard', path: '/admin', exact: true },
      { icon: <BarChart3 size={ICON} />, label: 'Analytics', path: '/admin/analytics' },
      { icon: <ScrollText size={ICON} />, label: 'Audit log', path: '/admin/audit-log' }
    ]
  },
  {
    label: 'Content',
    items: [
      { icon: <Languages size={ICON} />, label: 'Languages', path: '/admin/languages' },
      { icon: <BookOpen size={ICON} />, label: 'Stages', path: '/admin/stages' },
      { icon: <ListChecks size={ICON} />, label: 'Challenges', path: '/admin/challenges' }
    ]
  },
  {
    label: 'Operations',
    items: [
      { icon: <Users size={ICON} />, label: 'Users', path: '/admin/users' },
      { icon: <CreditCard size={ICON} />, label: 'Billing', path: '/admin/billing' },
      { icon: <FileSpreadsheet size={ICON} />, label: 'Excel sync', path: '/admin/excel' },
      { icon: <ShieldCheck size={ICON} />, label: 'Security', path: '/admin/settings/security' }
    ]
  }
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
      <div className="min-h-screen flex items-center justify-center bg-bg">
        <Spinner label="Checking admin session…" />
      </div>
    );
  }
  if (!admin) return <Navigate to="/admin/login" replace />;

  const Nav = ({ onNavigate }: { onNavigate?: () => void }) => (
    <div className="w-60 h-full border-r border-border bg-surface flex flex-col">
      <div className="px-3 pt-4 pb-3 flex-1 overflow-y-auto scroll-thin">
        <div className="flex items-center px-3 h-8 mb-4">
          <DevlingoLogo size="sm" wordmark suffix={<span className="badge badge-mono ml-1">admin</span>} />
        </div>
        <nav aria-label="Admin">
          {GROUPS.map((group) => (
            <div key={group.label}>
              <div className="nav-group-label">{group.label}</div>
              <ul className="space-y-0.5">
                {group.items.map((item) => (
                  <li key={item.path}>
                    <NavLink
                      to={item.path}
                      end={item.exact}
                      onClick={onNavigate}
                      className={({ isActive }) => `nav-item ${isActive ? 'is-active' : ''}`.trim()}
                    >
                      {item.icon}
                      <span>{item.label}</span>
                    </NavLink>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>
      </div>
      <div className="px-3 py-3 border-t border-border">
        <div className="px-3 mb-2">
          <div className="text-[11px] font-mono uppercase tracking-wider text-fg-muted">Signed in as</div>
          <div className="text-sm font-medium text-fg truncate">{admin.userId}</div>
        </div>
        <button type="button" onClick={logout} className="nav-item w-full text-left">
          <LogOut size={ICON} />
          <span>Log out</span>
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-bg text-fg">
      <aside className="hidden lg:block fixed left-0 top-0 h-screen w-60 z-40">
        <Nav />
      </aside>

      <header className="lg:hidden sticky top-0 z-40 flex items-center justify-between h-12 px-4 border-b border-border bg-surface">
        <DevlingoLogo size="sm" wordmark suffix={<span className="badge badge-mono ml-1">admin</span>} />
        <button type="button" onClick={() => setDrawerOpen(true)} className="btn btn-ghost btn-sm btn-icon" aria-label="Open navigation">
          <Menu size={18} />
        </button>
      </header>

      {drawerOpen && (
        <div className="lg:hidden fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label="Admin navigation">
          <div className="absolute inset-0 bg-black/50" onClick={() => setDrawerOpen(false)} />
          <div className="absolute left-0 top-0 h-full shadow-dialog">
            <Nav onNavigate={() => setDrawerOpen(false)} />
          </div>
          <button
            type="button"
            onClick={() => setDrawerOpen(false)}
            className="btn btn-secondary btn-sm btn-icon absolute top-3 left-[16rem]"
            aria-label="Close navigation"
          >
            <X size={16} />
          </button>
        </div>
      )}

      <div className="lg:ml-60 min-h-screen">
        <main className="page max-w-6xl">
          <Outlet />
        </main>
      </div>
    </div>
  );
};
