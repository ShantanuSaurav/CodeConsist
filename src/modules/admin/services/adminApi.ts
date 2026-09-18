/**
 * Client for the admin API (`/api/admin/*`, plus `/api/admin-auth/*` for
 * sign-in itself).
 *
 * Deliberately separate from `src/lib/api.ts`: the admin app is its own
 * session, with its own token (under STORAGE_KEYS.adminToken - see
 * src/lib/storage.ts) issued by a completely separate credential system
 * (Admin User ID + Admin Password, never a learner's email/password - see
 * server/admin-auth.js). Signing out of the learner app or the admin app
 * never touches the other one. Every route this calls is re-checked
 * server-side by `requireAdminAuth` in server/admin-auth.js - nothing here
 * is a security boundary by itself, it just talks to the one that is.
 */
import { STORAGE_KEYS, readString, remove, writeString } from '@/platform/storage/storage';

const BASE = '/api';

export class AdminApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'AdminApiError';
    this.status = status;
  }
}

export function getAdminToken(): string | null {
  return readString(STORAGE_KEYS.adminToken);
}

export function setAdminToken(token: string | null): void {
  if (token) writeString(STORAGE_KEYS.adminToken, token);
  else remove(STORAGE_KEYS.adminToken);
}

async function request<T>(path: string, options: { method?: string; body?: unknown } = {}): Promise<T> {
  const { method = 'GET', body } = options;
  const headers: Record<string, string> = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const token = getAdminToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  let response: Response;
  let text: string;
  try {
    response = await fetch(`${BASE}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    text = await response.text();
  } catch {
    throw new AdminApiError('The Devlingo API is not reachable. Is the server running?', 0);
  }

  let payload: any = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = { error: text.slice(0, 300) };
    }
  }

  if (!response.ok) {
    throw new AdminApiError(payload?.error || `Request failed (${response.status})`, response.status);
  }
  return payload as T;
}

/* ------------------------------------------------------------------ shapes */

/**
 * The administrator's own identity - never a learner `UserProfile`. There is
 * no `role`/`email` here: an administrator has neither, by design (see
 * server/db.js's separate `admin` record).
 */
export interface AdminIdentity {
  id: string;
  userId: string;
  createdAt: string;
  lastLoginAt: string | null;
}

export interface AdminUserRow {
  id: string;
  email: string;
  username: string;
  isPremium: boolean;
  createdAt: string | null;
  xp: number;
  level: number;
  streak: number;
  completedChallenges: number;
  completedStages: number;
  lastActiveDay: string | null;
}

export interface AdminStageRow {
  id: string;
  index: string;
  name: string;
  description: string;
  icon?: string;
  language: string;
  /** The language track this stage is ordered within (null if the bank has no tracks). */
  trackId: string | null;
  trackLabel: string | null;
  isPremium?: boolean;
  challengeCount: number;
  hasTest: boolean;
  hidden: boolean;
  order: number;
  original: { name: string; description: string; icon?: string; isPremium: boolean };
}

export interface AdminChallengeRow {
  id: string;
  stageId: string;
  title: string;
  type: string;
  difficulty: 'easy' | 'medium' | 'hard';
  language: string;
  prompt: string;
  explanation: string;
  hints?: string[];
  tags?: string[];
  xpReward: number;
  isStageTest?: boolean;
  hidden: boolean;
  original: { title: string; prompt: string; explanation: string; xpReward: number; difficulty: string };
}

export interface AdminLanguageRow {
  id: string;
  label: string;
  icon: string;
  tagline: string;
  description: string;
  stageIds: string[];
  hidden: boolean;
  stageCount: number;
  challengeCount: number;
}

export interface DashboardSummary {
  totals: {
    users: number;
    premium: number;
    challenges: number;
    stages: number;
    totalXpAwarded: number;
    totalSolves: number;
    activeLast7Days: number;
  };
  signupsByDay: { day: string; signups: number }[];
  judge0Configured: boolean;
  excel: ExcelStatus;
}

export interface ExcelStatus {
  configured: boolean;
  tenantConfigured: boolean;
  clientConfigured: boolean;
  workbookConfigured: boolean;
  worksheetName: string;
  tableName: string;
}

export interface AuditEntry {
  id: string;
  at: string;
  adminId: string;
  adminUsername: string;
  action: string;
  target: string | null;
  details: unknown;
}

export interface AnalyticsSummary {
  byStage: { stageId: string; name: string; language: string; challengeCount: number; totalSolves: number }[];
  challengesByLanguage: Record<string, number>;
  mostMissed: { id: string; title: string; stageId: string; attempts: number; solved: number }[];
}

export interface CredentialsChangeResult {
  admin: AdminIdentity;
  changed: { userId: boolean; password: boolean };
  message: string;
}

/* ----------------------------------------------------------------- methods */

export const adminApi = {
  /**
   * Signs in through the SEPARATE administrator credential system - Admin
   * User ID + Admin Password, never an email, never a learner account (see
   * server/admin-auth.js). A wrong User ID, a wrong password, no admin
   * account configured at all, and a temporary lockout all come back as the
   * exact same generic error, by design.
   */
  async login(userId: string, password: string): Promise<AdminIdentity> {
    const res = await request<{ token: string; admin: AdminIdentity }>('/admin-auth/login', {
      method: 'POST',
      body: { userId, password }
    });
    setAdminToken(res.token);
    return res.admin;
  },

  logout(): void {
    setAdminToken(null);
  },

  /** Re-validates the current admin token against the server - never trusts a cached identity. */
  async me(): Promise<{ admin: AdminIdentity }> {
    return request('/admin-auth/me');
  },

  async dashboard(): Promise<DashboardSummary> {
    return request('/admin/dashboard');
  },

  async analytics(): Promise<AnalyticsSummary> {
    return request('/admin/analytics');
  },

  async auditLog(limit = 100): Promise<{ entries: AuditEntry[] }> {
    return request(`/admin/audit-log?limit=${limit}`);
  },

  async users(q = ''): Promise<{ users: AdminUserRow[] }> {
    return request(`/admin/users${q ? `?q=${encodeURIComponent(q)}` : ''}`);
  },

  async updateUser(id: string, patch: Partial<{ isPremium: boolean; username: string }>): Promise<{ user: AdminUserRow }> {
    return request(`/admin/users/${id}`, { method: 'PATCH', body: patch });
  },

  async deleteUser(id: string): Promise<{ ok: true }> {
    return request(`/admin/users/${id}`, { method: 'DELETE' });
  },

  async languages(): Promise<{ languages: AdminLanguageRow[] }> {
    return request('/admin/content/languages');
  },

  async updateLanguage(id: string, patch: { hidden?: boolean }): Promise<{ override: unknown }> {
    return request(`/admin/content/languages/${id}`, { method: 'PATCH', body: patch });
  },

  async stages(): Promise<{ stages: AdminStageRow[] }> {
    return request('/admin/content/stages');
  },

  async updateStage(
    id: string,
    patch: Partial<{ name: string | null; description: string | null; icon: string | null; hidden: boolean; isPremium: boolean | null; order: number }>
  ): Promise<{ override: unknown }> {
    return request(`/admin/content/stages/${id}`, { method: 'PATCH', body: patch });
  },

  async reorderStage(id: string, direction: 'up' | 'down'): Promise<{ ok: true }> {
    return request(`/admin/content/stages/${id}/reorder`, { method: 'POST', body: { direction } });
  },

  async challenges(stageId?: string): Promise<{ challenges: AdminChallengeRow[] }> {
    return request(`/admin/content/challenges${stageId ? `?stageId=${encodeURIComponent(stageId)}` : ''}`);
  },

  async updateChallenge(
    id: string,
    patch: Partial<{
      title: string | null;
      prompt: string | null;
      explanation: string | null;
      hints: string[] | null;
      tags: string[] | null;
      xpReward: number | null;
      difficulty: 'easy' | 'medium' | 'hard' | null;
      hidden: boolean;
    }>
  ): Promise<{ override: unknown }> {
    return request(`/admin/content/challenges/${id}`, { method: 'PATCH', body: patch });
  },

  async excelStatus(): Promise<ExcelStatus & { sync: { rowIndexByUserId: Record<string, number>; lastSyncedAtByUser: Record<string, string>; lastFullSyncAt: string | null; failures: { id: string; userId: string; username: string; reason: string; error: string; at: string }[] } }> {
    return request('/admin/excel/status');
  },

  async excelTestConnection(): Promise<{ ok: boolean; message: string }> {
    return request('/admin/excel/test-connection', { method: 'POST' });
  },

  async excelSyncNow(): Promise<{ ok: boolean; synced: number; failed: number; total: number; message?: string }> {
    return request('/admin/excel/sync-now', { method: 'POST' });
  },

  async excelRetryFailed(): Promise<{ ok: boolean; retried: number; stillFailing: number; message?: string }> {
    return request('/admin/excel/retry-failed', { method: 'POST' });
  },

  /**
   * Changes the Admin User ID and/or Password. Requires the CURRENT password
   * even though the request is already authenticated - a live session token
   * alone is not enough to change the credentials that govern every future
   * session. On success, every previously issued admin token (including the
   * one that made this request) stops working immediately - the caller must
   * sign in again with the new credentials.
   */
  async updateCredentials(patch: {
    currentPassword: string;
    newUserId?: string;
    newPassword?: string;
    confirmNewPassword?: string;
  }): Promise<CredentialsChangeResult> {
    return request('/admin/settings/credentials', { method: 'PATCH', body: patch });
  }
};
