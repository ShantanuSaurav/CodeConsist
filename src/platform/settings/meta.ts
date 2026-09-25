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
  kind: 'int' | 'number' | 'bool' | 'string' | 'enum';
  min?: number;
  max?: number;
  minLength?: number;
  maxLength?: number;
  values?: string[];
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
    title: 'Streak & time zones',
    description: "Which day a solve counts on. Days are counted in each learner's own time zone.",
    audience: 'public',
    phase: 'P1'
  },
  {
    id: 'retention',
    title: 'Data limits',
    description: 'How much activity and how many wrong answers are kept per learner. Never sent to learners.',
    audience: 'admin',
    phase: 'P1'
  }
];

/** Sections that never leave the server's admin routes. */
export const ADMIN_ONLY_SECTIONS: readonly string[] = ['retention', 'access'];

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
  }
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
