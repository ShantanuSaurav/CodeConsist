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
  /** The lessons. Does NOT include the stage test. */
  challenges: Challenge[];
  /** The mandatory coding test for this stage, if it has one. */
  test?: Challenge;
}

/* ==========================================================================
   Reading material
   ========================================================================== */

/** One `## ` heading of a stage article, addressable from a challenge by tag. */
export interface ArticleSection {
  /** Slug of the heading, used as the URL fragment. */
  id: string;
  title: string;
  /** Challenge tags this section explains; the practice modal matches on them. */
  tags: string[];
  /** Markdown body (the subset src/lib/markdown.tsx renders). */
  body: string;
}

/** The article a learner reads before (or during) a stage's lessons. */
export interface Article {
  stageId: string;
  title: string;
  /** One-paragraph summary shown on the stage card. */
  summary: string;
  readingMinutes: number;
  sections: ArticleSection[];
}

/* ==========================================================================
   Roadmaps (roadmap.sh-style skill maps)
   ========================================================================== */

export type ResourceKind = 'docs' | 'article' | 'video' | 'course' | 'roadmap' | 'practice' | 'book';

export interface RoadmapResource {
  title: string;
  url: string;
  kind: ResourceKind;
}

export interface RoadmapNode {
  id: string;
  title: string;
  /** Two or three sentences: what it is and why it matters. */
  description: string;
  resources: RoadmapResource[];
  /** In-app stage that practises this topic, if any. */
  stageId?: string;
  /** Challenge tags that practise this topic; used to deep-link into the library. */
  tags?: string[];
  /** Nice-to-know rather than core. */
  optional?: boolean;
}

export interface RoadmapSection {
  id: string;
  title: string;
  description?: string;
  nodes: RoadmapNode[];
}

export interface Roadmap {
  slug: string;
  title: string;
  kind: 'role' | 'skill';
  description: string;
  icon: string;
  /** The equivalent roadmap on roadmap.sh, for the wider community version. */
  roadmapShUrl: string;
  sections: RoadmapSection[];
}

export type RoadmapNodeStatus = 'pending' | 'learning' | 'done' | 'skipped';

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
