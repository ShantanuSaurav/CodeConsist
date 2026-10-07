/**
 * Client for the local CodeQuest API.
 *
 * Every call degrades gracefully: if the server is not running the app keeps
 * working against localStorage, it just says so instead of silently pretending.
 */
import {
  ActivityContext,
  ActivityLog,
  AssessmentClaim,
  AssessmentView,
  Challenge,
  CodeDraft,
  DayRecord,
  ExecutionResult,
  HabitState,
  LeaderboardResponse,
  LeagueView,
  LearnerPreferences,
  LearningMode,
  MissSummary,
  ReviewEvent,
  ReviewItem,
  ReviewItemState,
  ReviewOutcome,
  TestCase,
  UserProfile,
  UserStats
} from '@/types';
import { STORAGE_KEYS, readString, remove, writeString } from '../storage/storage';
import type { PlaygroundLanguage, PlaygroundProgram, PlaygroundSave } from '../playground/model';
import { browserTimeZone } from '../time/days';
import type { ActivityView } from '../activity/log';
import type { PublicSettings } from '../settings/types';
import type { HabitStatus } from '../habits/types';

const BASE = '/api';

/** What the server can say about WHY it refused, beyond the status. */
export interface ApiErrorDetails {
  /**
   * A machine-readable reason: 'rate-limited' (429), 'busy' (503, every
   * code-runner slot taken), 'premium-locked' (403), 'stage-test', ...
   */
  reason?: string;
  /** With a 429: how long until a retry can succeed. */
  retryAfterSeconds?: number;
  /** The whole response body, for callers that need more (a 503's run result, say). */
  payload?: unknown;
}

export class ApiError extends Error {
  status: number;
  reason?: string;
  retryAfterSeconds?: number;
  payload?: unknown;
  constructor(message: string, status: number, details: ApiErrorDetails = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.reason = details.reason;
    this.retryAfterSeconds = details.retryAfterSeconds;
    this.payload = details.payload;
  }
}

/** Thrown when the server could not be reached at all. */
export class OfflineError extends Error {
  constructor() {
    super('The CodeConsist server is offline right now. Please try again in a little while.');
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
  // The learner's own zone, so the server counts their days in it (the write
  // routes store it on the account). A browser whose Intl will not say, or
  // throws, simply sends nothing - it must never break the request.
  try {
    const zone = browserTimeZone();
    if (zone) headers['X-Time-Zone'] = zone;
  } catch {
    /* no zone header */
  }

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
      // The API only ever answers JSON. Anything else came from something
      // standing in front of it - ngrok's "endpoint is offline" page
      // (ERR_NGROK_3200) when the tunnel is down, or a Vercel error page -
      // so it means "server unreachable", and its HTML is never shown.
      throw new OfflineError();
    }
  }

  if (!response.ok) {
    // A 501 from /api/execute carries a usable result body, not a failure.
    if (response.status === 501 && payload) return payload as T;
    // The server's own sentence: `error`, or a run result's `stderr` (the
    // 503 "busy" answer from /api/execute has no `error`).
    const message = (typeof payload?.error === 'string' && payload.error) || (typeof payload?.stderr === 'string' && payload.stderr) || `Request failed (${response.status})`;
    const retryAfter = Number(payload?.retryAfterSeconds ?? response.headers?.get?.('Retry-After'));
    throw new ApiError(message, response.status, {
      reason: typeof payload?.reason === 'string' ? payload.reason : undefined,
      retryAfterSeconds: Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : undefined,
      payload
    });
  }
  return payload as T;
}

/* ------------------------------------------------------------------ shapes */

export interface AuthResponse {
  token: string;
  user: UserProfile;
  progress: ServerProgress;
  /** The streak and goal as they stand today (freezes applied). Absent from an older server. */
  habits?: HabitStatus;
}

export interface ServerProgress {
  xp: number;
  level: number;
  /** The RAW stored streak (its missed days worked out on the learner's today); screens show `habits.streak`. */
  streak: number;
  bestStreak: number;
  lastActiveDay: string | null;
  completedChallenges: string[];
  completedStages: string[];
  attempts: UserStats['attempts'];
  /** Units whose first completion was recorded, and the bonus it paid. Absent from an older server. */
  unitsCompleted?: UserStats['unitsCompleted'];
  /** Freezes, repair and streak history. Absent from an older server (and from a row nothing has written yet). */
  habit?: HabitState;
  /** The Practice schedule (entries only for questions reviewed or revealed). Absent from an older server. */
  review?: Record<string, ReviewItemState>;
  /** Stages tested out of (Phase 5). Absent from an older server. */
  testedOut?: UserStats['testedOut'];
  /** Teaching sequences already shown, as the account knows them - union with this browser's. Absent from an older server. */
  seenConcepts?: string[];
  /**
   * Every challenge this account was ever paid for (Phase 6): kept by a
   * progress reset, so XP earned again never counts for the weekly league.
   * Server bookkeeping - the browser never sends it. Absent from an older server.
   */
  everSolved?: string[];
}

/** A bonus paid on top of a solve's own XP. `awardedXp` never includes it. */
export type Bonus = { kind: 'perfect-unit'; unitId: string; xp: number } | { kind: 'daily-goal'; day: string; xp: number };

/** What a solve did to the streak and the daily goal (server/habits.js). */
export interface HabitEventsResponse {
  /** The daily goal was met for the first time today with this solve. */
  goalMet: boolean;
  freezeEarned: boolean;
  /** An open repair was completed: the lost streak is back. */
  repaired: boolean;
  /** The goal bonus this solve paid (0 when none). */
  bonusXp: number;
  streakDay?: boolean;
  /** Days a freeze covered when the missed days were worked out. */
  frozenDays?: string[];
  broken?: { lostStreak: number; repairOffered: boolean } | null;
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
 * `ticket` attaches the provider to the account that is already signed in
 * rather than starting a new session. It comes from `api.oauthLinkTicket()`,
 * which is a normal authenticated request - the session token stays in the
 * Authorization header, where a URL cannot carry it into somebody else's
 * link, the browser history or a proxy log.
 */
export function oauthStartUrl(provider: string, options: { ticket?: string } = {}): string {
  const path = `${BASE}/auth/oauth/${encodeURIComponent(provider)}/start`;
  if (!options.ticket) return path;
  return `${path}?${new URLSearchParams({ link: '1', ticket: options.ticket }).toString()}`;
}

/**
 * One language's engine, as the server describes it.
 *
 * `label` is a name and a version and nothing else - never a URL, a key or a
 * host name. It exists so the UI can say "Judge0 (self-hosted)" rather than
 * "Judge0", which is the difference between an engine that is free, private
 * and unlimited and one that is rate limited and posts code to a third party.
 */
export interface RuntimeInfo {
  available: boolean;
  engine: 'node' | 'browser' | 'judge0' | 'none';
  label: string;
}

export interface HealthResponse {
  ok: boolean;
  challenges: number;
  stages: number;
  users: number;
  /** Never carries credentials - just whether the server has a remote compiler wired up, and for which languages. */
  judge0?: { configured: boolean; languages: string[] };
  /**
   * Per-language engines, keyed by language. Optional because a server built
   * before this key existed simply does not send it, and the client has to
   * keep working against one - `judge0` above stays the fallback.
   */
  runtimes?: Record<string, RuntimeInfo>;
  /**
   * The revision of the admin's learning rules. When it differs from the
   * cached one the client refetches `GET /api/settings`. Absent from an older
   * server, which means "use the defaults".
   */
  settingsRevision?: number;
}

/** What `GET /api/settings` returns: the learner-facing rules and their revision. */
export interface SettingsResponse {
  revision: number;
  settings: PublicSettings;
}

/** The day a solve or a miss landed on, as the server recorded it. */
export type TodayRow = DayRecord & { day: string };

export interface SolveResponse {
  progress: ServerProgress;
  awardedXp: number;
  score: number;
  firstSolve: boolean;
  verified: boolean;
  /** Absent from an older server. */
  settingsRevision?: number;
  today?: TodayRow;
  /** Bonuses on top of `awardedXp` (a perfect unit, the daily goal). Absent from an older server. */
  bonuses?: Bonus[];
  /** Every bonus this solve paid: the perfect unit's and the daily goal's. */
  bonusXp?: number;
  /** The unit this solve completed for the first time, or null. */
  unitCompleted?: string | null;
  /** Whether that unit was cleared perfectly (first try throughout). */
  unitPerfect?: boolean;
  /** The streak and goal after this solve. Absent from an older server. */
  habits?: HabitStatus;
  /** What this solve did to them; `bonusXp` is the goal bonus alone. Absent from an older server. */
  habitEvents?: HabitEventsResponse;
}

export interface MergeResponse {
  progress: ServerProgress;
  mergedChallenges?: number;
  /** Solve XP only; unit and goal bonuses are in `bonusXp`. */
  awardedXp?: number;
  bonusXp?: number;
  bonuses?: Bonus[];
  /** The account's activity after the merge. Absent from an older server. */
  activity?: ActivityView;
  /** The account's preferences after a guest's were adopted. Absent from an older server. */
  preferences?: LearnerPreferences;
  /** The streak and goal after the merge. Absent from an older server. */
  habits?: HabitStatus;
  /**
   * Solved ids that were NOT credited because they are in a premium stage
   * this account has not unlocked. Absent when there were none.
   */
  skippedLocked?: string[];
  /** Practice XP the merged review log paid (not in `awardedXp`). Absent from an older server. */
  awardedReviewXp?: number;
  /**
   * Solved ids NOT credited because their stage is not open on the account
   * (the stage order, `access.mergeGate` enforcing). Absent when there were none.
   */
  droppedChallenges?: string[];
  /** What became of a guest's test-out claims, when any were sent. */
  claims?: { accepted: string[]; rejected: Array<{ stageId: string; reason: string }> };
}

/** `GET /api/assessments/status`: what the learner may take now, and what is running. */
export interface AssessmentStatusResponse {
  placement: { eligible: boolean; reason: string | null; retryAt: string | null; queue: string[] } | null;
  testOut: Record<string, { allowed: boolean; reason: string | null; retryAt: string | null; attemptsLeft: number }>;
  active: AssessmentView | null;
}

/** What a submit in a test-out or a placement returns. */
export interface AssessmentSubmitResponse {
  assessment: AssessmentView;
  passed: boolean;
  progress: ServerProgress;
  awardedXp: number;
  bonusXp?: number;
  settingsRevision?: number;
  today?: TodayRow;
  habits?: HabitStatus;
  habitEvents?: HabitEventsResponse;
}

/** What `POST /api/review/session` returns: a session, or nothing to practise and when to come back. */
export interface ReviewSessionResponse {
  sessionId: string | null;
  items: ReviewItem[];
  /** The day the next question falls due (null when none will). */
  nextDueDay?: string | null;
  xp?: { remainingToday: number };
  expiresAt?: string;
}

/** What `POST /api/review/answer` returns. */
export interface ReviewAnswerResponse {
  correct: boolean;
  outcome: ReviewOutcome;
  awardedXp: number;
  bonusXp: number;
  /** The daily-goal bonus this answer paid, the first time today's goal was met. */
  goalBonusXp?: number;
  xpRemainingToday: number;
  /** Answered right: the question is done in this session. */
  resolved?: boolean;
  /** Every question in the session is answered right. */
  sessionComplete?: boolean;
  /** The question was already answered right in this session: nothing was paid. */
  replay?: boolean;
  progress: ServerProgress;
  today?: TodayRow;
  habits?: HabitStatus;
  habitEvents?: HabitEventsResponse | null;
  settingsRevision?: number;
}

/** What `PATCH /api/me/preferences` accepts (any subset); `null` puts a default back - not for the zone. */
export type PreferencesPatch = Partial<Pick<LearnerPreferences, 'soundOn' | 'dailyGoalId' | 'trackId' | 'learningMode' | 'motivation' | 'experience'>> & {
  timeZone?: string;
  /** The first-run setup was finished or put aside (Phase 5). Not a preference: it is kept beside them. */
  onboarding?: 'completed' | 'dismissed';
};

/** What `PATCH /api/me/preferences` returns. */
export interface PreferencesResponse {
  user: UserProfile;
  /** `timeZone` is present only when the request sent a zone. */
  applied: { timeZone?: boolean };
}

/** What `GET /api/content` returns. */
export interface ContentResponse {
  /** Stage metadata; from Phase 2 each carries `units` (ids and names). */
  stages: any[];
  /** Every challenge; one in a premium stage this viewer cannot open is a `locked` stub. */
  challenges: Challenge[];
  languageTracks?: any[];
  hiddenLanguages?: string[];
  /** The premium stages this viewer has not unlocked (their challenges are stubs). Absent from an older server. */
  lockedStageIds?: string[];
}

/** `POST /api/auth/password-reset/inspect`: is this reset link live, and whose is it? */
export type PasswordResetInspect =
  | { valid: true; username: string; expiresAt: string }
  | { valid: false; reason: 'unknown' | 'expired' | 'used' | 'revoked' };

/** One wrong answer on its way to `POST /api/activity/misses`. */
export interface MissUpload {
  challengeId: string;
  /** The answer as the practice modal holds it (non-code challenges). */
  answer?: unknown;
  /** Pass counts of a failed run (code challenges). */
  code?: { passed: number; total: number };
  context?: ActivityContext;
  /** The answer was shown after this miss. */
  final?: boolean;
  /** When it happened, if it was queued. */
  at?: string;
}

export interface MissesResponse {
  accepted: number;
  dropped: number;
  today: TodayRow;
  misses: Record<string, MissSummary>;
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

/**
 * A progress copy as a merge sends it: without what only this browser keeps
 * (a guest's claims go in their own field; held-back solves are a notice).
 */
function withoutLocalOnly<T extends object>(progress: T): T {
  if (!progress || typeof progress !== 'object') return progress;
  const { assessmentClaims: _claims, heldChallenges: _held, ...rest } = progress as T & { assessmentClaims?: unknown; heldChallenges?: unknown };
  return rest as T;
}

/* ----------------------------------------------------------------- methods */

export const api = {
  async health(): Promise<HealthResponse> {
    return request<HealthResponse>('/health', { auth: false, timeoutMs: 10000 });
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

  async me(): Promise<{ user: UserProfile; progress: ServerProgress; habits?: HabitStatus }> {
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
   * Permission to connect a provider to THIS account, for the navigation that
   * follows. Short-lived and single-use, so the link it ends up in is worth
   * nothing to anyone else.
   */
  async oauthLinkTicket(provider: string): Promise<{ ticket: string; expiresInSeconds: number }> {
    return request(`/auth/oauth/${encodeURIComponent(provider)}/link-ticket`, { method: 'POST' });
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

  /**
   * The bank as THIS viewer may see it - so it is asked with the session:
   * a premium stage the account has not unlocked comes back as stubs.
   */
  async content(): Promise<ContentResponse> {
    return request('/content');
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
    submission: {
      answer?: unknown;
      code?: string;
      context?: ActivityContext;
      /** Learn or Practice: which score cap applies after a reveal. */
      learningMode?: LearningMode | null;
      /** Back at the end of the unit after a miss: completes below the pass mark. */
      requeued?: boolean;
      /** Its answer was shown first: the score is capped. */
      revealed?: boolean;
    } = {}
  ): Promise<SolveResponse> {
    return request('/progress/solve', {
      method: 'POST',
      body: { challengeId, attempts, hintsUsed, ...submission }
    });
  },

  /**
   * Carry local progress into the account: a guest's on sign-in, or this
   * account's own offline copy. `activity` (days, miss summaries, recent
   * misses - trimmed by the caller to stay under the 256 kB body limit) is
   * merged idempotently, so sending it twice never counts anything twice.
   *
   * Should the body still be too large (413), the progress goes up again on
   * its own: the solves are what a sign-in or a sign-out must not lose, and
   * the log is only history.
   */
  async mergeProgress(
    progress: Partial<ServerProgress>,
    activity?: Pick<ActivityLog, 'days' | 'misses' | 'missLog'>,
    preferences?: LearnerPreferences | null,
    reviewLog?: ReviewEvent[] | null,
    assessmentClaims?: AssessmentClaim[] | null
  ): Promise<MergeResponse> {
    // A guest's own choices (sound on or off, their daily goal) go along; the
    // server adopts them only where the account has none. Their streak
    // freezes and history ride in `progress.habit`, their Practice schedule
    // in `progress.review`; Practice answers the server has not priced yet
    // go in `reviewLog`, and passed test-outs (with the answer that passed
    // them, checked again there) in `assessmentClaims` - never inside
    // `progress`, which would send them twice.
    const extra = {
      ...(preferences ? { preferences } : {}),
      ...(reviewLog && reviewLog.length ? { reviewLog } : {}),
      ...(assessmentClaims && assessmentClaims.length ? { assessmentClaims } : {})
    };
    const sent = withoutLocalOnly(progress);
    try {
      return await request<MergeResponse>('/progress/merge', { method: 'POST', body: activity ? { progress: sent, activity, ...extra } : { progress: sent, ...extra } });
    } catch (err) {
      if (activity && err instanceof ApiError && err.status === 413) {
        return request<MergeResponse>('/progress/merge', { method: 'POST', body: { progress: sent, ...extra } });
      }
      throw err;
    }
  },

  /** The account's progress row, with level and streak as they stand on the learner's today. */
  async progress(): Promise<{ progress: ServerProgress; habits?: HabitStatus }> {
    return request('/progress');
  },

  /* Test-out and placement (Phase 5). The server decides who may start what and records every pass. */

  /** What may be started now (per stage, and a placement on `trackId`), and the one running. */
  async assessmentStatus(trackId?: string): Promise<AssessmentStatusResponse> {
    return request(`/assessments/status${trackId ? `?trackId=${encodeURIComponent(trackId)}` : ''}`);
  },

  /** Start a test-out of one stage, or a placement on a track. A 409 `active-exists` carries the running one. */
  async startAssessment(input: { kind: 'test-out'; stageId: string } | { kind: 'placement'; trackId: string }): Promise<{ assessment: AssessmentView }> {
    return request('/assessments', { method: 'POST', body: input });
  },

  /** Hand in the current test of a running assessment. A wrong answer (422) does not use up the run. */
  async submitAssessment(
    id: string,
    body: { stageId: string; attempts: number; hintsUsed: number; code?: string; answer?: unknown }
  ): Promise<AssessmentSubmitResponse> {
    return request(`/assessments/${encodeURIComponent(id)}/submit`, { method: 'POST', body });
  },

  /** The current test was not passed: the learner gave up, or ran out of runs. */
  async failAssessment(id: string, body: { stageId: string; reason: 'gave-up' | 'out-of-runs'; runs?: number }): Promise<{ assessment: AssessmentView }> {
    return request(`/assessments/${encodeURIComponent(id)}/fail`, { method: 'POST', body });
  },

  /** End a placement early. */
  async finishAssessment(id: string): Promise<{ assessment: AssessmentView }> {
    return request(`/assessments/${encodeURIComponent(id)}/finish`, { method: 'POST' });
  },

  /**
   * Change the learner's own preferences: sound (Phase 2), the daily goal and
   * the time zone (Phase 3), the track, the learning mode and the first-run
   * setup's answers (Phase 5); `null` puts a default back. A zone changed
   * again within the cooldown is not applied (`applied.timeZone: false`) -
   * that is not an error.
   */
  async updatePreferences(patch: PreferencesPatch): Promise<PreferencesResponse> {
    return request('/me/preferences', { method: 'PATCH', body: patch });
  },

  /** Teaching sequences shown in this browser, added to the account's (known ones only). */
  async markConceptsSeen(conceptIds: string[]): Promise<{ seenConcepts: string[] }> {
    return request('/progress/concepts', { method: 'POST', body: { conceptIds } });
  },

  /** The learner-facing rules. Public: guests play by the same rules. */
  async settings(): Promise<SettingsResponse> {
    return request('/settings', { auth: false, timeoutMs: 10000 });
  },

  /** The account's days from `from` (default: the last 14 weeks) and its miss summaries. */
  async activity(from?: string): Promise<ActivityView> {
    return request(`/activity${from ? `?from=${encodeURIComponent(from)}` : ''}`);
  },

  /** Record wrong answers (1-50). `keepalive` lets the request outlive a closing tab. */
  async recordMisses(misses: MissUpload[], options: { keepalive?: boolean } = {}): Promise<MissesResponse> {
    return request('/activity/misses', { method: 'POST', body: { misses }, keepalive: options.keepalive });
  },

  /** Start a Practice session (the whole bank, or one stage). */
  async reviewSession(scope: { stageId?: string } = {}): Promise<ReviewSessionResponse> {
    return request('/review/session', { method: 'POST', body: scope.stageId ? { stageId: scope.stageId } : {} });
  },

  /**
   * Answer one question of a Practice session. The server checks the answer
   * and prices it; a 404 with `reason: 'expired'` means the session is over
   * (start a new one).
   */
  async reviewAnswer(body: {
    sessionId: string;
    challengeId: string;
    answer?: unknown;
    code?: string;
    attempts: number;
    hintsUsed: number;
    revealed?: boolean;
  }): Promise<ReviewAnswerResponse> {
    return request('/review/answer', { method: 'POST', body });
  },

  async resetProgress(): Promise<{ progress: ServerProgress; habits?: HabitStatus }> {
    return request('/progress/reset', { method: 'POST' });
  },

  /* Billing. Prices and entitlements come from the server; the client only asks. */

  async billingCatalog(): Promise<BillingCatalogResponse> {
    return request('/billing/catalog');
  },

  async playgroundSaves(language: PlaygroundLanguage): Promise<{ snippets: PlaygroundSave[] }> {
    return request(`/playground/snippets?language=${encodeURIComponent(language)}`);
  },

  async savePlayground(id: string, title: string, program: PlaygroundProgram): Promise<{ snippet: PlaygroundSave }> {
    return request(`/playground/snippets/${encodeURIComponent(id)}`, { method: 'PUT', body: { title, program } });
  },

  async renamePlayground(id: string, title: string): Promise<{ snippet: PlaygroundSave }> {
    return request(`/playground/snippets/${encodeURIComponent(id)}`, { method: 'PATCH', body: { title } });
  },

  async deletePlayground(id: string): Promise<{ ok: true }> {
    return request(`/playground/snippets/${encodeURIComponent(id)}`, { method: 'DELETE' });
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

  /**
   * The all-time board. With the session when there is one, so the server
   * can mark the learner's own row (`isYou`) and send their place even
   * below the shown rows (`me`); a guest (or a token the server no longer
   * accepts) simply gets the board.
   */
  async leaderboard(): Promise<LeaderboardResponse> {
    return request('/leaderboard');
  },

  /**
   * This week's league (Phase 6): the board, the countdown, the learner's
   * own place and last week's result. A guest passes their zone (`tz`) so
   * the week and the countdown are in it; an account's own zone is used
   * otherwise. 404 from an older server that has no league.
   */
  async leagueCurrent(tz?: string | null): Promise<LeagueView> {
    return request(`/leagues/current${tz ? `?tz=${encodeURIComponent(tz)}` : ''}`, { timeoutMs: 10000 });
  },

  /** With the session, so a premium lesson is graded for a learner who has unlocked it. */
  async grade(challengeId: string, answer: unknown): Promise<{ correct: boolean; explanation: string }> {
    return request('/grade', { method: 'POST', body: { challengeId, answer } });
  },

  async execute(payload: {
    language: string;
    code: string;
    entryFunction?: string;
    testCases?: TestCase[];
    /**
     * What the program reads on standard input. Only the compiled languages
     * use it (the server ignores it elsewhere), and it is what makes Scanner
     * and scanf work - the first program most people write in Java or C reads
     * a number, and without this it reads EOF.
     */
    stdin?: string;
  }): Promise<ExecutionResult> {
    // With the session when there is one: a signed-in learner's runs are
    // limited per account, a guest's per address (a 429 or a 503 "busy"
    // comes back as an ApiError with its `reason`).
    return request('/execute', { method: 'POST', body: payload, timeoutMs: 30000 });
  },

  /* Password reset links. An administrator issues one from Users; the token
     arrives in the page's URL fragment and only ever travels in these bodies. */

  /** Is this link live, and for whom? Never throws for a dead link - `valid: false` says why. */
  async inspectPasswordReset(token: string): Promise<PasswordResetInspect> {
    return request('/auth/password-reset/inspect', { method: 'POST', auth: false, body: { token } });
  },

  /**
   * Set a new password with a link. Answers like a login (and stores the new
   * token); every other session of the account is signed out. 410 when the
   * link is used, expired or withdrawn.
   */
  async resetPassword(token: string, newPassword: string): Promise<AuthResponse> {
    const res = await request<AuthResponse>('/auth/password-reset', { method: 'POST', auth: false, body: { token, newPassword } });
    setToken(res.token);
    return res;
  }
};
