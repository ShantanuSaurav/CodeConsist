/* ==========================================================================
   Admin metadata for every setting: its label, help text, kind and bounds.

   This one table drives three things, so they can never disagree:
     - the zod bounds the server and the admin validate with (schema.ts),
     - the form the admin edits it in (modules/admin GenericSection),
     - which keys a merge treats as leaves (merge.ts).
   A setting with no entry here cannot be saved, and a unit test fails when
   a default has no entry - nothing can be added without being editable.
   ========================================================================== */
import type { SettingsSectionId } from './types';

export type SettingKind =
  | 'int'
  | 'number'
  | 'bool'
  | 'enum'
  | 'string'
  | 'text'
  | 'zone'
  | 'intList'
  | 'stringList'
  | 'rows'
  | 'map'
  | 'origins';

/** One column of a `rows` setting (for example a rank's `minLevel` and `title`). */
export interface RowFieldMeta {
  key: string;
  label: string;
  /** `intList`: a list of whole numbers in one cell (a badge family's tiers); `min`/`max` bound each. */
  kind: 'int' | 'number' | 'bool' | 'string' | 'enum' | 'intList';
  min?: number;
  max?: number;
  minLength?: number;
  maxLength?: number;
  values?: string[];
  /** `intList`: how many entries. */
  minItems?: number;
  maxItems?: number;
  /** `string`: the `{tokens}` the text may use (checked by a section rule in schema.ts). */
  tokens?: string[];
}

export interface SettingMeta {
  label: string;
  help: string;
  kind: SettingKind;
  /** Numbers: bounds of the value. Lists: bounds of each item. */
  min?: number;
  max?: number;
  step?: number;
  /** `enum`: the allowed values. */
  values?: string[];
  minLength?: number;
  maxLength?: number;
  /** Lists and rows: how many entries. */
  minItems?: number;
  maxItems?: number;
  /** `text`: the `{tokens}` the copy may use; any other token is rejected. */
  tokens?: string[];
  /** `text`: example values for the live preview. */
  sample?: Record<string, string | number>;
  /** Read from this environment variable when set (between the defaults and the admin's overrides). */
  envVar?: string;
  /** `rows`: the columns. */
  rowMeta?: RowFieldMeta[];
  /** May be null (for example "no default zone - use the server's"). */
  nullable?: boolean;
  /** Shown after the input: "points", "hours", "XP". */
  unit?: string;
}

export interface SectionMeta {
  id: SettingsSectionId;
  title: string;
  description: string;
  /** 'admin' sections are never sent to learners. */
  audience: 'public' | 'admin';
  /** The build phase that introduced the section - for the admin's own orientation. */
  phase: string;
}

/** In admin display order. */
export const SECTION_META: SectionMeta[] = [
  {
    id: 'xp',
    title: 'XP & scoring',
    description: 'How a solve is scored and how much XP it pays. The server applies these the moment they are saved.',
    audience: 'public',
    phase: 'P1'
  },
  {
    id: 'levels',
    title: 'Levels & ranks',
    description:
      'The XP each level needs and the rank titles. A level is always computed from XP, so a curve change applies to every learner at once - it never costs anyone XP.',
    audience: 'public',
    phase: 'P1'
  },
  {
    id: 'streak',
    title: 'Streak, freezes & repair',
    description:
      "What makes a streak day, the freezes that cover a missed day, the repair that wins a broken streak back, and which day a solve counts on. Days are counted in each learner's own time zone.",
    audience: 'public',
    phase: 'P1'
  },
  {
    id: 'goals',
    title: 'Daily goal',
    description:
      'The goals a learner can pick, which one applies until they choose, and the bonus XP meeting it pays (once a day). A met day stays met when a learner changes their goal.',
    audience: 'public',
    phase: 'P3'
  },
  {
    id: 'reminders',
    title: 'In-app reminders',
    description:
      'The banners and toasts about streaks and goals: at risk, goal met, freezes, a broken or repaired streak, and welcome back. In the app only - no email or push. Plain text; each message may use only the {tokens} listed under it.',
    audience: 'public',
    phase: 'P3'
  },
  {
    id: 'units',
    title: 'Units',
    description:
      "How a stage's lessons are grouped into short units by default, how long each kind of question takes, and the perfect-unit bonus. A stage's own grouping is edited from Stages > Units; default groupings are re-derived from these numbers.",
    audience: 'public',
    phase: 'P2'
  },
  {
    id: 'celebrations',
    title: 'Celebrations & sound',
    description: 'Sounds, confetti, the level-up screen and the words on the unit end screen. Learners can still turn sound off for themselves.',
    audience: 'public',
    phase: 'P2'
  },
  {
    id: 'badges',
    title: 'Badges',
    description:
      'Tiered badge families (each tier is a badge: streak-3, streak-7, ...), their tier names, and the stage badges. Changing a tier never announces a burst of badges - open learner tabs re-read what they already have.',
    audience: 'public',
    phase: 'P2'
  },
  {
    id: 'feedback',
    title: 'Answer feedback & retries',
    description:
      'How many wrong answers a question allows before its answer is shown, which "why this is wrong" notes appear, when a coding lesson offers its solution, and how a missed question comes back at the end of the unit. The notes themselves are written under Answer feedback.',
    audience: 'public',
    phase: 'P4'
  },
  {
    id: 'review',
    title: 'Practice sessions',
    description:
      "Short Practice sessions that go back over a learner's mistakes, the questions due on their review schedule and their weakest solves - and the small XP they pay under a daily cap. A session is built from the rules as they are when it starts; what an answer pays uses the rules at that moment.",
    audience: 'public',
    phase: 'P4'
  },
  {
    id: 'copy',
    title: 'Site copy',
    description:
      'What visitors read when something is unavailable, the landing page and meta description, and the limit, premium, not-found and error messages. Plain text; each message may use only the {tokens} listed under it.',
    audience: 'public',
    phase: 'P1T'
  },
  {
    id: 'retention',
    title: 'Data limits',
    description: 'How much activity and how many wrong answers are kept per learner. Never sent to learners.',
    audience: 'admin',
    phase: 'P1'
  },
  {
    id: 'access',
    title: 'Limits & access',
    description:
      'Rate limits, code-runner capacity, the proxy chain, CORS, the server-side premium lock and reset-link lifetime. Applied to the next request. Never sent to learners.',
    audience: 'admin',
    phase: 'P1T'
  }
];

/** Sections that never leave the server's admin routes. */
export const ADMIN_ONLY_SECTIONS: readonly string[] = ['retention', 'access'];

/* ------------------------------------------------------------------ units */

/** Every question kind with its admin label, for the per-kind minutes. */
export const QUESTION_KINDS: Array<{ key: string; label: string }> = [
  { key: 'quiz', label: 'Quiz' },
  { key: 'output_prediction', label: 'Output prediction' },
  { key: 'multi_select', label: 'Multiple select' },
  { key: 'fill_blank', label: 'Fill in the blanks' },
  { key: 'pseudocode_order', label: 'Order the lines' },
  { key: 'code_runner', label: 'Write code' },
  { key: 'debug', label: 'Debug' }
];

const UNITS_META: Record<string, SettingMeta> = {
  'units.targetSize': {
    label: 'Target unit size',
    help: 'How many questions a default unit aims for. Between the minimum and the maximum.',
    kind: 'int',
    min: 1,
    max: 30,
    unit: 'questions'
  },
  'units.minSize': {
    label: 'Smallest unit',
    help: 'A default unit smaller than this joins the unit before it, when the two together stay within the largest size.',
    kind: 'int',
    min: 1,
    max: 30,
    unit: 'questions'
  },
  'units.maxSize': {
    label: 'Largest unit',
    help: 'No default unit is bigger than this.',
    kind: 'int',
    min: 1,
    max: 30,
    unit: 'questions'
  },
  'units.targetMinutes': {
    label: 'Target unit length',
    help: 'How long a unit should take. The units editor warns about a unit expected to take longer.',
    kind: 'int',
    min: 1,
    max: 60,
    unit: 'minutes'
  },
  ...Object.fromEntries(
    QUESTION_KINDS.map(({ key, label }): [string, SettingMeta] => [
      `units.minutesByType.${key}`,
      {
        label: `Minutes per question: ${label}`,
        help: 'The expected time for one question of this kind - the "~6 min" learners see on each unit.',
        kind: 'number',
        min: 0.1,
        max: 30,
        step: 0.25,
        unit: 'minutes'
      }
    ])
  ),
  'units.perfectBonusXp': {
    label: 'Perfect-unit bonus',
    help: 'Paid once per unit, when a first solve completes a unit whose every question was right on the first try.',
    kind: 'int',
    min: 0,
    max: 500,
    unit: 'XP'
  },
  'units.perfectRequiresNoHints': {
    label: 'Perfect means no hints',
    help: 'On: a hint anywhere in the unit means no bonus. Off: only first-try answers count.',
    kind: 'bool'
  }
};

/* ----------------------------------------------------------- celebrations */

/** The sounds, with their admin labels. */
export const SOUND_EVENTS: Array<{ key: string; label: string }> = [
  { key: 'correct', label: 'Correct answer' },
  { key: 'wrong', label: 'Wrong answer' },
  { key: 'unitComplete', label: 'Unit complete' },
  { key: 'levelUp', label: 'Level up' },
  { key: 'badge', label: 'Badge earned' }
];

const CELEBRATION_COPY_MAX = 80;
const CELEBRATION_SAMPLE: Record<string, string | number> = { xp: 25, level: 7, title: 'Developer', n: 5 };

function celebrationCopy(label: string, help: string, tokens: string[] = []): SettingMeta {
  return { label, help, kind: 'text', minLength: 1, maxLength: CELEBRATION_COPY_MAX, tokens, sample: CELEBRATION_SAMPLE };
}

const CELEBRATIONS_META: Record<string, SettingMeta> = {
  'celebrations.sound.defaultOn': {
    label: 'Sound on by default',
    help: 'For a learner who has not chosen. Each learner can turn sound on or off for themselves (Settings, or the speaker in a lesson).',
    kind: 'bool'
  },
  'celebrations.sound.volume': {
    label: 'Volume',
    help: 'How loud the effects are, from 0 (silent) to 1.',
    kind: 'number',
    min: 0,
    max: 1,
    step: 0.05
  },
  ...Object.fromEntries(
    SOUND_EVENTS.map(({ key, label }): [string, SettingMeta] => [
      `celebrations.sound.events.${key}`,
      { label: `Sound: ${label}`, help: 'Play this sound (when the learner has sound on).', kind: 'bool' }
    ])
  ),
  'celebrations.confetti.onCorrect': {
    label: 'Confetti on a correct answer',
    help: 'Only when the answer paid XP - unless re-solves are turned on below.',
    kind: 'bool'
  },
  'celebrations.confetti.onCorrectParticles': {
    label: 'Confetti on a correct answer: particles',
    help: 'How much confetti. Learners who ask their system for reduced motion never see any.',
    kind: 'int',
    min: 0,
    max: 300
  },
  'celebrations.confetti.onReSolve': {
    label: 'Confetti on a re-solve too',
    help: 'Also after solving something already solved, which pays no XP.',
    kind: 'bool'
  },
  'celebrations.confetti.onUnitEnd': {
    label: 'Confetti at the end of a unit',
    help: 'On the unit end screen, when the unit paid any XP.',
    kind: 'bool'
  },
  'celebrations.confetti.unitEndParticles': {
    label: 'Confetti at the end of a unit: particles',
    help: 'How much confetti on the end screen.',
    kind: 'int',
    min: 0,
    max: 400
  },
  'celebrations.levelUpOverlay': {
    label: 'Level-up screen',
    help: 'After a unit or a stage test that crossed a level, show "Level N" full screen (closed with Enter or Esc).',
    kind: 'bool'
  },
  'celebrations.countUpMs': {
    label: 'XP count-up',
    help: 'How long the XP number counts up on the end screen. 0 shows it at once.',
    kind: 'int',
    min: 0,
    max: 5000,
    unit: 'ms'
  },
  'celebrations.copy.unitComplete': celebrationCopy('End screen: heading', 'The heading when a unit is finished.'),
  'celebrations.copy.perfect': celebrationCopy('End screen: perfect unit', 'When the unit paid the perfect-unit bonus.', ['xp']),
  'celebrations.copy.flawless': celebrationCopy('End screen: flawless replay', 'A replay answered all right first time (no bonus - it was paid before).'),
  'celebrations.copy.levelUp': celebrationCopy('Level-up screen: heading', 'The big line on the level-up screen.', ['level']),
  'celebrations.copy.newRank': celebrationCopy('Level-up screen: new title', 'Under it, when the level also brought a new rank title.', ['title']),
  'celebrations.copy.streakUp': celebrationCopy('End screen: streak', 'Beside the flame when the day streak went up.', ['n'])
};

/* ----------------------------------------------------------------- badges */

export const BADGE_METRICS: Array<{ key: string; label: string }> = [
  { key: 'bestStreak', label: 'Best day streak' },
  { key: 'solvedCount', label: 'Challenges solved' },
  { key: 'unitsCompleted', label: 'Units completed' },
  { key: 'perfectUnits', label: 'Perfect units' },
  { key: 'xp', label: 'Total XP' },
  { key: 'testsPassed', label: 'Stage tests passed' }
];

const BADGES_META: Record<string, SettingMeta> = {
  'badges.tierNames': {
    label: 'Tier names',
    help: 'The name of each tier, lowest first (Bronze, Silver, ...). A family with more tiers than names uses the last name for the rest.',
    kind: 'stringList',
    minItems: 2,
    maxItems: 8,
    minLength: 1,
    maxLength: 20
  },
  'badges.families': {
    label: 'Badge families',
    help: 'Each tier of a family is one badge, with the id family-N (streak-3, streak-7, ...). Title and detail must contain {n}, the tier. Tiers climb strictly. Changing a family id renames its badges.',
    kind: 'rows',
    minItems: 0,
    maxItems: 12,
    rowMeta: [
      { key: 'id', label: 'Id', kind: 'string', minLength: 1, maxLength: 32 },
      { key: 'metric', label: 'Counts', kind: 'enum', values: BADGE_METRICS.map((m) => m.key) },
      { key: 'enabled', label: 'On', kind: 'bool' },
      { key: 'title', label: 'Title', kind: 'string', minLength: 1, maxLength: 60, tokens: ['n'] },
      { key: 'detail', label: 'Detail', kind: 'string', minLength: 1, maxLength: 60, tokens: ['n'] },
      { key: 'tiers', label: 'Tiers', kind: 'intList', min: 1, max: 10_000_000, minItems: 1, maxItems: 8 }
    ]
  },
  'badges.stageBadges.enabled': {
    label: 'Stage badges',
    help: 'One badge per stage, earned when the stage (lessons and test) is cleared.',
    kind: 'bool'
  },
  'badges.stageBadges.coreTitle': {
    label: 'Stage badge: core stage',
    help: 'The title of a core stage badge, by stage number.',
    kind: 'text',
    minLength: 1,
    maxLength: 60,
    tokens: ['index'],
    sample: { index: '03' }
  },
  'badges.stageBadges.trackTitle': {
    label: 'Stage badge: track stage',
    help: 'The title of a track stage badge (C, C++), by name - every track starts again at 01.',
    kind: 'text',
    minLength: 1,
    maxLength: 60,
    tokens: ['name'],
    sample: { name: 'C Fundamentals' }
  }
};

/* --------------------------------------------------------------- feedback */

/** The answer-graded kinds, with their admin labels, for the per-kind attempt budgets. */
export const ANSWER_KINDS: Array<{ key: string; label: string }> = QUESTION_KINDS.filter((k) => k.key !== 'code_runner' && k.key !== 'debug');

/** Where wrong-answer notes can be switched on or off. */
export const NOTE_CONTEXTS: Array<{ key: string; label: string }> = [
  { key: 'learn', label: 'Learn mode' },
  { key: 'practice', label: 'Practice mode' },
  { key: 'review', label: 'Practice sessions' }
];

const FEEDBACK_META: Record<string, SettingMeta> = {
  ...Object.fromEntries(
    ANSWER_KINDS.map(({ key, label }): [string, SettingMeta] => [
      `feedback.attemptsBeforeReveal.practice.${key}`,
      {
        label: `Tries before the answer, Practice mode: ${label}`,
        help: 'Wrong answers allowed before the right answer is shown (with the last one). Before that only the learner\'s own pick is marked wrong. A single-choice question never allows more than its options minus one.',
        kind: 'int',
        min: 1,
        max: 5,
        unit: 'tries'
      }
    ])
  ),
  'feedback.attemptsBeforeReveal.learn': {
    label: 'Tries before the answer, Learn mode',
    help: 'Learn mode explains the answer after this many wrong answers - 1 explains straight away.',
    kind: 'int',
    min: 1,
    max: 5,
    unit: 'tries'
  },
  ...Object.fromEntries(
    NOTE_CONTEXTS.map(({ key, label }): [string, SettingMeta] => [
      `feedback.showWrongAnswerNotes.${key}`,
      {
        label: `Wrong-answer notes: ${label}`,
        help: 'Show the note written for the option or blank the learner got wrong ("why this is wrong"). A note that would give the answer away waits until the answer is shown.',
        kind: 'bool'
      }
    ])
  ),
  'feedback.stageTestWrongAnswerNotes': {
    label: 'Wrong-answer notes on stage tests',
    help: 'Also show them on answer-graded stage tests (C and C++). The right answer is never shown on a test either way.',
    kind: 'bool'
  },
  'feedback.solutionAfterFailedRuns': {
    label: '"Show me the solution" after',
    help: 'Failed runs of a coding lesson before its worked solution is offered. 0 never offers it. Never offered on a stage test.',
    kind: 'int',
    min: 0,
    max: 10,
    unit: 'failed runs'
  },
  'feedback.learnOpensReading': {
    label: 'Learn mode opens the reading',
    help: 'In Learn mode, the "Read about this topic" panel starts open on every lesson that has one.',
    kind: 'bool'
  },
  'feedback.requeue.enabled': {
    label: 'Missed questions come back',
    help: 'A question whose answer was shown returns at the end of the unit, so every unit ends with every question answered right.',
    kind: 'bool'
  },
  'feedback.requeue.maxRounds': {
    label: 'Most times a question comes back',
    help: 'In one run of a unit. Past this, the question stays unsolved and is the first thing the learner meets next time.',
    kind: 'int',
    min: 0,
    max: 3,
    unit: 'times'
  },
  'feedback.requeue.maxScoreAfterReveal.learn': {
    label: 'Highest score after the answer was shown: Learn mode',
    help: 'Caps the score, and so the XP, of a question solved after its answer was shown. The server pays the same.',
    kind: 'int',
    min: 50,
    max: 100,
    unit: '%'
  },
  'feedback.requeue.maxScoreAfterReveal.practice': {
    label: 'Highest score after the answer was shown: Practice mode',
    help: 'Caps the score, and so the XP, of a question solved after its answer was shown. The server pays the same.',
    kind: 'int',
    min: 50,
    max: 100,
    unit: '%'
  }
};

/* ---------------------------------------------------------------- review */

const REVIEW_META: Record<string, SettingMeta> = {
  'review.enabled': {
    label: 'Practice sessions',
    help: 'Off hides the Practice card on the dashboard, the Practice row on the path and "Practice this stage", and no new session can start.',
    kind: 'bool'
  },
  'review.intervalsDays': {
    label: 'Review schedule (days per box)',
    help: 'Days until a question is due again, by box. A clean answer moves it one box up, one right after help keeps its box, and a missed one drops back to the box set below. 2 to 8 entries, each longer than the one before.',
    kind: 'intList',
    min: 1,
    max: 365,
    minItems: 2,
    maxItems: 8
  },
  'review.wrongResetsToBox': {
    label: 'A missed question drops back to box',
    help: 'Counted from 0 (the first interval). A question whose answer was shown - in a lesson or a session - goes back to this box.',
    kind: 'int',
    min: 0,
    max: 7
  },
  'review.initialBox.clean': {
    label: 'Starting box: solved first try',
    help: 'Where a lesson solved on its first try with no hint starts, before it was ever reviewed. Counted from 0.',
    kind: 'int',
    min: 0,
    max: 7
  },
  'review.initialBox.assisted': {
    label: 'Starting box: solved with help',
    help: 'Where a lesson solved after a wrong answer or a hint starts, before it was ever reviewed. Counted from 0.',
    kind: 'int',
    min: 0,
    max: 7
  },
  'review.sessionSize.min': {
    label: 'Smallest session',
    help: 'A session with fewer questions is topped up with more mistakes and due questions, when there are any.',
    kind: 'int',
    min: 1,
    max: 20,
    unit: 'questions'
  },
  'review.sessionSize.max': {
    label: 'Largest session',
    help: 'No session holds more questions than this.',
    kind: 'int',
    min: 1,
    max: 20,
    unit: 'questions'
  },
  'review.mix.mistakes': {
    label: 'Most mistakes per session',
    help: 'Questions the learner got wrong on an earlier day and has not yet answered cleanly. They come first.',
    kind: 'int',
    min: 0,
    max: 20,
    unit: 'questions'
  },
  'review.mix.due': {
    label: 'Most due questions per session',
    help: 'Questions due on the review schedule. Weak solves fill the rest of the session.',
    kind: 'int',
    min: 0,
    max: 20,
    unit: 'questions'
  },
  'review.weak.scoreBelow': {
    label: 'Weak solve: score below',
    help: 'A lesson never reviewed counts as weak when its score was below this.',
    kind: 'int',
    min: 1,
    max: 100,
    unit: '%'
  },
  'review.weak.hintsAtLeast': {
    label: 'Weak solve: hints used',
    help: 'A lesson never reviewed also counts as weak when it took at least this many hints.',
    kind: 'int',
    min: 0,
    max: 10,
    unit: 'hints'
  },
  'review.mistakeWindowDays': {
    label: 'Mistakes count for',
    help: 'A mistake older than this is no longer picked as a mistake (it stays on the schedule).',
    kind: 'int',
    min: 1,
    max: 365,
    unit: 'days'
  },
  'review.itemTypes': {
    label: 'Question kinds in sessions',
    help: 'The kinds a session may use. Coding kinds take much longer - add them only if sessions should include them.',
    kind: 'stringList',
    values: QUESTION_KINDS.map((k) => k.key),
    minItems: 1,
    maxItems: QUESTION_KINDS.length
  },
  'review.attemptsBeforeReveal': {
    label: 'Tries before the answer, in a session',
    help: 'Wrong answers a question allows in a session before its answer is shown. A single-choice question never allows more than its options minus one.',
    kind: 'int',
    min: 1,
    max: 5,
    unit: 'tries'
  },
  'review.requeueMissed': {
    label: 'Missed questions come back once',
    help: 'A question whose answer was shown returns once at the end of the session.',
    kind: 'bool'
  },
  'review.xp.correctFirstTry': {
    label: 'XP: right first time',
    help: 'Paid for a question answered right on the first try with no hint - once per question per day.',
    kind: 'int',
    min: 0,
    max: 50,
    unit: 'XP'
  },
  'review.xp.correctAfterMiss': {
    label: 'XP: right after a miss',
    help: 'Paid for a question answered right after a wrong answer, a hint or its answer being shown - once per question per day.',
    kind: 'int',
    min: 0,
    max: 50,
    unit: 'XP'
  },
  'review.xp.sessionBonus': {
    label: 'XP: finishing a session',
    help: 'Paid once when every question in a session has been answered right, within the daily limit.',
    kind: 'int',
    min: 0,
    max: 100,
    unit: 'XP'
  },
  'review.xp.dailyCap': {
    label: 'Most Practice XP per day',
    help: 'Practice sessions never pay more than this in one day, bonus included. It counts towards the daily goal like any XP.',
    kind: 'int',
    min: 0,
    max: 500,
    unit: 'XP'
  },
  'review.sessionTtlHours': {
    label: 'A session stays open for',
    help: 'After this long an unfinished session is gone, and answering in it asks the learner to start a new one.',
    kind: 'int',
    min: 1,
    max: 72,
    unit: 'hours'
  },
  'review.guestMergeWindowDays': {
    label: 'Offline answers pay for',
    help: 'Practice answered as a guest or offline pays, when it reaches the account, only for the last this-many days (0: today only).',
    kind: 'int',
    min: 0,
    max: 7,
    unit: 'days'
  }
};

/* ------------------------------------------------ streak, goals, reminders */

/** What makes a streak day, for the admin's select. */
export const DAY_RULES: Array<{ key: string; label: string }> = [
  { key: 'any-solve', label: 'Any passing solve (re-solves too)' },
  { key: 'xp-earned', label: 'A solve that paid XP' },
  { key: 'goal-met', label: 'Meeting the daily goal' }
];

const STREAK_P3_META: Record<string, SettingMeta> = {
  'streak.dayRule': {
    label: 'What counts as a streak day',
    help: 'any-solve: any passing solve, re-solves included. xp-earned: a solve that paid XP (a re-solve pays none). goal-met: only a day the daily goal was met (with daily goals switched off, any passing solve counts).',
    kind: 'enum',
    values: DAY_RULES.map((r) => r.key)
  },
  'streak.freeze.enabled': {
    label: 'Streak freezes',
    help: 'A freeze covers one missed day, so the streak survives it. Off: freezes held are kept but not used, and no more are earned.',
    kind: 'bool'
  },
  'streak.freeze.earnEveryGoalDays': {
    label: 'A freeze every',
    help: 'Days the daily goal is met to earn one freeze. Nothing is counted while a learner holds the maximum.',
    kind: 'int',
    min: 1,
    max: 60,
    unit: 'goal days'
  },
  'streak.freeze.maxHeld': {
    label: 'Most freezes held',
    help: 'Lowering it takes no freeze away; learners holding more simply earn none until they are below it.',
    kind: 'int',
    min: 0,
    max: 10,
    unit: 'freezes'
  },
  'streak.freeze.startingCount': {
    label: 'Freezes to start with',
    help: 'What a new learner (or a progress reset) starts with. At most the most held.',
    kind: 'int',
    min: 0,
    max: 10,
    unit: 'freezes'
  },
  'streak.repair.enabled': {
    label: 'Streak repair',
    help: 'After a streak breaks, offer to win it back by finishing extra lessons within a few days.',
    kind: 'bool'
  },
  'streak.repair.windowDays': {
    label: 'Repair window',
    help: 'How long the offer stays open, counted from the first missed day. A gap of more missed days than this cannot be repaired.',
    kind: 'int',
    min: 1,
    max: 7,
    unit: 'days'
  },
  'streak.repair.lessonsPerMissedDay': {
    label: 'Lessons per missed day',
    help: 'Lessons a repair asks for, for each missed day it covers.',
    kind: 'int',
    min: 1,
    max: 20,
    unit: 'lessons'
  },
  'streak.milestones': {
    label: 'Milestones',
    help: 'Streak lengths that are celebrated (a toast when a learner reaches one). Each larger than the one before.',
    kind: 'intList',
    min: 1,
    max: 3650,
    minItems: 0,
    maxItems: 12,
    unit: 'days'
  },
  'streak.runsKept': {
    label: 'Past streaks kept',
    help: "How many finished streaks each learner's streak history keeps.",
    kind: 'int',
    min: 5,
    max: 200
  },
  'streak.mergeReplayDays': {
    label: 'Offline days replayed',
    help: "When lessons a learner finished offline (or as a guest) are merged into their account, the days they were finished on, up to this many back, count for their streak and goal (a goal bonus is paid only for these). Re-solves reported for a day count for neither.",
    kind: 'int',
    min: 0,
    max: 30,
    unit: 'days'
  }
};

/** A daily goal's metrics, for the admin's select. */
export const GOAL_METRIC_LABELS: Array<{ key: string; label: string }> = [
  { key: 'xp', label: 'XP earned' },
  { key: 'lessons', label: 'Lessons finished' },
  { key: 'units', label: 'Units completed' }
];

const GOALS_META: Record<string, SettingMeta> = {
  'goals.enabled': {
    label: 'Daily goals',
    help: 'Off hides the goal ring, the picker and the goal card, and pays no goal bonus.',
    kind: 'bool'
  },
  'goals.options': {
    label: 'Goal options',
    help: 'What a learner can pick. Id: lower-case letters, digits and dashes (it is stored on accounts - renaming one sends its learners to the default). Target: XP 10-2000, lessons 1-50, units 1-20. The bonus is paid once a day, the first time the goal is met. A disabled option sends its learners to the default until it is enabled again.',
    kind: 'rows',
    minItems: 1,
    maxItems: 8,
    rowMeta: [
      { key: 'id', label: 'Id', kind: 'string', minLength: 1, maxLength: 32 },
      { key: 'label', label: 'Label', kind: 'string', minLength: 1, maxLength: 24 },
      { key: 'blurb', label: 'Blurb', kind: 'string', minLength: 0, maxLength: 60 },
      { key: 'metric', label: 'Counts', kind: 'enum', values: GOAL_METRIC_LABELS.map((m) => m.key) },
      { key: 'target', label: 'Target', kind: 'int', min: 1, max: 2000 },
      { key: 'bonusXp', label: 'Bonus XP', kind: 'int', min: 0, max: 100 },
      { key: 'enabled', label: 'On', kind: 'bool' }
    ]
  },
  'goals.defaultOptionId': {
    label: 'Default goal',
    help: 'The goal for guests and for learners who have not chosen one. Must be an enabled option.',
    kind: 'string',
    minLength: 1,
    maxLength: 32
  },
  'goals.oneMorePrompt': {
    label: '"One more?" card',
    help: 'When a lesson meets the goal, offer one more lesson or "Done for today".',
    kind: 'bool'
  }
};

const REMINDER_TITLE_MAX = 80;
const REMINDER_BODY_MAX = 200;

/** Example values for every reminder token, for the live previews. */
export const REMINDER_SAMPLE: Record<string, string | number> = {
  streak: 12,
  hoursLeft: 5,
  freezes: 1,
  maxFreezes: 2,
  goal: '100 XP',
  bonusXp: 10,
  days: 'Tue 22 Sep',
  lostStreak: 12,
  remaining: 3,
  deadline: 'Thursday',
  name: 'Asha',
  bestStreak: 21
};

/** The tokens a welcome-back tier may use. */
export const WELCOME_BACK_TOKENS = ['name', 'days', 'bestStreak'];

function reminderCopy(label: string, help: string, maxLength: number, tokens: string[] = []): SettingMeta {
  return { label, help, kind: 'text', minLength: 1, maxLength, tokens, sample: REMINDER_SAMPLE };
}

const REMINDERS_META: Record<string, SettingMeta> = {
  'reminders.atRisk.enabled': {
    label: 'At-risk banner',
    help: 'A banner when a learner has a streak and today does not count yet.',
    kind: 'bool'
  },
  'reminders.atRisk.fromLocalHour': {
    label: 'At risk from',
    help: "Not shown before this hour of the learner's own day (0-23). 18 means from 6 pm.",
    kind: 'int',
    min: 0,
    max: 23,
    unit: 'h'
  },
  'reminders.atRisk.title': reminderCopy('At risk: title', 'The banner heading.', REMINDER_TITLE_MAX, ['streak']),
  'reminders.atRisk.body': reminderCopy('At risk: text', 'Under the heading, when no freeze would cover today.', REMINDER_BODY_MAX, ['streak', 'hoursLeft']),
  'reminders.atRisk.bodyWithFreeze': reminderCopy('At risk: text with a freeze', 'Under the heading, when a freeze would cover today.', REMINDER_BODY_MAX, ['freezes']),
  'reminders.atRisk.cta': reminderCopy('At risk: button', 'Opens the next lesson.', REMINDER_TITLE_MAX),
  'reminders.goalMet.toast': reminderCopy('Goal met: toast', 'The toast when the daily goal is met.', REMINDER_BODY_MAX, ['goal', 'bonusXp']),
  'reminders.goalMet.cardTitle': reminderCopy('Goal met: card title', 'The card inside a lesson when the goal is met.', REMINDER_TITLE_MAX),
  'reminders.goalMet.cardBody': reminderCopy('Goal met: card text', 'Under the card title.', REMINDER_BODY_MAX, ['streak', 'bonusXp']),
  'reminders.goalMet.moreLabel': reminderCopy('Goal met: keep going', 'The button that carries on.', REMINDER_TITLE_MAX),
  'reminders.goalMet.doneLabel': reminderCopy('Goal met: stop', 'The button that closes the lesson.', REMINDER_TITLE_MAX),
  'reminders.freezeEarned': reminderCopy('Freeze earned', 'The toast when a freeze is earned.', REMINDER_BODY_MAX, ['freezes', 'maxFreezes']),
  'reminders.freezeUsed': reminderCopy('Freeze used', 'The banner after a freeze covered a missed day.', REMINDER_BODY_MAX, ['streak', 'days']),
  'reminders.streakBroken.title': reminderCopy('Streak ended: title', 'The banner heading while a repair is on offer.', REMINDER_TITLE_MAX, ['lostStreak']),
  'reminders.streakBroken.body': reminderCopy('Streak ended: text', 'What the repair asks for, and by when.', REMINDER_BODY_MAX, ['remaining', 'deadline']),
  'reminders.streakBroken.cta': reminderCopy('Streak ended: button', 'Opens the next lesson.', REMINDER_TITLE_MAX),
  'reminders.streakRepaired': reminderCopy('Streak repaired', 'The toast when a repair is completed.', REMINDER_BODY_MAX, ['streak']),
  'reminders.welcomeBack.enabled': {
    label: 'Welcome-back banner',
    help: 'A banner for a learner coming back after some days away.',
    kind: 'bool'
  },
  'reminders.welcomeBack.cta': reminderCopy('Welcome back: button', 'Opens the next lesson.', REMINDER_TITLE_MAX),
  'reminders.welcomeBack.tiers': {
    label: 'Welcome-back messages',
    help: 'The message for learners away at least this many days; the longest absence that applies wins. Days climb strictly. Title and text may use {name}, {days} and {bestStreak}. A guest has no name: for them {name} is left out, with the comma before it.',
    kind: 'rows',
    minItems: 1,
    maxItems: 5,
    rowMeta: [
      { key: 'minDays', label: 'Away at least (days)', kind: 'int', min: 1, max: 365 },
      { key: 'title', label: 'Title', kind: 'string', minLength: 1, maxLength: REMINDER_TITLE_MAX, tokens: WELCOME_BACK_TOKENS },
      { key: 'body', label: 'Text', kind: 'string', minLength: 1, maxLength: REMINDER_BODY_MAX, tokens: WELCOME_BACK_TOKENS }
    ]
  }
};

/* ------------------------------------------------------------ site copy */

/** The longest any piece of site copy may be. */
export const COPY_MAX_LENGTH = 300;

/** Example values for every copy token, for the live preview (the admin page swaps in the real counts). */
export const COPY_SAMPLE: Record<string, string | number> = {
  language: 'Java',
  freeStages: 6,
  premiumStages: 4,
  stages: 10,
  lessons: 230,
  tests: 12,
  tracks: 3,
  minutes: 15
};

function copyMeta(label: string, help: string, tokens: string[] = []): SettingMeta {
  return { label, help, kind: 'text', minLength: 1, maxLength: COPY_MAX_LENGTH, tokens, sample: COPY_SAMPLE };
}

const COPY_META: Record<string, SettingMeta> = {
  'copy.offline.auth': copyMeta('Sign-in unavailable', 'In the sign-in window while accounts cannot be reached.'),
  'copy.offline.leaderboard': copyMeta('Leaderboard unavailable', 'The heading of the leaderboard while it cannot be loaded.'),
  'copy.offline.banner': copyMeta('Offline banner', 'The strip across the top of the app while progress cannot sync.'),
  'copy.offline.generic': copyMeta('Temporarily unavailable', 'Any page that needs the server and cannot reach it (a certificate, a reset link).'),
  'copy.offline.checkout': copyMeta('Checkout unavailable', 'In the purchase window while payments cannot be reached.'),
  'copy.offline.verify': copyMeta('Certificate check unavailable', 'On the public certificate check while it cannot be reached.'),
  'copy.offline.playgroundJs': copyMeta('Playground: JavaScript in the browser', 'Under the Playground console when JavaScript runs in the browser because the server is unavailable.'),
  'copy.offline.playgroundCompiled': copyMeta(
    'Playground: compiled language unreachable',
    'When Java, C or C++ cannot run because the server cannot be reached.',
    ['language']
  ),
  'copy.runtime.unavailable': copyMeta(
    'Language not available',
    'When the server has no compiler for a language (the server sends this sentence too).',
    ['language']
  ),
  'copy.sync.online': copyMeta('Sync: synced', 'Settings > Sync and the sidebar, when a signed-in learner is connected.'),
  'copy.sync.offline': copyMeta('Sync: paused', 'Settings > Sync and the sidebar, while the server cannot be reached.'),
  'copy.sync.guest': copyMeta('Sync: guest', 'Settings > Sync and the sidebar, for a guest.'),
  'copy.playground.description': copyMeta('Playground description', 'Under the Playground heading. Say what runs where, without naming infrastructure.'),
  'copy.landing.heroFootnote': copyMeta('Hero footnote', 'The small line under the landing page buttons.', ['freeStages', 'premiumStages']),
  'copy.landing.footerBlurb': copyMeta('Footer blurb', 'Under the logo in the landing page footer.'),
  'copy.landing.howLessons': copyMeta('How it works: Learn', 'The "Learn" step on the landing page.'),
  'copy.landing.finalCta': copyMeta('Final call to action', 'The heading of the last landing page section.'),
  'copy.landing.pathLine': copyMeta('How it works: the path', 'The line under the "How it works" heading.', ['stages']),
  'copy.landing.buildStep': copyMeta('How it works: Build', 'The "Build" step on the landing page. Keep it true: it describes how stages unlock.'),
  'copy.meta.description': copyMeta(
    'Meta description',
    'The page description search engines and link previews show. Set on the landing page once it loads; the built page carries the build-time numbers.',
    ['lessons', 'tests', 'stages', 'tracks']
  ),
  'copy.limits.tooMany': copyMeta('Too many attempts', 'Every "slow down" answer (sign-in, sign-up, running code, solving).', ['minutes']),
  'copy.limits.busy': copyMeta('Code runner busy', 'When every code-runner slot is taken and the queue is full.'),
  'copy.premium.lockedSolve': copyMeta('Premium lesson', 'When someone without access tries to solve a lesson in a premium stage.'),
  'copy.notFound.title': copyMeta('Not found: title', 'The heading of the "page not found" screen.'),
  'copy.notFound.body': copyMeta('Not found: text', 'The text of the "page not found" screen.'),
  'copy.error.title': copyMeta('Crash screen: title', 'The heading shown when a page fails to render.'),
  'copy.error.body': copyMeta('Crash screen: text', 'The text shown when a page fails to render. A reference code is added under it.')
};

/* -------------------------------------------------------- limits & access */

/** Every rate-limit bucket: its settings key, what it counts, and the bounds of its limit. */
export const RATE_LIMIT_BUCKETS: Array<{ key: string; label: string; help: string; min: number; max: number }> = [
  { key: 'loginIp', label: 'Sign-in, per address', help: 'Sign-in attempts from one network address.', min: 5, max: 1000 },
  { key: 'loginAccount', label: 'Failed sign-ins, per email', help: 'Wrong passwords for one email address. A correct sign-in clears it.', min: 3, max: 100 },
  { key: 'registerIp', label: 'Sign-ups, per address', help: 'New accounts from one network address.', min: 1, max: 500 },
  { key: 'registerGlobal', label: 'Sign-ups, everyone', help: 'New accounts in total, from anywhere.', min: 10, max: 10_000 },
  { key: 'executeAccount', label: 'Code runs, per account', help: 'Run requests from one signed-in learner.', min: 5, max: 1000 },
  { key: 'executeIp', label: 'Code runs, per address', help: 'Run requests from one network address, signed in or not.', min: 5, max: 2000 },
  { key: 'solveAccount', label: 'Solves, per account', help: 'Solve submissions from one learner.', min: 10, max: 1000 },
  { key: 'writeAccount', label: 'Other writes, per account', help: 'Wrong answers recorded and other small writes from one learner.', min: 10, max: 2000 },
  { key: 'passwordChangeAccount', label: 'Password changes, per account', help: 'Attempts to set or change the password of one account.', min: 3, max: 100 },
  { key: 'passwordResetIp', label: 'Reset links, per address', help: 'Password-reset link checks and submissions from one network address.', min: 3, max: 200 }
];

const RATE_WINDOW = { min: 60, max: 86_400 };

const ACCESS_META: Record<string, SettingMeta> = {
  'access.rateLimit.mode': {
    label: 'Rate limits',
    help: 'Enforce answers "too many attempts" (429). Log only counts and logs what would have been refused. Off skips every check.',
    kind: 'enum',
    values: ['off', 'log', 'enforce']
  },
  ...Object.fromEntries(
    RATE_LIMIT_BUCKETS.flatMap((bucket): Array<[string, SettingMeta]> => [
      [
        `access.rateLimit.${bucket.key}.limit`,
        { label: `${bucket.label}: limit`, help: `${bucket.help} Requests allowed per window.`, kind: 'int', min: bucket.min, max: bucket.max, unit: 'requests' }
      ],
      [
        `access.rateLimit.${bucket.key}.windowSeconds`,
        { label: `${bucket.label}: window`, help: 'How long the count runs before it starts again.', kind: 'int', min: RATE_WINDOW.min, max: RATE_WINDOW.max, unit: 'seconds' }
      ]
    ])
  ),
  'access.execution.maxConcurrent': {
    label: 'Code runs at once',
    help: 'How many submissions the server runs at the same time (the JavaScript sandbox, local Python, Judge0).',
    kind: 'int',
    min: 1,
    max: 16
  },
  'access.execution.maxQueued': {
    label: 'Code runs waiting',
    help: 'How many more may wait for a free slot. Past this the runner answers "busy".',
    kind: 'int',
    min: 0,
    max: 200
  },
  'access.execution.queueWaitMs': {
    label: 'Longest wait',
    help: 'How long a waiting run may wait for a slot before it is answered "busy".',
    kind: 'int',
    min: 0,
    max: 30_000,
    unit: 'ms'
  },
  'access.network.trustProxyHops': {
    label: 'Trusted proxy hops',
    help: "How many proxies stand in front of this server (Vercel, then the tunnel: 2). Too few and every learner's address is unknown, so per-address limits are skipped; too many and an address can be forged. Check the live diagnostic below.",
    kind: 'int',
    min: 0,
    max: 5,
    envVar: 'TRUST_PROXY_HOPS'
  },
  'access.cors.mode': {
    label: 'Cross-site requests (CORS)',
    help: 'Report records writes from other sites and lets them through. Enforce refuses them (403). Open allows every origin. Switch to enforce once the rejected-origins list below stays empty.',
    kind: 'enum',
    values: ['open', 'report', 'enforce']
  },
  'access.cors.extraOrigins': {
    label: 'Extra allowed origins',
    help: 'Exact origins such as https://preview.example.com - no path, no wildcard. APP_ORIGIN, CORS_ORIGINS in the environment and localhost are always allowed.',
    kind: 'origins',
    maxItems: 20
  },
  'access.premiumGate': {
    label: 'Server-side premium lock',
    help: 'Enforce refuses solves, answer checks and guest merges for premium lessons the learner has not unlocked. Log only records what would have been refused - the emergency switch if paying learners are wrongly blocked.',
    kind: 'enum',
    values: ['log', 'enforce']
  },
  'access.passwordResetTtlMinutes': {
    label: 'Reset link lifetime',
    help: 'How long a password reset link issued from Users stays valid.',
    kind: 'int',
    min: 15,
    max: 10_080,
    unit: 'minutes'
  }
};

export const SETTING_META: Record<string, SettingMeta> = {
  /* ---------------------------------------------------------------- xp */
  'xp.retryPenalty': {
    label: 'Retry penalty',
    help: 'Points taken off the score for each try after the first.',
    kind: 'int',
    min: 0,
    max: 50,
    unit: 'points'
  },
  'xp.hintPenalty': {
    label: 'Hint penalty',
    help: 'Points taken off the score for each hint shown. Learners see this as "costs N% XP".',
    kind: 'int',
    min: 0,
    max: 50,
    unit: 'points'
  },
  'xp.scoreFloor': {
    label: 'Score floor',
    help: 'The lowest score a completed lesson can get, however many tries it took. At most the pass score.',
    kind: 'int',
    min: 0,
    max: 100,
    unit: '%'
  },
  'xp.passScore': {
    label: 'Pass score',
    help: 'The score (before the floor) a correct answer needs to complete the lesson. Below it the lesson is not recorded and the learner retries it.',
    kind: 'int',
    min: 0,
    max: 100,
    unit: '%'
  },
  'xp.minXpPerSolve': {
    label: 'Minimum XP per solve',
    help: 'A first solve always pays at least this much.',
    kind: 'int',
    min: 0,
    max: 100,
    unit: 'XP'
  },
  'xp.maxAttemptsCounted': {
    label: 'Tries counted',
    help: 'Tries beyond this number are ignored when scoring.',
    kind: 'int',
    min: 1,
    max: 50
  },
  'xp.maxHintsCounted': {
    label: 'Hints counted',
    help: 'Hints beyond this number are ignored when scoring.',
    kind: 'int',
    min: 0,
    max: 10
  },

  /* ------------------------------------------------------------ levels */
  'levels.thresholds': {
    label: 'XP to reach each level',
    help: 'One number per level, starting with level 1 at 0. Each must be larger than the one before.',
    kind: 'intList',
    min: 0,
    max: 10_000_000,
    minItems: 2,
    maxItems: 100,
    unit: 'XP'
  },
  'levels.overflowStep': {
    label: 'XP per level after the table',
    help: 'Once a learner passes the last level in the table, every further level costs this much more.',
    kind: 'int',
    min: 1,
    max: 100_000,
    unit: 'XP'
  },
  'levels.ranks': {
    label: 'Rank titles',
    help: 'The title shown from each level on. The first starts at level 1; each later one starts at a higher level.',
    kind: 'rows',
    minItems: 1,
    maxItems: 12,
    rowMeta: [
      { key: 'minLevel', label: 'From level', kind: 'int', min: 1, max: 1000 },
      { key: 'title', label: 'Title', kind: 'string', minLength: 1, maxLength: 40 }
    ]
  },

  /* ------------------------------------------------------------ streak */
  'streak.defaultTimeZone': {
    label: 'Default time zone',
    help: "The zone a learner's days are counted in until their browser reports one. Empty means the server's own zone.",
    kind: 'zone',
    nullable: true
  },
  'streak.timeZoneChangeCooldownHours': {
    label: 'Time zone change cooldown',
    help: "After a learner's zone is set, a different one reported by their browser is ignored for this long. Stops a day being replayed by flipping zones.",
    kind: 'int',
    min: 0,
    max: 168,
    unit: 'hours'
  },
  'streak.maxPlausibleMergedStreak': {
    label: 'Longest believable guest streak',
    help: 'A streak brought in from guest play is cut to this many days when it is merged into an account.',
    kind: 'int',
    min: 1,
    max: 3650,
    unit: 'days'
  },
  ...STREAK_P3_META,

  /* ---------------------------------------------------- goals, reminders */
  ...GOALS_META,
  ...REMINDERS_META,

  /* ------------------------------------------- units, celebrations, badges */
  ...UNITS_META,
  ...CELEBRATIONS_META,
  ...BADGES_META,

  /* ---------------------------------------------------------- feedback */
  ...FEEDBACK_META,

  /* ------------------------------------------------------------ review */
  ...REVIEW_META,

  /* -------------------------------------------------------------- copy */
  ...COPY_META,

  /* --------------------------------------------------------- retention */
  'retention.activityDaysKept': {
    label: 'Days of activity kept',
    help: 'Per learner. Older days drop off the log (and the heatmap).',
    kind: 'int',
    min: 30,
    max: 1000,
    unit: 'days'
  },
  'retention.missLogPerUser': {
    label: 'Wrong answers kept per learner',
    help: 'The most recent wrong answers stored per learner, for the admin drill-down. The per-question totals are kept regardless.',
    kind: 'int',
    min: 0,
    max: 2000
  },
  'retention.missesPerDay': {
    label: 'Wrong answers recorded per day',
    help: 'Per learner. Anything past this in one day is not recorded.',
    kind: 'int',
    min: 1,
    max: 5000
  },
  'retention.missesPerItemPerDay': {
    label: 'Wrong answers per question per day',
    help: 'Per learner and question. Stops one stuck question from filling the log.',
    kind: 'int',
    min: 1,
    max: 100
  },
  'retention.answerMaxChars': {
    label: 'Stored answer length',
    help: 'Typed answers (fill in the blank) are cut to this many characters before they are stored.',
    kind: 'int',
    min: 20,
    max: 1000,
    unit: 'characters'
  },
  'retention.mostMissedMinLearners': {
    label: '"Most missed" minimum learners',
    help: 'A question appears in Analytics > Most missed only once at least this many learners have missed it.',
    kind: 'int',
    min: 1,
    max: 100
  },

  /* ------------------------------------------------------------ access */
  ...ACCESS_META
};

/** The section a dot path belongs to (`xp` for `xp.passScore`). */
export function sectionOfPath(path: string): string {
  const dot = path.indexOf('.');
  return dot === -1 ? path : path.slice(0, dot);
}

/** Every setting path in one section, in display order. */
export function pathsInSection(sectionId: string): string[] {
  return Object.keys(SETTING_META).filter((path) => sectionOfPath(path) === sectionId);
}

/** Own-property lookup, so `__proto__` or `constructor` never resolve to something. */
export function metaFor(path: string): SettingMeta | null {
  return Object.prototype.hasOwnProperty.call(SETTING_META, path) ? SETTING_META[path] : null;
}

/** Is `path` a section, or a group of settings inside one (a prefix of some setting path)? */
export function isSettingsGroup(path: string): boolean {
  const prefix = `${path}.`;
  return Object.keys(SETTING_META).some((key) => key.startsWith(prefix));
}
