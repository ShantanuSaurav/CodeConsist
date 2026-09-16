# modules/challenges

**Owns:** the challenge bank (210 lessons + stage tests, one folder per topic), the seven challenge types and their client-side grading (`challenge-types/registry.ts`), the practice modal and its session, the learning path and the library.

**Public API (`index.ts`):** `PracticeHost`, `LearnPage`, `ChallengesPage`, `ALL_CHALLENGES`, `CHALLENGE_BY_ID`, `buildStages`, `STAGE_META`, `CHALLENGE_TYPES`, `ChallengeSchema`.

**Emits:** `challenge:completed`, `stage:completed` (through the session); `account:openPro` when a locked premium stage is opened.

**Listens:** `practice:open`, `practice:openTest`, `progress:reset`, `auth:signedOut`.

**Does not own:** XP rules and stage unlocking (`platform/xp-leveling`, `platform/progress`), server verification (`server/`), the reading material shown in the modal (injected by the app via `readingSlot`).

Same layout as every module: `content/` (data + `spec.ts` + glob `index.ts`),
`components/`, `pages/`, `services/`, `schema.ts`, `__tests__/`. Anything not
exported from `index.ts` is private; `npm run lint:boundaries` enforces it.
