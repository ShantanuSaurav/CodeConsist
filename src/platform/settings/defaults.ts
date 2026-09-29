/* ==========================================================================
   The defaults for every setting. The store holds only the keys an
   administrator changed; everything else is what is written here.

   The XP, level and rank numbers are IMPORTED from the functions that use
   them, never retyped, so the defaults cannot drift from what a call with no
   settings does - and they are exactly the constants the app used before
   settings existed. The level curve is the retuned one (Phase 2, owner
   decision 2): it never costs anyone a level.

   Units and badges are imported the same way (progress/units.ts,
   xp-leveling/insights.ts); the celebrations are only ever read from here.
   ========================================================================== */
import { DEFAULT_LEVEL_CURVE, DEFAULT_XP_RULES } from '../xp-leveling/leveling';
import { DEFAULT_BADGES, DEFAULT_RANKS } from '../xp-leveling/insights';
import { DEFAULT_UNIT_SETTINGS } from '../progress/units';
import { DEFAULT_GOAL_SETTINGS } from '../habits/goals';
import { DEFAULT_HABIT_SETTINGS } from '../habits/streak';
import { DEFAULT_FEEDBACK_SETTINGS } from './budget';
import { DEFAULT_REVIEW_SETTINGS } from '../review/defaults';
import { DEFAULT_PLACEMENT_SETTINGS, DEFAULT_TEST_OUT_SETTINGS } from '../progress/access';
import type { OnboardingSettings, Settings } from './types';

function jsonCopy<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/**
 * The first-run setup (Phase 5). The mode cards' words are the ones
 * LearningModeChooser.tsx showed before they were editable.
 */
export const DEFAULT_ONBOARDING_SETTINGS: OnboardingSettings = {
  enabled: true,
  showAfterEnter: true,
  dashboardReminder: true,
  intro: {
    title: 'Welcome to CodeConsist',
    body: 'A few quick questions so your path fits you. It takes about a minute, and you can change every answer later in Settings.'
  },
  finish: {
    title: "You're set",
    // No promise of a placement here: one may be switched off or not open to
    // this learner. When it is, the finish screen offers it itself.
    body: 'Your path is ready. Every answer can be changed later in Settings.',
    ctaLabel: 'Start learning',
    placementCtaLabel: 'Find my level'
  },
  steps: [
    { id: 'motivation', enabled: true, skippable: true, title: 'What brings you here?', subtitle: 'Pick the closest one. It only helps us suggest where to start.' },
    { id: 'track', enabled: true, skippable: true, title: 'Pick a track', subtitle: 'You can switch tracks at any time.' },
    { id: 'experience', enabled: true, skippable: true, title: 'How much do you already know?', subtitle: 'There is no wrong answer - you can take a placement later too.' },
    { id: 'goal', enabled: true, skippable: true, title: 'Set a daily goal', subtitle: 'A small goal you keep beats a big one you skip.' },
    { id: 'mode', enabled: true, skippable: true, title: 'How do you like to learn?', subtitle: 'You can change this at any time.' }
  ],
  motivation: {
    options: [
      { id: 'job', label: 'Get a job', description: 'Build the skills employers ask for.', icon: 'briefcase' },
      { id: 'college', label: 'Do well in college', description: 'Keep up with coursework and exams.', icon: 'graduation-cap' },
      { id: 'interviews', label: 'Prepare for interviews', description: 'Practise the kind of problems interviews use.', icon: 'target' },
      { id: 'fun', label: 'Just for fun', description: 'Learn something new at my own pace.', icon: 'sparkles' }
    ]
  },
  track: { blurbs: {} },
  experience: {
    options: {
      new: { label: "I'm new to coding", description: 'Start from the very first lesson.', action: 'start', recommendMode: 'learn' },
      some: {
        label: 'I know a little',
        description: 'Start at the beginning, or take a short placement to skip what you know.',
        action: 'offer-placement',
        recommendMode: 'learn'
      },
      experienced: {
        label: "I've written code before",
        description: 'Take a short placement to find where to start.',
        action: 'placement',
        recommendMode: 'practice'
      }
    },
    placementPrompt: {
      title: 'Want to skip ahead?',
      body: 'Take a few stage tests. Each one you pass marks that stage as tested out, and you start after it.',
      startLabel: 'Take the placement',
      skipLabel: 'Start from the beginning'
    }
  },
  mode: {
    options: {
      learn: {
        title: 'Learn & Understand',
        flow: 'Theory → Example → Try it → Quick check → Practice',
        blurb:
          'New ideas are explained before you are asked about them, wrong answers explain themselves straight away, and the stage article is a click away.'
      },
      practice: {
        title: 'Practice Mode',
        flow: 'Challenge → Solve → Grade → Next',
        blurb: 'Straight into the questions. Same challenges, same real grading, same XP - just no walk-through first.'
      }
    }
  }
};

export const DEFAULT_SETTINGS: Settings = {
  xp: {
    ...DEFAULT_XP_RULES,
    // server/index.js clamped a solve's tries to 1..50 and hints to 0..10.
    maxAttemptsCounted: 50,
    maxHintsCounted: 10
  },
  levels: {
    thresholds: [...DEFAULT_LEVEL_CURVE.thresholds],
    overflowStep: DEFAULT_LEVEL_CURVE.overflowStep,
    ranks: DEFAULT_RANKS.map((rank) => ({ ...rank }))
  },
  streak: {
    // null = the server's own zone, which is how every day was counted before.
    defaultTimeZone: null,
    timeZoneChangeCooldownHours: 20,
    // server/index.js's MAX_PLAUSIBLE_STREAK.
    maxPlausibleMergedStreak: 400,
    // Phase 3: what counts as a streak day, freezes, repair and history
    // (src/platform/habits/streak.ts, where the engine reads them).
    dayRule: DEFAULT_HABIT_SETTINGS.dayRule,
    freeze: { ...DEFAULT_HABIT_SETTINGS.freeze },
    repair: { ...DEFAULT_HABIT_SETTINGS.repair },
    milestones: [...DEFAULT_HABIT_SETTINGS.milestones],
    runsKept: DEFAULT_HABIT_SETTINGS.runsKept,
    mergeReplayDays: DEFAULT_HABIT_SETTINGS.mergeReplayDays
  },
  // XP goals; "Regular" (100 XP) is what the dashboard's "Earn 100 XP" was.
  goals: {
    ...DEFAULT_GOAL_SETTINGS,
    options: DEFAULT_GOAL_SETTINGS.options.map((option) => ({ ...option }))
  },
  reminders: {
    atRisk: {
      enabled: true,
      // An evening nudge: a morning "at risk" banner is nagging.
      fromLocalHour: 18,
      title: 'Your {streak}-day streak is at risk',
      // Worded so any number reads right ('1h left' as well as '5h left').
      body: 'Finish one lesson before midnight to keep it ({hoursLeft}h left).',
      bodyWithFreeze: 'Miss today and a streak freeze covers it ({freezes} left).',
      cta: 'Practise now'
    },
    goalMet: {
      toast: 'Daily goal met: {goal}.',
      cardTitle: 'Daily goal met',
      cardBody: 'Day {streak} of your streak. One more lesson?',
      moreLabel: 'One more',
      doneLabel: 'Done for today'
    },
    freezeEarned: 'You earned a streak freeze ({freezes} of {maxFreezes}).',
    freezeUsed: 'A streak freeze kept your {streak}-day streak alive on {days}.',
    streakBroken: {
      title: 'Your {lostStreak}-day streak ended',
      body: 'Finish {remaining} more by {deadline} to repair it.',
      cta: 'Repair my streak'
    },
    streakRepaired: 'Streak repaired: {streak} days.',
    welcomeBack: {
      enabled: true,
      cta: 'Start a lesson',
      tiers: [
        { minDays: 3, title: 'Welcome back, {name}', body: 'Pick up where you left off - one lesson starts a new streak.' },
        { minDays: 14, title: "It's been {days} days", body: 'Your best streak is {bestStreak} days. Start small: one lesson today.' }
      ]
    }
  },
  units: {
    ...DEFAULT_UNIT_SETTINGS,
    minutesByType: { ...DEFAULT_UNIT_SETTINGS.minutesByType }
  },
  celebrations: {
    sound: {
      defaultOn: true,
      volume: 0.5,
      events: { correct: true, wrong: true, unitComplete: true, levelUp: true, badge: true }
    },
    confetti: {
      // Was 70 particles on every solve, re-solves included.
      onCorrect: true,
      onCorrectParticles: 40,
      onReSolve: false,
      onUnitEnd: true,
      unitEndParticles: 140
    },
    levelUpOverlay: true,
    countUpMs: 900,
    copy: {
      unitComplete: 'Unit complete!',
      perfect: 'Perfect unit! +{xp} XP',
      flawless: 'Flawless run',
      levelUp: 'Level {level}',
      newRank: 'New title: {title}',
      streakUp: '{n}-day streak'
    }
  },
  badges: {
    tierNames: [...DEFAULT_BADGES.tierNames],
    families: DEFAULT_BADGES.families.map((family) => ({ ...family, tiers: [...family.tiers] })),
    stageBadges: { ...DEFAULT_BADGES.stageBadges }
  },
  // Phase 4: attempts before an answer is shown, wrong-answer notes and the
  // requeue (src/platform/settings/budget.ts, where the rules read them).
  feedback: {
    attemptsBeforeReveal: {
      practice: { ...DEFAULT_FEEDBACK_SETTINGS.attemptsBeforeReveal.practice },
      learn: DEFAULT_FEEDBACK_SETTINGS.attemptsBeforeReveal.learn
    },
    showWrongAnswerNotes: { ...DEFAULT_FEEDBACK_SETTINGS.showWrongAnswerNotes },
    stageTestWrongAnswerNotes: DEFAULT_FEEDBACK_SETTINGS.stageTestWrongAnswerNotes,
    solutionAfterFailedRuns: DEFAULT_FEEDBACK_SETTINGS.solutionAfterFailedRuns,
    learnOpensReading: DEFAULT_FEEDBACK_SETTINGS.learnOpensReading,
    requeue: {
      ...DEFAULT_FEEDBACK_SETTINGS.requeue,
      maxScoreAfterReveal: { ...DEFAULT_FEEDBACK_SETTINGS.requeue.maxScoreAfterReveal }
    }
  },
  // Phase 4: Practice sessions (src/platform/review, where the rules read them).
  review: {
    ...DEFAULT_REVIEW_SETTINGS,
    intervalsDays: [...DEFAULT_REVIEW_SETTINGS.intervalsDays],
    initialBox: { ...DEFAULT_REVIEW_SETTINGS.initialBox },
    sessionSize: { ...DEFAULT_REVIEW_SETTINGS.sessionSize },
    mix: { ...DEFAULT_REVIEW_SETTINGS.mix },
    weak: { ...DEFAULT_REVIEW_SETTINGS.weak },
    itemTypes: [...DEFAULT_REVIEW_SETTINGS.itemTypes],
    xp: { ...DEFAULT_REVIEW_SETTINGS.xp }
  },
  // Phase 5: the first-run setup, placement and test-out (src/platform/progress/access.ts
  // reads the last two). Deep copies, so nothing here shares an object with the constants.
  onboarding: jsonCopy(DEFAULT_ONBOARDING_SETTINGS),
  placement: jsonCopy(DEFAULT_PLACEMENT_SETTINGS),
  testOut: jsonCopy(DEFAULT_TEST_OUT_SETTINGS),
  copy: {
    offline: {
      auth: 'Accounts are temporarily unavailable. Keep practising as a guest - your progress is saved on this device.',
      leaderboard: 'The leaderboard is temporarily unavailable.',
      banner: 'Sync is temporarily unavailable - your progress is saved on this device.',
      generic: 'CodeConsist is temporarily unavailable. Please try again in a little while.',
      checkout: 'Checkout is temporarily unavailable. Please try again in a little while.',
      verify: 'Certificate checks are temporarily unavailable. Please try again in a little while.',
      playgroundJs: 'Running in this browser while the CodeConsist server is unavailable.',
      playgroundCompiled:
        '{language} runs on the CodeConsist server, which is not reachable right now. Please try again in a little while - JavaScript and Python still run in your browser.'
    },
    runtime: {
      unavailable: "{language} can't run here right now - this server has no compiler for it yet. JavaScript and Python work as usual."
    },
    sync: {
      online: 'Synced',
      offline: 'Sync paused - saved on this device',
      guest: 'Guest - saved on this device'
    },
    playground: {
      description:
        'HTML, CSS and JavaScript render in a sandboxed frame in this browser. JavaScript runs in a sandbox on the CodeConsist server, or in your browser when the server is unavailable. Python runs in your browser. Java, C and C++ compile on the server when it has a compiler for them.'
    },
    landing: {
      heroFootnote: 'Free to start · {freeStages} free stages, {premiumStages} premium · Every stage ends in a coding test',
      footerBlurb: 'The developer training environment.',
      howLessons:
        'Bite-sized lessons in every stage: quizzes, output prediction, fill-the-blanks, pseudocode ordering. Each new idea is explained before you are asked about it.',
      finalCta: 'Open the first stage. It takes about twenty minutes.',
      pathLine: '{stages} stages, in order, each ending in a coding test.',
      buildStep: 'Each stage ends in a mandatory test. The next stage stays locked until you clear it.',
      pathLineWithSkip: '{stages} stages, in order, each ending in a coding test. Already know some? Take a short placement or test out of a stage.',
      buildStepWithSkip: 'Each stage ends in a mandatory test. The next stage stays locked until you clear it - or test out of it.'
    },
    meta: {
      description:
        // The same sentence index.html carries at build time (scripts/vite-content-stats.mjs).
        'CodeConsist - learn to code with {lessons} bite-sized lessons and {tests} stage tests across {stages} stages on {tracks} tracks, with real code execution. Free to start.'
    },
    limits: {
      tooMany: 'Too many attempts - wait {minutes} min and try again.',
      busy: 'The code runner is busy - try again in a moment.'
    },
    premium: {
      lockedSolve: 'This lesson is part of a premium stage.'
    },
    notFound: {
      title: 'There is nothing at this address.',
      body: 'The link may be mistyped, or the page may have moved. Everything else is where you left it.'
    },
    error: {
      title: 'Something went wrong.',
      body:
        'This page hit a problem it could not recover from. Your progress is saved as you go - on this device, and to your account when you are signed in - so reloading should not lose it.'
    }
  },
  retention: {
    activityDaysKept: 400,
    missLogPerUser: 300,
    missesPerDay: 300,
    missesPerItemPerDay: 20,
    answerMaxChars: 200,
    mostMissedMinLearners: 3
  },
  access: {
    rateLimit: {
      mode: 'enforce',
      // Per-IP limits are generous on purpose: students on one campus
      // network share a public address. Accounts carry the tighter limits.
      loginIp: { limit: 30, windowSeconds: 900 },
      loginAccount: { limit: 10, windowSeconds: 900 },
      registerIp: { limit: 20, windowSeconds: 3600 },
      registerGlobal: { limit: 300, windowSeconds: 3600 },
      executeAccount: { limit: 40, windowSeconds: 60 },
      executeIp: { limit: 120, windowSeconds: 60 },
      solveAccount: { limit: 60, windowSeconds: 60 },
      writeAccount: { limit: 120, windowSeconds: 60 },
      passwordChangeAccount: { limit: 10, windowSeconds: 900 },
      passwordResetIp: { limit: 10, windowSeconds: 900 }
    },
    execution: {
      maxConcurrent: 4,
      maxQueued: 20,
      queueWaitMs: 10_000
    },
    network: {
      // Browser -> Vercel -> ngrok -> this server: two hops in front of it.
      // TRUST_PROXY_HOPS in the environment replaces this default.
      trustProxyHops: 2
    },
    cors: {
      // Report first: foreign writes are recorded, not refused, until the
      // admin has checked the list and switches to enforce.
      mode: 'report',
      extraOrigins: []
    },
    premiumGate: 'enforce',
    passwordResetTtlMinutes: 1440,
    // Phase 5: the stage order on the server. Log first - count what would be
    // refused, change nothing - and enforce once the counts stay clean.
    solveGate: 'log',
    mergeGate: 'log',
    requireServerVerification: true,
    acceptGuestClaims: true
  }
};
