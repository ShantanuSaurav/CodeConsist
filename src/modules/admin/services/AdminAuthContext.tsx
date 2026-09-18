import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { AdminApiError, AdminIdentity, adminApi, getAdminToken } from './adminApi';

interface AdminAuthState {
  admin: AdminIdentity | null;
  /** True while the initial token check (or a login attempt) is in flight. */
  loading: boolean;
  login: (userId: string, password: string) => Promise<void>;
  logout: () => void;
  /** Called after a successful credential change - the old token is already dead server-side. */
  clearSession: () => void;
}

const AdminAuthContext = createContext<AdminAuthState | undefined>(undefined);

/**
 * Holds the admin session. On mount, if a token is already saved, it is
 * re-validated against `/api/admin-auth/me` - a stored token from before a
 * credential change (or one that has simply expired) is never trusted, only
 * what the server says about it right now.
 */
export const AdminAuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [admin, setAdmin] = useState<AdminIdentity | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!getAdminToken()) {
        setLoading(false);
        return;
      }
      try {
        const res = await adminApi.me();
        if (!cancelled) setAdmin(res.admin);
      } catch {
        adminApi.logout();
        if (!cancelled) setAdmin(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (userId: string, password: string) => {
    const identity = await adminApi.login(userId, password);
    setAdmin(identity);
  }, []);

  const logout = useCallback(() => {
    adminApi.logout();
    setAdmin(null);
  }, []);

  return (
    <AdminAuthContext.Provider value={{ admin, loading, login, logout, clearSession: logout }}>
      {children}
    </AdminAuthContext.Provider>
  );
};

export function useAdminAuth(): AdminAuthState {
  const ctx = useContext(AdminAuthContext);
  if (!ctx) throw new Error('useAdminAuth must be used within AdminAuthProvider');
  return ctx;
}

export { AdminApiError };
