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
