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
import type { Settings, SettingsIssue } from '@/platform/settings';
import type { DayGoal, HabitState } from '@/types';
import type { HabitStatus, StreakStripCell } from '@/platform/habits';

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
  /** The streak as the learner sees it today (their zone, freezes applied). */
  streak: number;
  /** The daily goal that applies to them; `chosen` is false on the default. Null when goals are off (or from an older server). */
  goal?: { id: string; label: string; chosen: boolean } | null;
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
  /** A password reset link that is live right now, and until when - never the link itself. Absent from an older server. */
  activeResetLink?: { expiresAt: string } | null;
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
  /** Units learners see in this stage (null from a server without units). */
  unitCount?: number | null;
  /** An admin regrouped this stage (Stages > Units). */
  unitsCustomized?: boolean;
  order: number;
  original: { name: string; description: string; icon?: string; isPremium: boolean };
}

/** One unit as the units editor shows it. */
export interface AdminUnit {
  /** Absent on a unit made in the editor and not saved yet (the server names it `${stageId}:m<n>`). */
  id?: string;
  name: string;
  description?: string;
  challengeIds: string[];
  source?: 'default' | 'custom' | 'auto';
  size?: number;
  estMinutes?: number;
  xp?: number;
}

/** A problem (or a warning) with a grouping, tied to its path (`units.2.name`). */
export interface UnitIssue {
  path: string;
  message: string;
}

/** GET /api/admin/content/stages/:id/units - one stage's grouping, over every lesson (hidden ones too). */
export interface AdminUnitsView {
  stageId: string;
  /** The stage as learners see it named (null for a server that does not say). */
  stage?: { id: string; name: string; index: string; hasTest: boolean } | null;
  source: 'default' | 'custom';
  units: AdminUnit[];
  /** The default grouping, for comparison. */
  defaults: AdminUnit[];
  lessons: Array<{ id: string; title: string; type: string; difficulty: string; xpReward: number; hidden: boolean }>;
  /** Lessons in no unit (written after the grouping was saved). */
  unassigned: string[];
  warnings: UnitIssue[];
  nextSeq: number;
  updatedAt: string | null;
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
  original: { title: string; prompt: string; explanation: string; xpReward: number; difficulty: string; hints?: string[]; tags?: string[] };
  /** Present only when the authored original carries Learn-mode teaching steps; the console never edits them. */
  concept?: unknown;
  /* The question's own fields, returned in full so any question can be re-opened for editing. */
  codeSnippet?: string;
  options?: string[];
  correctIndex?: number;
  correctIndices?: number[];
  /** One "why" note per option, as learners get them (an admin's notes on a built-in question included). */
  optionFeedback?: string[];
  blanks?: { answer: string; alternatives?: string[]; choices?: string[]; wrongAnswers?: BlankWrongAnswer[] }[];
  pseudocodeLines?: string[];
  starterCode?: string;
  entryFunction?: string;
  solutionCode?: string;
  testCases?: { input: string; expected: string; hidden?: boolean; description?: string }[];
  uiPreview?: boolean;
  /* Stage tests show these instead of hints. */
  examples?: { input: string; output: string; explanation?: string }[];
  constraints?: string[];
  /**
   * Notes saved for this built-in question's options (or blanks) that have
   * since changed in source: learners do not see them. `staleFeedback`
   * holds them, to look at and save again.
   */
  feedbackStale?: boolean;
  staleFeedback?: { optionFeedback: string[] | null; blankFeedback: BlankFeedback[] | null };
  /** The id of the teaching card (concept) this lesson carries, or null. */
  conceptKey?: string | null;
}

/** A blank's wrong answer and why it is wrong. */
export interface BlankWrongAnswer {
  answer: string;
  feedback: string;
}

/** One blank's wrong answers, as the notes routes take them (one entry per blank, in order). */
export interface BlankFeedback {
  wrongAnswers: BlankWrongAnswer[];
}

/** A note that would give the answer away (it waits until the answer is shown): a warning, never a refusal. */
export interface FeedbackWarning {
  /** `optionFeedback.<i>` or `blanks.<i>.wrongAnswers.<j>`. */
  path: string;
  message: string;
}

/** Notes to save for one question (Answer feedback's "Save accepted"). */
export interface FeedbackItem {
  id: string;
  optionFeedback?: string[] | null;
  blankFeedback?: BlankFeedback[] | null;
}

/** Gemini's draft notes for one question. `leaks` are the keys (`o<i>`, `b<i>.<j>`) of notes that name the answer. */
export interface FeedbackDraft {
  id: string;
  optionFeedback?: string[];
  blankFeedback?: BlankFeedback[];
  leaks: string[];
  /** Gemini wrote nothing usable for it. */
  empty?: boolean;
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
  /** One note per option (empty for none); lined up with `options` by the server. */
  optionFeedback?: string[];
  blanks?: { answer: string; alternatives: string[]; choices: string[]; wrongAnswers?: BlankWrongAnswer[] }[];
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

/** One of the most common wrong answers to a question, labelled for display. */
export interface WrongAnswerRow {
  key: string;
  label: string;
  count: number;
}

/** A question many learners got wrong - from the activity store's per-learner miss summaries. */
export interface MostMissedRow {
  id: string;
  title: string;
  stageId: string;
  /** Learners who missed it or solved it. */
  learners: number;
  /** Learners with at least one miss. */
  missedBy: number;
  /** missedBy / learners, 0-1. */
  missRate: number;
  totalMisses: number;
  /** Misses after which the answer was shown. */
  revealed: number;
  topWrong: WrongAnswerRow[];
  /** Kept for older screens: the same as `learners`. */
  attempts: number;
  solved: number;
}

export interface AnalyticsSummary {
  byStage: { stageId: string; name: string; language: string; challengeCount: number; totalSolves: number }[];
  challengesByLanguage: Record<string, number>;
  mostMissed: MostMissedRow[];
  /** Practice sessions over the last 7 days: learners who practised, and the review XP it paid. Null on an older server. */
  practice?: { learners7d: number; xp7d: number } | null;
}

/* ------------------------------------------------------------ teaching cards */

/** Where a teaching card goes: before a lesson, at the start of a stage, or at the start of a unit. */
export type ConceptAnchor =
  | { kind: 'lesson'; challengeId: string }
  | { kind: 'stage'; stageId: string }
  | { kind: 'unit'; unitId: string; stageId?: string };

/** One example in a card: code, its language, and notes on single lines. */
export interface ConceptExampleInput {
  code: string;
  language: string;
  callouts?: { line: number; text: string }[];
}

/** A teaching card as the editor sends it (the server gives it its id). */
export interface ConceptInput {
  title: string;
  summary: string;
  intro: string;
  example: ConceptExampleInput;
  why: string;
  secondExample?: ConceptExampleInput;
  tryIt?: { instructions: string; starterCode: string; language: string; ui?: boolean };
  explainDifferently?: string;
}

/** One concept on the Teaching page. */
export interface ConceptRow {
  key: string;
  anchor: ConceptAnchor;
  concept: (ConceptInput & { id: string }) | null;
  /** As shipped, a built-in one edited here, or a card written here. */
  source: 'authored' | 'modified' | 'created';
  hidden: boolean;
  /** Times it was re-shown to learners who had seen it ("show it again"). */
  revision: number;
  lessonId: string | null;
  lessonTitle: string | null;
  stageId: string | null;
  /** Learners do not get it: its lesson is hidden or gone, or the lesson has another concept. */
  orphaned: boolean;
  problem: 'anchor-missing' | 'lesson-has-concept' | null;
  updatedAt: string | null;
}

/** One lesson of a stage, and the concept it carries (if any). */
export interface ConceptLesson {
  id: string;
  title: string;
  type: string;
  hidden: boolean;
  concept: { key: string; source: ConceptRow['source']; hidden: boolean; title: string } | null;
}

export interface ConceptsView {
  rows: ConceptRow[];
  /** Per stage: the lessons learners see, and how many carry a concept. */
  coverage: { stageId: string; name: string; lessons: number; withConcept: number }[];
  /** With a stage: its lessons and units (for placing a card). */
  lessons?: ConceptLesson[];
  units?: { id: string; name: string; firstLessonId: string | null }[];
}

/** One question's wrong answers across every learner - answers only, never who. */
export interface ChallengeMisses {
  challenge: { id: string; title: string; type: string; stageId: string; options: string[] | null };
  missedBy: number;
  totalMisses: number;
  revealed: number;
  answers: WrongAnswerRow[];
  recent: { at: string; day: string; context: string; final: boolean; answer: string }[];
}

/** One day of a learner's activity (their own time zone). */
export interface AdminDayRecord {
  xp: number;
  lessons: number;
  tests: number;
  reSolves: number;
  mistakes: number;
  /** Units first completed that day (Phase 2). */
  units: number;
  /** Perfect-unit bonus XP paid that day (already inside `xp`). */
  perfectBonusXp: number;
  /** The daily goal met that day, as it stood then (Phase 3; null until met). */
  goal: DayGoal | null;
  /** The daily-goal bonus paid that day (NOT inside `xp`). */
  goalBonusXp: number;
  /** Right answers in Practice sessions that day (Phase 4). */
  reviews: number;
  /** Practice-session XP paid that day (already inside `xp`). */
  reviewXp: number;
  firstAt: string | null;
  lastAt: string | null;
  source: 'live' | 'backfill' | 'merge';
}

export interface UserLearning {
  timeZone: string | null;
  timeZoneSetAt: string | null;
  today: string;
  from: string;
  days: Record<string, AdminDayRecord>;
  /** Streak and goal (Phase 3; absent from an older server). */
  preferences?: { timeZone: string | null; timeZoneSetAt: string | null; dailyGoalId: string | null; soundOn: boolean | null };
  effectiveGoal?: { id: string; label: string; metric: string; target: number } | null;
  /** The stored streak fields (raw) and habit record. */
  habit?: { streak: number; bestStreak: number; lastActiveDay: string | null; habit: HabitState };
  /** The streak and goal as the learner sees them today. */
  summary?: HabitStatus;
  /** The last 30 days: active, frozen, repaired, missed. */
  strip?: StreakStripCell[];
  /** The most freezes the support edit may set. */
  maxFreezes?: number;
  /** The goals the support edit may set (the enabled options). */
  goalOptions?: { id: string; label: string }[];
  misses: {
    challengeId: string;
    title: string;
    stageId: string | null;
    count: number;
    lastAt: string;
    revealed: number;
    topWrong: string | null;
  }[];
}

/** PATCH /admin/users/:id/learning: any of these; audited with before and after. */
export interface UserLearningPatch {
  freezes?: number;
  /** 0 ends the current run; a value needs the last day it counted (not after the learner's today). */
  streak?: { value: number; lastActiveDay?: string | null };
  dailyGoalId?: string | null;
  clearTimeZone?: true;
}

/** GET /admin/analytics/engagement: goals and streaks across every learner. */
export interface EngagementSummary {
  goalChoice: Record<string, number>;
  /** Learners on the default goal (no choice, or one no longer offered). */
  goalUnset: number;
  metGoalToday: number;
  atRiskNow: number;
  /** Average streak among learners with one going. */
  avgStreak: number;
  learnersWithStreak: number;
  freezesHeld: number;
  freezesUsed7d: number;
  repairsOpen: number;
  repairsDone7d: number;
  learnersWithTimeZone: number;
  learners: number;
}

/* ------------------------------------------------------- rules & rewards */

/** A sparse settings patch: a value sets a setting, `null` puts it (or a whole section) back to its default. */
export type SettingsPatch = Record<string, unknown>;

/** GET /api/admin/settings. `settings`/`defaults` are complete; `overrides` is only what was changed. */
export interface AdminSettingsView {
  settings: Settings;
  overrides: Record<string, unknown>;
  defaults: Settings;
  revision: number;
  updatedAt: string | null;
  updatedBy: string | null;
  /** Stored values the server could not use (their section runs on defaults until fixed). */
  issues: SettingsIssue[];
  /** Settings supplied by environment variables, by path. */
  env: Record<string, unknown>;
}

/** GET /api/admin/settings/context: what the rules page needs to judge a change. */
export interface SettingsContext {
  content: {
    lessons: number;
    tests: number;
    stages: number;
    tracks: number;
    freeStages: number;
    premiumStages: number;
    totalXp: number;
    freeXp: number;
    /** Units learners see across every visible stage (null from a server without units). */
    unitCount?: number | null;
    /** The most the perfect-unit bonus could pay in total, at the saved setting. */
    maxPerfectBonusXp?: number | null;
  } | null;
  runtime: { pythonVerifiable: boolean; judge0Languages: string[] } | null;
  levels: { learnerXp: number[] };
  /** How many learners chose each daily goal, and how many follow the default (Phase 3; null without it). */
  goals?: { choiceCounts: Record<string, number>; unset: number } | null;
}

export interface CredentialsChangeResult {
  admin: AdminIdentity;
  changed: { userId: boolean; password: boolean };
  message: string;
}

/* ------------------------------------------------------- limits & access */

/** One rate-limit bucket's live counters (in memory since the server started). */
export interface RateLimitBucketStatus {
  /** Requests refused (or, logging only, that would have been) since boot. */
  blocked: number;
  lastBlockedAt: string | null;
  /** Keys with a live window. */
  keys: number;
  /** The busiest keys: an address, an account id or an email - with the username when it is an account. */
  top: { key: string; count: number; resetsInSeconds: number; username: string | null }[];
  /** Its settings key under `access.rateLimit`, and the rule in force. */
  setting: string;
  rule: { limit: number; windowSeconds: number } | null;
}

/** GET /api/admin/access/status: what the Limits & access page shows live. */
export interface AccessStatus {
  /** The server's view of the admin's own request, to check the trusted hop count against. */
  ip: {
    socket: string | null;
    forwardedFor: string[];
    hops: number;
    derived: string | null;
    trustworthy: boolean;
    notes: string[];
  };
  limiter: { mode: string; trackedKeys: number; buckets: Record<string, RateLimitBucketStatus> };
  slots: {
    running: number;
    queued: number;
    maxConcurrent: number;
    maxQueued: number;
    queueWaitMs: number;
    completed: number;
    queueFull: number;
    timedOut: number;
    peakQueued: number;
    lastBusyAt: string | null;
  } | null;
  cors: {
    mode: string;
    allowed: { origin: string; source: 'APP_ORIGIN' | 'env' | 'admin' | 'dev' }[];
    recent: { origin: string; count: number; firstAt: string; lastAt: string; method: string; path: string; refused: boolean }[];
  } | null;
  premium: { mode: string; blocked: number; wouldBlock: number; lastAt: string | null; byRoute: Record<string, number> };
  bootedAt: string | null;
}

/* ------------------------------------------------------- password resets */

/** POST /api/admin/users/:id/password-reset - the token is in this answer and nowhere else, ever. */
export interface PasswordResetIssued {
  reset: { id: string; createdAt: string; expiresAt: string };
  token: string;
  /** `/reset-password#token=...` - the token rides in the fragment, which never reaches a server. */
  path: string;
  /** The full link when the server knows its public origin (APP_ORIGIN), else null. */
  url: string | null;
}

export interface PasswordResetRow {
  id: string;
  createdAt: string;
  expiresAt: string;
  usedAt: string | null;
  revokedAt: string | null;
  status: 'active' | 'used' | 'expired' | 'revoked';
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

  /** One question's wrong-answer distribution and its latest misses (no learner identities). */
  async challengeMisses(id: string): Promise<ChallengeMisses> {
    return request(`/admin/analytics/challenges/${encodeURIComponent(id)}/misses`);
  },

  /** One learner's time zone, last 14 weeks of days, most-missed questions, streak and goal. */
  async userLearning(id: string): Promise<UserLearning> {
    return request(`/admin/users/${encodeURIComponent(id)}/learning`);
  },

  /** Support edits to one learner's streak, freezes, goal and time zone (range-checked and audited). */
  async updateUserLearning(id: string, patch: UserLearningPatch): Promise<UserLearning & { changed: string[] }> {
    return request(`/admin/users/${encodeURIComponent(id)}/learning`, { method: 'PATCH', body: patch });
  },

  /** Goals and streaks across every learner. */
  async engagement(): Promise<EngagementSummary> {
    return request('/admin/analytics/engagement');
  },

  /* Rules & rewards: the settings store. Every learner picks a change up within one health probe. */

  async settings(): Promise<AdminSettingsView> {
    return request('/admin/settings');
  },

  /**
   * Save a sparse patch against the revision it was made on. 409 (with the
   * current `revision` in the payload) when someone else saved first; 422
   * with `issues` tied to paths when a value is out of bounds.
   */
  async updateSettings(revision: number, patch: SettingsPatch): Promise<AdminSettingsView> {
    return request('/admin/settings', { method: 'PUT', body: { revision, patch } });
  },

  async settingsContext(): Promise<SettingsContext> {
    return request('/admin/settings/context');
  },

  /* Limits & access: the live side of the `access` settings (in memory on the server; a restart clears it). */

  async accessStatus(): Promise<AccessStatus> {
    return request('/admin/access/status');
  },

  /** Unblock: forget one key's count in a rate-limit bucket, or the whole bucket when `key` is left out. */
  async resetRateLimit(input: { bucket: string; key?: string }): Promise<{ ok: true; cleared: number }> {
    return request('/admin/access/rate-limits/reset', { method: 'POST', body: input });
  },

  /* Password reset links. The token comes back once, from the issue call, and is never stored or logged. */

  async issuePasswordReset(userId: string): Promise<PasswordResetIssued> {
    return request(`/admin/users/${encodeURIComponent(userId)}/password-reset`, { method: 'POST' });
  },

  async passwordResets(userId: string): Promise<{ resets: PasswordResetRow[] }> {
    return request(`/admin/users/${encodeURIComponent(userId)}/password-resets`);
  },

  async revokePasswordReset(id: string): Promise<{ reset: PasswordResetRow }> {
    return request(`/admin/password-resets/${encodeURIComponent(id)}/revoke`, { method: 'POST' });
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

  /* Units: a stage's lessons grouped into short units (the default grouping until one is saved). */

  async stageUnits(stageId: string): Promise<AdminUnitsView> {
    return request(`/admin/content/stages/${encodeURIComponent(stageId)}/units`);
  },

  /** Save a grouping. 422 carries `issues` (and `warnings`) in the error's payload. */
  async saveStageUnits(stageId: string, units: AdminUnit[]): Promise<AdminUnitsView> {
    const body = {
      units: units.map((u) => ({
        ...(u.id ? { id: u.id } : {}),
        name: u.name,
        ...(u.description ? { description: u.description } : {}),
        challengeIds: u.challengeIds
      }))
    };
    return request(`/admin/content/stages/${encodeURIComponent(stageId)}/units`, { method: 'PUT', body });
  },

  /** Back to the default grouping. */
  async resetStageUnits(stageId: string): Promise<AdminUnitsView> {
    return request(`/admin/content/stages/${encodeURIComponent(stageId)}/units`, { method: 'DELETE' });
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

  /**
   * Change a question without replacing it: the presentational fields, hidden,
   * and the wrong-answer notes. On a built-in question the source logic stays
   * live (it is not marked modified); notes are stored with the options they
   * were written for. `null` puts a field back. A 400 carries `issues`;
   * `warnings` name notes that give the answer away (saved all the same).
   */
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
      optionFeedback: string[] | null;
      blankFeedback: BlankFeedback[] | null;
    }>
  ): Promise<{ override: unknown; warnings?: FeedbackWarning[] }> {
    return request(`/admin/content/challenges/${id}`, { method: 'PATCH', body: patch });
  },

  /** Save the notes for up to 50 questions. Each is saved on its own: `rows` saved, `issues` (by id) refused. */
  async saveFeedbackBulk(
    items: FeedbackItem[]
  ): Promise<{ rows: AdminChallengeRow[]; issues: Array<QuestionIssue & { id: string }>; warnings: Array<FeedbackWarning & { id: string }> }> {
    return request('/admin/content/challenges/feedback', { method: 'POST', body: { items } });
  },

  /** Gemini drafts notes for 1-10 questions. Nothing is saved. 503 with `notConfigured` when there is no key. */
  async aiFeedback(ids: string[]): Promise<{ drafts: FeedbackDraft[] }> {
    return request('/admin/ai/feedback', { method: 'POST', body: { ids } });
  },

  /* Teaching cards (concepts): the built-in ones and the admin's own. */

  async concepts(stageId?: string): Promise<ConceptsView> {
    return request(`/admin/content/concepts${stageId ? `?stageId=${encodeURIComponent(stageId)}` : ''}`);
  },

  /** Check a card without saving it. */
  async validateConcept(concept: ConceptInput, anchor?: ConceptAnchor): Promise<{ ok: boolean; issues: QuestionIssue[] }> {
    return request('/admin/content/concepts/validate', { method: 'POST', body: anchor ? { concept, anchor } : { concept } });
  },

  /** A new card. 409 when the lesson already has one (`payload.existingKey` names it). */
  async createConcept(anchor: ConceptAnchor, concept: ConceptInput): Promise<{ card: ConceptRow }> {
    return request('/admin/content/concepts', { method: 'POST', body: { anchor, concept } });
  },

  /** Replace a card's text (a built-in one stays on its lesson). `showAgain` re-shows it to learners who saw it. */
  async replaceConcept(key: string, body: { concept: ConceptInput; anchor?: ConceptAnchor; showAgain?: boolean }): Promise<{ card: ConceptRow }> {
    return request(`/admin/content/concepts/${encodeURIComponent(key)}`, { method: 'PUT', body });
  },

  /** A built-in concept back as it shipped. */
  async revertConcept(key: string): Promise<{ card: ConceptRow }> {
    return request(`/admin/content/concepts/${encodeURIComponent(key)}/revert`, { method: 'POST' });
  },

  async setConceptHidden(key: string, hidden: boolean): Promise<{ card: ConceptRow }> {
    return request(`/admin/content/concepts/${encodeURIComponent(key)}`, { method: 'PATCH', body: { hidden } });
  },

  /** Delete a card written here (a built-in one is hidden or reverted instead). */
  async deleteConcept(key: string): Promise<{ ok: true }> {
    return request(`/admin/content/concepts/${encodeURIComponent(key)}`, { method: 'DELETE' });
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
