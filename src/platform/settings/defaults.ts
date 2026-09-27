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
import type { Settings } from './types';

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
    maxPlausibleMergedStreak: 400
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
      buildStep: 'Each stage ends in a mandatory test. The next stage stays locked until you clear it.'
    },
    meta: {
      description:
        // The same sentence index.html carries at build time (scripts/vite-content-stats.mjs).
        'CodeConsist - learn to code with {lessons} bite-sized lessons and {tests} stage tests across {stages} stages on {tracks} tracks, with real code execution. Free to start.'
    },
    limits: {
      tooMany: 'Too many attempts - try again in {minutes} minutes.',
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
    passwordResetTtlMinutes: 1440
  }
};
