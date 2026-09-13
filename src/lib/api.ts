/**
 * Client for the local CodeQuest API.
 *
 * Every call degrades gracefully: if the server is not running the app keeps
 * working against localStorage, it just says so instead of silently pretending.
 */
import { Challenge, ExecutionResult, LeaderboardEntry, TestCase, UserProfile, UserStats } from '../types';
import { STORAGE_KEYS, readString, remove, writeString } from './storage';

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
  options: { method?: string; body?: unknown; auth?: boolean; timeoutMs?: number } = {}
): Promise<T> {
  const { method = 'GET', body, auth = true, timeoutMs = 15000 } = options;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  const headers: Record<string, string> = {};
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

export interface HealthResponse {
  ok: boolean;
  challenges: number;
  stages: number;
  users: number;
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

  async content(): Promise<{ stages: any[]; challenges: Challenge[] }> {
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

  async upgradePro(): Promise<{ user: UserProfile }> {
    return request('/account/pro', { method: 'POST' });
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
    return request('/execute', { method: 'POST', auth: false, body: payload, timeoutMs: 20000 });
  }
};
