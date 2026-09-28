# Design: Onboarding, placement and test-out

## 1. Goal

A new learner goes from "Enter CodeConsist" through a short first-run setup: why they are learning, which track, how much they already know, a daily goal and a learning mode. The answers are saved on the account, or in the browser for guests. Learners who already know some of the material can take a placement built from the existing stage tests, or test out of a locked stage. The server records every test-out and every stage unlock, so neither can be faked. Every rule, number and piece of text is a code default that the admin can change at runtime. Existing progress is left exactly as it is.

## 2. Data model

### 2.1 Admin-editable config (new, shared by client and server)

New pure-TypeScript package `src/platform/learning-config/`. It has no React and no DOM, so `server/build.js` `compileTsModule` can bundle it the same way it bundles `leveling.ts` and `schema.ts`.
- `types.ts`: `LearningConfig { onboarding; placement; testOut; progression }`.
- `defaults.ts`: `DEFAULT_LEARNING_CONFIG`, plus `schemaVersion` per namespace.
- `schema.ts`: one zod schema per namespace. zod is already a dependency, and `modules/challenges/schema.ts` is compiled for the server the same way.
- `resolve.ts`:
  - `resolveConfig(defaults, stored)`: objects are deep-merged; arrays in the stored value replace the default arrays whole; missing scalar keys fall back to the default. If the result fails the zod schema, that namespace falls back to its defaults and is flagged `invalid: true`.
  - `migrateStored(ns, value, fromVersion)`: used when a code release adds array items, such as a new onboarding step.
  - `fillTemplate(text, vars)`: fills placeholders such as `{stage}`, `{passMark}`, `{maxRuns}` and `{when}`.
  - `maxRunsFor(passMark) = floor((100 - passMark) / 10) + 1`. Pass marks use the existing `rawScore()`: 100, minus 10 for each extra run, minus 10 for each hint.

Default values in code (the admin can edit all of them):

| Namespace | Fields (default) |
|---|---|
| `onboarding` | `enabled` (true), `showAfterEnter` (true), `dashboardReminder` (true), `intro {title, body}`, `finish {title, body, ctaLabel, placementCtaLabel}`. `steps[]` in display order, with fixed ids `motivation, track, experience, goal, mode`. Each step has `{id, enabled, skippable, title, subtitle}`. **motivation** `options[] {id, label, description, icon}`: job, college, interviews, fun. **track** `trackBlurbs {[trackId]: string}` (optional overrides). **experience** has fixed option ids `new / some / experienced`, each `{label, description, action: 'start'\|'offer-placement'\|'placement', recommendMode: 'learn'\|'practice'\|null}`, plus `placementPrompt {title, body, startLabel, skipLabel}`. **goal** `{title, subtitle}`; its options come from the goal feature's `goals` namespace. **mode** `options {learn, practice}: {title, flow, blurb}`, moved out of `LearningModeChooser.tsx` `OPTIONS`. Validation: step ids are unique and from the fixed set; `track` comes before `experience` when both are enabled; motivation has 2–8 options; text is at most 120/600 characters. |
| `placement` | `enabled` (true), `offerOnLearnPage` (true), `maxStages` (3, range 1–20), `stopOnFirstFail` (true), `passMark` (70; multiple of 10, range 50–100), `hintsAllowed` (false), `xpPercent` (100, range 0–100), `retakeAfterDays` (7), `stagesByTrack {[trackId]: stageId[]}` (empty means every stage with a test, in track order), `copy {introTitle, introBody, passTitle, passBody, failTitle, failBody, learnPageLink}` |
| `testOut` | `enabled` (true), `allowOnOpenStage` (true), `allowSkipAhead` (true; false means only the first locked stage), `countsAsCleared` (true), `countsTowardCertificate` (false), `passMark` (80), `hintsAllowed` (false), `maxAttempts` (3), `attemptWindowHours` (24), `cooldownMinutes` (60), `sessionMinutes` (60), `xpPercent` (100), `disabledStages []`, `copy {buttonLabel, confirmTitle, confirmBody, rulesLine, passTitle, passBody, failTitle, failBody, cooldownLabel}` |
| `progression` | `solveGate`: `'off'\|'log'\|'enforce'`. `mergeGate`: the same three values. `requireServerVerification` (true). `acceptGuestClaims` (true). `landing {pathLine, pathLineNoSkip, buildStep, buildStepNoSkip}`. |

The storage for these settings is a new top-level key in `server/db.js` `EMPTY`: `settings: {}`, shaped as `{ [ns]: { value, schemaVersion, updatedAt, updatedBy } }`. It holds only what the admin has changed. New store helpers: `getSettings()`, `setSettingsNamespace(ns, value, adminId)` and `deleteSettingsNamespace(ns)`. Keys are written with `defineEntry`.

### 2.2 User record (`db.users[]`)

- `preferences`: `{ trackId?, learningMode?, motivation?, experience?, dailyGoal?, updatedAt }`. `dailyGoal` is the goal feature's option id; if that feature stores it somewhere else, align this field with it.
- `onboarding`: `{ completedAt: string|null, dismissedAt: string|null, configUpdatedAt: string|null } | null`.

These fields go on the user row, not the progress row, so that `POST /api/progress/reset` keeps them. `deleteUser` already removes the row.

### 2.3 Progress row (`db.progress[userId]`, `EMPTY_PROGRESS`)

- `testedOut: { [stageId]: { at, via: 'test-out'|'placement', clears: boolean, assessmentId } }`. `clears` is copied from the config at the moment the test is passed, so a later admin change never re-locks anyone.
- `seenConcepts: string[]`: moved from local-only storage to the progress row.
- `attempts[testId].via`: optional, `'test-out'|'placement'`.

### 2.4 Assessment log (new top-level key `assessments: {}`)

`assessments[userId] = { records: AssessmentRecord[] (the newest 100), cooldownClearedAt: { [stageId|'*']: iso } }`.

`AssessmentRecord`:
```
{ id: 'as_<random>', kind, trackId, stageIds[], cursor,
  status: 'active'|'passed'|'failed'|'finished'|'abandoned'|'expired',
  results: {[stageId]: {outcome, runs, hintsUsed, score, verified, at}},
  rules: {passMark, hintsAllowed, xpPercent, clears},   // copied at start
  startedAt, expiresAt, finishedAt }
```
The log is kept separate from progress on purpose: resetting progress must not reset cooldowns. `deleteUser` gains `deleteAssessmentsForUser(id)`.

### 2.5 TypeScript (`src/types/index.ts`)

- New types: `AssessmentKind`, `TestOutRecord`, `AssessmentRules {passMark, hintsAllowed, maxRuns, xpPercent}`, `AssessmentView` (the record without internals, plus a `current` stage id), `LearnerPreferences`, `OnboardingState`.
- `UserStats` gains `testedOut?`. For guests only, it also gains `assessmentClaims?` (§3.3) and `heldChallenges?`.
- `Stage.testedOut?: boolean`, set by `applyProgress`. The stage keeps the `'Completed'` state so the union type does not change.
- `UserProfile` gains `preferences?` and `onboarding?`.
- `ServerProgress` in `api.ts` gains `testedOut` and `seenConcepts`.

### 2.6 Guest and local storage (`src/platform/storage/storage.ts` `STORAGE_KEYS`)

- `onboarding: 'cq-onboarding-v1'`: `{completedAt, dismissedAt, answers}`
- `preferences: 'cq-preferences-v1'`: motivation, experience, dailyGoal, updatedAt, pendingSync
- `assessments: 'cq-assessments-v1'`: the guest's local assessment log
- `config: 'cq-learning-config-v1'`: the last `/api/config` response, used offline

The existing keys `cq-selected-track` and `cq-learning-mode` stay the local mirror.

### 2.7 Migration: existing data is never broken

- `migrate()` in `server/db.js`:
  - `next.settings = plainObject(loaded.settings)` and `next.assessments = plainObject(loaded.assessments)`.
  - Each user gets `preferences: plainObject(rest.preferences)` and `onboarding: rest.onboarding ?? null`.
  - Export `migrate` as `migrateState` so it can be tested, following the pure pattern of `forgetBillingIdentity`.
- `EMPTY_PROGRESS` gains `testedOut: {}` and `seenConcepts: []`. `getProgress` already fills in missing fields. `/api/progress/reset` (index.js:795) must create fresh `testedOut: {}` and `seenConcepts: []` objects rather than spreading the shared constant.
- On the client, `hydrateStats` fills `testedOut: {}`.
- Existing rows have no `testedOut`, so their stage states come out exactly as today (proved by regression tests).
- Onboarding is never forced on existing learners. `needsOnboarding` is true only when `onboarding?.completedAt` and `dismissedAt` are both empty **and** `completedChallenges.length === 0`.
- Legacy accounts have no server preferences. On the first restore after deploy, the device's local track and mode are pushed up, so the first device wins.
- Sticky evidence (§3.1): a stage in which the learner has already solved something stays open. Solves made before server enforcement existed are therefore kept.

## 3. Server API

### 3.1 Shared rules (pure TS, compiled in `bootstrap()` next to `leveling.mjs`)

**`src/platform/progress/stages.ts` `applyProgress(stages, stats)`.** The signature does not change. Only the rules do:
- **Cleared** = today's rule (every lesson done and the test passed), **or** `testedOut[id].clears` with the test passed.
- **Open** (not `'Locked'`, unless premium-locked, which is checked first as today) when any of these holds:
  - the chain says so, as today;
  - the stage has a `testedOut` record;
  - a later stage in the same track has a `testedOut` record, so jumping ahead opens every stage before it;
  - sticky evidence: any lesson or the test of this stage is already solved.
- Sets `testedOut: true` on stages with a record.
- `groupIntoStages` moves here from `platform/session/content.ts`, which re-exports it, so the server can build `Stage[]` in the same shape the client uses.

**New `src/platform/progress/access.ts`** (all pure; tests pass `now` in):
- `canSolve(challenge, stagesWithState, stats) → {ok} | {ok:false, reason:'stage-locked'|'stage-unavailable'|'test-locked'}`. A test is allowed when its stage's lessons are done or the test is already solved.
- `settleExpired(records, now)`: an active record past `expiresAt` counts as `expired`, which is a failure.
- `testOutEligibility({stage, trackStages, log, rules, now}) → {allowed, reason:'disabled'|'no-test'|'premium'|'already-cleared'|'test-pending'|'not-reachable'|'limit'|'cooldown', retryAt, attemptsLeft}`.
- `placementEligibility(...)` and `placementQueue(trackStages, rules)`. The queue starts at the first uncleared stage, skips premium-locked stages and stages without a test, respects `stagesByTrack`, and is capped at `maxStages`.
- `filterMergeIds(bankOrder, accepted, incoming, stats)`: walks the incoming ids in track order and accepts a lesson only when its stage is open given what has been accepted so far, and a test only when its lessons are accepted. Sticky evidence comes only from ids already accepted, never from the incoming claim itself.

**`src/platform/xp-leveling/leveling.ts`:** add `xpForTestOut(xpReward, xpPercent, attempts, hintsUsed)`, built on `xpForSolve`.

### 3.2 `server/progression.js` (new, testable without index.js)

- `learnerAccess(user, progress)`:
  - builds `applyLearnerOverrides(contentSnapshot(), overrides)`;
  - removes hidden tracks (the same filter as `visibleTracks` in `SessionProvider.tsx:630`);
  - runs `groupIntoStages`, then `applyProgressByTrack` with `{completedChallenges, testedOut, isPremium: entitlementsFor(...).lifetime, unlockedStages: unlockedStageIds(...)}`.
- `checkSolveAccess(user, challenge)` wraps `canSolve` and honours `progression.solveGate`. In `log` mode it returns ok and counts "would reject" in an in-memory counter shown to the admin.
- `applySolve(progress, challenge, {attempts, hintsUsed, awarded, via})` holds the XP, streak and attempts logic taken out of `/api/progress/solve` (index.js:666–696). The solve route and the assessment route both use it, so the two stay identical.
- `completedStagesFor(completedIds, testedOut)` moves here from index.js:723 and also counts records with `clears`.
- `acceptClaims(current, claims, deps)` and `filterMerge(current, incoming)` are used by the merge route.

### 3.3 Changes to existing routes (`server/index.js`)

- **`POST /api/progress/solve`** (641–711): after `getChallengeMerged`, call `checkSolveAccess`. If it fails, return `403 {error, reason}`. The rest of the route goes through `applySolve`. Tested-out stages already record their test as solved, so re-solving it is allowed.
- **`POST /api/progress/merge`** (738–793): becomes `asyncRoute`.
  1. Guest `incoming.assessmentClaims` (at most 20; each `{kind, stageId, testId, attempts, hintsUsed, code?|answer?, at}`) are sorted into track order and checked one by one:
     - the challenge is a stage test for that stage;
     - the stage is in the learner view and not premium-locked;
     - the feature is enabled and `acceptGuestClaims` is on;
     - `rawScore >= passMark`, and no hints were used if hints are not allowed;
     - reachability passes (`allowSkipAhead`);
     - `verifySubmission` returns ok, and verified if `requireServerVerification` is on.
     Accepted claims write `testedOut`, add the test id, and pay `xpForTestOut`.
  2. Incoming ids go through `filterMergeIds` under `mergeGate`.
  3. `seenConcepts` is unioned, keeping only known concept ids, capped at 500.
  4. The response adds `droppedChallenges[]` and `claims: {accepted[], rejected[{stageId, reason}]}`.
- **`POST /api/progress/reset`:** fresh `testedOut` and `seenConcepts`. The assessment log is kept.
- **`POST /api/grade`** (836): refuse `isStageTest` with 400. No client code calls this route today, and for the C/C++ fill-blank tests it is an unlimited answer oracle.
- **`publicUser()`** (206): add `preferences` and `onboarding`.
- **`bootstrap()`:** compile `learning-config`, `progress/access` and the updated `stages`. Fill a `learningDeps` object the same way `adminDeps` is filled, so routers mounted before bootstrap read it per request.

### 3.4 New learner routes

- **`GET /api/config`** (public, no auth): `{ updatedAt, onboarding, placement, testOut, progression: {landing} }`, the effective learner-facing config. Other features add their own namespaces here. It never contains secrets, and the text is rendered as plain text.
- **`server/preferences-routes.js`**, `createPreferencesRouter({requireAuth, publicUser, config, learnerTracks, conceptIds})`. It follows the `createDraftsRouter` pattern: checks each field with `String(...)` and answers `400 {error}` naming the field.
  - `PUT /api/me/preferences`, body `{trackId?, learningMode?, motivation?, experience?, dailyGoal?, onboarding?: 'completed'|'dismissed'}`:
    - `trackId` must be a visible track;
    - `learningMode` must be `learn` or `practice`;
    - `motivation` and `experience` must be option ids in the effective config, or null;
    - `dailyGoal` is checked against `goals` only when that namespace exists.
    - Returns `{user: publicUser}`.
  - `POST /api/progress/concepts {conceptIds[]}`: union with the stored list, known ids only, returns `{seenConcepts}`.
- **`server/assessment-routes.js`**, `createAssessmentRouter(deps)`. `deps` are `{requireAuth, verifySubmission, getChallengeMerged, progression, access, leveling, config, clearDraftForSolve, onProgress}`. Every route uses `requireAuth` and is scoped to `req.user.id`; a record id owned by someone else returns 404.
  - `GET /api/assessments/status?trackId=` → `{ placement: {eligible, reason, retryAt, queue}, testOut: {[stageId]: {allowed, reason, retryAt, attemptsLeft}}, active: AssessmentView|null }`.
  - `POST /api/assessments` with `{kind:'test-out', stageId}` or `{kind:'placement', trackId}`. Returns `201 {assessment}`. Errors: `409 {reason:'active-exists', assessment}` (the client offers Resume); `429 {reason:'cooldown'|'limit', retryAt}`; `403 {reason:'premium'|'not-reachable'|'disabled'}`; `404` for an unknown stage or track. The record snapshots `rules`.
  - `POST /api/assessments/:id/submit` with `{stageId, attempts, hintsUsed, code?|answer?}`. The record must be active, not expired, and on the current stage.
    - Hints used when not allowed → 422.
    - `verifySubmission` fails → `422` (the attempt is not used up).
    - The server cannot verify and verification is required → `503 {reason:'unverifiable'}` (not used up).
    - `rawScore < passMark` → the result is recorded as failed.
    - Pass → `applySolve(..., via)` plus the `testedOut` record, `clearDraftForSolve`, then the cursor advances.
    - Returns `{assessment, progress, awardedXp}`.
  - `POST /api/assessments/:id/fail` with `{stageId, reason:'gave-up'|'out-of-runs'}`. A test-out becomes `failed`. A placement becomes `finished` when `stopOnFirstFail`, otherwise it moves on.
  - `POST /api/assessments/:id/finish` ends a placement early.

### 3.5 Admin routes (in `server/admin.js`, already behind `router.use(requireAdminAuth)`)

- `GET /settings` → `{namespaces: {[ns]: {defaults, stored, effective, invalid, updatedAt, updatedBy}}, diagnostics: {solveGate, mergeGate counters, pythonVerifiable}, stages: [{id, name, trackId, hasTest, testLanguage}]}`.
- `PUT /settings/:ns` with `{value}`: validates the *resolved* result with the namespace's zod schema, answering `400 {error, issues:[{path, message}]}` (the same shape as `/content/challenges/validate`). Stores it, audits `settings.update {ns, changedKeys}`, and returns the view.
- `DELETE /settings/:ns` resets the namespace to defaults (audit `settings.reset`).
- `GET /users/:id/learning` → `{preferences, onboarding, testedOut, assessments}`.
- `POST /users/:id/assessments/clear-cooldown {stageId?}` sets `cooldownClearedAt` (audit `assessment.cooldown.clear`).
- `GET /analytics/onboarding` → onboarding completion and dismissal counts; answer counts per option (removed options are grouped as "other"); placements started, finished and median stages placed; test-out attempts and pass rate per stage.

The zod validator reaches the admin router through `adminDeps.validateSettings`, the same way `validateChallenge` does.

### 3.6 Where each rule lives

- Lock chain and test-out effect: `stages.ts`.
- Solve, merge, eligibility and queue: `access.ts`.
- XP: `leveling.ts`.

The server and the client run the same compiled code. The server alone writes `testedOut`, runs assessments, applies cooldowns and verifies claims.

## 4. Client

### 4.1 Platform

- **`api.ts`:** add `config()`, `progress()` (the route exists but the client has no method), `updatePreferences()`, `markConceptsSeen()`, `assessmentStatus()`, `startAssessment()`, `submitAssessment()`, `failAssessment()` and `finishAssessment()`. Extend the `mergeProgress` response type.
- **`SessionProvider.tsx`:**
  - `config`: starts from `cq-learning-config-v1` or the defaults, and is refetched in the probe's recovered branch next to `loadFromApi`.
  - `preferences`, `needsOnboarding`, `completeOnboarding(answers)` and `dismissOnboarding()`.
  - Track and mode changes (`setSelectedTrack` / `setLearningMode`) are synced with a 1500 ms debounce `PUT`, with a `lastSynced` ref so that adopting the server's values does not echo them back.
  - `markConceptSeen` also calls `api.markConceptsSeen` when signed in.
  - **Regression guard:** in `restoreSession`, `adoptSession` and the `completeChallenge` reconcile, `seenConcepts` is unioned, not spread. Local extras are pushed up; otherwise the first restore after deploy would wipe teaching history kept only in the browser.
  - `completeChallenge`: a 403 rolls back the optimistic update like a 422, then refetches config and progress.
  - After a merge, `heldChallenges = droppedChallenges` is stored and a toast explains why.
  - New helper files keep the provider from growing further: `src/platform/session/preferences.ts` (pure `reconcilePreferences(local, server)`, `unionConcepts`) and `useAssessments.ts`. The hook exposes `testOutStatus(stageId)`, `placementStatus(trackId)`, `startAssessment`, `submitAssessment`, `failAssessment`, `finishAssessment` and `refreshAssessmentStatus`. Signed-in learners use the server routes. Guests use a local engine: the same `access.ts` functions, a log in `cq-assessments-v1`, and on a pass a local `testedOut` record, local XP from `xpForTestOut`, and an `assessmentClaims[stageId]` entry that stores the passing code or answer.
- **`src/platform/events`:** new intent `assessment:open {kind, stageId?, trackId?}` with `intents.openAssessment`, and a fact event `assessment:finished {kind, passedStageIds}`.

### 4.2 Onboarding (new module `src/modules/onboarding/`)

- Barrel `index.ts` exports `OnboardingPage`.
- `OnboardingPage` has its own content gate using `contentReady` and a skeleton, and renders the enabled steps in config order.
- `flow.ts` (pure): `visibleSteps(config, hasGoals)` and `nextAction(answers)`.
- Steps: `MotivationStep`, `TrackStep`, `ExperienceStep`, `GoalStep` (skipped automatically when `config.goals` is missing) and `ModeStep` (preselected from the experience option's `recommendMode`).
- On Finish it calls `completeOnboarding`. If placement was chosen, it navigates to `/dashboard/learn` and calls `intents.openAssessment({kind:'placement', trackId})`.
- If the learner is signed in but their cached profile is stale, the page waits for restore and sends them to `/dashboard` when onboarding is already complete.
- `src/config/routes.ts` gains `onboarding: '/welcome'`, also added to `STATIC_ROUTES`. `App.tsx` gets a `lazyPage` route outside the dashboard frame.
- `Landing.tsx` `enter()` (lines 54–57) goes to `/welcome` when `needsOnboarding && config.onboarding.enabled && showAfterEnter`, and to `/dashboard` otherwise.
- `DashboardHome.tsx`: a "Finish setting up" card when `needsOnboarding && dashboardReminder`.
- `SettingsPage.tsx`: "Redo setup", which opens `/welcome` pre-filled.

### 4.3 Shared UI (merging the track picker and mode chooser)

- New presentational primitives in `src/ui/primitives/`: `ChoiceCards` (props: options and value), `TrackChoiceList` (plain props, no session types) and `LearningModeCards`, which is `LearningModeChooser` moved out of its module with its copy passed in from config.
- `LanguageTrackPicker.tsx` becomes a thin wrapper around `TrackChoiceList` plus `useSession`.
- `LearningModeChooser.tsx` is replaced by `LearningModeCards` inside `PracticeModal`. It stays as the fallback when onboarding was skipped.
- The onboarding module and the admin preview use the same primitives, which respects the module boundaries.

### 4.4 Challenges module

- **`session/rules.ts`** (new, pure):
  - `canRevealSolution({challenge, mode, isCorrect, attempts})`: false whenever `challenge.isStageTest` or the mode is `'test'` or `'assessment'`.
  - `revealsAnswers(mode, challenge)`.
  - `hintsVisible(...)`.
- **(d) `PracticeModal.tsx`:**
  - Line 891 uses `canRevealSolution`, and `showSolution` is forced to false in test-like modes.
  - New `revealAnswers` prop on `AnswerRendererProps` (`challenge-types/types.ts`). `FillBlankChallenge.tsx:88` hides "Expected:" and `OptionsChallenge.tsx:62–65` does not mark the correct option when it is false.
  - This matters because the C and C++ stage tests are fill-blank questions: today the first wrong check shows the answer, and the retry then passes.
- **`PracticeSessionProvider.tsx`:**
  - `PracticeMode` gains `'assessment'` with `activeAssessment: AssessmentView`.
  - `openAssessment(req)` handles `assessment:open`: it checks status, calls `startAssessment` (or offers Resume on a 409), and walks `stageIds`.
  - In assessment mode, closing asks for confirmation ("Leaving ends this attempt") and then calls `failAssessment('gave-up')`.
- **`PracticeModal` in assessment mode:**
  - Header shows "Test out · Stage 03" or "Placement · 2 of 3".
  - A pill shows "Run n of maxRuns · pass mark X%".
  - Hints appear only if allowed. The explanation stays hidden until the attempt ends. There is no Skip.
  - `award()` calls `submitAssessment` instead of `completeChallenge`. When runs reach `maxRuns` it calls `failAssessment('out-of-runs')`.
  - Result screens: on a pass, "Next test" or "Start Stage NN" (the stage after the tested-out one); on a fail, the cooldown time and "Do the lessons instead".
- **`LearningPath.tsx`:**
  - Locked, non-premium rows (they have no actions today, line 108) get a Test out button labelled `copy.buttonLabel` when `testOutStatus.allowed`, or a disabled "Try again {when}" during a cooldown.
  - Open stages whose lessons are unfinished get a small Test out link when `allowOnOpenStage`.
  - Stages with a `testedOut` record show a "Tested out" badge.
- **`LearnPage.tsx`:** a "Find your level" link (`placement.copy.learnPageLink`) when placement is eligible and `offerOnLearnPage` is on, plus a notice when `heldChallenges` is not empty.

### 4.5 (e) Landing copy

- `HowItWorks.tsx:41` changes to `progression.landing.pathLine`, or `pathLineNoSkip` when both placement and test-out are disabled.
- The step 03 description (line 23) changes to `buildStep` / `buildStepNoSkip`.
- The defaults drop both "You cannot skip ahead" and the wrong "Ten stages":
  - `pathLine`: "Stages open in order, each ending in a coding test. Already know some? Take a short placement or test out of a stage."
  - `buildStep`: "…The next stage stays locked until you clear it, or test out of it."

### 4.6 States

| Situation | Onboarding | Placement / test-out | Preferences and concepts |
|---|---|---|---|
| Guest (API online or offline) | Saved locally | Local engine; claims re-checked when the guest signs in | Local only |
| Signed in, online | Server (`PUT`) plus local mirror | Server routes | Debounced `PUT`; concepts pushed |
| Signed in, offline | Saved locally with `pendingSync`; pushed on restore (newer `updatedAt` wins) | Buttons disabled: "Test-outs need a connection so the unlock is saved to your account" | Queued; unioned on restore |
| Guest signs in | `reconcilePreferences`: the account's fields win and local answers fill the gaps | Claims verified at merge; rejected ones are listed, and any lessons they would have unlocked go into `heldChallenges` | Unioned |

## 5. Admin panel

- **Navigation:** a new "Learning" group in `AdminLayout.tsx` `GROUPS`, with routes in `AdminApp.tsx`:
  - **`/admin/onboarding`, `pages/AdminOnboarding.tsx`:**
    - master toggles (`enabled`, `showAfterEnter`, `dashboardReminder`);
    - an intro and finish text editor;
    - a step list with an on/off Toggle, up/down reorder (validated so track comes before experience), and title and subtitle fields;
    - per-step option editors: motivation add, remove and edit label, description and icon; experience label, description and a `SelectField` for action and recommended mode; mode title, flow and blurb; track blurb per track;
    - a live preview built from the shared `ChoiceCards` and `LearningModeCards`;
    - "Reset to defaults".
  - **`/admin/placement`, `pages/AdminPlacement.tsx`, with three sections:**
    - **Placement:** every field of that namespace, with a checkbox list of stages per track for `stagesByTrack`.
    - **Test-out:** every number and toggle. The derived "at most N runs" is shown next to each pass mark. `disabledStages` is a checkbox list. Each stage row shows its test's language and whether the server can verify it (for example, "Python: not verifiable on this server"), and links to edit that stage test in Challenges through the existing `QuestionWizard`, since the stage tests are the placement content.
    - **Progression rules:** `solveGate` and `mergeGate` as segmented off/log/enforce, with the "would reject / rejected in 24h" counters; `requireServerVerification`; `acceptGuestClaims`; the four landing lines.
- **Users** (`AdminUsers.tsx` drawer): a "Learning" section showing onboarding answers, tested-out stages, the last 20 assessments, and a "Clear test-out cooldowns" button with a `ConfirmDialog`.
- **Analytics** (`AdminAnalytics.tsx`): an "Onboarding and placement" card built from `/analytics/onboarding`. Guests are not counted, and the page says so.
- **Audit log:** shows `settings.update`, `settings.reset` and `assessment.cooldown.clear` automatically.
- **`adminApi.ts`:** add `settings()`, `updateSettings(ns, value)`, `resetSettings(ns)`, `userLearning(id)`, `clearAssessmentCooldown(id, stageId?)` and `onboardingAnalytics()`. Types come from `@/platform/learning-config`. Field errors map from `issues[].path`, as in `QuestionWizard`.

## 6. Tests to add

**Unit (vitest, `src/**/__tests__`):**
- `platform/progress/__tests__/stages.test.ts`:
  - all existing fixtures unchanged, with no `testedOut`;
  - a record with `clears:true` opens the next stage;
  - with `clears:false` the tested-out stage opens but the next one waits for its lessons;
  - earlier stages open after a skip-ahead;
  - premium still wins;
  - sticky evidence keeps a stage open after a new lesson is added to the stage before it;
  - `groupIntoStages` after the move.
- `platform/progress/__tests__/access.test.ts`:
  - every `canSolve` reason;
  - `testOutEligibility`: disabled stage, premium, skip-ahead off, window limit, cooldown, an expired active record counting as a failure, `cooldownClearedAt`;
  - `placementQueue`: skipping premium and test-less stages, `maxStages`, `stagesByTrack`;
  - `filterMergeIds`: a forged later-stage lesson is dropped, a test without its lessons is dropped, legitimate progress in order passes.
- `platform/learning-config/__tests__/config.test.ts`: defaults validate; deep merge and array replacement; an invalid stored value falls back with `invalid:true`; `migrateStored`; `fillTemplate`; `maxRunsFor`; the track-before-experience rule.
- `xp-leveling/__tests__/leveling.test.ts`: `xpForTestOut`.
- `modules/challenges/__tests__/rules.test.ts`: `canRevealSolution` is false for any `isStageTest` and in test and assessment modes; `revealsAnswers`.
- `modules/onboarding/__tests__/flow.test.ts`: `visibleSteps`, the goal step hidden when there is no goals config, experience options branching to placement, `needsOnboarding` false for learners who already have progress.
- `platform/session/__tests__/preferences.test.ts`: `reconcilePreferences`, `unionConcepts`.

**Server (`server/__tests__`, following the patterns of `drafts.test.mjs` and `admin-questions.test.mjs`):**
- `assessments.test.mjs` (real `db.js` with fs stubbed; `verifySubmission` stubbed; real TypeScript `access`, `leveling` and `config` imported):
  - start → 201; a second start → 409; cooldown and limit → 429 with `retryAt`; premium → 403;
  - a pass writes `testedOut`, the test id, XP equal to `xpForTestOut`, and clears the draft;
  - wrong code → 422, not used up; hints not allowed → 422; below the pass mark → failed;
  - `unverifiable` → 503;
  - an expired record counts as a failure;
  - placement moves on and stops on the first failure;
  - another user's id → 404; `__proto__` ids are safe.
- `progression.test.mjs`: `checkSolveAccess` under off, log and enforce; `applySolve` matches today's solve maths; `completedStagesFor` with `testedOut`; `acceptClaims` for verified, wrong, unverifiable, over-cap and below-pass-mark claims.
- `preferences.test.mjs`: 400 for each invalid field; onboarding completed and dismissed; concepts union, unknown ids dropped, cap.
- `admin-settings.test.mjs` (mocked `db.js` and `admin-auth.js`): GET views; PUT valid → stored and audited; PUT invalid → 400 with `issues`; DELETE reset; clear-cooldown and its audit.
- `db-migrate.test.mjs`: `migrateState` adds `settings`, `assessments`, user `preferences` and `onboarding` without touching progress; `deleteUser` drops assessments.
- `index-guards.test.mjs`: the solve route calls `checkSolveAccess(`; `/api/grade` refuses `isStageTest`.

## 7. Risks, edge cases and manual checks

- **The answer key is public** (plan item 4.3). Stage-test `solutionCode`, hidden tests and the C/C++ blank answers ship in the bundle and in `/api/content`. Test-outs are therefore "verified correct", not proof of skill. Follow-up: strip answers for `isStageTest` from `/api/content` and the bundle.
- **Python stage 2:** without a local CPython, `verifySubmission` returns `verified:false`, so test-outs and claims are refused while `requireServerVerification` is on. The admin page shows this; the admin can relax the rule or disable that stage.
- **Rollout:** ship `solveGate` and `mergeGate` as `'log'`, watch the counters, then switch to `'enforce'`. In log mode, unlocks can still be faked exactly as they can today.
- **Merge:**
  - It is async and slower because claims are verified. The client timeout is 15 s and `express.json` is capped at 256 kB, so claims are limited to 20.
  - Rejected claims and dropped ids are shown to the learner and kept in `heldChallenges`.
  - Lessons remain trusted in merge, as they are today; only unlocks and tests are checked.
- **Config drift:** a client with a stale config gets a 403, then refetches. Rules are copied onto each assessment when it starts, and `clears` is copied onto each tested-out record, so admin edits never act retroactively.
- **Evidence and premium:** evidence never overrides the premium lock. Enforcing locks on `/solve` also stops XP for premium stages the learner has not bought (overlaps plan item 4.2; coordinate).
- **Other edge cases:**
  - Several tabs or devices: there is one active assessment per user, and a 409 leads to Resume.
  - Progress reset does not reset cooldowns.
  - Tested-out stages count as "cleared" in counts and badges, so a placement can pop several badge toasts at once.
  - Certificates still need every lesson unless `countsTowardCertificate` is on (a small change in `billing.js` `certificateEligibility`).
  - A hidden track saved as a preference falls back through `setSelectedTrack`.
  - A removed motivation option shows as "other".
- **Manual checks:**
  1. A fresh guest runs Enter → onboarding → placement, passes 2 tests and fails the third. Stages 01–02 show "Tested out", 03 is open, and XP matches.
  2. Sign in: claims are verified, progress matches, rejected claims are explained.
  3. A test-out cooldown, then the admin clears it.
  4. An existing account with progress sees no onboarding, and its stage states are the same as before deploy.
  5. No "Show me the solution" or "Expected:" appears on any stage test, test-out or placement.
  6. The admin changes a pass mark and some copy; the learner sees it without a redeploy.
  7. `/solve` in log mode, then enforce mode, using direct curl calls to a locked stage.
  8. Offline signed-in behaviour and phone-width layout of the onboarding steps.

## 8. Implementation steps (each can ship and be tested on its own)

1. **(d) Solution and answer-reveal fix:** `rules.ts`, the `PracticeModal` line 891 condition, the `revealAnswers` prop, and `/api/grade` refusing stage tests. Add tests.
2. **(e), first pass:** change the static copy in `HowItWorks.tsx` so it no longer says "cannot skip" or "Ten stages". Config-driven lines come in step 13.
3. **Config package:** `learning-config` (defaults, schema, resolve); `db.settings` and the migration; `server/settings.js`; `GET /api/config`; admin `GET/PUT/DELETE /settings`. Add tests.
4. **Admin placement page:** the Progression section plus a skeleton of the Placement and Test-out forms, bound to config. No learner behaviour changes yet.
5. **Progress model:** `testedOut` in types, `EMPTY_PROGRESS` and `hydrateStats`; the new `applyProgress` rules; `groupIntoStages` moved. Regression tests.
6. **`access.ts` and `server/progression.js`:** `applySolve` refactor, `checkSolveAccess` on `/solve` with `solveGate:'log'`; the client handles 403. Add tests.
7. **Merge:** `filterMergeIds` plus claim verification behind `mergeGate:'log'`; the response fields; client `heldChallenges`.
8. **Assessment store and `server/assessment-routes.js`:** tests, and the admin user-learning routes.
9. **Client assessment flow:** `useAssessments` (server and guest engine), the `assessment:open` intent, the assessment mode in `PracticeSessionProvider` and `PracticeModal`, and the Test out button in `LearningPath`.
10. **Placement entry points:** the Learn page link and the placement results screen.
11. **Preferences sync:** routes, `publicUser` fields, SessionProvider sync, and the `seenConcepts` union fix.
12. **Onboarding:** the UI primitives extracted, the `modules/onboarding` module, the `/welcome` route, the `Landing` redirect, the Dashboard card and Settings "Redo setup". Then `AdminOnboarding` with its preview.
13. **Config-driven landing lines;** admin Users drawer and onboarding analytics.
14. **Enforcement:** after the log counters stay clean, change the code defaults to `solveGate` and `mergeGate: 'enforce'`. Update `README.md` and write a new ADR, `docs/adr/0008-server-enforced-progression.md`.