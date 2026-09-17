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

/** A worked example shown on a stage test, LeetCode-style. */
export interface WorkedExample {
  input: string;
  output: string;
  explanation?: string;
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

/* ==========================================================================
   Beginner teaching ("concept") model

   A Challenge can optionally carry a `concept`: a short guided-teaching
   sequence shown ONCE, before the challenge itself, the first time the
   learner reaches it. It exists so a beginner meets a new idea
   (intro -> example -> why it works -> a tiny ungraded try-it) before being
   quizzed on it, instead of the quiz being the very first thing they see.
   The challenge that carries the `concept` then IS the "quick check" step;
   later challenges in the stage are the practice, and the stage test is the
   challenge. Once shown, the concept's id is recorded in
   `UserStats.seenConcepts` and it is never shown again.
   ========================================================================== */

/** One annotated line of a code example, e.g. explaining what `let` does. */
export interface CodeCallout {
  /** 1-based line number within the example's `code`. */
  line: number;
  /** Short note about that line. */
  text: string;
}

/** A tiny, ungraded snippet the learner can edit and run to build intuition. */
export interface TryItExample {
  instructions: string;
  starterCode: string;
  language: SupportedLanguage;
}

export interface Concept {
  /** Stable id, e.g. "variables-let". Independent of any challenge id. */
  id: string;
  /** Short title, e.g. "What is a variable?" */
  title: string;
  /** One line describing what this concept teaches, shown in the step header. */
  summary: string;
  /** Very short, plain-language explanation. A paragraph or two, not a wall of text. */
  intro: string;
  /** The first example, shown right after the intro. */
  example: {
    code: string;
    language: SupportedLanguage;
    callouts?: CodeCallout[];
  };
  /** "Why does this work?" - what the language/runtime is actually doing. */
  why: string;
  /** An optional second, slightly harder example (for "gradually increase difficulty"). */
  secondExample?: {
    code: string;
    language: SupportedLanguage;
    callouts?: CodeCallout[];
  };
  /** The hands-on, ungraded step before the quick check. */
  tryIt?: TryItExample;
  /**
   * A plainer, more basic restatement of `intro`, shown only if the learner
   * clicks "I don't understand" / "Explain this differently". Optional -
   * omit it if `intro` is already about as simple as the idea can get.
   */
  explainDifferently?: string;
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

  /**
   * Marks the stage's mandatory coding test. One per stage; unlocked once every
   * lesson in the stage is solved, and the next stage stays locked until it is
   * passed. Presented with examples and constraints rather than hints.
   */
  isStageTest?: boolean;
  /** Worked examples, for stage tests. */
  examples?: WorkedExample[];
  /** Input guarantees the solution may rely on, for stage tests. */
  constraints?: string[];

  /** Shown one at a time, on demand, before the answer is given away. */
  hints?: string[];
  /** Always shown after answering. Explains *why*. */
  explanation: string;
  xpReward: number;
  tags?: string[];

  /**
   * Beginner teaching shown once, before this challenge, the first time the
   * learner reaches it. See the Concept model above.
   */
  concept?: Concept;
}

export interface Stage {
  id: string;
  index: string;
  slug?: string;
  name: string;
  /**
   * 'Test pending' = every lesson solved, stage test not yet passed. The next
   * stage does not open until it is.
   */
  state: 'Completed' | 'Test pending' | 'In progress' | 'Locked';
  description: string;
  isPremium?: boolean;
  /** Emoji or short glyph used on the path list. */
  icon?: string;
  /**
   * Which language track this stage belongs to. Every stage belongs to
   * exactly one language track (see `src/data/tracks.ts`); a stage's
   * challenges all share this language (the stage test may not, e.g. a
   * pure-assessment quiz for a language with no server-side execution
   * engine). Defaults to 'javascript' for stages authored before tracks
   * existed — see `hydrateStage` if one is ever read without it.
   */
  language: SupportedLanguage;
  /** The lessons. Does NOT include the stage test. */
  challenges: Challenge[];
  /** The mandatory coding test for this stage, if it has one. */
  test?: Challenge;
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
  /** Ids of Concept teaching sequences already shown, so they are not repeated. */
  seenConcepts: string[];
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
