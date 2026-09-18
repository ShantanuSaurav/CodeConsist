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
   sequence shown ONCE, before the challenge itself, the first time a learner
   in Learn mode reaches it. It exists so a beginner meets a new idea
   (intro -> example -> why it works -> a tiny ungraded try-it) before being
   quizzed on it, instead of the quiz being the very first thing they see.
   The challenge that carries the `concept` then IS the "quick check" step;
   later challenges in the stage are the practice, and the stage test is the
   challenge. Once shown, the concept's id is recorded in
   `UserStats.seenConcepts`. Practice mode never shows it.
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

export interface ConceptExample {
  code: string;
  language: SupportedLanguage;
  callouts?: CodeCallout[];
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
  example: ConceptExample;
  /** "Why does this work?" - what the language/runtime is actually doing. */
  why: string;
  /** An optional second, slightly harder example (for "gradually increase difficulty"). */
  secondExample?: ConceptExample;
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
   * Beginner teaching shown once, before this challenge, the first time a
   * learner in Learn mode reaches it. See the Concept model above.
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
   * The language most of this stage's lessons are written in. Informational
   * (the Playground opens on it, the path shows it); which track a stage
   * belongs to is decided by `LanguageTrack.stageIds`, not by this field.
   */
  language: SupportedLanguage;
  /** The lessons. Does NOT include the stage test. */
  challenges: Challenge[];
  /** The mandatory coding test for this stage, if it has one. */
  test?: Challenge;
}

/* ==========================================================================
   Language tracks and learning modes
   ========================================================================== */

/**
 * A track is an ordered slice of the stage list that forms one self-contained
 * learning path with its own lock chain ("stage 2 opens once stage 1 is
 * cleared" is evaluated per track). It is NOT a second content system: the
 * same Stage/Challenge records are grouped, never copied. The core Devlingo
 * path (Programming Basics → Shipping) is one track; C and C++ are others.
 */
export interface LanguageTrack {
  /** 'core', 'c', 'cpp', ... */
  id: string;
  label: string;
  icon: string;
  tagline: string;
  description: string;
  /** The language a fresh Playground opens on for this track. */
  primaryLanguage: SupportedLanguage;
  /** Stage ids in the order this track presents them. */
  stageIds: string[];
}

/**
 * How a learner wants to reach a stage's challenges.
 *   'learn'    - theory, examples, a try-it and a quick check before each new idea
 *   'practice' - straight to the challenges
 * Both use the same challenge engine, grading, XP, streaks and unlocking; only
 * the journey to the question differs.
 */
export type LearningMode = 'learn' | 'practice';

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

/**
 * A link into reading material, offered to a module by the app so the module
 * that shows it need not import the module that owns it.
 */
export interface ReadingLink {
  href: string;
  label: string;
  minutes?: number;
}

/** Resolves reading for a stage (and optionally the tags of one challenge). */
export type ReadingResolver = (stageId: string, tags?: readonly string[]) => ReadingLink | null;

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
  /** Display order on the hub; lower first. */
  order: number;
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
  /**
   * Ids of Concept teaching sequences already shown, so they are not
   * repeated. A local, per-browser affordance: it earns no XP and the server
   * never verifies it.
   */
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
