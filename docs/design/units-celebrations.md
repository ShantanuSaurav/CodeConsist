# Bite-sized units and celebrations: design

## 1. Goal

Split each stage into short units of about 5-8 questions. Each unit is a node on the learning path and ends with its own end screen: XP count-up, accuracy, time, streak flame and daily-goal ring. The same shared pure functions add a server-checked perfect-unit bonus, a daily-goal bonus, a full-screen level-up, synthesized sounds with a mute setting, badge tiers with "progress to next" and a retuned level curve. Every number, grouping and piece of copy has a default in code and can be edited in a new admin page. Edits take effect without a redeploy. Guest mode, stage tests, gating and existing progress keep working unchanged.

**Checked against the code (branch `feature/learning-loop`, repo `Devlingo-dev`).** The feature map names `Devlingo-merged` as the repo; the code is actually in `Devlingo-dev`.
- **Batch files per core stage:** each core stage has exactly two batch files. The ids encode the batch letter: `stage-3-a01…a10`, `stage-3-b01…b10`.
  - Exceptions: stage-1 has a:12 (`a00`, `a00b`, `a01..a10`) and b:10. stage-5 has 11 and 11.
  - C and C++ each have a single `a.ts` with 15 items.
  - Questions created in the admin console get ids like `custom-<stageId>-<slug>-<4 chars>` (`generateChallengeId`, `server/custom-challenges.js:287`).
- **Order of question types inside a batch:** it varies. For example, data-structures/a is Q O O F F P M C C D and data-structures/b is O Q F P M C D O F C. Code items cluster at the end of the "a" batches.
- **Server XP maths:** `server/index.js` compiles `src/platform/xp-leveling/leveling.ts` at startup (`compileTsModule`, `server/build.js`). It prices XP in `/api/progress/solve` (lines 641-711) and `/api/progress/merge` (738-793).
  - The stored `level` is recomputed on read (`recalc`), and by the leaderboard.
  - `/api/auth/me` returns the raw stored progress, including the stored `level`.
  - `adminUserRow` (`server/admin.js:64`) returns the stored `progress.level`.
- **Confetti:** `celebrate()` (`SessionProvider.tsx:902`) fires 70 particles on every solve, including 0-XP re-solves. It also fires in `SubscriptionModal.tsx:223` after a purchase.
- **framer-motion:** it is only named in `vite.config.ts` (the manual chunk `motion`). Nothing imports it.
- **Badge regex bug:** `insights.ts:134` has `/^stage-d+$/`.
- **PracticeModal:** it is mounted in the shell through `PracticeHost` (`App.tsx:161`), not lazy-loaded.
- **Stage end screen:** it is at `PracticeModal.tsx:580-669`.
- **Server boundary rule:** `scripts/check-boundaries.mjs` lets the server import `platform/**` only. So all shared logic below lives in `src/platform`.

---

## 2. Data model

### 2.1 `server/db.js`

**New top-level key `gameRules`** (added to `EMPTY`):
- `gameRules: { overrides: {}, version: 0, updatedAt: null }`
- `overrides` is **sparse, per section**: `{ levels?, rewards?, dailyGoal?, units?, badges?, celebrations? }`.
  - Within a section, stored keys are merged shallowly over the defaults, so keys added to the defaults in later releases still appear.
  - Arrays (thresholds, options, tiers, families) replace the default array wholesale.
  - A missing section means "use the defaults".
- `version` goes up on every save. Clients use it to refetch.

**New `contentOverrides.units`**, keyed by stageId:
- `{ [stageId]: { units: [{ id, name, description?, challengeIds: string[] }], nextSeq: number, updatedAt } }`
- This sits beside `stages`, `challenges` and `languages`. It is written through `defineEntry` and read through `ownEntry`, so it is safe against `__proto__`.

**Progress rows** (`EMPTY_PROGRESS`, db.js:453) get three new fields:
- `unitsCompleted: {}`, shaped `{ [unitId]: { completedAt: ISO, perfect: boolean, bonusXp: number } }`. This is a record that the bonus was paid, not the source of "unit done". "Done" is always derived from `completedChallenges`.
- `daily: {}`, shaped `{ [yyyy-mm-dd]: { xp, firstSolves, solves, units, goalXp, goalBonusXp } }`. It is trimmed to the last `rules.dailyGoal.ledgerDays` days.
- `prefs: { dailyGoalXp: null, soundOn: null }`. `null` means "use the default from the rules".

**New store functions:**
- `getGameRulesRecord()`
- `setGameRulesOverrides(overrides)`: replaces the sparse object, increments `version`, stamps `updatedAt`, then persists.
- `getUnitOverride(stageId)`
- `setUnitOverride(stageId, record | null)`: `null` deletes the entry.

**Migration in `migrate()`**, following the existing pattern:
- `next.gameRules = { overrides: plainObject(loaded.gameRules?.overrides), version: Number.isInteger(...) ? ... : 0, updatedAt: string | null }`
- `next.contentOverrides.units = plainObject(loaded.contentOverrides?.units)`

**`getProgress()`** keeps its `{...clone(EMPTY_PROGRESS), ...row}` backfill. It additionally deep-fills `prefs` (`{ ...EMPTY_PROGRESS.prefs, ...row.prefs }`) and coerces `unitsCompleted` and `daily` through `plainObject`.

No row is rewritten at load. Old rows gain the fields the first time they are read or written.

### 2.2 TypeScript types

**`src/types/index.ts`** (additive; the new `UserStats` fields are optional, so existing test fixtures still compile):
- `interface UnitDef { id: string; name: string; description?: string; challengeIds: string[] }`
- `interface Unit extends UnitDef { stageId: string; index: number; challenges: Challenge[]; estMinutes: number; source: 'default' | 'custom' | 'auto' }`
- `Stage.units?: Unit[]`
- `interface UnitCompletion { completedAt: string; perfect: boolean; bonusXp: number }`
- `interface DailyEntry { xp: number; firstSolves: number; solves: number; units: number; goalXp: number; goalBonusXp: number }`
- `interface LearnerPrefs { dailyGoalXp: number | null; soundOn: boolean | null }`
- `UserStats += unitsCompleted?: Record<string, UnitCompletion>; daily?: Record<string, DailyEntry>; prefs?: LearnerPrefs`

**`src/platform/game-rules/types.ts`** defines `GameRules` with these sections:
- `levels: { thresholds: number[]; overflowStep: number; ranks: { minLevel: number; title: string }[] }`
- `rewards: { perfectUnitBonusXp: number; perfectRequiresNoHints: boolean }`
- `dailyGoal: { options: { id; label; xp; bonusXp }[]; defaultOptionId: string; ledgerDays: number; mergeMaxDays: number }`
- `units: { targetSize; minSize; maxSize; targetMinutes; minutesByType: Record<ChallengeType, number> }`
- `badges: { tierNames: string[]; families: { id; metric: BadgeMetric; enabled; title; detail; tiers: number[] }[]; stageBadges: { enabled; coreTitle; trackTitle } }`, where `BadgeMetric = 'bestStreak' | 'solvedCount' | 'unitsCompleted' | 'perfectUnits' | 'xp' | 'testsPassed'`. The list of metrics is fixed in code; admins pick from it.
- `celebrations: { sound: { defaultOn; volume; events: Record<SfxEvent, boolean> }; confetti: { onCorrect; onCorrectParticles; onUnitEnd; unitEndParticles }; levelUpOverlay: boolean; countUpMs: number; copy: { unitComplete; perfect; goalMet; levelUp; newRank; streakUp } }`

### 2.3 Defaults (`src/platform/game-rules/defaults.ts`, `DEFAULT_GAME_RULES`)

| Section | Default |
|---|---|
| **Level thresholds** (XP to reach level 1..20) | `0,100,300,600,1000,1500,2100,2800,3600,4500` (same as today for levels 1-10), then +900 per level: `5400,6300,…,13500` (level 20). `overflowStep: 900` for levels past the table. |
| **Ranks** | Apprentice 1, Junior Developer 3, Developer 6, Senior Developer 10, Staff Engineer 15, Principal Engineer 20. The bands are unchanged. Principal now needs 13,500 XP, against 17,020 for all content and 14,080 for free content. |
| **Rewards** | `perfectUnitBonusXp: 25`, `perfectRequiresNoHints: true` (46 default units, so at most 1,150 bonus XP in total) |
| **Daily goal options** | casual 50 XP / +5, regular 100 / +10 (**default**, matches today's `DAILY_XP=100`), serious 250 / +25, intense 500 / +50. `ledgerDays: 60`, `mergeMaxDays: 7`. |
| **Units** | `targetSize 5, minSize 3, maxSize 8, targetMinutes 8`. Minutes per type: quiz 0.5, output_prediction 0.75, multi_select 1, fill_blank 1, pseudocode_order 1.5, code_runner 4, debug 3. |
| **Badges** | tierNames Bronze/Silver/Gold/Platinum/Diamond. Families: streak `bestStreak` [3,7,14,30,100]; solved `solvedCount` [10,50,100,200]; units `unitsCompleted` [1,10,25,40]; perfect `perfectUnits` [1,5,15,30]; tests `testsPassed` [1,3,6,12]; xp `xp` [1000,5000,10000,15000]. Stage badges on: `Stage {index} cleared` for core stages, `{name} cleared` for track stages. `first-solve` stays a single badge. |
| **Celebrations** | sound defaultOn true, volume 0.5, all events on; confetti onCorrect 40 particles and onUnitEnd 140 particles; levelUpOverlay on; countUpMs 900. Copy: "Unit complete!", "Perfect unit! +{xp} XP", "Daily goal reached! +{xp} XP", "Level {level}", "New title: {title}", "{n}-day streak". |

**The new curve never lowers anyone's level.**
- The new threshold is less than or equal to the old `50·(L-1)·L` for every level. For example, L11 is 5,400 against 5,500, and L20 is 13,500 against 19,000.
- So learners only move up. A unit test checks this property.
- All content now reaches level 23.

**Default grouping produces 46 units:** 4 per core stage (5/5/5/5, 6/6/5/5 for stage-1, 6/5/6/5 for stage-5) and 3 per C/C++ stage.

### 2.4 Backwards compatibility

- **No stored progress is rewritten.** "Unit done" is derived from `completedChallenges`.
- **Retroactive unit badges:** the unit and perfect badge metrics count derived completions, so existing learners get credit.
  - `perfectUnits` = the union of `unitsCompleted[..].perfect` and `isPerfectUnit(unit, attempts)`.
  - So a later replay, which accumulates `attempts`, cannot take away a badge.
- **Levels:** they are always recomputed from `xp` with the current curve. The stored `level` is still written, for Excel sync and old clients.
- **Daily ledger:** `daily` starts empty. On the day this ships, the goal ring counts only XP earned after the deploy.

---

## 3. Server API

### 3.1 Where the server-side rules live

**Shared pure TypeScript**, compiled at startup with `compileTsModule` into a single bundle, `server/generated/game.mjs`:
- **Entry:** `src/platform/xp-leveling/rewards.ts`, which re-exports `resolveGameRules`, `validateGameRules`, `DEFAULT_GAME_RULES`, `defaultUnits`, `resolveUnits`, `validateUnitOverride`, `levelFromXp` and the reward functions.
- **Wiring:** `bootstrap()` loads it next to `leveling.mjs` and passes it on as `adminDeps.game`, the same way `validateChallenge` is passed today.

**Modules and functions:**
- `src/platform/game-rules/{types,defaults,resolve,index}.ts`
  - `resolveGameRules(overrides): { rules, issues }` validates each section. A stored section that is invalid falls back to the defaults and is reported in `issues`, so a bad save can never break the server.
  - `validateGameRulesPatch(patch): Issue[]`
- `src/platform/xp-leveling/leveling.ts` gets an optional curve parameter; existing callers are unchanged.
  - `DEFAULT_LEVEL_CURVE`
  - `xpForLevel(level, curve?)`, `levelFromXp(xp, curve?)`, `levelProgress(xp, curve?)`
- `src/platform/progress/units.ts`
  - `defaultUnits(stageId, lessons, cfg): UnitDef[]`
  - `resolveUnits(stageId, lessons, override | undefined, cfg): Unit[]`
  - `unitStates(units, completed)`, `unitFor(units, challengeId)`, `estimateMinutes(challenges, cfg)`
  - `validateUnitOverride(stageId, lessonIds, input, cfg): { units, issues, warnings }`
- `src/platform/xp-leveling/rewards.ts`
  - `applySolveRewards(before, after, { challengeId, firstSolve, solveXp, today, now }, { rules, unitFor }): { progress, outcome }`
  - `applyMergeRewards(before, merged, { newIds, solveXpById, today }, { rules, unitFor, dayOf }): { progress, bonusXp, outcome }`
  - `isPerfectUnit(unit, attempts, rules)`, `goalFor(prefs, rules)`, `pruneDaily(daily, today, keepDays)`

**How `defaultUnits` groups questions:**
1. Split the lessons into runs by batch letter, taken from `^<stageId>-([a-z])\d`. Ids that do not match go into batch `x`.
2. Cut each run into `k = max(ceil(n/maxSize), round(n/targetSize))` chunks of balanced size.
3. Merge a trailing chunk smaller than `minSize` into the previous unit when the result stays within `maxSize`.
4. Unit ids are `${stageId}:${letter}${k}`, for example `stage-3:a1` and `stage-3:b2`. These stay stable when a question is hidden.

**How `resolveUnits` applies an admin override:**
- It drops unknown or hidden ids and empty units.
- It excludes the stage test.
- Any lesson not assigned to a unit goes into a trailing `${stageId}:auto` unit.
- The concatenated unit order becomes the stage's lesson order.

**Payment rule:**
- A unit bonus is paid only when a **first solve** completes the unit and the unit id is not yet in `unitsCompleted`.
- Regrouping a unit, or hiding a question, never pays a bonus retroactively.
- `perfect` means every lesson in the unit has `attempts === 1`, plus `hintsUsed === 0` when `perfectRequiresNoHints` is on.

**Daily-goal rule:**
- `daily[today].xp` includes solve XP and perfect bonuses. The goal bonus itself does not count toward the goal.
- The bonus is paid when `daily[today].xp >= target && !goalBonusXp`. It is paid at most once per day.
- The amount is `bonusXp` of the learner's option. `goalFor` snaps a removed option to the nearest remaining one.

**`today` is the server's `leveling.dayKey()`**, the same clock the streak uses today. Clients read the server's day from health, see 3.3.

**New `server/game-rules.js`:** `createGameRulesService({ store, game })` returns:
- `current()`: resolved rules, cached in memory by `version`
- `adminView()`
- `update(patch)`

**New `server/progress-routes.js`:** `createProgressRouter(deps)`, the same factory pattern as `drafts-routes.js`.
- It moves the existing `GET /api/progress`, `POST /solve`, `POST /merge` and `POST /reset` out of `index.js` without changing their behaviour.
- It adds the prefs route.
- `deps = { requireAuth, store, getChallengeMerged, getChallenge, verifySubmission, leveling, game, rules, completedStagesFor, unitForChallenge, onSolved }`
- `onSolved` covers the draft clear and the Excel sync.
- This finally lets the core XP routes be tested over HTTP. Today `index.js` binds a port when it is imported, so they cannot be.

### 3.2 Public route

**`GET /api/game-rules`** (no auth: guests need it):
- Response: `{ rules: GameRules, version, updatedAt, day }`
- Header: `Cache-Control: no-cache`
- Mounted in a new `server/rules-routes.js` via `createRulesRouter({ rules, leveling })`.

### 3.3 Learner routes (changes are additive; old clients ignore the new fields)

**`GET /api/health`** gains:
- `rulesVersion`
- `day`: the server's `dayKey()`

**`GET /api/content`:**
- Each stage gains `units: UnitDef[]`.
- It is computed after `applyLearnerOverrides`, so hidden lessons are excluded, by a new pure helper in `server/content.js`: `attachUnits(merged, unitOverrides, resolveUnits, unitCfg)`. `resolveUnits` is injected so the helper is testable.

**`POST /api/progress/solve`** (`requireAuth`):
- **Request:** unchanged.
- **Unchanged checks:** the 404, the 422 "does not solve" and the 422 below-pass-mark checks stay exactly as they are.
- **After the existing `next` is built,** the route calls `game.applySolveRewards(progress, next, {...}, { rules: rules.current(), unitFor })`, then sets `level = levelFromXp(xp, rules.levels)`.
- **Response** adds:
  - `bonusXp`
  - `bonuses: [{ kind: 'perfect-unit', unitId, xp } | { kind: 'daily-goal', day, xp }]`
  - `unitCompleted: unitId | null`
  - `day`
  - `awardedXp` keeps its current meaning: solve XP only.
- **The server never reads `xp`, `unitsCompleted`, `daily` or `level` from the request body.**

**`POST /api/progress/merge`** (`requireAuth`):
- The existing re-pricing stays as it is.
- Then `game.applyMergeRewards(current, merged, { newIds, solveXpById, today }, ...)` runs:
  - **Perfect bonuses** are paid only for units completed *by* the newly merged ids.
  - **Daily-goal bonuses** are paid only for days `<= today` and within the `mergeMaxDays` most recent days. The evidence is the re-priced XP of the merged solves, grouped by `dayOf(solvedAt)`.
- Any `unitsCompleted`, `daily` or `xp` sent by the client is ignored.
- `incoming.prefs` is adopted only where the account's pref is `null` and the value is a valid option.
- The response adds `bonusXp`.

**`POST /api/progress/reset`:** keeps `prefs` and resets everything else.

**New `PATCH /api/progress/prefs`** (`requireAuth`):
- **Body:** `{ dailyGoalXp?: number | null, soundOn?: boolean | null }`
- **Validation**, in the style of the pricing route:
  - `dailyGoalXp` must equal one of `rules.dailyGoal.options[].xp`, or be `null` to use the default.
  - `soundOn` must be a boolean or `null`.
  - Anything else returns 400 `{ error, issues }`.
- **Response:** `{ progress }`
- It never pays XP.

**Level now comes from the rules curve** in `recalc`, the leaderboard (`index.js:823`), `/api/auth/me` (wrap with `recalc`) and `adminUserRow` (`admin.js:77`).

### 3.4 Admin routes

All are in `createAdminRouter`, behind `requireAdminAuth`, and audited with ids and numbers only.

**`GET /api/admin/game-rules`** returns:
- `rules`: resolved
- `overrides`: sparse
- `defaults`
- `issues`: stored sections that are invalid and currently falling back
- `version`, `updatedAt`
- `stats: { totalXp, freeXp, unitCount, maxPerfectBonusXp, levelAtTotal, levelAtFree, topRank: { title, minLevel, xp } }`, computed from `allChallenges()`, the stage premium flags and the resolved units

**`PUT /api/admin/game-rules`:**
- **Body:** `{ [section]: object | null }`. `null` resets that section to the defaults.
- **Validation:** `validateGameRulesPatch`. Problems return 400 `{ error: issues[0].message, issues: [{ path: 'levels.thresholds.4', message }] }`.
- **On success:** `setGameRulesOverrides`, then audit `rules.update { sections: [...] }`.
- **Returns:** the same view as the GET.

**`GET /api/admin/content/stages/:id/units`** returns:
- `stageId`, `source: 'default' | 'custom'`
- `units`: resolved, each with `estMinutes`, `xp` and `size`
- `defaults`: the default grouping
- `lessons: [{ id, title, type, difficulty, xpReward, hidden }]`
- `unassigned: string[]`
- `warnings`
- An unknown stage returns 404.

**`PUT /api/admin/content/stages/:id/units`:**
- **Body:** `{ units: [{ id?, name, description?, challengeIds }] }`
- **Validation:** `validateUnitOverride` with the stage's lessons. **Hidden lessons are included**, so unhiding one never orphans it.
- **Hard errors, returned as 422 `{ error, issues }`:**
  - an unknown id, or an id from another stage
  - the stage test included
  - a duplicate id
  - a lesson left out of every unit
  - a name empty or longer than 60 characters
  - a description longer than 200 characters
  - more than 40 units
  - a unit with 0 or more than 30 items
  - a unit id that is malformed or foreign (it must start with `${stageId}:`)
- **Warnings, which do not block the save:** a unit size outside `[minSize, maxSize]`, or an estimated time above `targetMinutes`.
- **New units** get `${stageId}:m${nextSeq++}`, so a deleted id is never reused.
- **Audit:** `content.units.update { stageId, units: n }`.

**`DELETE /api/admin/content/stages/:id/units`:** reverts the stage to the default grouping. Audit `content.units.reset`.

**`GET /api/admin/content/stages`:** each row gains `unitCount` and `unitsCustomized`.

---

## 4. Client

### 4.1 Platform

**`src/platform/storage/storage.ts`** adds three keys:
- `gameRules: 'cq-game-rules-v1'`: the last rules payload
- `unitDefs: 'cq-unit-defs-v1'`: the last API `UnitDef`s per stage, ids only
- `soundOn: 'cq-sound-on'`: a device mirror

**`src/platform/session/stats.ts` (new):**
- `hydrateStats` and `INITIAL_STATS` move here from `SessionProvider.tsx`, so they can be tested and so Fast Refresh keeps working.
- It backfills `unitsCompleted {}`, `daily {}` and `prefs {null, null}`.

**`src/platform/session/content.ts`:**
- `groupIntoStages` attaches `units` when the API's stage meta carries `UnitDef[]`, using `resolveUnits` against the lessons, and reorders `stage.challenges` to the unit order.
- **`withUnits(stages, unitCfg, cachedDefs?)`** is new. For the bundled content it uses `cachedDefs` from `cq-unit-defs-v1` when they exist; otherwise it uses `defaultUnits`.

**`SessionProvider.tsx`:**
- **Rules state:** `rules`, initialised from the cache or `DEFAULT_GAME_RULES`. It is fetched on the first successful probe and whenever `health.rulesVersion` changes.
- **Server day:** `serverDay` comes from `health.day`. `todayKey()` returns `serverDay` for signed-in learners and `dayKey()` for guests.
- **`stages`:** `useMemo`: `withUnits(bundle.stages, rules.units, cachedDefs)`, then `applyProgressByTrack`.
- **`completeChallenge(challenge, options): Promise<SolveOutcome>`**. This changes the return type; the only caller is `PracticeModal`.
  1. Build `optimistic` as today, then run it through `applySolveRewards` with the client's `unitFor`.
  2. Call `celebrate({ particles: rules.celebrations.confetti.onCorrectParticles })` **only when `outcome.totalXp > 0`** and `confetti.onCorrect` is on.
  3. Show the level-up toast only when `!options.deferCelebrations`.
  4. After the server responds, adopt `unitsCompleted`, `daily` and `prefs` from the server. Keep the existing max/union for `xp` and `completedChallenges`.
  5. Resolve the outcome from the server's `awardedXp`, `bonusXp` and `bonuses` when they are present.
- **`SolveOutcome`:** `{ solveXp, perfectBonusXp, goalBonusXp, totalXp, unitCompleted, perfect, goal: { target, before, after, met }, verifiedByServer }`
- **New context values:**
  - `rules`, `todayKey`
  - `dailyGoal`: `{ option, todayXp }`
  - `setDailyGoal(xp)`: local, plus `PATCH /prefs` when signed in
  - `soundOn`, `setSoundOn(bool)`: `stats.prefs.soundOn`, then `cq-sound-on`, then `rules.celebrations.sound.defaultOn`
  - `playSound(event)`
- **Restore and merge:**
  - `adoptSession` and restore adopt server `prefs` that are not null.
  - `mergeableGuestProgress` includes `prefs`.
  - `resetProgress` keeps `prefs`.
  - `celebrate(opts?)` gains a particle-count option. The purchase confetti in `SubscriptionModal` stays, since it is not an XP event (see section 7).

**`src/platform/sound/sfx.ts` (new):**
- `playSfx(event: SfxEvent, { volume })`, with `SfxEvent = 'correct' | 'wrong' | 'unitComplete' | 'levelUp' | 'badge'`.
- Short tones synthesized with WebAudio: no audio files, no licensing, a few hundred bytes.
- The AudioContext is created lazily on first play (a click always comes first) and resumed if it is suspended. It is a silent no-op when WebAudio is missing or throws.

**`src/platform/events/index.ts` and `intents.ts`:**
- New fact event: `'unit:completed': { stageId, unitId, perfect, xpEarned }`
- New intent: `'practice:openUnit': { stageId, unitId }`, emitted by `intents.openUnit(stageId, unitId)`

**`src/platform/api-client/api.ts`:**
- `gameRules()`
- `updatePrefs(patch)`
- `ServerProgress` gains optional `unitsCompleted`, `daily`, `prefs`
- The solve and merge response types gain the bonus fields
- `HealthResponse` gains `rulesVersion` and `day`
- The `content()` stage type gains `units`

**`src/platform/xp-leveling/insights.ts`:**
- `rankTitle(level, ranks?)` and `nextRankLevel(level, ranks?)`
- **`achievements(stats, stages, badgeRules?)` is rewritten:**
  - It returns the existing `Achievement` fields plus `tier`, `tierName`, `family`, `progress: { value, next, previous } | null`.
  - Ids stay stable: `streak-3`, `solved-10` and `first-solve` are unchanged; new families use `${family}-${n}`.
  - The unit metrics take the resolved `stage.units`.
  - The regex is fixed to `/^stage-\d+$/`.
- `badgeProgress(stats, stages, rules)` groups the badges into families for the Achievements page.

### 4.2 Challenges module

**`session/PracticeSessionProvider.tsx`:**
- **New state:** `activeUnitId`.
- **`activeUnit`** is derived.
- **`activeChallenges`:** the test mode is unchanged; in lesson mode it is `activeUnit?.challenges ?? activeStage.challenges`.
- **New `openUnit(stageId, unitId)`** checks, in order:
  1. premium (`isPremiumLocked`, which opens the unlock modal)
  2. `stage.state === 'Locked'`
  3. unit locked (a toast: "Finish {previous unit name} first")

  It opens at the first unsolved question, or at 0 for a finished unit (a replay).
- **`openPractice(stageId, challengeId, mode)`** keeps its signature. It resolves through a new exported pure function `resolveOpenTarget(stage, completed, challengeId?)`, which returns `{ unitId, index, notice? }`:
  - A lesson in a reachable unit opens there.
  - Otherwise it lands on the current unit, with the existing "lessons open in order" toast.
  - A fully completed stage with no id opens Unit 1 for review. Today it opens the last lesson.
- **New exposed values:** `activeUnit`, `unitPosition: { index, count }`, `nextUnit`, `openUnit`.
- `reachableIndex` uses the unchanged `reachableLessonIndex` on the unit's questions.
- **The stage test** still opens only when `stageStatus(...).lessonsDone`.

**`components/PracticeModal.tsx`:**
- **Scope:** the header reads `Stage 03 · Data Structures · Unit 2 of 4`. Dots, the progress bar and the footer count cover the unit only. The last button says "Finish unit", or "Finish" on the test.
- **Run tracking:** a new `useUnitRun()` hook in `session/useUnitRun.ts`.
  - At open it snapshots `{ xp, level, streak: currentStreak(...), todayXp, goalTarget, earnedBadgeIds }`.
  - During the run it counts `checks`, `firstTryCorrect`, `questions`, `hints`, plus `activeMs`. Time pauses while `document.hidden`.
- **`award()`** passes `deferCelebrations: true` and adds `outcome.totalXp` to `sessionXp`. It plays `correct` or `wrong` in `handleCheck` and `handleRun`.
- **`finished`** renders a lazy `UnitComplete` (`components/lesson/UnitComplete.tsx`, loaded with `React.lazy` so framer-motion stays out of the shell) in place of the current lessons view. The test-mode "Stage cleared" view gets the same count-up and confetti.
  - **Actions:**
    - If there is a next unit and it is open: "Continue: {next unit name}".
    - If this was the last unit and the test is pending: the existing "Take the stage test / Later".
    - Otherwise: "Replay unit / Back to the path".
- **After the end-screen animation**, if `levelAfter > levelBefore` and `levelUpOverlay` is on, it shows `LevelUpOverlay`: role=dialog, `useFocusTrap`, Enter or Esc closes it, plus a `levelUp` sound and a "New title" line when the rank changed.
- **Header mute toggle:** a `Volume2`/`VolumeX` button bound to `setSoundOn`.

**`components/lesson/UnitComplete.tsx` (new):**
- **Props:** `{ copy, xp: { from: 0, to: sessionXp }, accuracy, timeMs, streak: { before, after }, goal: { target, before, after, bonusXp }, perfect: { bonusXp } | null, flawless, newBadges, pendingSync }`
- **What it shows:**
  - The XP count-up.
  - Three stat boxes (accuracy, time, streak). It reuses the `.celebration-*` classes in `practice.css`.
  - The goal ring (before to after), with "Daily goal reached +N" when crossed.
  - The streak flame, animated only when the streak went up.
  - "Perfect unit +25 XP" when a bonus was paid, else "Flawless run" when accuracy was 100 on a replay.
  - Newly earned badges with their tier.
- **Confetti** fires (`unitEndParticles`) only when `sessionXp > 0`, together with the `unitComplete` sound.
- **Screen readers:** an sr-only `role="status"` summary. The animated numbers are `aria-hidden`.

**`components/LearningPath.tsx`:**
- An expanded stage now renders a rail of **unit nodes** (new `UnitNode` component):
  - The marker is a check, a star for perfect, a number for the current unit, or a lock.
  - It shows the name, "5 questions · ~6 min · +250 XP" and "3/5".
  - Clicking calls `intents.openUnit`. A small disclosure shows the unit's questions, reusing the existing lesson rows.
- The stage-test row stays last, unchanged.
- `StageAction` "Continue" still calls `openPractice`, which lands in the current unit.

### 4.3 Celebration components (`src/ui/celebrations/`, a separate entry `@/ui/celebrations`, not re-exported from `@/ui`)

- **Components:**
  - `XpCountUp({ from, to, durationMs })`
  - `GoalRing({ target, from, to })`: SVG stroke-dasharray
  - `StreakFlame({ streak, increased })`
  - `LevelUpOverlay({ level, rankTitle, newRank, xpToNext, onClose, copy })`
  - `BadgeTierChip({ tierName, tierIndex })`
- **framer-motion** is used only here, through `useReducedMotion()`. With reduced motion, final values render immediately and there is no confetti.
- The components take props only, since the `ui` layer may not import `platform`.

### 4.4 Other screens

- **Level and rank call sites:** `Sidebar.tsx:62`, `SettingsPage.tsx:82`, `AchievementsPage.tsx:25/66/70`, `DashboardHome.tsx:19/134` and `landing/Gamification.tsx:14-17` pass `rules.levels` and `rules.levels.ranks` to `levelProgress`, `xpForLevel`, `rankTitle` and `nextRankLevel`.
- **`DashboardHome.tsx`:**
  - `DAILY_XP` is replaced by `dailyGoal.option.xp` and `todayXp` from `stats.daily[todayKey()]`. This also fixes today's bug where re-solves inflate daily XP.
  - "Solve 3" uses `daily.firstSolves`.
  - A "Change goal" link goes to Settings.
  - "Next badge" shows progress, for example "Silver streak · 5/7 days".
- **`SettingsPage.tsx`:**
  - Learning section: a "Daily goal" `Segmented` control built from `rules.dailyGoal.options` (label and XP).
  - Appearance section: a "Sound effects" `Switch`.
- **`AchievementsPage.tsx`:**
  - Badge families shown as cards: current tier chip, tier pips, and `ProgressBar` "12 / 14 days to Gold".
  - Stage badges listed below.
- **`BadgeToaster` and `badgeWatcher.ts`:**
  - `useNewBadges` takes the badge rules and reseeds its "seen" set when `rules.version` changes, so an admin edit cannot set off a burst of toasts.
  - Toast text includes the tier.

### 4.5 States

**Guest:**
- Everything runs locally. Rewards come from the same `applySolveRewards`, and rules come from the cache or the defaults.
- The daily day is the local day.
- Prefs live in `stats.prefs` and `cq-sound-on`.
- On sign-in, the merge re-prices everything on the server, and the client adopts the server's numbers.

**Signed in:**
- The update is optimistic, then reconciled against the server's response.
- The end screen's numbers animate to the server figures when the response arrives.
- "Today" is the server's day.

**Offline (signed in or guest):**
- Bundled content is used with the cached unit definitions, falling back to the defaults, and the cached or default rules.
- Solves are kept locally. The end screen says "Saved on this device, will sync".
- When the session is restored, `mergeProgress` pushes the local copy up and the server re-prices it, bonuses included.

**Old server:**
- `/api/game-rules` returns 404, so the defaults are used.
- Content without `units` falls back to the defaults.
- A solve response without bonuses keeps the local bonus until the next restore, which corrects it.

---

## 5. Admin panel

**Navigation (`AdminLayout.tsx` GROUPS):** a new group "Learning rules" with the item "Rules & rewards" (`/admin/rules`, icon `SlidersHorizontal`).

**Routes (`AdminApp.tsx`):** `rules` renders `AdminGameRules`, and `stages/:stageId/units` renders `AdminUnits`.

**`services/adminApi.ts`:**
- **Methods:** `gameRules()`, `updateGameRules(patch)`, `stageUnits(stageId)`, `saveStageUnits(stageId, units)`, `resetStageUnits(stageId)`
- **Types:** `AdminGameRulesView`, `AdminUnitsView`
- `AdminStageRow` gains `unitCount` and `unitsCustomized`.

### 5.1 `pages/AdminGameRules.tsx`

**Layout:** one `Card` per section. Each card has "Default: …" hints, a per-section Save and a "Reset to default" that sends `null`. Server issues are mapped to fields, as in `QuestionWizard`. The page validates locally first with `validateGameRulesPatch` from `@/platform/game-rules`.

| Section | Editable fields |
|---|---|
| **Levels & ranks** | A threshold table (XP per level, add or remove rows), `overflowStep`, and a "Generate curve" helper (keep levels 1..N, then +step per level). The ranks list has min level and title, can be added to, removed and reordered. **Live check panel** (from the `stats` returned by the GET plus `adminApi.users()` XP): "All content 17,020 XP → level 23; free content 14,080 → level 20; top title at 13,500 XP". It shows a red warning when the top rank cannot be reached, and "N learners would drop a level". |
| **Rewards** | Perfect-unit bonus XP, and "Perfect requires no hints" |
| **Daily goal** | An options table (id, label, XP, bonus XP), a default option, ledger days and merge bonus days |
| **Units** | Target, min and max size, target minutes, and minutes per question type (7 number fields). A note says default groupings are rederived from these. |
| **Badges** | Tier names; families (enabled, metric chosen from the fixed list, title and detail templates with `{n}`, tiers); stage-badge templates (`{index}`, `{name}`). |
| **Celebrations** | Sound on by default, volume, per-event sound toggles; confetti on correct and particles; confetti at unit end and particles; level-up overlay on or off; count-up duration; the six copy strings, with the placeholder variables listed. |

Each section also shows any stored-invalid `issues` in an `ErrorText` banner ("Using defaults because …").

### 5.2 `pages/AdminUnits.tsx` (opened from a "Units" button on each `AdminStages` row)

- **Header:** stage name, a Default or Customised badge, "Reset to default" (`ConfirmDialog`) and Save.
- **Unit cards**, one per unit:
  - Name (`TextField`) and description (`TextArea`).
  - A meta line: "6 questions · ~7.5 min · 330 XP", with a warning `Badge` when outside the size or time targets.
  - An ordered question list showing title, type, difficulty and a hidden badge.
  - Per-question buttons, using the same up/down arrow style as the stage reorder (no drag library): ↑ ↓, "← previous unit", "next unit →", "Split here".
  - Unit controls: move up or down, merge with next, delete (only when empty), and "Add unit".
- **"Not in a unit" panel:** questions created after the grouping was saved, each with an "Add to unit" `SelectField`.
- **"Default grouping" preview:** collapsible.
- **Pure editing helpers** live in `services/unitEditing.ts` for testing: `moveQuestion`, `moveAcross`, `splitAt`, `mergeWithNext`, `addUnit`.

### 5.3 Other admin changes

- `AdminStages.tsx`: a units column showing the count and a "custom" marker, plus the "Units" button.
- `adminUserRow`: level comes from the rules curve.
- `AdminUsers`: no change.

**Every new rule, number and piece of copy in this design maps to a field above**:
- unit groupings and names
- the size and time defaults
- the curve and titles
- both bonuses and the goal options
- the badge families and tiers
- sound, confetti and animation settings
- the copy strings

Anything not listed is hard safety bounds in code (for example "at most 40 units", "at most 30 items per unit"), deliberately not editable.

---

## 6. Tests to add

The patterns are vitest with `environment: 'node'`. Pure unit tests go in `src/**/__tests__`. Server HTTP tests use express on port 0 with `fetch`, `node:fs/promises` mocked (as in `drafts.test.mjs`), or a `db.js` mock plus a `requireAdminAuth` stub (as in `admin-questions.test.mjs`).

**Unit tests**

| File | What it covers |
|---|---|
| `src/platform/xp-leveling/__tests__/insights.test.ts` (new) | 1. `Stage 01 cleared` for `stage-1`, named title for `stage-c1` (the regex fix). 2. Existing badge ids are unchanged. 3. Tier and progress: bestStreak 5 gives Bronze, next 7, progress 5/7. 4. `perfectUnits` = union of the records and the derived count. 5. Disabled families are left out. |
| `src/platform/game-rules/__tests__/rules.test.ts` | 1. The defaults validate. 2. Sparse merge keeps new default keys. 3. Arrays replace. 4. Issues with paths: non-increasing thresholds, `thresholds[0] !== 0`, the first rank not at level 1, duplicate goal ids or XP, `defaultOptionId` missing, negative bonus, tiers not increasing, unknown metric, a template without `{n}`, a copy string too long, `minSize > targetSize`. 5. `null` resets. 6. A stored-invalid section falls back and is reported. |
| `src/platform/xp-leveling/__tests__/leveling.test.ts` (extend) | 1. A custom curve and the overflow step. 2. The default curve keeps levels 1-10. 3. **Property check:** `levelFromXp(x) >= oldLevelFromXp(x)` for x from 0 to 30,000 in steps of 50. 4. The top rank level is reachable at ≤ 14,080 XP. 5. The existing assertions still pass unchanged. |
| `src/platform/progress/__tests__/units.test.ts` | 1. `defaultUnits` gives 10→5/5, 12→6/6, 11→6/5, 15→5/5/5, 17→6/6/5. 2. A 2-item custom run merges into the previous unit when that stays ≤ 8, and stays separate when it would not. 3. Id format. 4. `resolveUnits` drops unknown or hidden ids, appends unassigned lessons to `:auto`, drops empty units, excludes the test, and reorders the lessons. 5. `unitStates` gating. 6. `unitFor`, `estimateMinutes`. 7. Every `validateUnitOverride` issue and warning. |
| `src/modules/challenges/__tests__/units-bank.test.ts` | Against the real `ALL_CHALLENGES`: every core stage gives 4 units, C and C++ give 3, all have 5-8 items, 46 in total, and the flattened units equal the authored order. |
| `src/modules/challenges/__tests__/practiceSession.test.ts` | `resolveOpenTarget`: current unit, a deep link into a locked unit is pulled back with a notice, a done stage opens Unit 1, and the test is never inside a unit. |
| `src/platform/xp-leveling/__tests__/rewards.test.ts` | 1. A first solve updates the ledger. 2. A re-solve pays 0 but counts `solves`. 3. Completing a unit pays the perfect bonus only if every lesson had `attempts===1 && hintsUsed===0`. 4. Paid once per unit id. 5. No bonus for a unit completed without a first solve. 6. The goal bonus is paid once per day, and does not count toward the goal. 7. A lowered goal pays on the next solve. 8. `pruneDaily`. 9. `applyMergeRewards` pays only for units completed by new ids, limits goal days to `mergeMaxDays`, and ignores client `xp`, `unitsCompleted` and `daily`. |
| `src/platform/session/__tests__/stats.test.ts` | `hydrateStats` backfills an old v2 save without losing anything. |
| `src/platform/sound/__tests__/sfx.test.ts` | Does not throw without `AudioContext` (the node environment). Never builds a context when muted. |
| `src/modules/achievements/__tests__/badges.test.ts` (extend) | Tiered `newlyEarned` results. No burst of new badges after a rules-version reseed. |
| `src/modules/admin/__tests__/unitEditing.test.ts` | The pure editor operations keep every id exactly once. |

**Server and route tests**

| File | What it covers |
|---|---|
| `server/__tests__/db-migrate.test.mjs` | 1. An old `db.json` shape gains `gameRules` and `contentOverrides.units`. 2. `getProgress` fills `unitsCompleted`, `daily` and a partial `prefs`. 3. `setUnitOverride('__proto__', …)` is safe. 4. `setGameRulesOverrides` bumps the version. |
| `server/__tests__/game-rules-routes.test.mjs` | 1. Public GET returns the defaults with no auth. 2. Admin GET includes `stats` and `defaults`. 3. PUT valid, then version+1 and an audit row. 4. PUT invalid returns 400 with `issues` paths. 5. `null` resets a section. 6. A learner-facing GET after a PUT sees the new values. |
| `server/__tests__/units-admin.test.mjs` | With real `loadContent()` and a 60 s timeout: 1. GET default gives 4 units for `stage-3`. 2. PUT valid saves and assigns `:m1` ids. 3. 422 for a foreign id, the test id, a duplicate, or a missing lesson. 4. DELETE reverts. 5. `/content/stages` shows `unitCount`. 6. `attachUnits` leaves hidden lessons out. |
| `server/__tests__/progress-routes.test.mjs` | Real `db.js` with fs mocked, a stubbed `verifySubmission` and a tiny content fixture through `getChallengeMerged` and `unitForChallenge`. **First, characterization tests of the current behaviour:** 404 unknown, 422 wrong answer, 422 below pass mark, XP once, re-solve 0 XP, merge re-prices, client `xp` ignored. **Then:** 1. Perfect bonus and `unitCompleted` in the response. 2. Goal bonus once. 3. Merge bonuses bounded. 4. `PATCH /prefs` validation (400), `null` restores the default. 5. Reset keeps prefs. 6. Level follows a custom curve. |
| `server/__tests__/index-guards.test.mjs` (extend) | `index.js` mounts `createProgressRouter` and no longer defines `app.post('/api/progress/solve'` itself. |

**Mocks to update:** the mock `db.js` factories in `admin-questions.test.mjs` and `admin-ai.test.mjs` need `getGameRulesRecord` and `contentOverrides.units`. Separately, route code reads `overrides.units ?? {}` defensively.

---

## 7. Risks, edge cases and manual checks

1. **"3-5 minutes" is not reachable for the code-heavy halves.** With the per-type estimates, units of recognition questions take about 4 min and code halves (P M C C D) about 13 min. The authored order puts code last, and splitting by time without reordering does not fix it (checked on data-structures/a).
   - The design keeps the authored order, shows honest per-unit estimates and warns in the admin editor.
   - Rebalancing, for example moving one code item into each half, is a content decision for the admin.
2. **Unit ids and bonuses.**
   - A bonus is paid only when a first solve completes the unit, so regrouping cannot pay twice for the same completion.
   - A new unit id containing newly solved lessons can pay once. That is bounded by the number of units.
   - Changing `targetSize` renames the default ids. That is harmless to progress, because "done" is derived.
3. **Admin regrouping can re-gate a learner.** For example, if lesson 15 is moved into Unit 1, a learner with lessons 1-7 solved is sent back to Unit 1. Solved work is never lost, and the stage test is unaffected.
4. **"Perfect" relies on the attempt count the client reports.** This is the same trust level as today's `xpForSolve`. Closing the modal resets the counter; that is an existing weakness and not widened here.
5. **Farming daily bonuses through guest merges.** The merge pays goal bonuses only for the last `mergeMaxDays` days (default 7), and only with re-priced solve XP as evidence. The worst case is 7 × 50 = 350 XP.
6. **Day boundary.** Signed-in learners use the server's day, the same clock as streaks today. Learners far from IST see their goal roll over at server midnight. Accepting a client timezone is a later change, because it would let a client split one day into two.
7. **The optimistic XP can differ from the server's**, because of stale rules or units, or a declined bonus.
   - The existing `Math.max` keeps the local number until the next restore, where `localIsAhead` triggers a merge and the server re-prices.
   - The end screen animates to the server figures when they arrive.
   - The leaderboard always uses server data.
8. **Stored rules become invalid after a code change.** Each section falls back to the defaults, and the admin page shows why. The server cannot crash on bad rules.
9. **Level curve edits apply instantly** to the sidebar, leaderboard and admin pages. The admin page shows how many learners would drop a level before saving.
10. **Badge toast storm when the rules change mid-session.** The watcher reseeds on the rules version. Toasts for badges earned retroactively on deploy day are suppressed by the first-render seed.
11. **Bundle size.** framer-motion must load only through `React.lazy` (`UnitComplete`, `LevelUpOverlay`). Check the build output: the shell chunk must not import the `motion` chunk.
12. **Sound.** Autoplay policies apply; sounds only follow clicks. Safari needs `webkitAudioContext`. Sound is never the only signal.
13. **Reduced motion.** No confetti, the count-up shows its final value and the overlay does not animate. `prefersReducedMotion` already exists in `SessionProvider`.
14. **Purchase confetti** (`SubscriptionModal.tsx:223`) is not an XP event, so this design keeps it. The owner should confirm.
15. **Existing server tests.** The mocked `db.js` factories need the new functions (see section 6).
16. **Deploy-day ledger undercount.** Today's goal ring starts from 0 XP on the day this ships.

**To verify by hand:**
- **Guest, API stopped:** default units, end screen, confetti only when XP > 0, replay gives 0 XP with no confetti.
- **Sign in:** merged XP equals the server's (compare with the leaderboard).
- **Admin units:** regroup and rename units for stage-3, then reload the learner app and the path shows them. Hide a question, and the unit shrinks with no crash.
- **Admin bonus:** set the perfect bonus to 40. The next perfect unit pays 40, and the path updates within about 30 s (rulesVersion) without a reload.
- **Curve:** edit it, then check the sidebar, the dashboard and the admin users level.
- **Mute:** it persists across reload, across sign-out and sign-in, and on a second browser.
- **Daily goal:** the ring crosses, the bonus toast appears once, and a second crossing the same day pays nothing.
- **Stage test:** still locked until all units are done; the "Take the stage test" end-screen path works; a premium stage's units stay locked.
- **Level-up overlay:** keyboard-only (Tab trapped, Enter or Esc closes) and read by a screen reader.
- **Layout:** end screen and unit nodes at 375 px, in dark mode and with OS reduced motion on.

---

## 8. Implementation order (each step ships and is tested on its own)

1. **Fix the badge regex** in `insights.ts:134` (`/^stage-\d+$/`), with a test. No other behaviour changes.
2. **Game-rules core** (`src/platform/game-rules/*`: types, defaults, resolve and validate), with `rules.test.ts`. Nothing is wired yet.
3. **Parametrize the level curve** in `leveling.ts` and `rankTitle`/`nextRankLevel`, and ship the retuned default. Add the property test showing no one loses a level.
4. **Move `hydrateStats`** to `session/stats.ts`, with a backfill test for the new optional fields. No behaviour change.
5. **Server rules storage and routes:**
   - `db.js`: `gameRules`, the migration and the store functions, with `db-migrate.test.mjs`.
   - `server/game-rules.js`, compile `game.mjs` at startup, `GET /api/game-rules`, health `rulesVersion` and `day`.
   - Admin GET and PUT, with `game-rules-routes.test.mjs`.
   - Use the curve in `recalc`, `/me`, the leaderboard and `adminUserRow`.
6. **Admin "Rules & rewards" page**: `adminApi` methods, the nav entry and all six sections. Sections for features not yet wired are still stored and validated.
7. **Client rules plumbing**: `SessionProvider` fetch and cache, the `rulesVersion` refetch, and every level and rank call site passes the rules.
8. **Units core** (`platform/progress/units.ts`), with `units.test.ts` and `units-bank.test.ts`.
9. **Units on the server**: `contentOverrides.units`, admin units routes, `attachUnits` in `/api/content`, stage-row counts, with `units-admin.test.mjs`.
10. **Admin units editor**: the `AdminUnits` page, `unitEditing.ts` with tests, and the "Units" button on `AdminStages`.
11. **Client units, without animation yet:**
    - `groupIntoStages` and `withUnits`, and the unit-defs cache.
    - `resolveOpenTarget`, `openUnit` and the new intent, with `practiceSession.test.ts`.
    - `LearningPath` unit nodes.
    - `PracticeModal` scoped to one unit, with a static `UnitComplete` (XP, accuracy, time, streak) and `useUnitRun`.
12. **Extract the progress routes** into `server/progress-routes.js` with **characterization tests first**. Behaviour must be identical.
13. **Rewards core** (`rewards.ts`), with `rewards.test.ts`.
14. **Wire rewards into the server** solve and merge, add `PATCH /prefs` and reset-keeps-prefs, and extend the route tests.
15. **Client rewards:**
    - `completeChallenge` returns `SolveOutcome`, uses the shared `applySolveRewards`, fires confetti only when XP > 0, and supports deferred celebrations.
    - Dashboard goal from the ledger and the chosen option.
    - Settings daily-goal picker.
16. **Celebration UI:**
    - `src/ui/celebrations/*`, lazy-loaded.
    - `UnitComplete` animated: count-up, ring, flame, perfect and goal bonus lines, new badges, end-of-unit confetti.
    - `LevelUpOverlay` on the stage-test end screen and the unit end screen.
    - Check that the shell chunk stays free of `motion`.
17. **Sound**: `sfx.ts`, `playSound` in the session, the Settings switch, the modal mute button and prefs sync, with `sfx.test.ts`.
18. **Badge tiers**: the `achievements` rewrite, `badgeProgress`, the Achievements page cards, "Next" with progress on the dashboard, and the toaster reseed, with the badge tests.
19. **Docs**:
    - a new `docs/adr/0008-units-and-game-rules.md`
    - a units note in `docs/CONTENT_AUTHORING.md`
    - `SkillRoadmap.tsx` time estimates switched to `rules.units.minutesByType`.