import type React from 'react';

/* ==========================================================================
   Challenge model
   ========================================================================== */

export type ChallengeType =
  | 'quiz'               // single-answer multiple choice (optionally with a code snippet)
  | 'multi_select'       // multiple correct answers
  | 'output_prediction'  // "what does this print?" — always shows the FULL snippet
  | 'fill_blank'         // fill the ___ holes in a code/pseudocode template
  | 'pseudocode_order'   // drag/click pseudocode lines into the right order
  | 'debug'              // repair broken code, graded by test cases
  | 'code_runner';       // implement a function, graded by test cases

export type Difficulty = 'easy' | 'medium' | 'hard';

export type SupportedLanguage =
  | 'javascript'
  | 'typescript'
  | 'python'
  | 'java'
  | 'c'
  | 'cpp'
  | 'go'
  | 'sql'
  | 'html'
  | 'css'
  | 'bash'
  | 'pseudocode';

export interface TestCase {
  /** Argument list exactly as it would appear inside a call: `[2, 7, 11, 15], 9` */
  input: string;
  /** Expected return value, as a JSON-ish literal: `[0, 1]` */
  expected: string;
  /** Hidden cases still run but their input is masked in the UI. */
  hidden?: boolean;
}

export interface TestResult {
  input: string;
  expected: string;
  actual: string;
  passed: boolean;
  /** Anything the submission printed while this case ran. */
  logs?: string;
  /** Milliseconds this individual case took. */
  timeMs?: number;
}

export interface Blank {
  /** Accepted answer (compared case-sensitively after trimming). */
  answer: string;
  /** Other spellings that should also be accepted. */
  alternatives?: string[];
  /** Optional multiple-choice chips instead of free typing. */
  choices?: string[];
}

export interface ExecutionResult {
  status: 'passed' | 'failed' | 'error';
  stdout?: string;
  stderr?: string;
  /** Human readable duration, e.g. "12ms (Node sandbox)". */
  time?: string;
  message?: string;
  /** Which engine actually ran the code — never lie about this. */
  engine?: string;
  testResults?: TestResult[];
}

export interface Challenge {
  id: string;
  stageId: string;
  title: string;
  type: ChallengeType;
  difficulty: Difficulty;
  language: SupportedLanguage;
  /** The question itself. Plain text, one or two sentences. */
  prompt: string;
  /** Full, multi-line code or pseudocode shown above the answers. Never truncated. */
  codeSnippet?: string;

  /* quiz | output_prediction | multi_select */
  options?: string[];
  correctIndex?: number;
  correctIndices?: number[];

  /* fill_blank — codeSnippet contains one `___` per blank, in order */
  blanks?: Blank[];

  /* pseudocode_order — the lines in their CORRECT order; the UI shuffles them */
  pseudocodeLines?: string[];

  /* debug | code_runner */
  starterCode?: string;
  entryFunction?: string;
  testCases?: TestCase[];
  /** Reference solution, revealed only after the learner asks for it. */
  solutionCode?: string;

  /** Shown one at a time, on demand, before the answer is given away. */
  hints?: string[];
  /** Always shown after answering. Explains *why*. */
  explanation: string;
  xpReward: number;
  tags?: string[];
}

export interface Stage {
  id: string;
  index: string;
  slug?: string;
  name: string;
  state: 'Completed' | 'In progress' | 'Locked';
  description: string;
  isPremium?: boolean;
  /** Emoji or short glyph used on the path list. */
  icon?: string;
  challenges: Challenge[];
}

/* ==========================================================================
   Player model
   ========================================================================== */

export interface ChallengeAttempt {
  challengeId: string;
  /** 0-100 — 100 for a first-try clear, less after retries/hints. */
  score: number;
  attempts: number;
  hintsUsed: number;
  solvedAt: string;
}

export interface UserStats {
  xp: number;
  level: number;
  streak: number;
  bestStreak: number;
  /** ISO yyyy-mm-dd of the last day a challenge was solved. */
  lastActiveDay: string | null;
  completedChallenges: string[];
  completedStages: string[];
  attempts: Record<string, ChallengeAttempt>;
  isPremium?: boolean;
  /**
   * Which account this local copy belongs to; absent for guest progress.
   * Signing in merges GUEST progress into the account - it must never merge
   * a previous user's progress on a shared machine, and it must never merge
   * one account's cached copy into another.
   */
  ownerId?: string;
}

export interface UserProfile {
  id: string;
  email: string;
  username: string;
  avatarUrl?: string;
  isPremium: boolean;
  /** Where this session's identity came from. */
  provider?: 'local' | 'guest';
}

export interface LeaderboardEntry {
  username: string;
  xp: number;
  level: number;
  streak: number;
  solved: number;
}

declare global {
  namespace JSX {
    interface IntrinsicElements {
      'spline-viewer': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement> & { url?: string }, HTMLElement>;
    }
  }
}
