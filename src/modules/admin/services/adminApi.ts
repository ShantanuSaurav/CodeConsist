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

const SERVER_OFFLINE = 'The CodeConsist server is offline right now. Please try again in a little while.';

export class AdminApiError extends Error {
  status: number;
  /** The response body, when the server sent one - e.g. `issues` on a 422. */
  payload: unknown;
  constructor(message: string, status: number, payload: unknown = null) {
    super(message);
    this.name = 'AdminApiError';
    this.status = status;
    this.payload = payload;
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
  const headers: Record<string, string> = {
    'ngrok-skip-browser-warning': 'true'
  };
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
    throw new AdminApiError(SERVER_OFFLINE, 0);
  }

  let payload: any = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      // The API only ever answers JSON. Anything else came from something
      // standing in front of it - ngrok's "endpoint is offline" page
      // (ERR_NGROK_3200) when the tunnel is down, or a Vercel error page -
      // so it means "server unreachable", and its HTML is never shown.
      throw new AdminApiError(SERVER_OFFLINE, 0);
    }
  }

  if (!response.ok) {
    throw new AdminApiError(payload?.error || `Request failed (${response.status})`, response.status, payload);
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
  /**
   * How this learner can sign in: the third-party providers linked to the
   * account (provider ids only) and whether a password exists at all. The
   * password itself is stored as a bcrypt hash and is never sent here - no
   * route returns it, to an administrator or to anyone else.
   */
  identities: string[];
  hasPassword: boolean;
  lastLoginAt: string | null;
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
  /** Written in the console (created): not in the authored bank, deletable. */
  custom: boolean;
  /** An authored question whose full replacement was saved here (modified) - it can be reverted. */
  modified: boolean;
  /** The AUTHORED version's presentational fields (the row's own, for a created question). */
  original: { title: string; prompt: string; explanation: string; xpReward: number; difficulty: string };
  /** Present only when the authored original carries Learn-mode teaching steps; the console never edits them. */
  concept?: unknown;
  /* The question's own fields, returned in full so any question can be re-opened for editing. */
  codeSnippet?: string;
  options?: string[];
  correctIndex?: number;
  correctIndices?: number[];
  blanks?: { answer: string; alternatives?: string[]; choices?: string[] }[];
  pseudocodeLines?: string[];
  starterCode?: string;
  entryFunction?: string;
  solutionCode?: string;
  testCases?: { input: string; expected: string; hidden?: boolean; description?: string }[];
  uiPreview?: boolean;
  /* Stage tests show these instead of hints. */
  examples?: { input: string; output: string; explanation?: string }[];
  constraints?: string[];
}

/** What the question wizard sends. The server tidies it and validates it against the content schema. */
export interface QuestionInput {
  stageId: string;
  type: 'quiz' | 'multi_select' | 'output_prediction' | 'fill_blank' | 'pseudocode_order' | 'debug' | 'code_runner';
  title: string;
  prompt: string;
  explanation: string;
  language: string;
  difficulty: 'easy' | 'medium' | 'hard';
  xpReward: number;
  hints: string[];
  tags: string[];
  codeSnippet?: string;
  options?: string[];
  correctIndex?: number;
  correctIndices?: number[];
  blanks?: { answer: string; alternatives: string[]; choices: string[] }[];
  pseudocodeLines?: string[];
  starterCode?: string;
  entryFunction?: string;
  solutionCode?: string;
  testCases?: { input: string; expected: string; hidden: boolean; description: string }[];
  uiPreview?: boolean;
  /* Code questions only; the server ignores them on other types. */
  examples?: { input: string; output: string; explanation: string }[];
  constraints?: string[];
}

/** One problem with a question, tied to the form field it is about (`path` like `options.2` or `testCases.0.expected`). */
export interface QuestionIssue {
  path: string;
  message: string;
}

/** The result of running a coding question's solution on the server. */
export interface SolutionRun {
  status: 'passed' | 'failed' | 'error' | 'skipped';
  reason?: string;
  stderr?: string;
  testResults?: { input: string; expected: string; actual?: string; passed: boolean; error?: string }[];
}

export interface QuestionVerification {
  solution: SolutionRun | null;
  /** For debug questions: the broken starter, which must NOT pass. */
  starter: SolutionRun | null;
}

export interface QuestionCheck {
  ok: boolean;
  issues: QuestionIssue[];
  verification: QuestionVerification | null;
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
  geminiConfigured: boolean;
  excel: ExcelStatus;
  /** Paid orders only; amounts in paise. */
  revenue: { paidOrders: number; totalPaise: number; last30DaysPaise: number };
  /** 'test' means no Razorpay keys are set - checkouts are simulated, clearly labelled. */
  razorpayMode: 'razorpay' | 'test';
}

/* ------------------------------------------------------------------ billing */

/** Prices in paise, per product key kind. A missing entry means "the default". */
export interface PricingRecord {
  lifetime: number;
  tracks: Record<string, number>;
  stages: Record<string, number>;
  certificates: Record<string, number>;
}

export interface PricingResponse {
  /** Effective prices, defaults already resolved. */
  pricing: PricingRecord;
  defaults: { lifetime: number; track: number; stage: number; certificate: number };
  currency: 'INR';
  mode: 'razorpay' | 'test';
  /** `hidden` ids can still be priced, but a grant goes through the learner-visible catalog and would be refused. */
  catalogKeys: {
    tracks: { id: string; label: string; hidden: boolean }[];
    premiumStages: { id: string; name: string; index: string; hidden: boolean }[];
  };
}

/** `null` for a key puts that price back to its default. */
export interface PricingPatch {
  lifetime?: number | null;
  tracks?: Record<string, number | null>;
  stages?: Record<string, number | null>;
  certificates?: Record<string, number | null>;
}

export type AdminBillingProduct =
  | { kind: 'lifetime' }
  | { kind: 'track'; trackId: string }
  | { kind: 'stage'; stageId: string }
  | { kind: 'certificate'; trackId: string };

export interface AdminOrderRow {
  id: string;
  userId: string;
  username: string | null;
  email: string | null;
  product: AdminBillingProduct;
  productKey: string;
  amount: number;
  currency: 'INR';
  provider: 'razorpay' | 'test' | 'admin' | 'free';
  status: 'created' | 'paid' | 'failed' | 'revoked';
  providerOrderId: string | null;
  providerPaymentId: string | null;
  note: string | null;
  certificateName: string | null;
  createdAt: string;
  paidAt: string | null;
  revokedAt: string | null;
  revokedBy: string | null;
  certificateId?: string;
}

export interface AdminCertificateRow {
  id: string;
  userId: string;
  username: string | null;
  trackId: string;
  trackLabel?: string;
  learnerName: string;
  issuedAt: string;
  orderId: string;
  revokedAt: string | null;
}

/* --------------------------------------------- Gemini question assistant */

/** The wizard's question kinds, as the AI routes name them (`frontend` is a code question in HTML). */
export type AiKind = QuestionInput['type'] | 'frontend';

export interface AiStatus {
  configured: boolean;
  model: string;
}

/** Where Gemini thinks a draft belongs. `confidence` is 0-1. */
export interface AiFit {
  stageId: string;
  confidence: number;
  reason: string;
  alternatives: { stageId: string; reason: string }[];
}

/** An existing question that overlaps with the draft, with Gemini's label for the overlap. */
export interface AiCandidate {
  id: string;
  title: string;
  stageId: string;
  stageName: string;
  type: string;
  /** Word overlap 0-1, before Gemini looked. */
  score: number;
  verdict: 'duplicate' | 'similar' | 'distinct';
  reason: string;
}

/** Computed server-side from the candidates' labels - never by Gemini itself. */
export interface AiVerdict {
  push: 'yes' | 'caution' | 'no';
  reason: string;
}

export interface AiSuggestion {
  title: string;
  prompt: string;
  kind: AiKind;
  difficulty: 'easy' | 'medium' | 'hard';
  why: string;
  /** False when an existing question already covers most of it (see `overlaps`). */
  novel: boolean;
  overlaps: { id: string; title: string; score: number }[];
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

  /**
   * Check a question without saving it - field problems plus, for code, the
   * solution's test run. `existingId` names the question being edited, so an
   * authored stage test is held to its extra rules (must stay a code question
   * with a worked example).
   */
  async validateQuestion(input: QuestionInput, existingId?: string): Promise<QuestionCheck> {
    return request(`/admin/content/challenges/validate${existingId ? `?id=${encodeURIComponent(existingId)}` : ''}`, { method: 'POST', body: input });
  },

  /** Save a new question. A 422 carries `issues` in the error payload. The returned row is complete (`custom`, `hidden`, `modified`, `original`). */
  async createQuestion(input: QuestionInput): Promise<{ challenge: AdminChallengeRow; verification: QuestionVerification | null }> {
    return request('/admin/content/challenges', { method: 'POST', body: input });
  },

  /**
   * Replace a question in full. For a created one this overwrites it; for an
   * authored one the server stores the replacement under the same id (the
   * row comes back `modified: true`) and learners see it in the original's
   * place. The returned row is complete, like `createQuestion`'s.
   */
  async replaceQuestion(id: string, input: QuestionInput): Promise<{ challenge: AdminChallengeRow; verification: QuestionVerification | null }> {
    return request(`/admin/content/challenges/${id}`, { method: 'PUT', body: input });
  },

  /** Put the authored original back: drops the modified replacement (409 when there is none). `hidden` is kept. */
  async revertQuestion(id: string): Promise<{ challenge: AdminChallengeRow }> {
    return request(`/admin/content/challenges/${id}/revert`, { method: 'POST' });
  },

  /** Delete a created question. Authored ones answer 409 (`{ authored: true, modified }`) - hide or revert those instead. */
  async deleteQuestion(id: string): Promise<{ ok: true; deleted: true }> {
    return request(`/admin/content/challenges/${id}`, { method: 'DELETE' });
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

  /* Gemini question assistant. The key lives only in the API server's .env; a 503 with `notConfigured` in the payload means it is unset. */

  async aiStatus(): Promise<AiStatus> {
    return request('/admin/ai/status');
  },

  /** Gemini writes the whole question from the admin's words and names the stage it fits best. Nothing is saved. */
  async aiDraft(input: { kind: AiKind; text: string; stageId?: string }): Promise<{ draft: QuestionInput; fit: AiFit }> {
    return request('/admin/ai/draft', { method: 'POST', body: input });
  },

  /** Which existing questions overlap with a draft, and whether it should be pushed. `text` is the admin's original wording, if any. */
  async aiDuplicates(input: { draft: QuestionInput; text?: string }): Promise<{ candidates: AiCandidate[]; verdict: AiVerdict }> {
    return request('/admin/ai/duplicates', { method: 'POST', body: input });
  },

  /** Ideas for questions a stage does not have yet. `count` is 1-10 (default 5). */
  async aiSuggest(input: { stageId: string; kind?: AiKind; count?: number }): Promise<{ suggestions: AiSuggestion[] }> {
    return request('/admin/ai/suggest', { method: 'POST', body: input });
  },

  /* Billing: prices, grants, orders, certificates. Every amount is paise; the page converts for display. */

  async billingPricing(): Promise<PricingResponse> {
    return request('/admin/billing/pricing');
  },

  /** Integers in paise within the server's [MIN, MAX]; `null` resets a key to its default. Audited. */
  async updateBillingPricing(patch: PricingPatch): Promise<PricingResponse> {
    return request('/admin/billing/pricing', { method: 'PUT', body: patch });
  },

  async billingOrders(filter: { status?: string; userId?: string; q?: string } = {}): Promise<{ orders: AdminOrderRow[] }> {
    const params = new URLSearchParams();
    if (filter.status) params.set('status', filter.status);
    if (filter.userId) params.set('userId', filter.userId);
    if (filter.q) params.set('q', filter.q);
    const qs = params.toString();
    return request(`/admin/billing/orders${qs ? `?${qs}` : ''}`);
  },

  /** Give a user a product without a payment (offline/UPI). Creates a paid order with provider 'admin'. 409 when they already have it. */
  async grantAccess(input: { userId: string; product: AdminBillingProduct; note: string; certificateName?: string }): Promise<{ order: AdminOrderRow; certificate?: AdminCertificateRow }> {
    return request('/admin/billing/grant', { method: 'POST', body: input });
  },

  /** Take a paid order back: access goes away, a certificate it issued is flagged revoked. */
  async revokeOrder(id: string): Promise<{ order: AdminOrderRow }> {
    return request(`/admin/billing/orders/${encodeURIComponent(id)}/revoke`, { method: 'POST' });
  },

  async billingCertificates(): Promise<{ certificates: AdminCertificateRow[] }> {
    return request('/admin/billing/certificates');
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
