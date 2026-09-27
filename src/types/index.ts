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
  /** Human-readable explanation of what this specific test case validates. */
  description?: string;
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
  /** Why nothing ran, when the server says: 'runtime-unavailable' means it has no engine for this language. */
  reason?: string;
  /**
   * Setup instructions for whoever runs the server (the Judge0 steps). Shown
   * in development builds only; `stderr` is the sentence a learner reads.
   */
  devHint?: string;
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
  ui?: boolean;
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
  /** When true, renders a live interactive preview pane for this challenge. */
  uiPreview?: boolean;
  /** Optional HTML/CSS template to wrap the user's component in. */
  uiTemplate?: string;

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

  /**
   * True only on a stub the server sent for a premium stage this viewer has
   * not unlocked (server/content.js lockedStub). A stub carries its id,
   * stage, type, title, difficulty, XP, language, `isStageTest` and tags -
   * enough to list and count it - and NOTHING that answers it: `prompt` and
   * `explanation` are missing and every option, blank, test and solution is
   * absent. It is never opened; the practice session shows the unlock prompt.
   */
  locked?: boolean;
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
  /** The lessons, in unit order when the stage has units. Does NOT include the stage test. */
  challenges: Challenge[];
  /** The mandatory coding test for this stage, if it has one. */
  test?: Challenge;
  /**
   * The lessons grouped into short units (src/platform/progress/units.ts).
   * Set by the session from the server's grouping, the cached one, or the
   * default; absent on a stage straight from the bundle. The stage test is
   * never in a unit.
   */
  units?: Unit[];
}

/* ==========================================================================
   Units
   ========================================================================== */

/** Where a unit's grouping came from: the default rule, an admin's, or the leftovers unit. */
export type UnitSource = 'default' | 'custom' | 'auto';

/** A unit as the server stores and sends it: ids and names only. */
export interface UnitDef {
  /** `${stageId}:a1` (default), `${stageId}:m3` (made in the admin), `${stageId}:auto`. */
  id: string;
  name: string;
  description?: string;
  challengeIds: string[];
  source?: UnitSource;
}

/** A unit resolved against its stage's lessons. */
export interface Unit extends UnitDef {
  stageId: string;
  /** 0-based position in the stage. */
  index: number;
  challenges: Challenge[];
  /** Expected minutes, from `settings.units.minutesByType`. */
  estMinutes: number;
  /** XP its questions pay on a first, clean solve. */
  xp: number;
  source: UnitSource;
}

/**
 * The record that a unit was first completed - and whether that paid the
 * perfect-unit bonus. NOT what makes a unit "done": that is always derived
 * from `completedChallenges`.
 */
export interface UnitCompletion {
  completedAt: string;
  perfect: boolean;
  bonusXp: number;
}

/* ==========================================================================
   Language tracks and learning modes
   ========================================================================== */

/**
 * A track is an ordered slice of the stage list that forms one self-contained
 * learning path with its own lock chain ("stage 2 opens once stage 1 is
 * cleared" is evaluated per track). It is NOT a second content system: the
 * same Stage/Challenge records are grouped, never copied. The core CodeConsist
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
  /**
   * When it was FIRST solved. Never overwritten by a re-solve (it used to be,
   * which moved old lessons onto today in the heatmap and the badge dates).
   */
  solvedAt: string;
  /** The most recent solve. Absent on rows written before it existed. */
  lastSolvedAt?: string;
  /** How many times it has been solved. Absent on rows written before it existed. */
  solves?: number;
}

/* ==========================================================================
   Daily activity and failed attempts (src/platform/activity)
   ========================================================================== */

/** Where something happened: a lesson, a stage test, a review, the library, an assessment. */
export type ActivityContext = 'lesson' | 'test' | 'review' | 'library' | 'assessment';

/**
 * One calendar day of a learner's activity, keyed by `yyyy-mm-dd` in THEIR
 * time zone. Every counter defaults to 0 (see `normalizeDay`).
 */
export interface DayRecord {
  /**
   * XP credited that day: only what was actually awarded, so a 0-XP re-solve
   * adds nothing. Solve XP plus any perfect-unit bonus.
   */
  xp: number;
  /** First-time lesson solves. */
  lessons: number;
  /** First-time stage-test solves. */
  tests: number;
  /** Solves of something already solved before. */
  reSolves: number;
  /** Wrong answers recorded that day. */
  mistakes: number;
  /** Units first completed that day. */
  units: number;
  /** Perfect-unit bonus XP paid that day (already inside `xp`). */
  perfectBonusXp: number;
  firstAt: string | null;
  lastAt: string | null;
  /** How the row came to exist: a live event, the one-time backfill, or a guest merge. */
  source: 'live' | 'backfill' | 'merge';
}

/**
 * A wrong answer, reduced to indices and short text - never code, never more
 * than the answer length cap. `lines` are indices into the correct order.
 */
export type MissAnswer =
  | { kind: 'choice'; index: number }
  | { kind: 'multi'; indices: number[] }
  | { kind: 'blanks'; values: string[] }
  | { kind: 'order'; lines: number[] }
  | { kind: 'code'; passed: number; total: number };

/** Everything known about one learner's misses on one challenge. */
export interface MissSummary {
  count: number;
  firstAt: string;
  lastAt: string;
  lastDay: string;
  /** Misses on `lastDay` - what the per-item daily cap counts. */
  lastDayCount: number;
  /** True from any miss until a clean review answer clears it (a later phase). */
  open: boolean;
  /** Final misses, where the answer was shown afterwards. */
  revealed: number;
  /** Wrong-answer keys (`o2`, `o0.3`, `b1:foo`, `order`) and how often, top five. */
  keys: Record<string, number>;
  lastAnswer: MissAnswer | null;
  /** Only ever missed by failing tests - nothing to show but pass counts. */
  codeOnly?: true;
}

export interface MissEntry {
  challengeId: string;
  at: string;
  day: string;
  context: ActivityContext;
  answer: MissAnswer | null;
  /** The answer was shown after this miss. */
  final: boolean;
  /** Present (false) only on a signed-in learner's miss the server has not taken yet. */
  synced?: false;
}

/**
 * A learner's activity log: per-day counters, per-challenge miss summaries
 * and a capped log of recent misses. The server keeps one per account
 * (`db.activity`); the browser keeps a mirror, tagged with `ownerId` exactly
 * like `UserStats.ownerId`.
 */
export interface ActivityLog {
  v: 1;
  /** The latest day anything was recorded on - the day never moves backwards. */
  lastDay: string | null;
  /** When the one-time backfill from `attempts` ran (null = not yet). */
  backfilledAt: string | null;
  days: Record<string, DayRecord>;
  misses: Record<string, MissSummary>;
  /** Newest last, capped. */
  missLog: MissEntry[];
  ownerId?: string;
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
  /**
   * Units whose first completion has been recorded, with the perfect-unit
   * bonus that completion paid (0 when it was not perfect). Optional: an old
   * save or an older server has none. Not what makes a unit "done".
   */
  unitsCompleted?: Record<string, UnitCompletion>;
  /** Lifetime licence (or the legacy Pro flag): every premium stage is open. Server-set, mirrored here. */
  isPremium?: boolean;
  /**
   * Premium stage ids this account has bought outright, or through a track
   * purchase. Copied from the server's `publicUser`; never edited locally.
   */
  unlockedStages?: string[];
  /**
   * Which account this local copy belongs to; absent for guest progress.
   * Signing in merges GUEST progress into the account - it must never merge
   * a previous user's progress on a shared machine, and it must never merge
   * one account's cached copy into another.
   */
  ownerId?: string;
}

/** A third-party sign-in the account can be linked to, alongside a password. */
export type OAuthProviderId = 'google' | 'github';

export interface UserProfile {
  id: string;
  email: string;
  username: string;
  /** The picture a linked provider gave us - a URL and nothing else. Null when there is none. */
  avatarUrl?: string | null;
  /** True with a lifetime licence (or the legacy Pro flag). */
  isPremium: boolean;
  /** Premium stage ids unlocked one at a time or via a track purchase (expanded server-side). */
  unlockedStages: string[];
  /** Where this session's identity came from. */
  provider?: 'local' | 'guest';
  /**
   * Which third-party sign-ins are linked - provider ids only (`['google']`).
   * The provider's own record stays on the server. Optional because a profile
   * cached by an older build has no such field.
   */
  identities?: string[];
  /**
   * Whether this account has a password at all, so the UI can offer "Set a
   * password" instead of "Change password". The password itself is stored
   * only as a bcrypt hash and is never sent anywhere, to anyone.
   */
  hasPassword?: boolean;
  createdAt?: string | null;
  lastLoginAt?: string | null;
  /**
   * The learner's own settings, stored on the account. `timeZone` is the
   * zone their days are counted in (null until the server has seen one).
   * Optional because older servers, and profiles cached by older builds, have
   * no such field.
   */
  preferences?: LearnerPreferences;
}

/** Account-level preferences. Every field is nullable: null means "use the default". */
export interface LearnerPreferences {
  timeZone?: string | null;
  /** Sound effects on or off; null = the default (`celebrations.sound.defaultOn`). */
  soundOn?: boolean | null;
}

/**
 * One saved coding session: the code a learner last had in a challenge's
 * editor. Kept per account on the server so closing the tab, signing out or
 * moving to another machine never means starting the challenge over.
 */
export interface CodeDraft {
  code: string;
  language?: string;
  /** ISO timestamp of the last save. */
  updatedAt: string;
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
