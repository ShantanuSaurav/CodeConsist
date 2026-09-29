# modules/challenges

**Owns:** the challenge bank (lessons plus one test per stage, one folder per topic; `stages.ts` and `tracks.ts` are the metadata - the current counts are in the root README, kept current by `npm run content:stats`), the seven challenge types and their client-side grading (`challenge-types/registry.ts`), the beginner teaching walk-through (`components/lesson/`, shown once per `concept` in Learn mode), the Learn/Practice mode chooser, the practice modal and its session, the learning path with its track picker, and the library.

**Public API (`index.ts`):** `PracticeHost`, `LearnPage`, `ChallengesPage`, `CHALLENGE_TYPES` and the grading helpers.

**Second public entry (`content/index.ts`, `import()` only):** `ALL_CHALLENGES`, `CHALLENGE_BY_ID`, `buildStages`, `STAGE_META`, `LANGUAGE_TRACKS`. The bank is ~300 kB and the app fetches it as its own chunk after the shell paints (ADR 0006); the boundary check refuses a static import. The zod schema is reached through `content/spec.ts` (`schema()`), lazily, so it stays out of the production bundle.

**Emits:** `challenge:completed`, `stage:completed` (through the session); `account:openPro` when a locked premium stage is opened; `assessment:finished` (through the session) when a test-out or placement ends.

**Listens:** `practice:open`, `practice:openTest`, `practice:openUnit`, `review:open`, `assessment:open`, `progress:reset`, `auth:signedOut`.

**Test-out and placement (Phase 5).** `assessment:open` opens the practice modal in `'assessment'` mode (`session/PracticeSessionProvider.tsx`): the rules first (`components/AssessmentPanel.tsx`, the admin's `testOut.copy` / `placement.copy`), then the stage test with a "Run n of maxRuns · pass mark X%" pill - no answer shown, no skip, hints only when allowed; closing asks first and counts as not passed. A pass is recorded by the session (`submitAssessment`: the server for an account, the local engine for a guest), then the next test or the result. The path shows a Test out button on locked stages ("Try again in …" while a learner must wait), a quiet Test out link on open ones and a "Tested out" badge; the Learn page offers "Find your level".

**Does not own:** XP rules and stage unlocking (`platform/xp-leveling`, `platform/progress` - per track), the selected track and the Learn/Practice preference (`platform/session`), server verification (`server/`), the reading material shown in the modal (injected by the app via `readingSlot`).

Same layout as every module: `content/` (data + `spec.ts` + glob `index.ts`),
`components/`, `pages/`, `services/`, `schema.ts`, `__tests__/`. Anything not
exported from `index.ts` is private; `npm run lint:boundaries` enforces it.
