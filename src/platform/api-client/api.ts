/**
 * Client for the local CodeQuest API.
 *
 * Every call degrades gracefully: if the server is not running the app keeps
 * working against localStorage, it just says so instead of silently pretending.
 */
import { Challenge, CodeDraft, ExecutionResult, LeaderboardEntry, TestCase, UserProfile, UserStats } from '@/types';
import { STORAGE_KEYS, readString, remove, writeString } from '../storage/storage';

const BASE = '/api';

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

/** Thrown when the server could not be reached at all. */
export class OfflineError extends Error {
  constructor() {
    super('The CodeQuest API is not reachable. Run `npm run dev:api` to enable accounts and the leaderboard.');
    this.name = 'OfflineError';
  }
}

export function getToken(): string | null {
  return readString(STORAGE_KEYS.token);
}

export function setToken(token: string | null): void {
  if (token) writeString(STORAGE_KEYS.token, token);
  else remove(STORAGE_KEYS.token);
}

async function request<T>(
  path: string,
  options: { method?: string; body?: unknown; auth?: boolean; timeoutMs?: number; keepalive?: boolean } = {}
): Promise<T> {
  const { method = 'GET', body, auth = true, timeoutMs = 15000, keepalive = false } = options;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  const headers: Record<string, string> = {
    'ngrok-skip-browser-warning': 'true'
  };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const token = auth ? getToken() : null;
  if (token) headers.Authorization = `Bearer ${token}`;

  // The timer covers headers AND body. Clearing it as soon as headers arrived
  // left the body read unbounded, and a connection dropped mid-body surfaced
  // as a raw TypeError instead of the OfflineError the app branches on.
  let response: Response;
  let text: string;
  try {
    response = await fetch(`${BASE}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      // `keepalive` lets a request outlive the page, which is the only way a
      // draft typed a moment before the tab closes still reaches the server.
      keepalive,
      signal: controller.signal
    });
    text = await response.text();
  } catch {
    throw new OfflineError();
  } finally {
    clearTimeout(timer);
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
    // A 501 from /api/execute carries a usable result body, not a failure.
    if (response.status === 501 && payload) return payload as T;
    throw new ApiError(payload?.error || `Request failed (${response.status})`, response.status);
  }
  return payload as T;
}

/* ------------------------------------------------------------------ shapes */

export interface AuthResponse {
  token: string;
  user: UserProfile;
  progress: ServerProgress;
}

export interface ServerProgress {
  xp: number;
  level: number;
  streak: number;
  bestStreak: number;
  lastActiveDay: string | null;
  completedChallenges: string[];
  completedStages: string[];
  attempts: UserStats['attempts'];
}

/**
 * Which third-party sign-ins this server has credentials for. Booleans only -
 * the browser never needs (and must never be shipped) a client id or secret.
 * Both false simply means the buttons are hidden and email+password is the
 * only way in.
 */
export interface OAuthProviders {
  google: boolean;
  github: boolean;
}

/**
 * Where the browser sends the learner to begin a provider sign-in. It is a
 * full page navigation, not a fetch: the server answers with a 302 to the
 * provider, and a fetch cannot follow that cross-origin.
 *
 * `link` attaches the provider to the account that is already signed in
 * rather than starting a new session, so the token has to travel with the
 * navigation. A browser cannot put an Authorization header on a link, which
 * leaves the query string; the API redacts `?token=` before anything reaches
 * its log (server/index.js). It goes nowhere else: the destination is this
 * app's own API, same origin, and the server answers with a redirect that
 * carries no token at all.
 */
export function oauthStartUrl(provider: string, options: { link?: boolean } = {}): string {
  const path = `${BASE}/auth/oauth/${encodeURIComponent(provider)}/start`;
  if (!options.link) return path;
  const token = getToken();
  const query = new URLSearchParams({ link: '1' });
  if (token) query.set('token', token);
  return `${path}?${query.toString()}`;
}

export interface HealthResponse {
  ok: boolean;
  challenges: number;
  stages: number;
  users: number;
  /** Never carries credentials - just whether the server has a remote compiler wired up, and for which languages. */
  judge0?: { configured: boolean; languages: string[] };
}

/* ----------------------------------------------------------------- billing */

/**
 * What can be bought. One-time purchases only - there is no subscription.
 * The server prices every product; the client never sends an amount.
 */
export type BillingProduct =
  | { kind: 'lifetime' }
  | { kind: 'track'; trackId: string }
  | { kind: 'stage'; stageId: string }
  | { kind: 'certificate'; trackId: string };

/** Amounts are integer paise (₹1 = 100 paise); `rupees()` formats them. */
export interface BillingCatalog {
  currency: 'INR';
  lifetime: { key: string; amount: number; name: string; description: string };
  tracks: { key: string; trackId: string; label: string; amount: number; stageIds: string[]; premiumStageIds: string[] }[];
  /** Only premium stages; hidden ones are already excluded server-side. */
  stages: { key: string; stageId: string; name: string; index: string; trackId: string | null; amount: number }[];
  certificates: { key: string; trackId: string; label: string; amount: number }[];
}

export interface CertificateEligibility {
  eligible: boolean;
  /** Plain words for the UI, e.g. "Finish every stage in this track (3 of 10 cleared)." */
  reason: string;
  stagesTotal: number;
  stagesCleared: number;
}

export interface BillingCatalogResponse {
  /** 'test' means the server has no Razorpay keys: payments are simulated through an explicit step. */
  mode: 'razorpay' | 'test';
  /** The public Razorpay key id ('' in test mode). Never the secret. */
  keyId: string;
  currency: 'INR';
  catalog: BillingCatalog;
  /** Null for anonymous callers. */
  owned: { lifetime: boolean; unlockedStages: string[]; certificates: Record<string, string> } | null;
  eligibility: Record<string, CertificateEligibility> | null;
}

export type BillingProvider = 'razorpay' | 'test' | 'admin' | 'free';
export type BillingOrderStatus = 'created' | 'paid' | 'failed' | 'revoked';

export interface BillingOrder {
  id: string;
  userId: string;
  product: BillingProduct;
  productKey: string;
  /** Paise. */
  amount: number;
  currency: 'INR';
  provider: BillingProvider;
  status: BillingOrderStatus;
  providerOrderId: string | null;
  providerPaymentId: string | null;
  note: string | null;
  certificateName: string | null;
  createdAt: string;
  paidAt: string | null;
  revokedAt: string | null;
  revokedBy: string | null;
  /** Set once a certificate order has issued its certificate. */
  certificateId?: string;
}

/** What the Razorpay checkout needs; null when the order was free and is already paid. */
export interface CheckoutInfo {
  amount: number;
  currency: 'INR';
  providerOrderId: string;
  name: string;
  description: string;
  prefill: { name: string; email: string };
}

export interface CreateOrderResponse {
  order: BillingOrder;
  mode: 'razorpay' | 'test';
  keyId: string;
  checkout: CheckoutInfo | null;
}

/** What comes back once an order is paid, however it was paid. */
export interface OrderPaidResponse {
  order: BillingOrder;
  certificate?: Certificate;
  user: UserProfile;
}

export interface Certificate {
  /** Doubles as the public verification code. */
  id: string;
  trackId: string;
  trackLabel: string;
  learnerName: string;
  issuedAt: string;
  revoked: boolean;
}

/** The owner's full view of one certificate, for the printable page. */
export interface CertificateDetail extends Certificate {
  username: string;
  stagesTotal: number;
}

export interface VerifyCertificateResponse {
  valid: boolean;
  certificate?: { id: string; learnerName: string; trackId: string; trackLabel: string; issuedAt: string; revoked: boolean };
}

/** Rupees for display: 199900 paise -> "₹1,999". Never used for arithmetic. */
export function rupees(paise: number): string {
  const whole = Math.floor(Math.abs(paise) / 100);
  const rest = Math.abs(paise) % 100;
  const formatted = whole.toLocaleString('en-IN');
  return `₹${formatted}${rest ? `.${String(rest).padStart(2, '0')}` : ''}`;
}

/* ----------------------------------------------------------------- methods */

export const api = {
  async health(): Promise<HealthResponse> {
    return request<HealthResponse>('/health', { auth: false, timeoutMs: 3000 });
  },

  async register(email: string, username: string, password: string): Promise<AuthResponse> {
    const res = await request<AuthResponse>('/auth/register', {
      method: 'POST',
      auth: false,
      body: { email, username, password }
    });
    setToken(res.token);
    return res;
  },

  async login(email: string, password: string): Promise<AuthResponse> {
    const res = await request<AuthResponse>('/auth/login', {
      method: 'POST',
      auth: false,
      body: { email, password }
    });
    setToken(res.token);
    return res;
  },

  async me(): Promise<{ user: UserProfile; progress: ServerProgress }> {
    return request('/auth/me');
  },

  /* Sign in with Google / GitHub. The browser never handles a provider secret:
     it navigates to `oauthStartUrl(...)`, the server does the whole exchange,
     and the learner comes back to /auth/callback holding only a CodeQuest token. */

  /** Which providers this server is configured for. Hidden buttons when both are false. */
  async oauthProviders(): Promise<OAuthProviders> {
    return request<OAuthProviders>('/auth/oauth/providers', { auth: false, timeoutMs: 5000 });
  },

  /**
   * Disconnect a provider. The server refuses (409) when it would leave the
   * account with no way to sign in at all.
   */
  async unlinkOAuth(provider: string): Promise<{ user?: UserProfile }> {
    return request(`/auth/oauth/${encodeURIComponent(provider)}`, { method: 'DELETE' });
  },

  /**
   * Set or change the learner's own password. `currentPassword` is required
   * only when the account already has one - an account created through Google
   * or GitHub has none until this is called. Only ever sends the new password
   * to the server, which stores nothing but a bcrypt hash of it.
   */
  async setPassword(body: { currentPassword?: string; newPassword: string }): Promise<{ user: UserProfile }> {
    return request('/auth/password', { method: 'POST', body });
  },

  /* Saved coding sessions. One call restores every challenge the learner has
     unfinished code in, so signing in puts them back exactly where they were. */

  async drafts(): Promise<{ drafts: Record<string, CodeDraft> }> {
    return request('/drafts');
  },

  /** `keepalive` keeps the request alive past a closing tab, for the flush-on-exit save. */
  async saveDraft(
    challengeId: string,
    code: string,
    language?: string,
    options: { keepalive?: boolean } = {}
  ): Promise<{ draft: CodeDraft }> {
    return request(`/drafts/${encodeURIComponent(challengeId)}`, {
      method: 'PUT',
      body: language === undefined ? { code } : { code, language },
      keepalive: options.keepalive
    });
  },

  async deleteDraft(challengeId: string): Promise<{ ok: true }> {
    return request(`/drafts/${encodeURIComponent(challengeId)}`, { method: 'DELETE' });
  },

  async content(): Promise<{ stages: any[]; challenges: Challenge[]; languageTracks?: any[]; hiddenLanguages?: string[] }> {
    return request('/content', { auth: false });
  },

  /**
   * Record a solve. The server re-checks the submission itself before paying
   * any XP - `answer` for choice/blank/order challenges, `code` for coding
   * ones - so the client's own verdict is a preview, never the decision.
   */
  async solve(
    challengeId: string,
    attempts: number,
    hintsUsed: number,
    submission: { answer?: unknown; code?: string } = {}
  ): Promise<{
    progress: ServerProgress;
    awardedXp: number;
    score: number;
    firstSolve: boolean;
    verified: boolean;
  }> {
    return request('/progress/solve', {
      method: 'POST',
      body: { challengeId, attempts, hintsUsed, ...submission }
    });
  },

  async mergeProgress(progress: Partial<ServerProgress>): Promise<{ progress: ServerProgress }> {
    return request('/progress/merge', { method: 'POST', body: { progress } });
  },

  async resetProgress(): Promise<{ progress: ServerProgress }> {
    return request('/progress/reset', { method: 'POST' });
  },

  /* Billing. Prices and entitlements come from the server; the client only asks. */

  async billingCatalog(): Promise<BillingCatalogResponse> {
    return request('/billing/catalog');
  },

  /** Start a purchase. The server picks the price; `certificateName` only matters for certificate products. */
  async createOrder(product: BillingProduct, certificateName?: string): Promise<CreateOrderResponse> {
    return request('/billing/orders', {
      method: 'POST',
      body: certificateName === undefined ? { product } : { product, certificateName }
    });
  },

  /** Hand Razorpay's checkout result to the server, which verifies the signature before unlocking anything. */
  async confirmOrder(
    id: string,
    payload: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }
  ): Promise<OrderPaidResponse> {
    return request(`/billing/orders/${encodeURIComponent(id)}/confirm`, { method: 'POST', body: payload });
  },

  /** Test mode only: the server refuses this when Razorpay keys are configured. */
  async testCompleteOrder(id: string): Promise<OrderPaidResponse> {
    return request(`/billing/orders/${encodeURIComponent(id)}/test-complete`, { method: 'POST' });
  },

  async myOrders(): Promise<{ orders: BillingOrder[] }> {
    return request('/billing/orders');
  },

  async myCertificates(): Promise<{ certificates: Certificate[] }> {
    return request('/certificates');
  },

  async certificate(id: string): Promise<{ certificate: CertificateDetail }> {
    return request(`/certificates/${encodeURIComponent(id)}`);
  },

  /** Public: anyone with the code can check it. */
  async verifyCertificate(code: string): Promise<VerifyCertificateResponse> {
    return request(`/verify/${encodeURIComponent(code)}`, { auth: false });
  },

  async leaderboard(): Promise<{ leaderboard: LeaderboardEntry[] }> {
    return request('/leaderboard', { auth: false });
  },

  async grade(challengeId: string, answer: unknown): Promise<{ correct: boolean; explanation: string }> {
    return request('/grade', { method: 'POST', auth: false, body: { challengeId, answer } });
  },

  async execute(payload: {
    language: string;
    code: string;
    entryFunction?: string;
    testCases?: TestCase[];
  }): Promise<ExecutionResult> {
    return request('/execute', { method: 'POST', auth: false, body: payload, timeoutMs: 30000 });
  }
};
