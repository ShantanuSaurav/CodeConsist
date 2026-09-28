# Design: foundations for the learning loop (game settings, daily activity log, failed attempts, guest merge, admin settings page)

## 1. Goal

This design adds two server-side stores that the other feature groups build on:

- **Game settings.** Defaults ship in code. The admin can change any value from the panel without a redeploy.
- **Per-learner daily activity log.** It is kept in the learner's own time zone, and it also stores failed attempts.

Both stores use one shared, pure implementation in `src/platform`. The browser (guest mode, optimistic updates) and the server (authoritative XP, streaks and days) run the same code. The design also fixes the `attempts[].solvedAt` overwrite bug. It changes no existing learner's XP, level, streak or solved set.

## 2. Data model

### 2.1 New shared code in `src/platform` (pure, no React)

The server can import `platform/**`, and `scripts/check-boundaries.mjs` rule 5 allows that. `server/build.js compileTsModule` bundles it the same way `leveling.ts` is bundled today.

| File | Contents |
|---|---|
| `src/platform/game-settings/types.ts` | `GameSettings`, `PublicGameSettings = Omit<GameSettings,'limits'>`, one type per section |
| `src/platform/game-settings/defaults.ts` | `DEFAULT_GAME_SETTINGS`, `GAME_SETTINGS_SCHEMA_VERSION = 1`. Numbers that exist today are imported from `leveling.ts` (`DEFAULT_XP_RULES`) and `insights.ts` (`DEFAULT_RANKS`), so the defaults match today's behaviour by construction. |
| `src/platform/game-settings/meta.ts` | `SETTING_META: Record<path, { label, help, kind: 'int'\|'bool'\|'string'\|'zone'\|'intList'\|'rows', min?, max?, step?, unit?, status?: 'live'\|'reserved' }>` and `SECTION_META`, which lists the sections in order and marks admin-only ones. This one list sets both the zod bounds and the admin form fields. |
| `src/platform/game-settings/merge.ts` | `mergeSettings(defaults, overrides): GameSettings`: deep merge where objects recurse and arrays and leaves replace wholesale; a leaf must keep its type or it is ignored; unknown keys and `__proto__` are skipped. `applySettingsPatch(overrides, patch): { overrides, changedPaths, unknownPaths }`: `null` deletes a key and empty objects are pruned. `publicSettings(s)`. `coerceSettings(raw): GameSettings` is the safe path for the learner client: it uses `mergeSettings` onto the defaults and has no zod. |
| `src/platform/game-settings/schema.ts` | zod `GameSettingsSchema` with bounds taken from `meta.ts`, plus cross-field refinements. `validateGameSettings(s): { ok, issues: {path, message}[] }`. It is imported only by the server and the admin module, never by `SessionProvider`, so zod stays out of the shell chunk. |
| `src/platform/game-settings/server.ts` | Re-exports all of the above. It is compiled to `server/generated/game-settings.mjs`. |
| `src/platform/activity/log.ts` | The pure daily-log reducer and merge (§2.4). It is compiled to `server/generated/activity.mjs`. |

### 2.2 Settings shape and defaults (categories other groups fill in)

Anything that is not built yet ships with `enabled: false` and `status: 'reserved'` in its meta.

- **xp**: `retryPenalty 10`, `hintPenalty 10`, `scoreFloor 50`, `passScore 60`, `minXpPerSolve 1`, `reSolveXp 0`, `maxAttemptsCounted 50`, `maxHintsCounted 10`, `defaultRewardByDifficulty { easy 40, medium 70, hard 110, stageTest 150 }`, `bonuses { firstTryPct 0, dailyGoal 0 }` (reserved).
- **levels**: `curveBase 50` (`xpForLevel = base*n*(n+1)`), `ranks [{minLevel 1,'Apprentice'},{3,'Junior Developer'},{6,'Developer'},{10,'Senior Developer'},{15,'Staff Engineer'},{20,'Principal Engineer'}]`.
- **goals**: `defaultDailyXp 100`, `dailySolves 3` (today's `DAILY_XP` and `DAILY_SOLVES`), `learnerCanChoose false`, `dailyXpOptions [{id:'casual',label:'Casual',xp:20},{regular,50},{serious,100},{intense,150}]`.
- **streak**: `reSolvesCount true` (today a re-solve keeps the streak alive), `minXpForStreakDay 0`, `milestones [3,7,14,30]`, `maxPlausibleMergedStreak 400` (today's `MAX_PLAUSIBLE_STREAK`), `timeZoneChangeCooldownHours 24`, `fallbackTimeZone 'server'`.
- **freeze** (reserved): `enabled false`, `maxHeld 2`, `grantEveryDays 7`, `autoApply true`.
- **review** (reserved): `enabled false`, `intervalsDays [1,3,7,14,30]`, `sessionSize 10`, `xpPerItem 0`.
- **league** (reserved): `enabled false`, `tiers ['Bronze','Silver','Gold','Sapphire','Ruby']`, `groupSize 30`, `promoteTop 7`, `demoteBottom 5`, `weekStartsOn 1`, `resetTimeZone 'UTC'`.
- **units** (reserved): `enabled false`, `defaultUnitSize 5`.
- **celebrations**: `confetti true`, `confettiParticles 70`, `confettiOnReSolve true`, `levelUpScreen false`, `sound false`, `toastMs 4000`.
- **onboarding** (reserved): `enabled false`, `askDailyGoal true`, `askExperience true`, `experienceOptions [...]`, `askMotivation false`, `motivationOptions [...]`.
- **limits** (admin-only, never sent to learners): `activityDaysKept 400`, `missLogPerUser 300`, `missesPerDay 300`, `answerMaxChars 200`, `mostMissedMinLearners 3`.

Cross-field rules checked in `schema.ts`:
- `0 ≤ scoreFloor ≤ passScore ≤ 100`
- `ranks[0].minLevel === 1`, with ranks strictly ascending
- goal option ids unique; `defaultDailyXp ≥ 1`
- `intervalsDays` strictly ascending
- `promoteTop + demoteBottom < groupSize`
- zones pass `isValidTimeZone` (`fallbackTimeZone` may also be `'server'`)
- milestones ascending

**Content is not settings.** Unit groupings, explanations and per-option explanations belong in `contentOverrides` (`server/content.js applyChallengeOverride` already allows `explanation` and `xpReward`) and are edited on the Stages and Challenges admin pages. That way they reach learners through `/api/content`. The settings store holds only numbers, switches and short labels.

### 2.3 `server/db.js`

- **`EMPTY` adds:**
  - `gameSettings: { overrides: {}, revision: 0, updatedAt: null, updatedBy: null }`: sparse, like `pricing`.
  - `activity: {}`: keyed by user id.
- **`migrate()`:**
  - `next.gameSettings` = normalized (`plainObject(overrides)`, integer `revision ≥ 0`).
  - `next.activity = plainObject(loaded.activity)`.
  - `next.version = Math.max(2, loaded.version ?? 1)`.
  - When `loaded.version < 2`, `load()` first writes the raw text to `db.json.pre-v2-<ts>`, a one-time safety copy using the same approach as the `.corrupt-*` path.
  - Progress rows are not rewritten.
- **New functions:**
  - `getGameSettingsRecord()`, `setGameSettingsRecord(record)`
  - `getActivity(userId)`: own-entry lookup via `ownEntry`; returns `null` when there is none.
  - `putActivity(userId, record)`: `defineEntry` then `persist()`.
  - `allActivity()`, `deleteActivity(userId)`
- **`deleteUser()`** also calls `deleteActivity(id)`, next to `deleteDraftsForUser`.

**Activity record** (`db.activity[userId]`, shared type `ActivityLog` plus server-only fields):
- `version: 1`, `timeZone: string|null`, `timeZoneSetAt: string|null`, `lastDay: string|null` (monotonic guard), `backfilledAt: string|null`
- `days: { [yyyy-mm-dd]: DayRecord }`, pruned to `limits.activityDaysKept`
- `misses: { [challengeId]: MissSummary }`: aggregate, never evicted, bounded by bank size
- `missLog: MissEntry[]`: newest last, capped at `limits.missLogPerUser`

### 2.4 TypeScript types (`src/types/index.ts`)

- `DayRecord { xp, lessons, tests, reSolves, reviews, mistakes, goalXp: number|null, goalMet, goalMetAt: string|null, freezeUsed, streak, firstAt, lastAt, source?: 'live'|'backfill'|'merge' }`
  - `xp` counts only XP actually awarded, so a 0-XP re-solve adds nothing.
  - `lessons` and `tests` count first-time solves.
  - `streak` is the streak value after the day's last activity. This stores the streak history that is missing today.
- `MissAnswer = {kind:'choice',index} | {kind:'multi',indices} | {kind:'blanks',values} | {kind:'order',lines:number[]} | {kind:'code',passed,total}`
- `MissSummary { challengeId, count, firstAt, lastAt, lastAnswer: MissAnswer|null }`
- `MissEntry { challengeId, at, day, context: ActivityContext, answer: MissAnswer|null, synced?: boolean }`
- `ActivityContext = 'lesson'|'test'|'review'|'library'`
- `ActivityLog { version:1, timeZone, lastDay, days, misses, missLog, ownerId? }`
- `ChallengeAttempt` gains optional `lastSolvedAt?: string` and `solves?: number`. `solvedAt` now means the first solve and is never overwritten again.

`src/platform/activity/log.ts` signatures:
- `applyActivityEvent(log, event, ctx: { day, at, goalXp, rules }): ActivityLog`. Events are `{type:'solve', challengeId, isTest, firstSolve, awardedXp, streakAfter}`, `{type:'miss', challengeId, answer, context}`, `{type:'review'}` and `{type:'freeze', day}`. The last two are hooks for the review and freeze groups.
- `mergeActivityLogs(server, incoming, ctx): ActivityLog`: idempotent (§4.4).
- `backfillFromAttempts(attempts, lookup, zone, rules): Record<string, DayRecord>`
- `pruneDays(log, keepDays, today)`, `streakFromDays(days, today)` (a freeze day continues a streak), `normalizeMissAnswer(challenge, raw, maxChars): MissAnswer|null`

### 2.5 `leveling.ts` and `insights.ts` (parameterized; defaults equal today)

- `export interface XpRules { retryPenalty; hintPenalty; scoreFloor; passScore; minXpPerSolve }`, `export const DEFAULT_XP_RULES`, and `PASS_SCORE = DEFAULT_XP_RULES.passScore` kept for compatibility.
- `scoreSolve(a, h, rules = DEFAULT_XP_RULES)`, `rawScore(...)`, `isPassingSolve(...)`, `xpForSolve(xpReward, a, h, rules = DEFAULT_XP_RULES)`
- `xpForLevel(level, curveBase = 50)`, `levelFromXp(xp, curveBase = 50)`, `levelProgress(xp, curveBase = 50)`
- **New:**
  - `dayKeyIn(timeZone, date = new Date())`: `Intl.DateTimeFormat('en-CA', {timeZone, year, month, day})`, with formatters cached per zone.
  - `isValidTimeZone(z)`: a string of at most 64 characters matching `/^[A-Za-z0-9_+\-/]+$/` that `new Intl.DateTimeFormat('en-US',{timeZone})` accepts.
  - `addDays(key, n)`
- `previousDayKey` switches to UTC calendar arithmetic. The output is the same, but it no longer depends on the process zone or DST.
- `insights.ts`:
  - `rankTitle(level, ranks = DEFAULT_RANKS)`, `nextRankLevel(level, ranks = DEFAULT_RANKS)`
  - New `activityGridFromLog(days, weeks, today)` and `dayTotals(log, day)`
  - The old `solvedOn`, `xpEarnedOn` and `activityGrid` stay as a fallback for days that are not in the log.
  - Fix the regex at `insights.ts:134` to `/^stage-\d+$/` while here.

### 2.6 Migration and backfill of existing data

- Settings: none are needed. An empty `overrides` means the defaults, which equal today's constants.
- Activity: a one-time, idempotent pass `activity.backfillAll()` runs in `bootstrap()` after `loadContent()`. For each user without `backfilledAt`, it builds `days` from `progress.attempts[*].solvedAt` in the fallback zone:
  - `lessons` or `tests` comes from the challenge's `isStageTest`.
  - `xp ≈ xpForSolve(xpReward, attempts, hints)`.
  - Rows are marked `source:'backfill'`, and `lastActiveDay` gets `streak = progress.streak`.
- This is lossy because old `solvedAt` values were already overwritten. The loss is accepted and marked in the data.
- Guests get the same backfill locally, once, when `cq-activity-v1` is missing.

## 3. Server API

### 3.1 Where the rules live

| Rule | Location |
|---|---|
| Defaults, bounds, merge, public subset | `src/platform/game-settings/*` (shared) |
| XP, score, pass mark, levels, day and zone math | `src/platform/xp-leveling/leveling.ts` (shared, parameterized) |
| Daily-log reducer, guest merge, backfill, streak-from-days | `src/platform/activity/log.ts` (shared) |
| Settings storage and cache | `server/game-settings.js`: `createGameSettingsService({ lib, store })` returns `{ current(), revision(), publicView(), adminView(), update({patch, revision, adminId}) }`. `current()` is memoized per revision. If a stored override fails validation after a code change, only that section falls back to the defaults, and the problem is listed in `adminView().issues`. The server never crashes on bad stored settings. |
| Zone resolution, day rows, misses, backfill | `server/activity.js`: `createActivityService({ lib, leveling, settings, store, getChallengeMerged })` returns `{ zoneFor(req, userId, {write}), dayFor(userId, zone, now), recordSolve(...), recordMisses(...), mergeGuest(...), view(userId, from), mistakes(userId, limit), reset(userId), backfillAll() }` |
| Progress routes | New `server/progress-routes.js`: `createProgressRouter({ requireAuth, leveling, settings, activity, getChallengeMerged, verifySubmission, completedStagesFor, clearDraftForSolve, onProgress })`. It takes `/api/progress`, `/solve`, `/merge` and `/reset` out of `index.js` (a pure move first), so they can be tested over HTTP like `drafts-routes.js`. |

`bootstrap()` compiles `game-settings/server.ts` and `activity/log.ts` next to `leveling.ts` and fills a `learningDeps` object the same way `adminDeps` is filled.

### 3.2 Time zone

- **How the client sends it:** `request()` in `src/platform/api-client/api.ts` adds `X-Time-Zone: Intl.DateTimeFormat().resolvedOptions().timeZone` to every call, inside a try/catch. `cors()` with its defaults already reflects custom headers, as `ngrok-skip-browser-warning` shows.
- **`zoneFor(req, userId, { write })`:**
  - The effective zone is the stored zone, else a valid header, else the fallback. The fallback `'server'` is the server process's own zone, which is exactly today's behaviour for old clients that send no header.
  - Only write routes (solve, misses, merge) update the stored zone: on first sight, or when the header differs and `timeZoneChangeCooldownHours` has passed since `timeZoneSetAt`. Invalid headers are ignored.
- **`dayFor`:** `max(dayKeyIn(zone, now), record.lastDay, progress.lastActiveDay)`. The day never goes backwards, so moving west or flipping zones cannot replay or double-count a day.
- All of this runs synchronously after the solve route's `await verifySubmission`, in the same tick as `setProgress`, so there is no interleaving.
- `recalc()` (GET `/api/progress`) and `GET /api/leaderboard` use `activity.todayFor(userId)` instead of the server's `leveling.dayKey()`.

### 3.3 Learner routes

| Route | Guard | Request | Response / validation |
|---|---|---|---|
| `GET /api/game-settings` | none (guests too) | – | `{ revision, settings: PublicGameSettings }` with `ETag: "r<revision>"` and `Cache-Control: no-cache` |
| `GET /api/health` (changed) | none | – | adds `settingsRevision` (additive) |
| `POST /api/progress/solve` (changed) | `requireAuth` | adds optional `context` (enum, default `'lesson'`) | Uses `settings.xp` for `isPassingSolve`, `xpForSolve` and `scoreSolve`, clamping `attempts` and `hintsUsed` to `maxAttemptsCounted` and `maxHintsCounted`. The 422 message uses `settings.xp.passScore`. `attempts[id].solvedAt = previous?.solvedAt ?? now`, plus `lastSolvedAt = now` and `solves += 1`. Writes the day row. Response adds `today: {day, ...DayRecord}` and `settingsRevision`. |
| `POST /api/progress/merge` (changed) | `requireAuth` | `{ progress, activity?: { days?, misses?, missLog? } }` | Re-prices with `settings.xp`. Merges activity (§4.4). Clamps the streak to `maxPlausibleMergedStreak`, then `streak = max(existing rule, streakFromDays)`. Response adds `activity` (default window). |
| `POST /api/progress/reset` (changed) | `requireAuth` | – | Also calls `activity.reset(userId)`, which keeps only `timeZone`. |
| `GET /api/activity?from=YYYY-MM-DD` | `requireAuth` | `from` defaults to today minus 97 days, at most 400 days | `{ timeZone, today, streak: {current, best, lastActiveDay}, goal: {xp}, days }` |
| `POST /api/activity/misses` | `requireAuth` | `{ misses: [{ challengeId, answer?, code?: {passed,total}, context?, at? }] }`, 1–50 items | Unknown challenge: 404 for a single item, dropped in a batch. `normalizeMissAnswer` returns null for malformed input, which is dropped. For non-code types, `gradeAnswer(challenge, answer)` must be false, otherwise 400 "That answer is correct - record it through /progress/solve." For code, `0 ≤ passed < total ≤ testCases.length`; code is never stored because drafts already hold it. `at` is clamped to [now−7d, now+5min]. Per-day cap is `limits.missesPerDay`. Response: `{ accepted, dropped, today }` |
| `GET /api/activity/mistakes?limit=50` | `requireAuth` | – | `{ mistakes: [{...MissSummary, solvedSince: boolean}] }`, unresolved first. This is the input for the review group. |

These are mounted from the new `server/learning-routes.js` (`createLearningRouter({ requireAuth, activity, settings, getChallengeMerged, gradeAnswer })`) and `server/game-settings-routes.js`. Add both files, plus `game-settings.js`, `activity.js` and `progress-routes.js`, to the `dev:api --watch-path` list in `package.json`.

### 3.4 Admin routes (all behind `requireAdminAuth`)

New router `createGameSettingsAdminRouter({ service })`, mounted at `/api/admin/game-settings` with `router.use(requireAdminAuth)`, plus small additions to `server/admin.js`:

| Route | Body | Response |
|---|---|---|
| `GET /api/admin/game-settings` | – | `{ settings, overrides, defaults, revision, updatedAt, updatedBy, issues }` |
| `PUT /api/admin/game-settings` | `{ revision, patch }`: sparse; `null` resets a key, and `{ review: null }` resets a whole section | 200 with the view (revision+1). 400 for unknown paths (`'Unknown setting "xp.foo"'`) or a non-object patch. 409 when `revision` is stale. 422 `{ error, issues: [{path, message}] }` when the merged result fails `validateGameSettings`. Audit: `game-settings.update` with `{ revision, changes: {path: {from, to}} }`, at most 50 paths. |
| `GET /api/admin/analytics` (changed) | – | `mostMissed` is rebuilt from `allActivity()`. `attempts` now means learners who missed or solved (key kept), `solved` stays, and `misses` and `learnersMissed` are added. The threshold is `limits.mostMissedMinLearners`. |
| `GET /api/admin/analytics/challenges/:id/misses` | – | `{ challenge: {id, title, type, options?}, total, learners, answers: [{answer, label, count}] (top 10), recent (≤20) }` |
| `GET /api/admin/users/:id/activity` | – | `{ timeZone, days (last 98), misses (top 20) }` |

## 4. Client

### 4.1 Settings

- `STORAGE_KEYS.gameSettings = 'cq-game-settings-v1'`, holding `{ revision, settings }`.
- New `src/platform/session/useGameSettings.ts`. Its initial state is the cached value passed through `coerceSettings`, or the defaults.
- In `SessionProvider`'s `probe()` (lines 801-853), after the health check: if `health.settingsRevision` is a number and differs from the cached revision, call `api.gameSettings()`. Do the same when a solve response carries a newer `settingsRevision`.
- Offline and guests use the cached value or the defaults. An old server that sends no revision means the defaults are used.
- `SessionContextType` adds `gameSettings: PublicGameSettings` and `settingsRevision: number|null`.
- New `src/platform/session/useLeveling.ts` (exported from the session barrel) returns memoized `{ levelFromXp, levelProgress, rankTitle, nextRankLevel }` bound to the current settings. Call sites to switch:
  - `src/app/layout/Sidebar.tsx`
  - `account/pages/SettingsPage.tsx`
  - `achievements/pages/AchievementsPage.tsx`
  - `dashboard/pages/DashboardHome.tsx`: `DAILY_SOLVES` and `DAILY_XP` become `settings.goals`
  - `landing/components/Gamification.tsx`
  - `SessionProvider` itself: `hydrateStats`, `completeChallenge` (the inline score at line 946 becomes `scoreSolve(..., rules)`), and `celebrate` (particles, `confettiOnReSolve`)
  - `PracticeModal.tsx`: `isPassingSolve` and `rawScore` at 246-247 take `settings.xp`; the inline score at 255-256 becomes `scoreSolve`; the "costs 10% XP" text at 811 and "pass mark" at 841 come from settings.

### 4.2 Activity log and time zone

- `STORAGE_KEYS.activity = 'cq-activity-v1'`.
- New `src/platform/session/useActivityLog.ts` holds `ActivityLog`, persisted, with `ownerId` tagging identical to `stats.ownerId`.
- `SessionContextType` adds:
  - `activity`
  - `today: DayRecord & { day }`
  - `todayKey`: `dayKeyIn(activity.timeZone ?? browserZone)`
  - `recordMistake(challenge, submission: { answer?: unknown; code?: {passed,total} }, context?)`
- `SolveOptions` adds `context`.
- `completeChallenge` (921-1020):
  - Stops overwriting `solvedAt` and sets `lastSolvedAt` and `solves`.
  - Applies a `solve` event to the local log optimistically.
  - When signed in and online, adopts the server's `today` row, so the server wins.
  - On a 422, rolls the log back together with `setStats(stats)`.
- `PracticeModal.handleCheck` (276-285): when the answer is wrong, call `recordMistake(challenge, { answer: currentAnswer }, context)`.
- `handleRun` (287-333): on `failed`, or on `error` with test results, call `recordMistake(challenge, { code: { passed, total } })`. Skip it when the engine was unavailable (`result.engine === 'none'`).
- `recordMistake` (fire-and-forget):
  - Guest: local log only.
  - Signed in and online: `api.recordMisses([...])`. On `OfflineError`, keep the entry with `synced:false`.
- Dashboard and heatmap read `today` and `activityGridFromLog`, falling back to `attempts` for days before the log started.

States:

| | Guest | Signed in, online | Signed in, offline |
|---|---|---|---|
| Settings | cache or defaults | server (revision-checked) | cache |
| XP | local preview | server authoritative | local; re-priced on the next merge |
| Day log | local reducer, browser zone | server rows mirrored locally | local rows plus `synced:false` misses |
| Misses | local only | `POST /activity/misses` | queued in `missLog`; pushed by merge on restore |

### 4.3 API client (`api.ts`)

- `browserTimeZone()` plus the header in `request()`.
- `api.gameSettings()` (`auth:false`), `api.activity(from?)`, `api.recordMisses(items, {keepalive?})`, `api.mistakes(limit?)`.
- The `solve` result type adds `today?` and `settingsRevision?`. `mergeProgress(progress, activity?)` adds `activity?` to the result. `HealthResponse.settingsRevision?`.

### 4.4 Guest merge on sign-in (uses the existing `/api/progress/merge`)

**Client side:**
- `mergeableGuestProgress` also returns guest progress that has only activity (misses but no solves).
- `loginWithEmail`, `signupWithEmail` and `adoptToken` send `api.mergeProgress(guest, trimmedLog)`, trimmed to the retention window and the `missLog` cap so the body stays under 256 KB.
- `restoreSession`'s `localIsAhead` path and `logout` send the account-tagged log the same way.
- After the merge the client adopts the returned `activity` with `ownerId`, and logout resets it, the same as stats.

**Server merge rules (`mergeActivityLogs`):** every rule is idempotent, so a merge that is retried or runs twice changes nothing.
- **XP, lessons and tests:** derived only from `newIds` (already re-priced). They are attributed to the day of their validated `solvedAt`, recomputed in the account's zone. Future timestamps, or ones older than the retention window, become "now".
- **reSolves, reviews and mistakes:** `max(server, guest)` per valid day key. This may undercount a day that has activity on both sides, but it never double counts.
- **`misses[id]`:** `count = max`, `firstAt = min`, `lastAt = max`.
- **`missLog`:** union keyed by `(challengeId, at)`, capped. Each non-code entry is re-graded with `gradeAnswer`, and entries that are actually correct are dropped.
- **`goalMet`:** recomputed from `xp` against `goalXp`. The goal must be one of `goals.dailyXpOptions`, otherwise `defaultDailyXp` is used.

## 5. Admin panel

**Route and navigation.** Add `game-settings` in `src/modules/admin/AdminApp.tsx`. In `layout/AdminLayout.tsx` add a new nav group "Learning" with "Game settings" (lucide `SlidersHorizontal`). Later groups add pages such as Leagues or Review to this group.

**Files:**
- `pages/AdminGameSettings.tsx`
  - Header: title, a revision badge ("Revision 7, saved <date> by <admin>"), and Save and Discard buttons in a sticky bar that appears when there are unsaved changes.
  - A section index with anchor links, and an "Effective settings (JSON)" read-only view that can be collapsed.
- `components/game-settings/sections.ts`: the `GAME_SETTINGS_SECTIONS` registry, `{ id, title, description, Component? }`, for XP & scoring, Levels & ranks, Daily goals, Streak, Streak freeze, Review, Leagues, Units, Celebrations, Onboarding, and Limits & analytics (admin-only badge). Another group adds one registry entry, or a custom `Component`, and nothing else.
- `components/game-settings/GenericSection.tsx`: renders any section from `SETTING_META`, so every number is editable on day one.
- `components/game-settings/fields.tsx`:
  - `SettingNumber`, `SettingToggle`, `SettingText`, `SettingZone`, `SettingIntList`, `SettingRows` (ranks, goal options, tiers), built on the existing `NumberField`, `Toggle`, `TextField`, `TagsField` and `Card` from `components/ui.tsx`.
  - Each field shows "Default: X", a per-field "Reset" when it is overridden (this sends `null`), and 422 issues matched by path.
- Each section card has a "Using defaults" or "N changes" badge, a "Reset section" button behind `ConfirmDialog`, and for `status:'reserved'` meta the badge "Read by a feature that is not live yet".

**Saving:**
- The page validates locally with the same `validateGameSettings`. The admin chunk is lazy, so zod is acceptable there.
- It sends only the changed paths as `PUT {revision, patch}`.
- A 409 shows "Changed elsewhere (revision N). Reload." and keeps the form's edits.

**`services/adminApi.ts` additions:**
- Methods: `gameSettings()`, `updateGameSettings(revision, patch)`, `challengeMisses(id)`, `userActivity(id)`.
- Types: `AdminGameSettingsView`, `GameSettingsPatch`.
- `AnalyticsSummary.mostMissed` rows gain `misses` and `learnersMissed`.

**Other admin pages:**
- `AdminAnalytics.tsx`: the "Most missed" rows open a Drawer with the wrong-answer distribution (option text for choice types).
- `AdminUsers.tsx`: an "Activity" row action opens a Drawer with the time zone, the last 14 weeks of days (goal met and freeze used shown), and top misses.
- Update `src/modules/admin/README.md`.

## 6. Tests to add

The existing test setup runs vitest in a node environment with no React component tests, so the tests below cover pure functions and HTTP routes.

**Unit tests in `src`:**
- `src/platform/game-settings/__tests__/settings.test.ts`:
  - The defaults pass the schema.
  - Defaults equal today's constants: penalties 10, floor 50, pass 60, curve 50, rank titles and thresholds identical to the current `rankTitle`, goals 3/100, 70 confetti particles.
  - Merge: deep merge, arrays replace, a type mismatch is ignored, unknown keys and `__proto__` are ignored.
  - `applySettingsPatch`: `null` resets and prunes.
  - Refinements reject bad values: floor above pass, unordered ranks, promote+demote ≥ groupSize, bad zone.
  - `publicSettings` drops `limits`.
  - Every leaf of `DEFAULT_GAME_SETTINGS` has a `SETTING_META` entry, so nothing can be added without being editable in the admin panel.
- Extend `src/platform/xp-leveling/__tests__/leveling.test.ts`:
  - The parameterized functions with defaults give exactly the old outputs; custom rules work.
  - `dayKeyIn` at one fixed instant for `Asia/Kolkata`, `America/Los_Angeles`, `Asia/Kathmandu` (+5:45), `Pacific/Kiritimati` (+14) and `Pacific/Pago_Pago` (−11), plus a DST boundary.
  - UTC-based `previousDayKey` across month and year boundaries; `isValidTimeZone`.
  - The `stage-\d+` badge title.
- `src/platform/activity/__tests__/log.test.ts`:
  - First solve versus re-solve (xp 0, `reSolves+1`).
  - `goalMet` flips once and `goalMetAt` is stable.
  - Misses update the summary and the capped log.
  - `pruneDays`; `streakFromDays` with freeze days.
  - Merge is idempotent (merging twice gives the same result as once), uses max semantics, and dedupes the union.
  - `backfillFromAttempts`; `normalizeMissAnswer` for each type, including over-long blanks and unknown order lines.
- Regression test in `insights`: re-solving an old challenge does not move its heatmap day.
- Extend `src/platform/api-client/__tests__/offline.test.ts`: the `X-Time-Zone` header is sent, and a throwing `Intl` does not break requests.

**Server tests in `server/__tests__`** (real `db.js` with `node:fs/promises` stubbed, as in `drafts.test.mjs`; `admin-auth.js` mocked as in `admin-questions.test.mjs`):
- `game-settings.test.mjs`:
  - Public GET needs no auth and has no `limits`.
  - Admin GET and PUT: sparse storage, null resets, 400 for unknown keys, 409 for a stale revision, 422 issues with paths, the revision increments, and an audit row is written.
  - A stored invalid override falls back per section and appears in `issues`.
  - Without the mocked auth, the admin route returns 401.
- `progress-routes.test.mjs`:
  - Characterization of today's solve and merge behaviour first.
  - Then: a re-solve keeps `solvedAt` and sets `lastSolvedAt`.
  - The day row counts XP only when awarded.
  - Changing `passScore` through the service moves the 422 threshold.
  - Merge with a guest log: the second merge is a no-op; future and ancient timestamps are clamped; a correct answer in `missLog` is dropped.
  - Reset clears activity.
- `activity.test.mjs`:
  - `POST /activity/misses`: 401 without auth, 404 for an unknown challenge, 400 for a correct answer, the per-day cap, and batch accept/drop counts.
  - `GET /activity` returns day keys in the user's zone.
  - The first header sets the zone; a change inside the cooldown is ignored; an invalid header is ignored; the day is monotonic across a zone flip.
- `db-migrate.test.mjs`: an old-shape `db.json` gains `gameSettings` and `activity` with its progress byte-identical, and `deleteUser` removes activity. Keep the pure-state style of `db-forget.test.mjs`.
- Update the explicit `vi.mock('../db.js')` export lists in `admin-ai.test.mjs` and `billing-routes.test.mjs` (both call `GET /dashboard`), and in `admin-questions.test.mjs`, if any route they hit starts calling `allActivity` or `getGameSettingsRecord`.

## 7. Risks, edge cases, and what to verify manually

- **XP rules changed mid-session.** The client preview can disagree with the server. The server stays authoritative, the solve response carries `settingsRevision` so the client refetches, and the probe refreshes within 30 seconds. `completeChallenge`'s `Math.max(prev.xp, progress.xp)` can keep a stale higher number until the next restore. Consider trusting the server `xp` when the revisions differ.
- **Level curve changes are retroactive,** because the level is derived from XP. Level-up toasts fire only on the solve path, so there is no toast spam. Warn in the admin help text.
- **Time-zone abuse and edges.** Covered by the cooldown and the monotonic day. Also: half-hour zones, +14/−12 zones, DST, and old clients with no header (the fallback is the server zone, which is today's behaviour). Node ships full ICU. Validate with `Intl.DateTimeFormat`, because TS `lib` is ES2020 and has no `supportedValuesOf`.
- **Backfill is approximate.** `solvedAt` was already overwritten and the fallback zone is used, so days are marked `backfill`. The streak is never reduced by `streakFromDays`, because merge takes the max.
- **Guest merge.** Max semantics undercount on overlapping days. Idempotency was chosen over precision.
- **db.json growth.** Mitigated by per-user caps and day retention. The JSON store is single-process and in-memory, so activity writes must happen synchronously next to `setProgress`, never across an `await`.
- **Privacy.** Typed `fill_blank` answers are learner text. They are capped at `answerMaxChars`, visible to the admin only, and deleted with the account.
- **Tests with mocked `db.js`.** New store functions on shared admin routes break those mocks. Keeping the new routes in separate routers limits the damage.
- **Bundle size.** zod must not reach the shell: `SessionProvider` imports only `merge.ts`, `defaults.ts` and `types.ts`.
- **Things that stay unchanged:** `/api/progress/solve` still never takes XP from the client, and premium gating is untouched.

**Verify manually:**
1. Diff the `progress` section of `db.json` before and after the first start on a copy of the live file. It must be identical, and `db.json.pre-v2-*` must exist.
2. Change `xp.passScore` in the admin panel. A learner tab picks it up within 30 seconds, and the server enforces it immediately.
3. Use Chrome DevTools location overrides to set Pacific/Auckland, then America/Los_Angeles, and solve near midnight. Check the day and the streak.
4. Re-solve an old challenge. The old heatmap day is unchanged, today's `reSolves` goes up by 1, and the XP goal is unchanged.
5. As a guest, solve and make misses, then sign up. The days and misses appear on the account. Log out and log back in: nothing is doubled.
6. Signed in, stop the API, solve and make misses, then restart. Everything syncs.
7. Admin Analytics "Most missed" fills in, and its drawer shows the wrong options.
8. Delete a user. Their activity is gone.

## 8. Ordered implementation steps (each small and independently testable)

1. **Date helpers** in `leveling.ts`: `dayKeyIn`, `isValidTimeZone`, `addDays`, UTC-based `previousDayKey`, with tests. No behaviour change.
2. **Parameterize `leveling.ts` and `insights.ts`** (`XpRules`, `curveBase`, `ranks`), with defaults equal to today and "same output" tests. Fix the badge regex.
3. **Settings core** in `src/platform/game-settings/*` (types, defaults, meta, merge, schema), with tests including "every leaf has meta" and "defaults equal constants".
4. **`db.js`**: `gameSettings` and `activity` in `EMPTY` and `migrate`, the pre-v2 copy, the store functions, and `deleteUser` cleanup. Migration tests.
5. **Server settings**: `server/game-settings.js`, compile in `bootstrap`, `GET /api/game-settings`, `health.settingsRevision`, and the admin router at `/api/admin/game-settings` with audit. Route tests. Add the watch paths.
6. **Admin page skeleton**: `AdminGameSettings`, the sections registry, `GenericSection` and fields, the nav entry, and the `adminApi` methods. Manual check: edit, reset, 409, 422.
7. **Client settings**: `useGameSettings` and `useLeveling`, the `STORAGE_KEYS` entry, and `SessionProvider` exposure. Replace the constants in the dashboard, landing, sidebar, achievements and `PracticeModal`.
8. **Extract the progress routes** into `server/progress-routes.js` as a pure move, with characterization HTTP tests.
9. **Server XP from settings**: solve and merge use `settings.xp` and `settings.levels`. Tests.
10. **`solvedAt` fix** on the server and client (`lastSolvedAt`, `solves`). Regression tests.
11. **Activity core** in `src/platform/activity/log.ts`: reducer, merge, backfill, `streakFromDays`. Tests.
12. **Server activity**:
    - `server/activity.js`: zone resolution, `backfillAll` at bootstrap, and the solve route writing day rows and returning `today`.
    - `GET /api/activity`; the zone used in `recalc` and the leaderboard; reset and delete cleanup.
    - The `X-Time-Zone` header in `api.ts`.
    - Tests.
13. **Failed attempts**: `POST /api/activity/misses` (with re-grading) and `GET /api/activity/mistakes`, plus `recordMistake` in `SessionProvider` and `PracticeModal`. Tests.
14. **Client log**: `useActivityLog` for guest and signed-in cache; dashboard goals and heatmap read the log with fallback. Pure tests.
15. **Guest merge**: activity in `mergeProgress` from login, signup, `adoptToken`, restore and logout; server `mergeActivityLogs`. Idempotency tests.
16. **Admin analytics and users**: the new `mostMissed`, the misses drill-down route and drawer, the user activity drawer, and the mock updates in the existing admin tests.
17. **Docs**: the admin module README, the server comments, and a short ADR (`docs/adr/`) that records "settings are numbers, content lives in `contentOverrides`" and the time-zone rules.

Files read to write this design, all under `C:\Users\KIIT0001\Desktop\Devlingo-dev`:
- `server\db.js`, `server\index.js`, `server\admin.js`, `server\drafts-routes.js`, `server\billing.js`, `server\build.js`, `server\content.js`, `server\admin-auth.js`, `server\__tests__\drafts.test.mjs`, `server\__tests__\admin-questions.test.mjs`
- `src\platform\session\SessionProvider.tsx`, `src\platform\session\content.ts`, `src\platform\api-client\api.ts`, `src\platform\xp-leveling\leveling.ts`, `src\platform\xp-leveling\insights.ts`, `src\platform\storage\storage.ts`, `src\platform\events\index.ts`
- `src\types\index.ts`, `src\modules\admin\AdminApp.tsx`, `src\modules\admin\layout\AdminLayout.tsx`, `src\modules\admin\services\adminApi.ts`, `src\modules\admin\pages\AdminAnalytics.tsx`, `src\modules\challenges\components\PracticeModal.tsx`, `src\modules\dashboard\pages\DashboardHome.tsx`
- `scripts\check-boundaries.mjs`, `package.json`, `tsconfig.json`