# CodeConsist learning loop: integrated build plan

This plan merges the six designs (foundations, units-celebrations, goal-streak-league, feedback-review, onboarding-placement, trust-fixes) into one build order for `C:\Users\KIIT0001\Desktop\Devlingo-dev` on branch `feature/learning-loop`.

- The designs disagreed in places. Those points were checked against the code, read-only.
- The only untracked item in the repo is `docs/design/`, which holds the six input designs.
- Engineers need only this document and the code. Where this plan and an input design disagree, **this plan wins**.

---

## 0. Ground rules

**Out of scope.** Razorpay and other payment-provider work, PWA, service worker, email and push notifications. Reminders are in-app only.

**Owner requirements, and how the plan meets them:**

| Requirement | How |
|---|---|
| Every rule, number and piece of copy can be viewed and edited in the admin panel | One settings store (§4.1) and one registry (§4.2). A unit test fails if any default has no admin metadata. Content (unit groupings, feedback notes, concept cards) uses `contentOverrides` and dedicated admin pages. |
| Defaults in code; admin edits apply without a redeploy | `DEFAULT_SETTINGS` in code, sparse overrides in `db.settings`. Learners refetch when `settingsRevision` changes (health probe every 30 s, plus every solve response). |
| Guest mode keeps working | Every rule is a pure function in `src/platform`, run locally for guests and re-run on the server when they sign in. |
| Server is authoritative for XP | The server never reads XP, level, bonuses, day rows or unit completions from a request body. It re-prices everything. |
| Careful, incremental, backwards compatible | Additive migrations only. A one-time backup is written before each schema bump. No progress row is rewritten or re-scored. Every phase ends with `npm run check` and `npm run build` green, plus a manual checklist. |

**Conventions**
- A settings key is added only in the phase that reads it. There are no placeholder or reserved keys.
- Field names:
  - `context` is where something happened: `'lesson' | 'test' | 'review' | 'library' | 'assessment'`.
  - `learningMode` is the learner's choice: `'learn' | 'practice'`.
  - `dailyGoalId` is the chosen goal option. Do not use `dailyGoalOptionId`, `dailyGoal` or `dailyGoalXp`.
  - `timeZone` and `soundOn` are preferences.
  - `today` is a day key (`yyyy-mm-dd`) in the learner's time zone.
- New ADRs are numbered 0008 to 0013 (§5 lists which phase writes which). Each input design claimed 0008; ignore those numbers.

---

## 1. Goal

Turn CodeConsist's stage path into a daily learning loop:
- short units with rewarding end screens
- a chosen daily goal and a forgiving streak
- wrong answers that teach, and review of past mistakes
- a first-run setup, with placement and test-out
- a weekly league

The work comes with trust fixes that make XP, premium access and the public site honest. Every rule and piece of copy lives in one server-side settings store with defaults in code and one admin editor. Guests keep full local play, the server stays authoritative for XP, and existing learners keep all their progress.

---

## 2. Facts checked in the code, and the design corrections they force

| Fact (file) | Consequence for the plan |
|---|---|
| `server/db.js`: `EMPTY.version` is 1 and nothing bumps it. `migrate()` is not exported. `getProgress()` returns a *shallow* `{...EMPTY_PROGRESS, ...row}` (nested objects are shared references) and **inserts** an empty row for an unknown id. | Add `SCHEMA_VERSION` and export `migrateState`. Normalize new nested progress fields in pure `normalize*` functions and never mutate the returned nested objects in place. |
| `server/index.js` binds a port when imported. The tests work around this by reading its source (`index-guards.test.mjs`). | The progress routes must move into a router factory (`server/progress-routes.js`) before they can get HTTP tests. This is P1's first server step. |
| Solve route (index.js 641-711): the day is `leveling.dayKey()` in the server's local zone. `attempts[id].solvedAt` is overwritten on every solve. The client does the same (SessionProvider 921-1020). | Fixed in P1: learner time zone, `solvedAt` kept, new `lastSolvedAt` and `solves`. |
| The merge route (738-793) is synchronous, uses `MAX_PLAUSIBLE_STREAK = 400`, and the body is `{ progress }` with `express.json` limited to 256 kB. | New merge payloads go in top-level siblings of `progress` (§4.8). P5 turns merge into an `asyncRoute`. |
| `celebrate()` fires 70 confetti particles on every solve, re-solves included. `completeChallenge` returns `Promise<number>`, and `PracticeModal` is the only caller. | The P2 return-type change is safe. Confetti rules move to settings in P2. |
| `currentStreak(...)` overwrites the stored streak at SessionProvider lines 198, 769, 995 and 1060. | P3 must stop this so the freeze and repair engine sees the raw value. |
| PracticeModal:891 shows "Show me the solution" with `isCodeType && !isCorrect && attempts >= 2 && solutionCode`. **There is no stage-test check.** | P0 fix. |
| `POST /api/grade` is public, returns `correct` plus `explanation`, and does not guard stage tests. No client code calls it. | P0: refuse stage tests. P1T: premium gate. |
| Admin `mostMissed` (admin.js 229-272) counts `attempts` keys, which are written only on solve, so `solved < attempts` is never true and the list is always empty. | P1 rebuilds it from the new miss store. **Misses must never create `attempts` entries**, because badges `solved-N` are derived from sorted `attempts`. |
| `insights.ts:134` has the regex `/^stage-d+$/`. Badge ids are `first-solve`, `solved-10/50/100/200`, `streak-3/7/14/30` and `stage-<id>`. | P0 fix. The P2 badge families must keep these ids. |
| `vite.config.ts:44` sets `sourcemap: true`. vitest runs in `environment: 'node'` and includes `server/__tests__/**/*.test.mjs`. | P0. The existing test layout is kept. |
| `app.use(cors())` is open. The access logger and oauth `sourceKey` read `cf-connecting-ip` / `x-forwarded-for` directly. | P1T. The new CORS `allowedHeaders` **must include `X-Time-Zone`**, which P1 adds; the trust design's list omitted it. |
| The admin front end already has the route `/admin/settings/security` (credentials page), and the server has `PATCH /api/admin/settings/credentials`. | The new generic settings page lives at `/admin/rules/...`. No settings section may have the id `security`. Server routes `GET/PUT /api/admin/settings` (exact path) do not collide. |
| `dev:api` already watches `./src/platform`. | Only new `server/*.js` files need adding to `--watch-path`. |
| `framer-motion` is a dependency but is never imported. `canvas-confetti` is used. | Celebrations use CSS and `requestAnimationFrame`, with no framer-motion (§3, decision 17). |
| `check-boundaries.mjs`: the server may import `platform/**` only, and platform may import only `ui`, `types` and `config`. | All shared rules live in `src/platform`. UI primitives take plain props. |
| Admin tests (`admin-questions`, `admin-ai`, `billing-routes`, `billing`, `excel`, `admin-auth-policy`) mock `../db.js` with explicit export lists. | New admin code gets its services through `deps` (`adminDeps.learning`), and `adminUserRow` falls back to stored values when `deps` lacks them. Update the mocks only where a tested route starts calling a new store function. |
| `seenConcepts` is local only. Server progress has no such field, and the client spreads server progress over local state. | When P5 makes the server return `seenConcepts`, the client must **union** it, or local history is erased. |
| `applyChallengeOverride` (content.js 228-241) allows only presentational fields. `PUT /content/challenges/:id` freezes a built-in question as "modified". | The P4 feedback overrides use the PATCH path with a basis guard. |
| `learnerView(snapshot, overrides)`, `entitlementsFor` and `unlockedStageIds` exist in `server/billing.js`. | They are reused by the P1T premium gate and by the P5 access checks. |
| Level curve: `xpForLevel(L) = 50·(L−1)·L`, so L20 needs 19,000 XP. | Resolved in §3, decision 10. |

---

## 3. Decision log (conflicts resolved)

| # | Topic | What the designs proposed | Decision |
|---|---|---|---|
| 1 | Settings store | `gameSettings`, `gameRules`, `settings` namespaces, `learningSettings`, a flat `settings` map, `settings[ns].value` | **One** `db.settings = { overrides, revision, updatedAt, updatedBy }`, holding sparse nested overrides per section. **One** shared module `src/platform/settings/` (types, defaults, meta, merge, zod schema, copy filling). |
| 2 | Public read route | `/api/game-settings`, `/api/game-rules`, `/api/settings`, `/api/config`, `/api/site-config`, `learningConfig` inside `/api/content` | **`GET /api/settings`** only. Health gets `settingsRevision`. |
| 3 | Admin route | Separate routers per namespace, PATCH or PUT | **`GET /api/admin/settings`** and **`PUT /api/admin/settings {revision, patch}`**. Responses: 400 for a malformed body or unknown path, 409 for a stale revision, 422 `{error, issues:[{path,message}]}` for invalid values. 422 matches the existing question routes (admin.js:483/505). |
| 4 | Activity log | `db.activity`, `progress.daily`, `progress.reviewXp`, and a per-day `activity` map | **One** `db.activity[userId]` with `days`, `misses` and `missLog`. Every per-day counter (goal, units, review XP, league XP) is a field of `DayRecord`. |
| 5 | Failed attempts | `POST /api/activity/misses` + `activity.misses`, or `POST /api/progress/attempt` + `progress.mistakes` | **One store**, `activity.misses` + `activity.missLog`. **One route**, `POST /api/activity/misses` (batch). Feedback's `final` flag and wrong-answer keys are folded in. |
| 6 | Preferences | Two different `users[].preferences` shapes, `progress.prefs`, three routes | **One** `users[].preferences` on the user row, so it survives reset. **One route**, `PATCH /api/me/preferences`, whose validator grows phase by phase. |
| 7 | Time zone | `X-Time-Zone` header plus cooldown; `PUT` preference; server day | Stored in `users[].preferences.timeZone` plus `timeZoneSetAt`. Captured automatically from the `X-Time-Zone` header on write routes, and settable explicitly through `PATCH /api/me/preferences`. Both honour `streak.timeZoneChangeCooldownHours` (20). The day never moves backwards for a learner. |
| 8 | Day helpers | In `leveling.ts` or `habits/days.ts` | `src/platform/time/days.ts`. `leveling.ts` keeps `dayKey`, `previousDayKey`, `nextStreak` and `currentStreak` for compatibility. |
| 9 | Server bundles | Seven separate `.mjs` bundles | One entry `src/platform/server-lib.ts` compiled to `server/generated/learning.mjs` and held as `learningDeps.lib`. The existing `leveling.mjs` and `grading.mjs` stay. |
| 10 | Level curve | Formula `curveBase` or a threshold table | A table: `levels.thresholds` plus `levels.overflowStep`. The P1 default reproduces today's formula for levels 1-40 (identical up to 82,000 XP). P2 ships the retuned default (owner decision 2, recommended), which never lowers anyone's level. |
| 11 | Daily goal | XP options (two different option sets) or units-based options | Options `{id,label,blurb,metric,target,bonusXp,enabled}`, where `metric` is `'xp' \| 'lessons' \| 'units'`. Defaults are XP-based: 50/100/250/500 with bonuses 5/10/25/50, and 100 is the default (today's `DAILY_XP`). `unitFallbackSolves` is dropped because units ship before goals. `DAILY_SOLVES` is removed in P3. |
| 12 | Goal bonus logic | Units `rewards.ts` or the habits engine | The habits engine (`applySolve`). The units rewards code only handles the perfect-unit bonus. |
| 13 | Streak state | `DayRecord.streak`/`freezeUsed`, or `progress.habit` | `progress.habit` (goal-streak design). `DayRecord` holds no streak fields. |
| 14 | Freeze keys | `freeze.*` section or `streak.freeze.*` | `streak.freeze.*` and `streak.repair.*`. |
| 15 | Solve refactor | `progress-routes.js`, `progress-rules.js`, `progression.js` (each with an `applySolve`) | `server/progress-routes.js` (HTTP) plus `server/progress-rules.js` (pure pipeline, §4.8). `server/progression.js` holds only access gates (premium, lock order). |
| 16 | Review schedule store | — | `progress.review` (cleared on reset). Misses stay in activity. |
| 17 | Animation library | framer-motion, lazy-loaded | CSS transitions and a `requestAnimationFrame` count-up; framer-motion stays unused. The shell chunk never grows, and reduced motion is a CSS media query. |
| 18 | Duplicate primitives | `GoalRing`/`ProgressRing`, two `StreakFlame`s, `GoalPicker`/`ChoiceCards` | `src/ui/primitives/ProgressRing`, `StreakFlame` and `ChoiceCards`. The goal picker is `ChoiceCards` fed with goal options. |
| 19 | Admin pages | About 12 separate settings pages | One generic settings page at `/admin/rules/:sectionId`, generated from metadata, with custom section components where needed. Operational pages stay separate: units editor, Teaching, Answer feedback, Leagues. |
| 20 | Premium and lock gates | `premiumGate` in billing, `checkSolveAccess` in progression | `checkSolveAccess(user, challenge)` in `server/progression.js` calls the billing `premiumGate` (P1T) and then the lock gate (P5). Modes are set in the `access` section. |
| 21 | Leaderboard polish | P3 or P6 | P3 only switches the leaderboard's streak to the derived value. `isYou`, the `me` row and `boardSize` ship with leagues in P6. |
| 22 | `GET /api/habits` | Proposed | Dropped. The client derives status from `progress.habit` plus the day record using the same pure `habitStatus`. Solve and `/auth/me` responses carry `habits`. |
| 23 | Reset semantics | Mixed | `POST /api/progress/reset` clears XP, solves, attempts, `unitsCompleted`, `review`, `testedOut` and `habit` (it keeps `habit.runs` and closes the current run as `ended:'reset'`), plus `activity.misses` and `missLog`. It **keeps** `users[].preferences`, `activity.days` (history; stops daily-bonus farming), `assessments` (cooldowns) and `everSolved` (P6). |
| 24 | At-risk reminder hour | 0 | `reminders.atRisk.fromLocalHour = 18`. A morning "at risk" banner is nagging. |
| 25 | Rate-limit bucket for new write routes | None | New `writeAccount` bucket covers misses, preferences and review answers. Assessment submits use `solveAccount`. |

---

## 4. Shared components (reference used by every phase)

### 4.1 The settings store

**Storage (`server/db.js`)**
- `EMPTY.settings = { overrides: {}, revision: 0, updatedAt: null, updatedBy: null }`
- `overrides` is sparse and nested by section, for example `{ xp: { passScore: 70 }, goals: { options: [...] } }`.
- Store functions:
  - `getSettingsRecord()`
  - `setSettingsRecord({ overrides, revision, updatedAt, updatedBy })` (then `persist()`).

**Shared module `src/platform/settings/`** (pure; no React)

| File | Contents |
|---|---|
| `types.ts` | `Settings` and one interface per section. `PublicSettings = Omit<Settings, 'retention' \| 'access'>`. |
| `defaults.ts` | `DEFAULT_SETTINGS`. XP and level defaults are imported from `leveling.ts` (`DEFAULT_XP_RULES`, `DEFAULT_LEVEL_CURVE`) and `insights.ts` (`DEFAULT_RANKS`), so they cannot drift. |
| `meta.ts` | `SECTION_META: {id, title, description, audience: 'public'\|'admin', phase}[]` in admin display order. `SETTING_META: Record<path, { label, help, kind: 'int'\|'number'\|'bool'\|'enum'\|'string'\|'text'\|'zone'\|'intList'\|'stringList'\|'rows'\|'map'\|'origins', min?, max?, step?, values?, maxLength?, tokens?: string[], sample?: Record<string,string\|number>, envVar?, rowMeta? }>`. |
| `merge.ts` | `mergeSettings(defaults, overrides)`: objects recurse, arrays and leaves replace, a type mismatch is ignored, unknown keys and `__proto__` are skipped. `applySettingsPatch(overrides, patch) → { overrides, changedPaths, unknownPaths }` (`null` deletes; emptied objects are pruned). `publicSettings(s)`. `coerceSettings(raw)` is the no-zod path used by learners. `getPath(s, path)`. |
| `schema.ts` | zod schemas built from `meta.ts` bounds, plus cross-field refinements. `validateSettings(s) → { ok, issues:[{path,message}] }`. `resolveSettings(overrides, env) → { settings, issues }` falls back **per section** to defaults when a stored section is invalid. Imported only by the server bundle and the admin module, never by `SessionProvider`. |
| `copy.ts` | `fillCopy(template, vars)` (plain text; unknown tokens are left out). `tokensIn(template)`. |
| `store.ts` | Module-level snapshot for non-React code (for example `compilerService`): `getSettingsSnapshot()`, `setSettingsSnapshot(s)`, `getCopy(key, vars)`, `subscribe(fn)`. |
| `index.ts` | Client barrel: everything except `schema.ts`. |

**Server service (`server/settings.js`)**
- `createSettingsService({ store, lib, env = process.env })` returns:
  - `current()`: memoized per revision. Layers are defaults, then env (for keys with `envVar`), then overrides.
  - `revision()`, `get(path)`, `publicView()`, `adminView()`
  - `update({ revision, patch, adminId }) → { ok, status, view \| error, issues }`
- A stored override that fails validation after a code change makes that section use its defaults, and is listed in `adminView().issues`. The server never crashes on bad settings.

**Routes (`server/settings-routes.js`)**
- `createSettingsRouter({ getService })` serves `GET /api/settings`:
  - response `{ revision, settings: PublicSettings }`
  - headers `ETag: "r<revision>"`, `Cache-Control: no-cache`
  - no auth
- `createSettingsAdminRouter({ getService, audit })` is mounted inside `createAdminRouter` **after** `router.use(requireAdminAuth)` as `router.use(createSettingsAdminRouter(...))`, and gets the service through `deps.learning.settings`. It returns 503 when the service is absent (keeps mocked tests safe). Routes:
  - `GET /settings` → `{ settings, overrides, defaults, revision, updatedAt, updatedBy, issues, env: {path: value} }`
  - `PUT /settings` with `{ revision: number, patch: object }` → 200 view (revision+1) | 400 `Unknown setting "xp.foo"` or a non-object patch | 409 `{ error, revision }` | 422 `{ error, issues }`
    - Audit `settings.update` with `{ revision, changes: { [path]: { from, to } } }`, at most 50 paths, text values cut to 120 characters.
  - `GET /settings/context` → `{ content: { lessons, tests, stages, tracks, freeStages, premiumStages, totalXp, freeXp }, runtime: { pythonVerifiable, judge0Languages } }`. Later phases add fields (see below).
    - P2 adds `unitCount` and `maxPerfectBonusXp` to `content`, and a `levels: { learnerXp: number[] }` block for impact previews.
    - P3 adds `goals: { choiceCounts }`.

**Client**
- `STORAGE_KEYS.settings = 'cq-settings-v1'` holds `{ revision, settings }`.
- `src/platform/session/useSettingsState.ts` (used inside `SessionProvider`):
  - initial state: the cache through `coerceSettings`, else the defaults
  - refetch when `health.settingsRevision` differs from the cached revision, or when a solve response carries a newer `settingsRevision`
  - an old server that sends no revision means the defaults are used
  - it calls `setSettingsSnapshot`
- Context adds `settings: PublicSettings` and `settingsRevision: number | null`.
- `src/platform/session/useLeveling.ts` returns `{ levelFromXp, levelProgress, xpForLevel, rankTitle, nextRankLevel }` bound to `settings.levels`.
- When the revision changes, `stats.level` is recomputed silently, so a curve change does not produce a level-up toast on the next solve.

**Admin page engine** (`src/modules/admin`)
- Page: `pages/AdminRules.tsx`, routes `rules` and `rules/:sectionId`. It has:
  - a section index (left rail on desktop, a select on mobile)
  - a revision badge ("Revision 7 · saved 25 Sep by admin")
  - a sticky Save/Discard bar when there are unsaved changes
  - a collapsible "Effective settings (JSON)" view
- `components/settings/sections.ts`: `SECTIONS` registry `{ id, title, description, audience, Component? }` built from `SECTION_META`.
- `components/settings/GenericSection.tsx` renders any section from `SETTING_META`, so every key is editable the day it lands.
- `components/settings/fields.tsx`: `SettingNumber`, `SettingToggle`, `SettingSelect`, `SettingText`, `SettingZone`, `SettingList`, `SettingRows`, `SettingMap`, `SettingOrigins`.
  - `SettingText` shows allowed-token chips and a live preview through `fillCopy(value, meta.sample)`.
  - Every field shows "Default: X", a per-field **Reset** (sends `null`) when overridden, and 422 issues matched by `path`.
- Each section card has a "Using defaults" or "N changes" badge and **Reset section** (behind `ConfirmDialog`), which sends `{ [section]: null }`.
- Saving:
  - validate locally with `validateSettings` from `@/platform/settings/schema` (the admin chunk is lazy)
  - send only changed paths
  - on 409, show "Changed elsewhere (revision N) - reload", keeping the edits
- Built on the existing `components/ui.tsx` (`Field`, `NumberField`, `TextField`, `TextArea`, `SelectField`, `TagsField`, `Toggle`, `Card`, `Badge`, `ConfirmDialog`, `Drawer`, `ErrorText`).
- `services/adminApi.ts` adds `settings()`, `updateSettings(revision, patch)` and `settingsContext()`, plus the types `AdminSettingsView` and `SettingsPatch`.

**Admin navigation** (`layout/AdminLayout.tsx` `GROUPS`)
- New group **"Learning"** (after Content):
  - Rules & rewards → `/admin/rules` (P1; lucide `SlidersHorizontal`)
  - Onboarding → `/admin/rules/onboarding` (P5)
  - Teaching → `/admin/teaching` (P4)
  - Answer feedback → `/admin/feedback` (P4)
  - Leagues → `/admin/leagues` (P6)
- Content group: Site copy → `/admin/rules/copy` (P1T).
- Operations group: Limits & access → `/admin/rules/access` (P1T). The existing "Security" credentials page stays.
- The units editor is reached from a **Units** button on `AdminStages` rows (`/admin/stages/:stageId/units`, P2).

### 4.2 Settings registry: every key

"Page" is the admin section at `/admin/rules/<section>` unless noted. All keys are public (sent to learners) except the `retention` and `access` sections. Text keys are plain text with their allowed `{tokens}`; any other token is rejected.

**`xp`: XP & scoring** (P1)

| Key | Type | Default | Bounds / rules |
|---|---|---|---|
| `retryPenalty` | int | 10 | 0-50 |
| `hintPenalty` | int | 10 | 0-50 |
| `scoreFloor` | int | 50 | 0-100, ≤ `passScore` |
| `passScore` | int | 60 | 0-100 |
| `minXpPerSolve` | int | 1 | 0-100 |
| `maxAttemptsCounted` | int | 50 | 1-50 |
| `maxHintsCounted` | int | 10 | 0-10 |

**`levels`: Levels & ranks** (P1; custom `LevelsSection` adds a "Generate curve" helper and an impact panel)

| Key | Type | Default | Bounds / rules |
|---|---|---|---|
| `thresholds` | intList | P1: `50·(L−1)·L` for L=1..40. P2: `0,100,300,600,1000,1500,2100,2800,3600,4500` then +900 per level to 13,500 (20 entries) | 2-100 entries; `[0]=0`; strictly ascending; ≤ 10,000,000 |
| `overflowStep` | int | P1: 4000. P2: 900 | 1-100,000 |
| `ranks` | rows `{minLevel,title}` | Apprentice 1, Junior Developer 3, Developer 6, Senior Developer 10, Staff Engineer 15, Principal Engineer 20 | 1-12 rows; first `minLevel` is 1; strictly ascending; title 1-40 characters |

**`streak`: Streak, freezes & repair** (P1 keys, then P3)

| Key | Type | Default | Bounds / rules | Phase |
|---|---|---|---|---|
| `defaultTimeZone` | zone \| null | null (the server's own zone; today's behaviour) | valid IANA name or null | P1 |
| `timeZoneChangeCooldownHours` | int | 20 | 0-168 | P1 |
| `maxPlausibleMergedStreak` | int | 400 | 1-3650 | P1 |
| `dayRule` | enum | `any-solve` | `any-solve` \| `xp-earned` \| `goal-met` | P3 |
| `freeze.enabled` | bool | true | | P3 |
| `freeze.earnEveryGoalDays` | int | 7 | 1-60 | P3 |
| `freeze.maxHeld` | int | 2 | 0-10 | P3 |
| `freeze.startingCount` | int | 0 | 0 to `maxHeld` | P3 |
| `repair.enabled` | bool | true | | P3 |
| `repair.windowDays` | int | 2 | 1-7 | P3 |
| `repair.lessonsPerMissedDay` | int | 3 | 1-20 | P3 |
| `milestones` | intList | `[3,7,14,30,50,100,365]` | 0-12 entries, ascending, 1-3650 | P3 |
| `runsKept` | int | 50 | 5-200 | P3 |
| `mergeReplayDays` | int | 7 | 0-30 | P3 |

**`celebrations`: Celebrations & sound** (P2)

| Key | Type | Default | Bounds / rules |
|---|---|---|---|
| `sound.defaultOn` | bool | true | |
| `sound.volume` | number | 0.5 | 0-1, step 0.05 |
| `sound.events` | map of bool | `correct`, `wrong`, `unitComplete`, `levelUp`, `badge`: all true | keys fixed |
| `confetti.onCorrect` | bool | true | |
| `confetti.onCorrectParticles` | int | 40 | 0-300 |
| `confetti.onReSolve` | bool | false | |
| `confetti.onUnitEnd` | bool | true | |
| `confetti.unitEndParticles` | int | 140 | 0-400 |
| `levelUpOverlay` | bool | true | |
| `countUpMs` | int | 900 | 0-5000 |
| `copy.unitComplete` | text | "Unit complete!" | ≤80 |
| `copy.perfect` | text | "Perfect unit! +{xp} XP" | ≤80; `{xp}` |
| `copy.flawless` | text | "Flawless run" | ≤80 |
| `copy.levelUp` | text | "Level {level}" | ≤80; `{level}` |
| `copy.newRank` | text | "New title: {title}" | ≤80; `{title}` |
| `copy.streakUp` | text | "{n}-day streak" | ≤80; `{n}` |

**`badges`: Badges** (P2)

| Key | Type | Default | Bounds / rules |
|---|---|---|---|
| `tierNames` | stringList | Bronze, Silver, Gold, Platinum, Diamond | 2-8 entries, each ≤20 characters |
| `families` | rows `{id, metric, enabled, title, detail, tiers}` | `streak`: bestStreak [3,7,14,30,100]<br>`solved`: solvedCount [10,50,100,200]<br>`units`: unitsCompleted [1,10,25,40]<br>`perfect`: perfectUnits [1,5,15,30]<br>`tests`: testsPassed [1,3,6,12]<br>`xp`: xp [1000,5000,10000,15000] | `id` slug, unique; `metric` ∈ bestStreak \| solvedCount \| unitsCompleted \| perfectUnits \| xp \| testsPassed; `title` and `detail` ≤60 characters, must contain `{n}`; `tiers` 1-8 values, strictly ascending |
| `stageBadges.enabled` | bool | true | |
| `stageBadges.coreTitle` | text | "Stage {index} cleared" | ≤60; `{index}` |
| `stageBadges.trackTitle` | text | "{name} cleared" | ≤60; `{name}` |

Badge ids stay `${familyId}-${n}`, so `streak-3` and `solved-10` keep their existing ids.

**`units`: Units** (P2)

| Key | Type | Default | Bounds / rules |
|---|---|---|---|
| `targetSize` | int | 5 | 1-30; `minSize ≤ targetSize ≤ maxSize` |
| `minSize` | int | 3 | 1-30 |
| `maxSize` | int | 8 | 1-30 |
| `targetMinutes` | int | 8 | 1-60 |
| `minutesByType` | map of number | quiz 0.5, output_prediction 0.75, multi_select 1, fill_blank 1, pseudocode_order 1.5, code_runner 4, debug 3 | 0.1-30, step 0.25; keys are exactly the challenge types |
| `perfectBonusXp` | int | 25 | 0-500 |
| `perfectRequiresNoHints` | bool | true | |

**`goals`: Daily goal** (P3)

| Key | Type | Default | Bounds / rules |
|---|---|---|---|
| `enabled` | bool | true | Off hides the ring, picker and card. |
| `options` | rows `{id,label,blurb,metric,target,bonusXp,enabled}` | casual "Casual" xp 50 +5<br>regular "Regular" xp 100 +10<br>serious "Serious" xp 250 +25<br>intense "Intense" xp 500 +50 | 1-8 rows; `id` slug `^[a-z0-9-]{1,32}$`, unique; `label` ≤24 characters; `blurb` ≤60 characters; `metric` ∈ xp \| lessons \| units; target 10-2000 for xp, 1-50 for lessons, 1-20 for units; `bonusXp` 0-100 |
| `defaultOptionId` | string | `regular` | must be an enabled option |
| `oneMorePrompt` | bool | true | |

**`reminders`: In-app reminders** (P3; `leagueResult` in P6)

Titles are at most 80 characters and bodies at most 200.

| Key | Default | Tokens |
|---|---|---|
| `atRisk.enabled` / `atRisk.fromLocalHour` | true / 18 (0-23) | |
| `atRisk.title` | "Your {streak}-day streak is at risk" | streak |
| `atRisk.body` | "Finish one lesson in the next {hoursLeft} hours to keep it." | streak, hoursLeft |
| `atRisk.bodyWithFreeze` | "Miss today and a streak freeze covers it ({freezes} left)." | freezes |
| `atRisk.cta` | "Practise now" | |
| `goalMet.toast` | "Daily goal met: {goal}." | goal, bonusXp |
| `goalMet.cardTitle` | "Daily goal met" | |
| `goalMet.cardBody` | "{streak} days in a row. One more lesson?" | streak, bonusXp |
| `goalMet.moreLabel` / `goalMet.doneLabel` | "One more" / "Done for today" | |
| `freezeEarned` | "You earned a streak freeze ({freezes} of {maxFreezes})." | freezes, maxFreezes |
| `freezeUsed` | "A streak freeze kept your {streak}-day streak alive on {days}." | streak, days |
| `streakBroken.title` | "Your {lostStreak}-day streak ended" | lostStreak |
| `streakBroken.body` | "Complete {remaining} more lessons by {deadline} to repair it." | remaining, deadline |
| `streakBroken.cta` | "Repair my streak" | |
| `streakRepaired` | "Streak repaired: {streak} days." | streak |
| `welcomeBack.enabled` / `welcomeBack.cta` | true / "Start a lesson" | |
| `welcomeBack.tiers` | rows `{minDays, title, body}`: 3 days "Welcome back, {name}", 14 days "It's been {days} days" (1-5 rows; `minDays` 1-365, strictly ascending) | name, days, bestStreak |
| `leagueResult.enabled` + `single`, `promoted`, `demoted`, `stayed` (P6) | e.g. "You finished #{rank} with {xp} XP." | rank, xp, tier |

**`feedback`: Answer feedback & retries** (P4)

| Key | Type | Default | Bounds / rules |
|---|---|---|---|
| `attemptsBeforeReveal.practice` | map int | quiz 2, output_prediction 2, multi_select 3, fill_blank 3, pseudocode_order 3 | 1-5 |
| `attemptsBeforeReveal.learn` | int | 1 | 1-5 |
| `showWrongAnswerNotes` | map bool | learn true, practice true, review true | |
| `stageTestWrongAnswerNotes` | bool | false | |
| `solutionAfterFailedRuns` | int | 2 | 0-10 (0 = never); never on stage tests or assessments |
| `learnOpensReading` | bool | true | |
| `requeue.enabled` | bool | true | |
| `requeue.maxRounds` | int | 2 | 0-3 |
| `requeue.maxScoreAfterReveal` | map int | learn 80, practice 60 | 50-100 |

**`review`: Practice (review)** (P4)

| Key | Type | Default | Bounds / rules |
|---|---|---|---|
| `enabled` | bool | true | |
| `intervalsDays` | intList | [1,3,7,21] | 2-8 entries, strictly ascending, each 1-365 |
| `wrongResetsToBox` | int | 0 | < number of intervals |
| `initialBox.clean` / `initialBox.assisted` | int | 1 / 0 | < number of intervals |
| `sessionSize.min` / `sessionSize.max` | int | 5 / 8 | 1-20; min ≤ max |
| `mix.mistakes` / `mix.due` | int | 3 / 4 | 0-20 |
| `weak.scoreBelow` / `weak.hintsAtLeast` | int | 80 / 2 | 1-100 / 0-10 |
| `mistakeWindowDays` | int | 30 | 1-365 |
| `itemTypes` | stringList | quiz, output_prediction, multi_select, fill_blank, pseudocode_order | non-empty subset of the challenge types |
| `attemptsBeforeReveal` | int | 1 | 1-5 |
| `requeueMissed` | bool | true | |
| `xp.correctFirstTry` / `xp.correctAfterMiss` | int | 5 / 2 | 0-50 |
| `xp.sessionBonus` / `xp.dailyCap` | int | 5 / 60 | 0-100 / 0-500 |
| `sessionTtlHours` | int | 12 | 1-72 |
| `guestMergeWindowDays` | int | 2 | 0-7 |

**`onboarding`: Onboarding** (P5; custom `OnboardingSection` with a live preview)

| Key | Default | Rules |
|---|---|---|
| `enabled` / `showAfterEnter` / `dashboardReminder` | true / true / true | |
| `intro.title` / `intro.body` | "Welcome to CodeConsist" / short intro | ≤120 / ≤600 |
| `finish.title` / `finish.body` / `finish.ctaLabel` / `finish.placementCtaLabel` | "You're set" / … / "Start learning" / "Find my level" | ≤120 / ≤600 / ≤40 / ≤40 |
| `steps` | rows `{id, enabled, skippable, title, subtitle}` for ids `motivation, track, experience, goal, mode` | Ids unique and from that fixed set; `track` comes before `experience` when both are enabled |
| `motivation.options` | rows `{id,label,description,icon}`: job, college, interviews, fun | 2-8 rows; `icon` is a lucide name from an allow-list |
| `track.blurbs` | map `{[trackId]: text}`, empty | ≤160 each; keys must be existing track ids |
| `experience.options` | map with keys `new`, `some`, `experienced`: `{label, description, action: 'start'\|'offer-placement'\|'placement', recommendMode: 'learn'\|'practice'\|null}` | keys fixed |
| `experience.placementPrompt` | `{title, body, startLabel, skipLabel}` | |
| `mode.options` | map with keys `learn`, `practice`: `{title, flow, blurb}` (moved out of `LearningModeChooser.tsx` `OPTIONS`) | |

**`placement`: Placement** (P5)

| Key | Default | Rules |
|---|---|---|
| `enabled` / `offerOnLearnPage` | true / true | |
| `maxStages` | 3 | 1-20 |
| `stopOnFirstFail` | true | |
| `passMark` | 70 | 50-100, a multiple of 10 |
| `hintsAllowed` | false | |
| `xpPercent` | 100 | 0-100 |
| `retakeAfterDays` | 7 | 0-90 |
| `stagesByTrack` | map `{[trackId]: stageId[]}`, empty (every stage with a test, in order) | ids must exist in that track |
| `copy.introTitle`, `introBody`, `passTitle`, `passBody`, `failTitle`, `failBody`, `learnPageLink` | texts | tokens `{stage}`, `{passMark}`, `{maxRuns}`, `{when}` where relevant |

**`testOut`: Test-out** (P5)

| Key | Default | Rules |
|---|---|---|
| `enabled` / `allowOnOpenStage` / `allowSkipAhead` | true / true / true | |
| `countsAsCleared` / `countsTowardCertificate` | true / false | |
| `passMark` | 80 | 50-100, a multiple of 10 |
| `hintsAllowed` | false | |
| `maxAttempts` / `attemptWindowHours` | 3 / 24 | 1-10 / 1-168 |
| `cooldownMinutes` / `sessionMinutes` | 60 / 60 | 0-10080 / 5-240 |
| `xpPercent` | 100 | 0-100 |
| `disabledStages` | [] | existing stage ids |
| `copy.buttonLabel`, `confirmTitle`, `confirmBody`, `rulesLine`, `passTitle`, `passBody`, `failTitle`, `failBody`, `cooldownLabel` | texts | tokens `{stage}`, `{passMark}`, `{maxRuns}`, `{when}` |

**`league`: Weekly league** (P6)

| Key | Default | Rules |
|---|---|---|
| `enabled` | true | |
| `weekStartsOn` | 1 (Monday) | 0 or 1 |
| `finalizeDelayHours` | 12 | 0-48 |
| `boardSize` | 50 | 10-200 (also used by the all-time board) |
| `countMergedXp` / `countUnverifiedSolves` / `countReviewXp` | false / true / true | |
| `tiers.enabled` | false | |
| `tiers.list` | rows `{id,name}`: Bronze, Silver, Gold, Platinum, Diamond | 2-10 rows; `id` slug; name ≤20 characters |
| `tiers.groupSize` / `promoteCount` / `demoteCount` / `minXpToPromote` | 30 / 7 / 5 / 1 | 5-100 / 0+ / 0+ / 0-10000; `promote + demote < groupSize` |

**`copy`: Site copy** (P1T; P5 adds the two `…WithSkip` keys; admin nav item "Site copy")

| Key | Default (abridged) | Tokens |
|---|---|---|
| `offline.auth` | "Accounts are temporarily unavailable. Keep practising as a guest - your progress is saved on this device." | |
| `offline.leaderboard`, `offline.banner`, `offline.generic`, `offline.checkout`, `offline.verify`, `offline.playgroundJs` | friendly texts | |
| `offline.playgroundCompiled` / `runtime.unavailable` | "… {language} …" | language |
| `sync.online` / `sync.offline` / `sync.guest` | "Synced" / "Sync paused - saved on this device" / "Guest - saved on this device" | |
| `playground.description` | no "API" or "Judge0" wording | |
| `landing.heroFootnote` | "Free to start · {freeStages} free stages, {premiumStages} premium · Every stage ends in a coding test" | freeStages, premiumStages |
| `landing.footerBlurb`, `landing.howLessons`, `landing.finalCta` | texts | |
| `landing.pathLine` | "{stages} stages, in order, each ending in a coding test." | stages |
| `landing.buildStep` | "…The next stage stays locked until you clear it." | |
| `landing.pathLineWithSkip` / `landing.buildStepWithSkip` (P5) | "…Already know some? Take a short placement or test out of a stage." | stages |
| `meta.description` | "CodeConsist - learn to code with {lessons} bite-sized lessons and {tests} stage tests across {stages} stages…" | lessons, tests, stages, tracks |
| `limits.tooMany` / `limits.busy` | "Too many attempts - try again in {minutes} minutes." / "The code runner is busy - try again in a moment." | minutes |
| `premium.lockedSolve` | "This lesson is part of a premium stage." | |
| `notFound.title` / `notFound.body` / `error.title` / `error.body` | texts | |

All copy values are at most 300 characters.

**`retention`: Data limits** (admin only; P1, `leagueWeeksKept` in P6)

| Key | Default | Bounds |
|---|---|---|
| `activityDaysKept` | 400 | 30-1000 |
| `missLogPerUser` | 300 | 0-2000 |
| `missesPerDay` | 300 | 1-5000 |
| `missesPerItemPerDay` | 20 | 1-100 |
| `answerMaxChars` | 200 | 20-1000 |
| `mostMissedMinLearners` | 3 | 1-100 |
| `leagueWeeksKept` (P6) | 26 | 4-104 |

**`access`: Limits & access** (admin only; P1T, gates in P5; custom `AccessSection` with diagnostics)

| Key | Default | Bounds |
|---|---|---|
| `rateLimit.mode` | enforce | off \| log \| enforce |
| `rateLimit.loginIp` | 30 / 900 s | limit 5-1000; window 60-86400 (the same window bounds apply to every bucket) |
| `rateLimit.loginAccount` (failed attempts per email) | 10 / 900 | limit 3-100 |
| `rateLimit.registerIp` | 20 / 3600 | limit 1-500 |
| `rateLimit.registerGlobal` | 300 / 3600 | limit 10-10000 |
| `rateLimit.executeAccount` | 40 / 60 | limit 5-1000 |
| `rateLimit.executeIp` | 120 / 60 | limit 5-2000 |
| `rateLimit.solveAccount` | 60 / 60 | limit 10-1000 |
| `rateLimit.writeAccount` | 120 / 60 | limit 10-2000 |
| `rateLimit.passwordChangeAccount` | 10 / 900 | limit 3-100 |
| `rateLimit.passwordResetIp` | 10 / 900 | limit 3-200 |
| `execution.maxConcurrent` / `maxQueued` / `queueWaitMs` | 4 / 20 / 10000 | 1-16 / 0-200 / 0-30000 |
| `network.trustProxyHops` | env `TRUST_PROXY_HOPS`, else 2 | 0-5 |
| `cors.mode` | report | open \| report \| enforce |
| `cors.extraOrigins` | [] (plus env `CORS_ORIGINS`) | at most 20 exact `http(s)://host[:port]` origins |
| `premiumGate` | enforce | log \| enforce |
| `passwordResetTtlMinutes` | 1440 | 15-10080 |
| `solveGate` / `mergeGate` (P5) | log / log | off \| log \| enforce |
| `requireServerVerification` / `acceptGuestClaims` (P5) | true / true | |

Each `rateLimit.<bucket>` value is `{ limit, windowSeconds }`.

**Cross-field refinements in `schema.ts`**
- `scoreFloor ≤ passScore`
- ranks start at level 1 and ascend strictly
- threshold table starts at 0 and ascends strictly
- `minSize ≤ targetSize ≤ maxSize`
- goal option ids are unique and the default option is enabled
- `freeze.startingCount ≤ freeze.maxHeld`
- review intervals ascend; `wrongResetsToBox` and `initialBox.*` are less than the number of intervals; `sessionSize.min ≤ max`
- onboarding `track` step comes before `experience`
- `promoteCount + demoteCount < groupSize`
- zones pass `isValidTimeZone`
- every text uses only its declared tokens

### 4.3 Activity log and failed attempts (one store)

**Stored as** `db.activity[userId]` (server). The client mirror is `STORAGE_KEYS.activity = 'cq-activity-v1'`, with `ownerId` tagging like `stats.ownerId`.

```
ActivityLog { v: 1, lastDay: string|null, backfilledAt: string|null,
              days: Record<day, DayRecord>, misses: Record<challengeId, MissSummary>, missLog: MissEntry[] }
```

**`DayRecord`** fields (all optional numbers default to 0 through `normalizeDay`):

| Field | Meaning | Phase |
|---|---|---|
| `xp` | XP credited that day **except** the goal bonus: solve XP, perfect-unit bonus, review XP, test-out XP. The goal `xp` metric reads this. | P1 |
| `lessons` / `tests` / `reSolves` | First-time lesson solves, first-time stage-test solves, and re-solves | P1 |
| `mistakes` | Misses recorded that day | P1 |
| `firstAt` / `lastAt` / `source` | ISO times; `source` is `'live' \| 'backfill' \| 'merge'` | P1 |
| `units` / `perfectBonusXp` | Units first completed that day, and perfect bonus paid | P2 |
| `goal` / `goalBonusXp` | `goal` is `{optionId, metric, target, metAt} \| null`, a snapshot taken when the goal is met, so a later goal change never un-meets the day | P3 |
| `reviews` / `reviewXp` | Correct review answers, and review XP paid (drives `review.xp.dailyCap`) | P4 |
| `leagueXp` | The part of the day's XP that counts toward the week | P6 |

The heatmap intensity is `xp + goalBonusXp`.

**`MissSummary`** (per challenge; bounded by the size of the question bank):
```
{ count, firstAt, lastAt, lastDay, lastDayCount, open, revealed, keys: Record<string,number> (top 5), lastAnswer: MissAnswer|null, codeOnly?: true }
```
- `open` becomes true on any miss. From P4 it is cleared only by a clean review answer.
- `revealed` counts final misses, where the answer was shown.
- `solvedSince` is derived, never stored: `attempts[id].lastSolvedAt > lastAt`.

**Other types**
- `MissAnswer = {kind:'choice',index} | {kind:'multi',indices} | {kind:'blanks',values} | {kind:'order',lines:number[]} | {kind:'code',passed,total}`
- `MissEntry = { challengeId, at, day, context, answer: MissAnswer|null, final: boolean, synced?: false }`. It is capped at `retention.missLogPerUser`, newest last.

**Pure code**
- `src/platform/activity/log.ts`:
  - `applyActivityEvent(log, event, ctx)`, where `event` is one of `{type:'solve', …}`, `{type:'miss', …}`, `{type:'review', …}`, `{type:'goal', …}` or `{type:'league', …}`
  - `mergeActivityLogs(server, incoming, ctx)`, which is idempotent
  - `backfillFromAttempts(attempts, lookup, zone, rules)`, `pruneDays`, `normalizeDay`, `activityGridFromLog(days, weeks, today)`
- `src/platform/grading-engine/misses.ts`:
  - `normalizeMissAnswer(challenge, raw, maxChars)`
  - `wrongAnswerKeys(challenge, answer)`, which produces keys `o<i>`, `o<i>.<j>`, `b<i>:<normalized>` or `order`
  - `missKeyLabel(challenge, key)`

**Rules**
- A miss never writes `progress.attempts`.
- A correct answer is never recorded as a miss. The server re-grades non-code answers with `gradeAnswer` and rejects correct ones.
- Code misses are never stored as code, because drafts already hold that.

### 4.4 Learner preferences

- `users[].preferences = { timeZone, timeZoneSetAt, dailyGoalId, soundOn, trackId, learningMode, motivation, experience, updatedAt }`. Every field is nullable; `null` means "use the default".
- `users[].onboarding = { completedAt, dismissedAt } | null`.
- Both are normalized in `migrate()` inside `users.map`. `publicUser()` adds `preferences` (without `timeZoneSetAt`) and `onboarding`.
- Route: `PATCH /api/me/preferences` (`requireAuth`, `writeAccount` limit), in `server/preferences-routes.js` as `createPreferencesRouter({ requireAuth, publicUser, settings, learnerTracks })`.
  - Body: any subset of `{ timeZone, dailyGoalId, soundOn, trackId, learningMode, motivation, experience, onboarding: 'completed'|'dismissed' }`.
  - Validation in index.js style: an early 400 `{ error }` naming the field. The accepted fields grow by phase: P2 `soundOn`; P3 `timeZone` and `dailyGoalId`; P5 the rest.
  - Response: `{ user: publicUser, applied: { timeZone: boolean } }`. A time-zone change inside the cooldown is not an error; it returns `applied.timeZone: false`.
- Guest copy: `STORAGE_KEYS.preferences = 'cq-preferences-v1'`, holding the same fields plus `pendingSync`. It is sent in the merge body. The server adopts only fields where the account's value is `null` and the value is valid.

### 4.5 Progress row additions (`EMPTY_PROGRESS` plus lazy `normalize*`)

| Field | Phase | Default | On `/progress/reset` |
|---|---|---|---|
| `attempts[id].lastSolvedAt`, `attempts[id].solves` (optional; `solvedAt` now means the first solve) | P1 | absent | cleared |
| `unitsCompleted: {[unitId]: {completedAt, perfect, bonusXp}}` | P2 | `{}` | cleared |
| `habit: HabitState` (§ P3) | P3 | `EMPTY_HABIT` via `normalizeHabit` | fresh, keeping `runs` and closing the current run as `'reset'` |
| `review: {[id]: {box, due, last?, paid?}}` | P4 | `{}` | cleared |
| `testedOut: {[stageId]: {at, via, clears, assessmentId}}`, `seenConcepts: string[]` | P5 | `{}`, `[]` | cleared (reset creates fresh objects and never spreads the shared constant) |
| `attempts[testId].via` | P5 | absent | cleared |
| `everSolved: string[]` | P6 | derived `= completedChallenges` | **kept** (union) |

### 4.6 Other new stores

| Key | Phase | Shape (summary) | Deleted with the user |
|---|---|---|---|
| `settings` | P1 | §4.1 | n/a |
| `activity` | P1 | §4.3 | yes |
| `passwordResets`, `users[].tokenVersion` | P1T | per the trust design | yes |
| `contentOverrides.units` | P2 | `{[stageId]: {units:[{id,name,description?,challengeIds}], nextSeq, updatedAt}}` | n/a |
| `contentOverrides.challenges[id].{optionFeedback, blankFeedback, feedbackBasis}` | P4 | per the feedback design | n/a |
| `conceptCards`, `reviewSessions` | P4 | per the feedback design | `reviewSessions`: yes |
| `assessments` | P5 | `{[userId]: {records[≤100], cooldownClearedAt}}` | yes |
| `leagues` | P6 | `{members, weeks}` | via `forgetLeagueIdentity` |

**Migration rule for every phase**
- Bump `SCHEMA_VERSION` by one when the phase adds a top-level key.
- When `loaded.version < SCHEMA_VERSION`, `load()` first writes the raw file to `db.json.pre-v<SCHEMA_VERSION>-<ts>` (same approach as the `.corrupt-*` path), then migrates.
- `migrateState` is pure, idempotent and order-independent. Every key goes through `plainObject(...)`. Map writes use `defineEntry`/`ownEntry`.
- No progress row is rewritten at load. New fields appear on first read or write.

### 4.7 Days and time zones

**`src/platform/time/days.ts`**
- `dayKeyIn(timeZone, date = new Date())`: `Intl.DateTimeFormat('en-CA', {timeZone, year:'numeric', month:'2-digit', day:'2-digit'})`, with one cached formatter per zone.
- `isValidTimeZone(z)`: at most 64 characters, matches `/^[A-Za-z0-9_+\-/]+$/`, and the `Intl` constructor does not throw. Do not use `supportedValuesOf`: the TypeScript lib is ES2020.
- `addDays(key, n)` and `daysBetween(a, b)` use UTC calendar arithmetic.
- `weekStartFor(day, weekStartsOn)`, `msUntilLocalMidnight(now, tz)`, `browserTimeZone()` (inside try/catch).
- In `leveling.ts`, `previousDayKey(key) = addDays(key, -1)`. The output is unchanged, but it no longer depends on DST.

**Server `server/activity.js` service**
- `zoneFor(user)`: `preferences.timeZone`, else `streak.defaultTimeZone`, else the server's zone.
- `captureZone(req, user, now)` runs on write routes only (solve, misses, merge, review answer, assessment submit). It stores a valid `X-Time-Zone` on first sight, or when it differs and the cooldown has passed. Invalid values are ignored.
- `todayFor(user, progress, now) = max(dayKeyIn(zone, now), activity.lastDay, progress.lastActiveDay)`. The day never moves backwards, so flipping zones cannot replay a day.
- All of this runs synchronously after the last `await` of a route, in the same tick as `setProgress`.

**Client**
- `request()` in `src/platform/api-client/api.ts` adds `X-Time-Zone: browserTimeZone()` inside try/catch.
- `todayKey = dayKeyIn(user?.preferences?.timeZone ?? browserTimeZone())`. A timer at `msUntilLocalMidnight` rolls it over.

### 4.8 Server pipelines (final order; each phase adds its step)

**Rule:** every step after the last `await` is synchronous. Progress, activity (and leagues) are written in the same tick.

**`POST /api/progress/solve`** (`requireAuth`)
1. Parse and clamp: `attempts` 1..`xp.maxAttemptsCounted`, `hintsUsed` 0..`xp.maxHintsCounted`, `context` (`lesson|test|library`, default `lesson`), `learningMode`, and from P4 `requeued` and `revealed` (each `=== true`).
2. `solveAccount` rate limit (P1T).
3. `getChallengeMerged` → 404.
4. `checkSolveAccess` (P1T premium; P5 lock order) → 403 `{error, reason}`, before any code runs.
5. `await verifySubmission` inside execution slots (P1T) → 422.
6. Pass mark `isPassingSolve(a, h, settings.xp)` (skipped when `requeued`, P4) → 422 `below-pass-mark`, with the message using `settings.xp.passScore`.
7. `captureZone`, then `today = todayFor(...)`.
8. `progressRules.applySolveCore`: score and XP with the rules and the reveal cap (P4); `attempts` keeps `solvedAt`, sets `lastSolvedAt`, `solves += 1`; `completedChallenges`; `completedStages`.
9. `applyUnitRewards` (P2): perfect bonus and `unitsCompleted`.
10. `applyActivityEvent(solve)` (P1): day counters, `units` and `perfectBonusXp` (P2).
11. Streak:
    - P1-P2: the existing `nextStreak` on `today`.
    - P3: `habits.applySolve`, which settles, repairs, counts the streak day, snapshots the goal, advances freezes, and adds the goal bonus to `xp` and `day.goalBonusXp`.
12. League (P6): `leagueXp`, `noteLeagueXp`, `everSolved`.
13. `level = levelFromXp(xp, settings.levels)`; persist; `clearDraftForSolve`; Excel sync as today.
14. Response `{ progress, awardedXp, score, firstSolve, verified, settingsRevision, today: {day, ...DayRecord}, bonuses: Bonus[], bonusXp, unitCompleted, habits?, habitEvents? }`, where `Bonus = {kind:'perfect-unit', unitId, xp} | {kind:'daily-goal', day, xp}`. `awardedXp` keeps its meaning: solve XP only.

**`POST /api/progress/merge`** (`requireAuth`; becomes `asyncRoute` in P5)

Body: `{ progress, activity?, reviewLog?, assessmentClaims?, preferences?, habit? }`. The client trims it to stay under 256 kB.

1. Premium filter on the new ids → `skippedLocked` (P1T).
2. Guest `assessmentClaims`, verified and capped at 20, then `filterMergeIds` under `access.mergeGate` → `claims`, `droppedChallenges` (P5).
3. Re-price the new ids with `settings.xp` (P1). The server's `solvedAt` is the client's value when it is valid; a future time or one older than `activityDaysKept` becomes "now".
4. `applyMergeUnitRewards`: bonuses only for units completed *by* the new ids (P2).
5. `mergeActivityLogs` (P1):
   - days for new ids come from their validated `solvedAt` in the account's zone
   - `reSolves`, `reviews` and `mistakes` take `max` per day
   - misses: `count` max, `firstAt` min, `lastAt` max
   - `missLog` is a union keyed `(challengeId, at)`, with non-code entries re-graded and correct ones dropped
6. Streak:
   - P1-P2: today's rule, with the clamp at `maxPlausibleMergedStreak`.
   - P3: `mergeHabitsFor`. A new account adopts the normalized guest habit (freezes capped at `maxHeld`). An existing account keeps the server habit and replays client day rows newer than its `lastActiveDay` within `streak.mergeReplayDays`, in date order; goal bonuses come only from that replay.
7. Review merge (P4): newer `last` wins; `reviewLog` XP recomputed within `guestMergeWindowDays` under `dailyCap`; no session bonus.
8. `seenConcepts` union (P5). `preferences` adopted where the account's value is null (P2+).
9. League (P6): merged days get `leagueXp: 0` unless `countMergedXp`.
10. Level; persist. Response: `{ progress, mergedChallenges, awardedXp, bonusXp, activity, skippedLocked?, droppedChallenges?, claims?, awardedReviewXp? }`.

### 4.9 Route catalogue (all phases)

**Learner and public routes**

| Route | Guard | Phase |
|---|---|---|
| `GET /api/settings` | none | P1 |
| `GET /api/health` (+`settingsRevision`) | none | P1 |
| `GET /api/progress` (learner-day recalc; `habits` from P3) | `requireAuth` | P1 |
| `GET /api/auth/me` (wrapped in `recalc`; `habits` from P3) | `requireAuth` | P1 |
| `POST /api/progress/solve`, `POST /api/progress/merge`, `POST /api/progress/reset` | `requireAuth` | P1+ |
| `GET /api/activity?from=YYYY-MM-DD` → `{ timeZone, today, days, misses }` (window: default today−97 days, max 400) | `requireAuth` | P1 |
| `POST /api/activity/misses` | `requireAuth` + `writeAccount` | P1 |
| `GET /api/leaderboard` (level and day from settings in P1, derived streak in P3, `isYou`/`me`/`boardSize` in P6) | global `optionalAuth` | P1/P3/P6 |
| `POST /api/grade` (refuses stage tests in P0; premium gate in P1T) | none | P0/P1T |
| `POST /api/execute` (`reason`/`devHint` in P0; limits and slots in P1T) | none | P0/P1T |
| `POST /api/auth/password-reset/inspect`, `POST /api/auth/password-reset` | none + `passwordResetIp` | P1T |
| `PATCH /api/me/preferences` | `requireAuth` + `writeAccount` | P2 (grows) |
| `GET /api/content` (stubs in P1T; `units` in P2; concept cards and feedback overrides in P4) | global `optionalAuth` | P1T/P2/P4 |
| `POST /api/review/session`, `POST /api/review/answer` | `requireAuth` | P4 |
| `POST /api/progress/concepts` | `requireAuth` | P5 |
| `GET /api/assessments/status`, `POST /api/assessments`, `POST /api/assessments/:id/submit`, `POST /api/assessments/:id/fail`, `POST /api/assessments/:id/finish` | `requireAuth` | P5 |
| `GET /api/leagues/current` | global `optionalAuth` | P6 |

**Admin routes** (all under `/api/admin` behind `requireAdminAuth`)

| Route | Phase |
|---|---|
| `GET /settings`, `PUT /settings`, `GET /settings/context` | P1 |
| `GET /analytics` (rebuilt `mostMissed`; `practice` in P4) | P1 |
| `GET /analytics/challenges/:id/misses` | P1 |
| `GET /users/:id/learning` (activity in P1, habits in P3, onboarding/assessments in P5, league in P6) | P1+ |
| `GET /access/status`, `POST /access/rate-limits/reset` | P1T |
| `POST /users/:id/password-reset`, `GET /users/:id/password-resets`, `POST /password-resets/:id/revoke` | P1T |
| `GET`, `PUT`, `DELETE /content/stages/:id/units` | P2 |
| `PATCH /users/:id/learning`, `GET /analytics/engagement` | P3 |
| `PATCH /content/challenges/:id` (feedback fields), `POST /content/challenges/feedback`, `POST /ai/feedback`, concept routes, `POST /ai/concept` (optional) | P4 |
| `POST /users/:id/assessments/clear-cooldown`, `GET /analytics/onboarding` | P5 |
| `GET /leagues/weeks`, `GET /leagues/weeks/:id`, `POST /leagues/weeks/:id/close`, `POST /leagues/weeks/:id/reset`, `POST /leagues/weeks/:id/exclude`, `PATCH /leagues/members/:userId` | P6 |

**New server files, by phase.** Add each to `package.json` `dev:api --watch-path` in the same commit that creates it.

| Phase | Files |
|---|---|
| P1 | `settings.js`, `settings-routes.js`, `progress-rules.js`, `progress-routes.js`, `activity.js`, `activity-routes.js` |
| P1T | `client-ip.js`, `rate-limit.js`, `cors-policy.js`, `progression.js`, `password-reset.js` |
| P2 | `units.js`, `preferences-routes.js` |
| P3 | `habits.js` |
| P4 | `review-routes.js`, `concept-cards.js` |
| P5 | `assessment-routes.js` |
| P6 | `leagues.js`, `leagues-routes.js`, `leagues-admin.js` |

### 4.10 Client catalogue

**`STORAGE_KEYS` additions**
- `settings`, `activity`, `preferences` (P1-P2)
- `unitDefs: 'cq-unit-defs-v1'` (P2)
- `habitSeen: 'cq-habit-seen-v1'` (P3)
- `onboarding: 'cq-onboarding-v1'`, `assessments: 'cq-assessments-v1'` (P5)
- `leaderboardTab` (P6)

Proposed keys **not** added, because the single `settings` cache or the `preferences` key covers them: `gameRules`, `soundOn`, `dailyGoal`, `pendingPrefs`, `config`, `siteConfig`.

**Events and intents** (`src/platform/events`)
- Facts:
  - `unit:completed` (P2)
  - `habit:goalMet {source:'solve'|'sync'}`, `habit:freezeEarned`, `habit:freezeUsed`, `habit:streakRepaired` (P3)
  - `challenge:missed`, `review:completed` (P4)
  - `assessment:finished` (P5)
- Intents:
  - `intents.openUnit(stageId, unitId)` → `practice:openUnit` (P2)
  - `intents.openReview(scope?)` → `review:open` (P4)
  - `intents.openAssessment(req)` → `assessment:open` (P5)

**`SessionProvider` split.** Keep the provider from growing further by moving logic into files in `src/platform/session/`:
- `stats.ts` (`hydrateStats`, `INITIAL_STATS`; P1)
- `useSettingsState.ts`, `useLeveling.ts`, `useActivityLog.ts` (P1)
- `useHabitState.ts` (P3)
- `preferences.ts` (`reconcilePreferences`, `unionConcepts`; P2/P5)
- `useAssessments.ts` (P5)

**`PracticeMode`.** `'lessons' | 'test'` gains `'review'` (P4) and `'assessment'` (P5).

**Challenge answer props.** `AnswerRendererProps` gains:
- `reveal: boolean` (P0 for stage tests; generalized in P4)
- `notes`, `ruledOut` (P4)

---

## 5. Phases

Each phase ends with:
- `npm run check` green (typecheck, boundaries, content scripts, vitest)
- `npm run build` green
- its manual checklist done on a copy of the live `db.json` (`DATA_DIR=./scratch-data`)

P1T can run in parallel with P2-P6 once P1 step 6 is merged.

---

### Phase 0: Trust quick fixes (no dependencies)

**Scope:** trust (a)(b)(c)(g) static parts, plus the stage-test reveal hole.

| Step | Change | Files |
|---|---|---|
| 0.1 | Sourcemaps off in production | `vite.config.ts`: `build.sourcemap: mode === 'development' \|\| env.SOURCEMAP === 'true'`. New `scripts/check-dist.mjs` (exits 1 if any `dist/**/*.map` exists). `.github/workflows/ci.yml`: run it after `npm run build`. |
| 0.2 | Badge regex | `src/platform/xp-leveling/insights.ts:134` → `/^stage-\d+$/`. Badge ids are unchanged. |
| 0.3 | 404 page | New `src/app/routes/NotFoundRoute.tsx` (static text; links to `ROUTES.landing` and `ROUTES.learn`). `src/app/App.tsx:149`: `path="*"` renders it instead of `<Navigate>`. Add `<Route path="*" element={<NotFoundRoute inFrame />} />` inside the dashboard route. |
| 0.4 | Error boundary | `src/ui/primitives/ErrorBoundary.tsx`: friendly production text, reference code `E-XXXXXX` logged with the error, dev-only `<pre>`, optional `messages?: () => {title, body}` prop, plain `<a href="/">`, log prefix `[CodeConsist]`. |
| 0.5 | Developer text hidden in production | New `src/ui/primitives/DevHint.tsx` (renders only when `ENV.isDev`; exported from `src/ui/index.ts`). Friendly static text at the locations below. `server/index.js` Judge0-missing 501: add `reason: 'runtime-unavailable'` and `devHint`. |
| 0.6 | Stage-test reveal hole | New `src/modules/challenges/session/rules.ts` with `canRevealSolution({challenge, context, isCorrect, attempts})` (false for `isStageTest` and in test or assessment context) and `revealsAnswers(context, challenge)`. `PracticeModal.tsx:891` uses it. `AnswerRendererProps.reveal` is added (false on stage tests). `FillBlankChallenge.tsx` hides "Expected:" and `OptionsChallenge.tsx` does not mark the correct option when `!reveal`. |
| 0.7 | Grade oracle | `server/index.js` `POST /api/grade` returns 400 `{ error, reason: 'stage-test' }` for `challenge.isStageTest`. |
| 0.8 | Honest landing copy | `src/modules/landing/components/HowItWorks.tsx`: remove "You cannot skip ahead" and "Ten stages", using the `copy.landing.pathLine` default text statically. |
| 0.9 | Content stats | New `scripts/content-stats.mjs` (`--check`/`--write`, using `loader.build.mjs`), README markers `<!-- content-stats:start/end -->`, `package.json` description. Add `content:stats` to the `check` chain. New `scripts/vite-content-stats.mjs` `transformIndexHtml` plugin fills `%CC_LESSONS%` (rounded down to 10, with "+"), `%CC_TESTS%`, `%CC_STAGES%` and `%CC_TRACKS%` in `index.html` meta. |

Step 0.5 locations (line numbers are from the trust design; confirm when editing):
- `AuthModal.tsx:156`
- `Leaderboard.tsx:22-27`
- `Playground.tsx:398-400/486/493`
- `compilerService.ts:569-571`
- `SettingsPage.tsx:233-241` (row renamed "Sync")
- `Sidebar.tsx:180`
- `DashboardLayout.tsx:80`
- `SubscriptionModal.tsx:117`
- `CertificatePage.tsx:48`
- `VerifyPage.tsx:38`
- `PlaygroundPage.tsx:10`

**Tests**
- New `src/platform/xp-leveling/__tests__/insights.test.ts`: `stage-3` gives "Stage 03 cleared"; `stage-c1` uses its name.
- New `src/modules/challenges/__tests__/rules.test.ts`: `canRevealSolution` is false for every stage test and for test and assessment contexts.
- Extend `src/platform/execution/__tests__/compilerService.test.ts`: with `vi.mock('@/config/env')`, production text contains no `npm run`, `.env` or `Docker`.
- Extend `server/__tests__/index-guards.test.mjs`: the `/api/grade` source refuses `isStageTest`.
- New `server/__tests__/vite-config.test.mjs`: production build gives `sourcemap === false`.

**Manual checks**
1. `npm run build` leaves no `.map` files.
2. `/nope` and `/dashboard/nope` show the 404 page (with the sidebar in the dashboard).
3. A thrown render error shows the reference code.
4. With the API stopped, the production build shows no `npm run dev:api` text.
5. On a C/C++ fill-blank stage test and a code stage test there is no "Expected:" and no "Show me the solution".
6. The landing page no longer says "cannot skip" or "Ten stages".

---

### Phase 1: Foundations

**Scope:**
- the settings store and generic admin page
- day and time-zone helpers
- parameterized XP and levels
- extraction of the progress routes
- the `solvedAt` fix
- the activity log and failed-attempt store
- guest merge of activity
- a working "Most missed" report

Learners see no behaviour change except:
- correct days in their own time zone
- the "XP today" figure no longer inflated by re-solves
- heatmap days that do not move

**Migration (SCHEMA_VERSION 2)**
- `EMPTY` gains `settings` and `activity`.
- `migrateState` normalizes both.
- The `db.json.pre-v2-<ts>` backup is written.
- `deleteUser()` also removes `activity[id]`.
- New store functions:
  - `getSettingsRecord`, `setSettingsRecord`
  - `getActivity(userId)` (null when absent), `putActivity(userId, record)`, `allActivity()`, `deleteActivity(userId)`
- Bootstrap runs `activity.backfillAll()` once after `loadContent()`:
  - for users without `backfilledAt`, days are built from `attempts[*].solvedAt` in the fallback zone
  - `lessons` or `tests` comes from `isStageTest`; `xp ≈ xpForSolve(...)`
  - rows are marked `source:'backfill'`
  - the result is lossy (old `solvedAt` values were overwritten) and this is accepted
- Guests get the same backfill locally once, when `cq-activity-v1` is missing.

**Steps**

1. **Day helpers.**
   - New `src/platform/time/days.ts` and `__tests__/days.test.ts`.
   - `leveling.ts` `previousDayKey` → `addDays`.
2. **Parameterize leveling and insights.** Defaults must give identical outputs.
   - `leveling.ts`:
     - `export interface XpRules {retryPenalty, hintPenalty, scoreFloor, passScore, minXpPerSolve}` and `DEFAULT_XP_RULES`; keep `PASS_SCORE = DEFAULT_XP_RULES.passScore`
     - `scoreSolve(a, h, rules = DEFAULT_XP_RULES, cap = 100)`, `rawScore(a, h, rules)`, `isPassingSolve(a, h, rules)`, `xpForSolve(reward, a, h, rules, cap = 100)`
     - `interface LevelCurve {thresholds, overflowStep}`, `formulaThresholds(base, count)`, `DEFAULT_LEVEL_CURVE`
     - `xpForLevel(level, curve)`, `levelFromXp(xp, curve)`, `levelProgress(xp, curve)`
   - `insights.ts`:
     - `DEFAULT_RANKS`, `rankTitle(level, ranks)`, `nextRankLevel(level, ranks)`
     - `xpEarnedOn`/`solvedOn` stay as fallbacks
     - new `dayTotals(log, day)`
3. **Settings core.**
   - `src/platform/settings/{types,defaults,meta,merge,schema,copy,store,index}.ts`.
   - Sections in P1: `xp`, `levels`, `streak` (3 keys), `retention`.
   - New `src/platform/server-lib.ts` re-exports `settings/*` (including `schema`), `time/days`, `activity/log`, `grading-engine/misses` and `xp-leveling/leveling`.
4. **db.js migration** as above.
5. **Server settings.**
   - `server/settings.js`, `server/settings-routes.js`.
   - `bootstrap()` compiles `server-lib.ts` to `learning.mjs` and fills `learningDeps = { lib, settings, activity }`. `adminDeps.learning = learningDeps` (read per request, like `adminDeps.validateChallenge`).
   - Mount `app.use('/api', createSettingsRouter(...))`.
   - Health adds `settingsRevision`.
6. **Admin rules page.**
   - `AdminRules.tsx`, `components/settings/*`, the nav group "Learning" with "Rules & rewards", the `AdminApp.tsx` routes `rules` and `rules/:sectionId`, and the `adminApi` methods.
   - Custom `LevelsSection`:
     - "Generate curve" (base × levels, then overflow)
     - an impact line, "N learners would change level", computed from `settingsContext().levels.learnerXp`
     - a warning when the top rank is not reachable with `content.totalXp`
7. **Client settings plumbing.**
   - Move `hydrateStats` and `INITIAL_STATS` to `src/platform/session/stats.ts`.
   - Add `useSettingsState`, `useLeveling`, and `STORAGE_KEYS.settings`.
   - Switch level and rank call sites to `useLeveling()`:
     - `src/app/layout/Sidebar.tsx`
     - `src/modules/account/pages/SettingsPage.tsx`
     - `src/modules/achievements/pages/AchievementsPage.tsx`
     - `src/modules/dashboard/pages/DashboardHome.tsx`
     - `src/modules/landing/components/Gamification.tsx`
   - `PracticeModal.tsx`:
     - lines 246-247 pass `settings.xp`
     - the "costs 10% XP" text uses `settings.xp.hintPenalty`
     - the "pass mark" text uses `settings.xp.passScore`
   - `SessionProvider.completeChallenge`: the inline score (line 946) becomes `scoreSolve(..., settings.xp)`.
8. **Extract the progress routes (pure move).**
   - `server/progress-routes.js` `createProgressRouter({ requireAuth, store, learningDeps, getLeveling, getChallenge, getChallengeMerged, verifySubmission, completedStagesFor, clearDraftForSolve, onProgress })` takes `GET /progress`, `POST /solve`, `POST /merge` and `POST /reset` out of index.js.
   - `server/progress-rules.js` holds `applySolveCore`, `mergeCore` and `resetProgress`.
   - Write the **characterization tests first** (below).
9. **Server XP from settings.**
   - solve, merge, `recalc`, leaderboard and `/auth/me` (wrapped in `recalc`) use `settings.xp` and `settings.levels`.
   - `adminUserRow(user, deps)` computes the level with the settings curve when `deps.learning` exists, otherwise the stored level.
10. **`solvedAt` fix.**
    - Server: `solvedAt = previous?.solvedAt ?? now`, `lastSolvedAt = now`, `solves += 1`.
    - Client `completeChallenge` does the same.
    - `ChallengeAttempt` gains the optional `lastSolvedAt` and `solves`.
11. **Activity core** `src/platform/activity/log.ts` and `src/platform/grading-engine/misses.ts`, with tests.
12. **Server activity.**
    - `server/activity.js` `createActivityService({ lib, store, settings, getChallengeMerged })` returns `{ zoneFor, captureZone, todayFor, recordSolve, recordMisses, merge, view, reset, backfillAll }`.
    - The solve route writes the day row and returns `today`.
    - `server/activity-routes.js` `createActivityRouter({ requireAuth, activity, gradeAnswer, getChallengeMerged })` serves `GET /api/activity`.
    - `recalc` and the leaderboard use `todayFor`.
    - Reset clears `misses` and `missLog` (keeps `days`).
    - `api.ts` sends the `X-Time-Zone` header.
13. **Failed attempts.** `POST /api/activity/misses`:
    - Body `{ misses: [{ challengeId, answer?, code?: {passed,total}, context?, final?, at? }] }`, 1-50 items.
    - An unknown challenge gives 404 for a single item and is dropped in a batch.
    - A malformed answer (`normalizeMissAnswer` returns null) is dropped.
    - A non-code answer that `gradeAnswer` accepts gives 400: "That answer is correct - record it through /progress/solve."
    - Code requires `0 ≤ passed < total ≤ testCases.length`.
    - `at` is clamped to [now−7 days, now+5 minutes].
    - Caps: `missesPerDay` and `missesPerItemPerDay`.
    - Response `{ accepted, dropped, today, misses: {[id]: MissSummary} }`.
    - Client: `SessionProvider.recordMiss(challenge, { answer? , code? }, { context, final? })`, fire and forget.
      - Guests write to the local log only.
      - Signed-in online learners call `api.recordMisses`.
      - On `OfflineError` the entry is kept with `synced:false`.
    - `PracticeModal.handleCheck` calls `recordMiss` on a wrong answer.
    - `handleRun` calls it on `failed`, or on `error` with test results, and skips it when `result.engine === 'none'`.
14. **Client activity log.**
    - `useActivityLog`; context adds `activity`, `today`, `todayKey` and `recordMiss`.
    - `DashboardHome` "Earn 100 XP" reads `today.xp`, which fixes the re-solve inflation (the constants stay until P3).
    - The heatmap uses `activityGridFromLog`, falling back to `attempts`.
15. **Guest and offline merge.**
    - `mergeableGuestProgress` returns guests that have only misses.
    - login, signup, `adoptToken`, the `restoreSession` `localIsAhead` path (also true when any `synced:false` misses exist) and logout send `api.mergeProgress(progress, trimmedActivity)`.
    - The returned `activity` is adopted with `ownerId`.
16. **Admin analytics.**
    - `mostMissed` is rebuilt from `allActivity()`.
      - Rows: `{ id, title, stageId, learners, missedBy, missRate, totalMisses, revealed, topWrong:[{key,label,count}] }`.
      - Threshold: `retention.mostMissedMinLearners`.
      - The existing keys `attempts` and `solved` are kept for compatibility.
    - `GET /analytics/challenges/:id/misses` returns the answer distribution (top 10) and the last 20 entries.
    - `GET /users/:id/learning` returns `{ timeZone, days (98), misses (top 20) }`.
    - `AdminAnalytics.tsx`: a drawer on "Most missed" rows.
    - `AdminUsers.tsx`: a "Learning" row action with a Drawer.
17. **Docs.**
    - `docs/adr/0008-settings-store-and-activity-log.md`: settings are numbers and copy; content lives in `contentOverrides`; the time-zone rules.
    - Update `src/modules/admin/README.md`.

**Tests**

Pure tests in `src`:
- `src/platform/settings/__tests__/settings.test.ts`:
  - the defaults validate, and the defaults equal today's constants
  - merge semantics, including `__proto__` ignored
  - patch `null` prunes
  - refinements reject bad values
  - `publicSettings` drops `retention` and `access`
  - **every leaf of `DEFAULT_SETTINGS` has `SETTING_META`**
  - every text default uses only its tokens
- Extend `src/platform/xp-leveling/__tests__/leveling.test.ts`:
  - old outputs are unchanged with the defaults, for XP 0-80,000
  - custom rules work
  - `formulaThresholds`
- `src/platform/time/__tests__/days.test.ts`:
  - `2026-09-25T20:00Z` is the 26th in Asia/Kolkata and the 25th in America/Los_Angeles
  - Asia/Kathmandu, Pacific/Kiritimati and Pacific/Pago_Pago; a DST boundary
  - month and year rollovers; `isValidTimeZone`
- `src/platform/activity/__tests__/log.test.ts`:
  - a first solve against a re-solve
  - merging twice equals merging once
  - max semantics and union dedupe
  - pruning; backfill
- `src/platform/grading-engine/__tests__/misses.test.ts`: `normalizeMissAnswer` for each type (over-long blanks, unknown order lines) and `wrongAnswerKeys`.
- `src/platform/session/__tests__/stats.test.ts`: `hydrateStats` backfills an old v2 save.
- Extend `src/platform/api-client/__tests__/offline.test.ts`: the `X-Time-Zone` header is sent, and a throwing `Intl` does not break requests.
- Extend `insights.test.ts`: re-solving an old challenge does not move its heatmap day.

Server tests (real `db.js` with `node:fs/promises` mocked as in `drafts.test.mjs`; admin via a mocked `admin-auth.js` as in `admin-questions.test.mjs`):
- `server/__tests__/settings-routes.test.mjs`:
  - the public GET needs no auth and has no `retention`
  - admin GET and PUT: sparse storage, `null` reset, 400 unknown path, 409 stale revision, 422 issues with paths
  - revision increments; an audit row is written
  - a stored invalid section falls back and appears in `issues`
  - 401 without admin auth
- `server/__tests__/progress-routes.test.mjs`:
  - **characterization first**: 404 unknown, 422 wrong answer, 422 below pass mark, XP paid once, re-solve pays 0, merge re-prices, client `xp` ignored
  - then: a re-solve keeps `solvedAt`; the day row counts only awarded XP
  - changing `xp.passScore` moves the 422 threshold
  - merge with activity is idempotent; future and ancient timestamps are clamped
  - reset clears misses and keeps days
- `server/__tests__/activity.test.mjs`:
  - misses: 401, 404, 400 for a correct answer, the per-day caps, batch accept and drop counts
  - `GET /activity` returns days in the user's zone
  - the first header sets the zone; a change inside the cooldown is ignored; an invalid header is ignored; the day is monotonic across a zone flip
- `server/__tests__/db-migrate.test.mjs` (pure, in the style of `db-forget.test.mjs`): an old `db.json` gains `settings` and `activity` with progress deep-equal to before; `deleteUser` removes activity.
- `server/__tests__/admin-analytics.test.mjs`: `mostMissed` is filled from activity; the threshold setting applies; labels are correct.
- Update the `vi.mock('../db.js')` factories in `admin-ai.test.mjs`, `billing-routes.test.mjs` and `admin-questions.test.mjs` only if a route they call now touches `allActivity` or `getSettingsRecord`.
- Extend `index-guards.test.mjs`: index.js mounts `createProgressRouter` and no longer defines `app.post('/api/progress/solve'`.

**Manual checks**
1. On a copy of live `db.json`: `progress` is byte-identical after first start, and `db.json.pre-v2-*` exists.
2. Change `xp.passScore` to 70 in `/admin/rules/xp`. The server's 422 changes at once, and a learner tab's pass-mark text changes within 30 s.
3. Using DevTools location overrides, set Pacific/Auckland, then America/Los_Angeles, and solve near midnight. Check the day and streak.
4. Re-solve an old item. The heatmap day stays; today's `reSolves` goes up by 1; "XP today" is unchanged.
5. As a guest, miss and solve, then sign up. Days and misses appear. Log out and back in: nothing is doubled.
6. Signed in, stop the API, miss and solve, then restart. It syncs.
7. After three accounts miss an item, "Most missed" shows it and its drawer lists the wrong options.
8. Delete a user. Their activity is gone.

---

### Phase 1T: Trust and access hardening (after P1 step 6; parallel with P2-P6)

**Scope:** trust design (a) editable copy, (b) runtime numbers, (d) premium gate, (e) IP, rate limits and CORS, (f) password reset.

**Migration (next SCHEMA_VERSION)**
- `passwordResets: {}`; users gain `tokenVersion` (default 0).
- Store functions: `putPasswordReset`, `findPasswordResetByTokenHash`, `passwordResetsForUser`, `updatePasswordReset`, `prunePasswordResets`.
- `deleteUser` removes the user's reset records.

**Steps**

1. **Site copy.**
   - Add the `copy` section (§4.2) to settings.
   - `getCopy` and a `useCopy()` hook in `src/platform/settings`. Replace the P0 static texts with `getCopy('…')`, keeping `DevHint`.
   - `App.tsx` passes `messages` to `ErrorBoundary`; `NotFoundRoute` uses copy.
   - Landing templates `Hero.tsx`, `Footer.tsx`, `HowItWorks.tsx` and `FinalCTA.tsx` use `useContentStats()` (new in `src/platform/session`: `{ lessons, tests, stages, tracks, freeStages, premiumStages }`).
   - Landing mount sets `meta[name=description]` from `copy.meta.description`.
   - Server `copyText(key, vars)` in `server/settings.js`.
   - Admin custom `CopySection`: groups, token chips, and previews using `settingsContext().content`.
2. **Client IP.**
   - `server/client-ip.js`: `trustProxyFn(getHops)`, `clientIp(req)` (null when behind an untrusted proxy), `ipDiagnostics(req)`.
   - `app.set('trust proxy', trustProxyFn(() => settings.get('access.network.trustProxyHops')))`.
   - The access logger (index.js:150) and oauth `sourceKey` (`oauth-routes.js:255`) use `clientIp(req) ?? req.socket.remoteAddress`.
3. **Rate limits.**
   - `server/rate-limit.js`: `createLimiter`, `rateLimit(...)` middleware, `createExecutionSlots`.
   - Apply per §4.2 `access.rateLimit.*`:
     - register: `registerIp`, `registerGlobal`
     - login: `loginIp`; `loginAccount` peeked before `bcrypt.compare`, hit on failure, reset on success
     - execute: `executeAccount`, `executeIp`, plus slots
     - solve: `solveAccount`; `verifySubmission` runs in slots
     - password change: `passwordChangeAccount`
     - new write routes: `writeAccount`
   - 429 `{ error: copyText('limits.tooMany',{minutes}), reason:'rate-limited', retryAfterSeconds }` plus `Retry-After`.
   - `BusyError` → 503 `{ status:'error', engine:'none', reason:'busy', stderr: copyText('limits.busy'), testResults: [] }`.
   - Client: `ApiError` gains `reason` and `retryAfterSeconds`.
     - `compilerService` maps 429 and busy to an error result.
     - The solve path treats 429 as "saved locally, will sync".
4. **CORS.**
   - `server/cors-policy.js`: `corsMiddleware()` with `allowedHeaders: ['Content-Type','Authorization','ngrok-skip-browser-warning','X-Time-Zone']`, plus `foreignOriginGuard()` mounted just before `createWebhookRouter`.
   - Mode `report` by default.
5. **Premium gate.**
   - `server/billing.js`: `premiumStageIds`, `stageAccessFor(user, ctx)` and `premiumGate(user, challenge, ctx)`.
   - `server/progression.js` `checkSolveAccess(user, challenge, ctx)` (premium part only in this phase).
   - Gate the solve route (403 `{reason:'premium-locked', stageId}`), merge (→ `skippedLocked`) and `/api/grade`.
   - `access.premiumGate = 'log'` logs and counts instead of blocking.
   - `server/content.js` `lockedStub(challenge)`. `GET /api/content` returns stubs for stages the viewer cannot open, plus `lockedStageIds`, with `Cache-Control: private, no-store` and `Vary: Authorization`.
   - Client:
     - `content.ts` carries `lockedStageIds`.
     - `SessionProvider.reloadContent()` runs after login, signup, `adoptToken`, logout and `refreshAccount`.
     - A 403 `premium-locked` rolls back like a 422.
     - A merge toast appears for `skippedLocked`.
     - `PracticeSessionProvider` treats `challenge.locked` like `isPremiumLocked`; `ChallengeLibrary` shows "Unlock to view".
6. **Token version.**
   - `server/auth.js` `signLearnerToken` adds `tv`; new `learnerTokenIsCurrent(payload, user)`.
   - Used in `optionalAuth` (index.js:244) and oauth `learnerFor`.
7. **Password reset.**
   - `server/password-reset.js`: `hashResetToken`, `issuePasswordReset`, `inspectPasswordReset`, `claimPasswordReset` (synchronous `usedAt`), `createPasswordResetRouter`.
   - Learner routes `/api/auth/password-reset/inspect` and `/api/auth/password-reset`. A reset bumps `tokenVersion`, and the response has the same shape as login.
   - Admin routes as in §4.9; the audit never contains the token.
   - `src/config/routes.ts` gains `resetPassword: '/reset-password'` (also in `STATIC_ROUTES`).
   - New `src/modules/account/pages/ResetPasswordPage.tsx`: token read from `#token=` and then removed from the URL.
   - `api.ts` gains `inspectPasswordReset` and `resetPassword`.
   - Admin `components/PasswordResetDialog.tsx` in `AdminUsers`, plus an "Active reset link" badge (`adminUserRow.activeResetLink`).
8. **Limits & access page.**
   - The `access` section as a custom `AccessSection`:
     - a generic form for every key
     - a live card from `GET /api/admin/access/status` with IP diagnostics, limiter status and top keys (each with an Unblock button that calls `POST /access/rate-limits/reset`), slot stats, the CORS allowlist with each origin's source and recent rejected origins, and premium blocks since boot
   - `AdminBilling.tsx` shows a read-only "Server-side premium lock: Enforced / Logging only" line.

**Tests** (per the trust design, renamed to the unified store)
- `rate-limit.test.mjs`, `client-ip.test.mjs`, `cors-policy.test.mjs`
- `settings-routes.test.mjs` additions: `access` validation (ranges, origins normalization, env precedence)
- `password-reset.test.mjs`: including a concurrent double submit where exactly one gets 200
- `auth-token-version.test.mjs`
- `premium-gate.test.mjs`: free, guest, lifetime, track, stage, revoked, override; `lockedStub` drops every answer field
- `db-migrate.test.mjs` additions
- `index-guards.test.mjs` additions:
  - `premiumGate(` appears in solve, merge and grade
  - `lockedStub` plus `no-store` in `/api/content`
  - no bare `cors()`
  - `trust proxy` is set
  - the logger no longer reads `cf-connecting-ip`
  - `limiter.peek('login.account'` comes before `bcrypt.compare`
- `src/platform/settings/__tests__/copy.test.ts`: `fillCopy` with known and missing tokens
- `src/platform/session/__tests__/content.test.ts`: stubs group into stages; `lockedStageIds` is kept

**Manual checks**
1. Through the Vercel URL, Limits & access shows your real public IP. `curl` straight to ngrok shows the difference.
2. Wrong-password loops give 429 with the friendly text; Unblock clears it.
3. The CORS rejected-origins list stays empty after a few days of normal use. Then switch to `enforce`.
4. As a guest and as a non-buyer, POST a solve for a premium item: 403. As a buyer: 200. A guest merge containing a premium id is reported in `skippedLocked`.
5. The `/api/content` response through Vercel has the `no-store` and `Vary` headers.
6. Issue a reset link, open it in a private window and set a password. The old session elsewhere is signed out, and the link cannot be used twice.
7. Edit `copy.offline.banner`. The offline banner changes without a redeploy.

---

### Phase 2: Units and celebrations (with badges, sound and the level curve)

**Migration (next SCHEMA_VERSION)**
- `contentOverrides.units: {}`.
- Progress `unitsCompleted` is filled lazily through `normalizeProgress`.
- `users[].preferences` is normalized (the whole shape from §4.4, all null).
- Store functions: `getUnitOverride(stageId)`, `setUnitOverride(stageId, record|null)` (with `defineEntry`).
- **Level default change:** `levels.thresholds` and `levels.overflowStep` get the retuned defaults (owner decision 2). A property test proves no learner loses a level.

**Settings added:** the `units`, `celebrations` and `badges` sections, and the retuned `levels` defaults.

**Steps**

1. **Units core.** `src/platform/progress/units.ts`:
   - `defaultUnits(stageId, lessons, cfg)`:
     - runs are split by batch letter `^<stageId>-([a-z])\d`; non-matching ids go into batch `x`
     - chunk count `k = max(ceil(n/maxSize), round(n/targetSize))`, balanced
     - a trailing chunk smaller than `minSize` merges into the previous unit if that stays ≤ `maxSize`
     - ids are `${stageId}:${letter}${k}`
   - `resolveUnits(stageId, lessons, override, cfg)`:
     - drops unknown or hidden ids and empty units
     - excludes the stage test
     - puts unassigned lessons in a trailing `${stageId}:auto` unit
     - unit order becomes lesson order
   - Also: `unitStates`, `unitFor`, `estimateMinutes`, `validateUnitOverride`.
2. **Server units.**
   - `server/units.js` `createUnitsService({ store, lib, settings })` returns `{ unitsForStage, unitFor, attachUnits(merged) }`, cached per content snapshot, overrides and settings revision.
   - `GET /api/content`: each stage gains `units: UnitDef[]`, computed after `applyLearnerOverrides`, so hidden lessons are excluded.
   - Admin routes `GET`, `PUT` and `DELETE /content/stages/:id/units`:
     - hidden lessons are included in validation
     - 422 `{ error, issues }` for: an unknown or foreign id, the stage test, a duplicate, a lesson missing from every unit, a name empty or over 60 characters, a description over 200 characters, more than 40 units, a unit with 0 or more than 30 items, a malformed unit id
     - warnings for size or time outside the targets
     - new units get `${stageId}:m${nextSeq++}`
     - audit `content.units.update` and `content.units.reset`
   - `GET /content/stages` rows gain `unitCount` and `unitsCustomized`.
3. **Admin units editor.**
   - `pages/AdminUnits.tsx` (route `stages/:stageId/units`, opened from a "Units" button on `AdminStages` rows).
   - Unit cards: name, description, a meta line ("6 questions · ~7.5 min · 330 XP"), question lists with ↑ ↓ / ← → / "Split here", merge, add, and delete-if-empty.
   - A "Not in a unit" panel, a default-grouping preview, and Reset (`ConfirmDialog`).
   - Pure helpers in `services/unitEditing.ts`: `moveQuestion`, `moveAcross`, `splitAt`, `mergeWithNext`, `addUnit`.
4. **Client units** (static end screen first).
   - `src/platform/session/content.ts`:
     - `groupIntoStages` attaches `units` from the API `UnitDef[]`
     - new `withUnits(stages, cfg, cachedDefs)` handles bundled or offline content using `cq-unit-defs-v1`, else defaults
   - `PracticeSessionProvider.tsx`:
     - `activeUnitId`, derived `activeUnit`, `unitPosition`, `nextUnit`
     - `openUnit(stageId, unitId)` checks premium, then the stage lock, then the unit lock
     - exported pure `resolveOpenTarget(stage, completed, challengeId?)`
     - `activeChallenges` in lesson mode is the unit's challenges
     - the stage test is unchanged
   - `LearningPath.tsx`: a `UnitNode` rail with check, star, number or lock markers, a "5 questions · ~6 min · +250 XP" line and "3/5" progress. It calls `intents.openUnit`.
   - `PracticeModal.tsx`:
     - scoped to the unit: header `Stage 03 · Data Structures · Unit 2 of 4`, the last button "Finish unit"
     - new `session/useUnitRun.ts` snapshots XP, level, streak and badges at open, and counts checks, first-try correct answers, hints and active time
     - new `components/lesson/UnitComplete.tsx`
5. **Rewards core.** `src/platform/xp-leveling/rewards.ts`:
   - `applyUnitRewards(before, after, {challengeId, firstSolve, now}, {cfg, unitFor})`
   - `applyMergeUnitRewards(...)`
   - `isPerfectUnit(unit, attempts, cfg)`
   - A bonus is paid only when a first solve completes a unit whose id is not yet in `unitsCompleted`. "Perfect" means every lesson has `attempts === 1`, and `hintsUsed === 0` when `perfectRequiresNoHints` is on.
   - `perfectUnits` for badges = the union of records and derived perfect units, so a later replay cannot remove a badge.
6. **Wire rewards on the server** (pipeline §4.8 steps 9-10, merge step 4).
   - The response adds `bonuses`, `bonusXp` and `unitCompleted`.
   - Day `units` and `perfectBonusXp`.
7. **Preferences route.**
   - `server/preferences-routes.js` with `soundOn` only.
   - The merge adopts guest `preferences.soundOn` where the account's value is null.
   - `publicUser.preferences`.
8. **Client rewards.**
   - `completeChallenge` returns `SolveOutcome { solveXp, perfectBonusXp, totalXp, unitCompleted, perfect, verifiedByServer }` and uses `applyUnitRewards` optimistically.
   - Confetti uses `celebrations.confetti.*` and fires only when `totalXp > 0` unless `onReSolve` is on.
   - `options.deferCelebrations` suppresses toasts while inside a unit run.
   - It adopts the server's `unitsCompleted`, `bonuses` and `bonusXp`.
9. **Celebration UI.**
   - `src/ui/primitives/ProgressRing.tsx` and `StreakFlame.tsx` (props only; CSS animation; `prefers-reduced-motion` disables motion).
   - `src/ui/celebrations/{XpCountUp,LevelUpOverlay,BadgeTierChip}.tsx` (separate entry `@/ui/celebrations`; `XpCountUp` uses `requestAnimationFrame`).
   - `UnitComplete` shows the XP count-up, accuracy, time, streak flame (animated only when the streak went up), the perfect line from `celebrations.copy.perfect` (or "Flawless run" on a replay), new badges with tiers, an sr-only `role="status"` summary, and "Saved on this device, will sync" when offline. Actions:
     - "Continue: {next unit}" when the next unit is open
     - "Take the stage test / Later" after the last unit
     - otherwise "Replay unit / Back to the path"
   - The same count-up and confetti appear on the stage-cleared view.
   - `LevelUpOverlay`: `role=dialog`, `useFocusTrap`, closes on Enter or Esc, shows a "New title" line when the rank changed.
10. **Sound.**
    - `src/platform/sound/sfx.ts` `playSfx(event, {volume})` with WebAudio tones. The context is lazy and resumed if suspended; it is a no-op without WebAudio (and handles `webkitAudioContext`).
    - `SessionProvider` adds `soundOn`, `setSoundOn` and `playSound`. `soundOn` resolves from `preferences.soundOn`, then the local preferences key, then `celebrations.sound.defaultOn`.
    - A mute button (`Volume2`/`VolumeX`) in the `PracticeModal` header, and a "Sound effects" `Switch` in `SettingsPage`.
11. **Badge tiers.**
    - `insights.ts` `achievements(stats, stages, badges)` adds `tier`, `tierName`, `family` and `progress`, keeping existing ids.
    - `badgeProgress(...)`.
    - The `AchievementsPage` family cards show a tier chip, pips and `ProgressBar`.
    - `DashboardHome` shows "Next badge" with progress.
    - `badgeWatcher.useNewBadges` reseeds its "seen" set when `settingsRevision` changes.
12. **Docs.**
    - `docs/adr/0009-units-and-celebrations.md`
    - a units note in `docs/CONTENT_AUTHORING.md`
    - `SkillRoadmap` time estimates switched to `units.minutesByType`

**Tests**
- `src/platform/progress/__tests__/units.test.ts`:
  - `defaultUnits` gives 10→5/5, 12→6/6, 11→6/5, 15→5/5/5, 17→6/6/5
  - small-tail merging; id format
  - `resolveUnits` rules; `unitStates`
  - every issue and warning from `validateUnitOverride`
- `src/modules/challenges/__tests__/units-bank.test.ts` (real `ALL_CHALLENGES`): every core stage gives 4 units, C and C++ give 3, all units have 5-8 items, 46 in total, and the flattened units equal the authored order.
- `src/modules/challenges/__tests__/practiceSession.test.ts`: `resolveOpenTarget`.
- `src/platform/xp-leveling/__tests__/rewards.test.ts`: paid once per unit; no bonus without a first solve; perfect requires no hints; merge pays only for units completed by new ids.
- Extend `leveling.test.ts`: **the property `levelFromXp(x, retuned) >= levelFromXp(x, formula)` for x = 0..100,000 in steps of 50**; the top rank is reachable at ≤ free content XP.
- Extend `src/modules/achievements/__tests__/badges.test.ts`: tiered badges, stable ids, no toast burst after a reseed.
- `src/platform/sound/__tests__/sfx.test.ts`: no throw without `AudioContext`; no context is built when muted.
- `src/modules/admin/__tests__/unitEditing.test.ts`: every operation keeps each id exactly once.
- `server/__tests__/units-admin.test.mjs`: real `loadContent()`, 60 s timeout.
- Extend `progress-routes.test.mjs`: perfect bonus plus `unitCompleted`; the merge bound; level follows a custom curve.
- `preferences.test.mjs`: `soundOn` validation, `null` reset.
- `db-migrate` additions.

**Manual checks**
1. As a guest with the API stopped: default units, end screen, confetti only when XP > 0, and a replay gives no confetti.
2. Sign in. The merged XP equals the leaderboard figure.
3. Regroup and rename stage-3 units in admin. The learner path shows the change after a reload. Hiding a question shrinks its unit.
4. Set `units.perfectBonusXp` to 40. The next perfect unit pays 40.
5. The level curve change shows in the sidebar, dashboard and admin users level. Nobody drops a level.
6. Mute persists across reload and across sign-out and sign-in.
7. The stage test stays locked until every unit is done. Premium units stay locked.
8. `LevelUpOverlay` works with the keyboard only.
9. Check the layout at 375 px, in dark mode and with reduced motion.
10. The build's shell chunk does not import a motion chunk.

---

### Phase 3: Daily goal, streak, freezes and repair, time-zone preferences, in-app reminders

**Migration (no new top-level key)**
- `progress.habit` is created lazily through `normalizeHabit(raw, progress, settings)`:
  - `runStart = addDays(lastActiveDay, -(streak-1))`
  - `freezes = freeze.startingCount`
  - arrays trimmed to `runsKept` and `activityDaysKept`
- The first write persists it. The first settle after deploy may open a repair offer for a run broken within `repair.windowDays`; this is intended.

**`HabitState`** (`src/types/index.ts`):
```
{ v: 1, freezes, freezeProgress, settledThrough, frozenDays: string[], repairedDays: string[],
  repair: null | { lostStreak, lostRunStart, missedDays: string[], expiresDay, required, done },
  runStart, runs: [{ start, end, length, ended: 'missed'|'reset'|'admin' }] }
```

**Settings added:** the `goals` and `reminders` sections, and the P3 keys in `streak`.

**Steps**

1. **Pure engine** `src/platform/habits/`: `streak.ts`, `goals.ts`, `types.ts`, `index.ts` (re-exported from `server-lib.ts`).

   **`settle(state, today, rules)`** walks each missed day from `max(lastActiveDay, settledThrough)+1` to `today−1`:
   - Freezes are used greedily, day by day, while `freezes > 0`.
   - When none are left, the streak breaks: the run is saved with `ended:'missed'`, a repair offer opens if the gap ≤ `windowDays` (`required = lessonsPerMissedDay × missed days`), and `streak = 0`.
   - An open repair grows with further missed days and expires when `today > expiresDay`.
   - Settling day by day gives the same result as settling at once.

   **`applySolve(state, { today, day, goal, rules, passing })`** settles first, then:
   1. **Repair:** `done += 1`. When complete, `streak = lostStreak + streak` and the matching run is removed.
   2. **Streak day:** if the day counts under `dayRule`, the streak grows by one, `lastActiveDay` becomes `today`, and `bestStreak` is updated.
   3. **Goal:** on first meeting it, `day.goal` is snapshotted, `freezeProgress` advances (not while holding `maxHeld`), and the events are recorded.

   **`habitStatus(...)`** is read-only: it settles a copy and returns `HabitStatus` (streak, at-risk flag, freezes, repair, goal progress, days away).

   **Goals:**
   - `effectiveGoal(dailyGoalId, goals)` falls back to the default option but keeps the stored choice.
   - `goalProgress(day, goal)`: `xp → day.xp`, `lessons → day.lessons + day.reviews`, `units → day.units`.

   Frozen and repaired days bridge a gap but do not add to the count.
2. **Server glue** `server/habits.js`:
   - `recordSolveHabits(...)` (pipeline step 11):
     - applies the goal bonus from the option's `bonusXp` to `progress.xp` and `day.goalBonusXp`, once per day
     - returns `habitEvents: { goalMet, freezeEarned, repaired, bonusXp }`
   - `mergeHabitsFor(...)` (merge step 6), `habitSummary(...)`, `streakFor(user, progress)`.
   - Solve and merge replace `nextStreak`.
   - `recalc`, `/auth/me` and the leaderboard use `streakFor` (freezes applied, the learner's own zone). `adminUserRow` does the same when `deps.learning` exists.
   - Reset: fresh habit, keeping `runs` and closing the current run as `'reset'`.
3. **Preferences.**
   - `PATCH /api/me/preferences` accepts `dailyGoalId` (an enabled option id or null; otherwise 400 "That goal is not available.") and `timeZone` (`isValidTimeZone`; cooldown → `applied.timeZone:false`).
   - The merge adopts the guest's `dailyGoalId` where the account's is null.
4. **Client plumbing.**
   - Types; `api.ts` `updatePreferences`; solve response types.
   - The `habit:*` events.
   - `src/platform/session/useHabitState.ts`:
     - derives `habits: HabitStatus`
     - emits each `habit:*` event once, stored in `cq-habit-seen-v1`
     - rolls the day at local midnight
   - `SessionProvider`:
     - `habits`, `goalOptions`, `dailyGoal`, `setDailyGoal(id)`
     - **the raw-streak overwrites at lines 198, 769, 995 and 1060 are removed**; display sites use `habits.streak`
     - `completeChallenge` applies `applySolve` locally
     - signed-in learners get the goal bonus only from the server's `habitEvents.bonusXp`
     - on restore, if the browser zone differs from the account's, it calls `updatePreferences({timeZone})` (failures are queued in `preferences.pendingSync`)
5. **UI primitives.**
   - `src/ui/primitives/ChoiceCards.tsx` (goal picker; P5 reuses it), `StreakStrip.tsx`, `GoalMetCard.tsx`. `ProgressRing` and `StreakFlame` already exist from P2.
6. **Shell.**
   - New `src/app/layout/HabitChip.tsx`: flame plus goal ring, with an aria-label like "12-day streak, at risk. Daily goal 40 of 100 XP". Placed in the `Sidebar.tsx` identity block and in the `DashboardLayout.tsx` mobile top bar.
   - New `src/app/layout/HabitBanner.tsx`: one banner at a time, in priority order: welcome back, streak broken/repair, freeze used, at risk. Each can be dismissed for the day; text comes from `reminders` through `fillCopy`.
   - New `src/app/HabitToaster.tsx`: mounted after `<BadgeToaster />`.
7. **Pages.**
   - `DashboardHome.tsx`:
     - delete `DAILY_SOLVES`, `DAILY_XP` and the `goals` array
     - add a goal card: ring, "40 / 100 XP", option label, **Change** (ChoiceCards), "Freezes 1/2 · next in 3 goal days", a 14-day `StreakStrip`
     - header line shows at-risk or goal-met text
   - `SettingsPage.tsx`: a Daily goal row, and a Time zone row with "Use this device's time zone".
   - `PracticeModal.tsx`: `useAppEvent('habit:goalMet')` with `source:'solve'` shows `GoalMetCard` ("One more" / "Done for today"). The `UnitComplete` goal ring and "Daily goal reached +N" line.
   - `AchievementsPage.tsx`: a Streak history section (current run, best run, past runs, 30-day strip).
   - `Gamification.tsx` uses the default option's label.
8. **Admin.**
   - Sections `goals`, `streak` (with a live worked example, e.g. "Miss 1 day with 1 freeze → protected") and `reminders` (custom `RemindersSection` with sample-value previews and a tier editor).
   - `GET /api/admin/analytics/engagement` → `{ goalChoice, metGoalToday, atRiskNow, avgStreak, freezesHeld, freezesUsed7d, repairsOpen, repairsDone7d, learnersWithTimeZone }`. It is shown as "who this affects" on these sections and as an "Engagement" card on `AdminDashboard`.
   - `GET /users/:id/learning` adds `{ preferences, habit, summary }`.
   - `PATCH /api/admin/users/:id/learning` accepts `{ freezes (0..maxHeld), streak: {value 0-400, lastActiveDay ≤ today}, dailyGoalId, clearTimeZone: true }`, audited as `learning.user.update` with from/to values.
   - The `AdminUsers` drawer gets a Habits tab; the users table gets Streak (derived) and Goal columns.
9. **Docs:** `docs/adr/0010-habits-and-time-zones.md`.

**Tests**
- `src/platform/habits/__tests__/streak.test.ts`:
  - greedy freezes; 3 missed days with 2 freezes gives 2 frozen, then a break and a repair offer
  - settling day by day equals settling at once; settle is idempotent
  - repair succeeds, expires, and grows
  - freezes are earned every N goal days and capped
  - each `dayRule`; freezes disabled
  - moving west clamps to the same day
  - `normalizeHabit` backfills an old row
- `src/platform/habits/__tests__/goals.test.ts`:
  - fallback when an option is disabled or unknown
  - the xp metric ignores 0-XP re-solves
  - `lessons` counts reviews
  - a met goal stays met after the goal is changed
- `server/__tests__/habits-solve.test.mjs` (real store): the goal bonus is paid once per day; a freeze arrives on the 7th goal day; a repair completes.
- Extend `preferences.test.mjs`: goal and zone validation, cooldown.
- `server/__tests__/admin-learning.test.mjs`: the PATCH is range-checked and audited.
- Extend `index-guards.test.mjs`: the solve source calls `recordSolveHabits(` and no longer calls `leveling.dayKey()`.

**Manual checks**
1. Set the device to Los Angeles and solve near local midnight; then repeat with Kiritimati.
2. With a scratch `DATA_DIR` and the system clock moved: a 1-day miss with a freeze is protected; a 2-day miss without one breaks; repair within the window works; a repair expires.
3. Meeting the goal shows the card, a toast and the bonus once. A freeze arrives on the 7th goal day.
4. A guest who signs up keeps goal and streak.
5. An offline solve syncs after reconnecting.
6. Every admin field saves and resets.
7. At mobile width the chip fits, the banner does not overflow, and targets are ≥ 44 px.

---

### Phase 4: Feedback that teaches, requeue, Learn mode everywhere, review, concept cards

**Migration (next SCHEMA_VERSION)**
- `conceptCards: {}` and `reviewSessions: {}`.
- Progress `review: {}` is lazy; items without an entry get a derived state (`reviewStateOf`).
- `contentOverrides.challenges[id]` may gain `optionFeedback`, `blankFeedback` and `feedbackBasis`.
- `deleteUser` removes `reviewSessions[id]`.

**Settings added:** the `feedback` and `review` sections.

**Steps**

1. **Content schema.**
   - `src/types/index.ts`: `Challenge.optionFeedback?: string[]`, `Blank.wrongAnswers?: {answer, feedback}[]`, `FeedbackNote`.
   - `src/modules/challenges/schema.ts`:
     - lengths must match `options`
     - option feedback only on quiz, output_prediction and multi_select
     - a wrong answer must not pass `checkBlank`
     - a wrong answer must be among the choices when the blank has `choices`
   - `server/custom-challenges.js` `normalizeChallengeInput` pads or truncates feedback and uses issue paths `optionFeedback.<i>` and `blanks.<i>.wrongAnswers.<j>`.
   - QuestionWizard `OptionsEditor` and `BlanksEditor` get fields; `KNOWN_PATHS` and `validateLocally` are updated.
2. **Feedback logic.**
   - New `src/platform/grading-engine/feedback.ts`: `optionNotes`, `blankNotes`, `feedbackLeaks`. `wrongAnswerKeys` is reused from P1 `misses.ts`.
   - Registry: `AnswerTypeDefinition.feedback`, `registry.feedbackNotes`.
   - Renderers:
     - `OptionsChallenge`: only the learner's wrong pick is marked, ruled-out options are struck through, notes linked with `aria-describedby`, and "Some correct answers are missing" for multi_select
     - `FillBlankChallenge`: "Expected:" only when `reveal`
     - `PseudocodeOrderChallenge`: the correct order only when `reveal`
   - `PracticeModal`:
     - extract `components/lesson/useAttemptFlow.ts` and `components/lesson/FeedbackBanner.tsx` (replacing lines 822-888)
     - `effectiveAttemptBudget(challenge, context, learningMode, settings)` in `src/platform/settings/budget.ts`: no limit on tests; `min(budget, options−1)` for single choice; at least 1
     - a wrong answer calls `recordMiss(…, { final })`; the final wrong answer reveals
     - footer: "Try again · N left", then "Continue"
     - the solution button uses `canRevealSolution` plus `solutionAfterFailedRuns`
3. **Requeue.**
   - New `src/modules/challenges/session/queue.ts`: `Slot`, `initialSlots`, `requeue`, `dropSolved`, `reachableSlotIndex`.
   - `PracticeSessionProvider`:
     - `slots`, `deferred`, `history`, `deferCurrent()`
     - `activeChallenges` expands the slots (duplicates allowed)
     - it works on the active unit from P2
   - The `PracticeModal` reset effect is keyed on `${index}:${challenge.id}`; requeued dots render after a divider.
   - `UnitComplete` adds "N first try · M fixed on retry".
   - Server solve accepts `requeued` (skips the pass-mark 422) and `revealed` (caps the score at `feedback.requeue.maxScoreAfterReveal[learningMode]`).
   - Optimistic XP uses the same cap.
   - A correct answer below the pass mark on the first pass of an answer-type item becomes a requeue instead of "Retry lesson".
4. **Learn mode everywhere.**
   - `PracticeModal.tsx:65-66`: remove `hasLearnContent`, so `learnMode = !isTestMode && learningMode === 'learn'`.
   - The switch shows on every lesson, and the "Practice only" pill is removed.
   - `readingSlot(challenge, close, { defaultOpen })`: `App.tsx` passes `defaultOpen` into `ReadingPanel` when Learn mode is on and `feedback.learnOpensReading`.
5. **Feedback overrides for built-in questions.**
   - `server/content.js` `feedbackBasisOf(c)`; `applyChallengeOverride` applies the feedback fields only when the stored basis equals the current basis.
   - `PATCH /content/challenges/:id` accepts `optionFeedback` and `blankFeedback` (400 on type mismatch, length mismatch, >600 characters, or an accepted wrong answer), stores `feedbackBasis`, and returns `{ override, warnings }`.
   - PUT (admin.js:510) also clears the three fields.
   - `toRow` adds `optionFeedback`, `wrongAnswers`, `feedbackStale` and `conceptKey`.
   - The wizard saves through PATCH when only presentational fields changed on a built-in question.
6. **Lint and AI.**
   - `scripts/lint-content.mjs` warnings: `feedback-leak`, `feedback-restates-option`, `feedback-thin`, plus a coverage line.
   - `ai-questions.js` `DRAFT_SCHEMA`, `KIND_CONVENTIONS` and `coerceDraft` gain feedback fields; new `draftFeedback`.
   - Routes `POST /ai/feedback` (1-10 ids; 503 when Gemini is not configured) and `POST /content/challenges/feedback` (bulk, at most 50).
   - New `pages/AdminFeedback.tsx`: coverage per stage; filters for missing, stale, leaking, and most missed first; "Draft with Gemini"; accept, edit or reject; "Save accepted".
7. **Misses in review terms.** `POST /api/activity/misses` with `final: true` increments `revealed` and resets `progress.review[id]` to `wrongResetsToBox`.
8. **Review core.** `src/platform/review/`:
   - `schedule.ts`: `reviewStateOf`, `applyReviewResult` (outcome is `clean` → box+1, `assisted` → same box, or `missed` → `wrongResetsToBox`; the box is clamped when intervals shrink)
   - `session.ts`: `buildReviewSession({ progress, activity, bank, settings, today, seed })`
     - buckets in priority order: open mistakes (last miss before today, inside the window), then due items, then weak items
     - solved, non-test, allowed types only; shuffled with a seed
   - `xp.ts`: `reviewXpFor(...)` (once per item per day, `dailyCap`, session bonus under the cap)
   - `reviewSummary(...)`
9. **Review routes.** `server/review-routes.js` `createReviewRouter({ requireAuth, learningDeps, visibleBankFor, verifySubmission, getChallengeMerged })`:
   - `POST /api/review/session`:
     - body `{ stageId? }`; an invisible stage gives 400
     - response `{ sessionId, items, xp: { remainingToday } }`, or `{ sessionId: null, items: [], nextDueDay }`
   - `POST /api/review/answer`:
     - body `{ sessionId, challengeId, answer?|code?, attempts 1-10, hintsUsed 0-10, revealed? }`
     - 404 when the session is missing or expired; 400 when the item is not in the session
     - the outcome is decided by the first answer; replays return `awardedXp: 0`
     - effects: the streak (P3 `applySolve` with `passing`), day `reviews` and `reviewXp`, `misses[id].open = false` on a clean answer
     - response `{ correct, outcome, awardedXp, bonusXp, xpRemainingToday, progress }`
   - `visibleBankFor(user)` = learner view minus locked premium stages, stage tests and types not in `itemTypes`.
   - The merge accepts `reviewLog` (merge step 7).
10. **Review client.**
    - `review:open` intent.
    - `SessionProvider`: `reviewSummary`, `startReview(scope)`, `completeReview(...)`; guests and offline learners build sessions locally with id `local-<ts>` and log to `unsynced.reviewLog`.
    - `PracticeMode 'review'`: title "Practice", no gating, no concepts, budget `review.attemptsBeforeReveal`.
    - New `components/lesson/ReviewComplete.tsx`.
    - Entry points: a Practice card on `DashboardHome` ("6 to practise: 2 mistakes, 4 due" / "All caught up"), a Practice row on `LearningPath`, and "Practice this stage" on completed stages.
11. **Concept cards.**
    - `server/concept-cards.js`: `normalizeConceptInput`, `generateConceptKey`.
    - `applyConceptCards(challenges)` inside `applyLearnerOverrides`.
    - Admin routes: `GET /content/concepts?stageId=`, `POST /content/concepts/validate`, `POST /content/concepts` (409 when the lesson already has one), `PUT /content/concepts/:key` (`showAgain` → `-r<N>` id), `POST /content/concepts/:key/revert`, `PATCH /content/concepts/:key` (hidden), `DELETE /content/concepts/:key` (created cards only), and optional `POST /ai/concept`.
    - `adminDeps.validateConcept` comes from `ConceptSchema`.
    - New `pages/AdminTeaching.tsx` and `components/ConceptEditor.tsx`. Anchors: a lesson, the start of a stage, or the start of a unit (P2 unit ids).
12. **Analytics.** `GET /analytics` adds `practice: { learners7d, xp7d }`; `AdminAnalytics` gets a "Practice (7 days)" card and "Edit feedback" row actions.
13. **Docs.**
    - `docs/adr/0011-feedback-and-review.md`
    - `docs/CONTENT_AUTHORING.md`: feedback fields, the no-leak rule, concept cards

**Tests**
- `src/platform/grading-engine/__tests__/feedback.test.ts`
- `src/platform/settings/__tests__/budget.test.ts`
- `src/platform/review/__tests__/schedule.test.ts` and `session.test.ts`
- `src/modules/challenges/__tests__/queue.test.ts`
- Extend `registry.test.ts`: `feedbackNotes` and the schema rules.
- Extend `leveling.test.ts`: the cap.
- `server/__tests__/review-routes.test.mjs`: XP once, idempotent replay, daily cap, bonus once, expiry, streak update.
- Extend `progress-routes.test.mjs`: `requeued` and `revealed`.
- Extend `activity.test.mjs`: `final` resets the box.
- Extend `admin-questions.test.mjs` (add the new store functions to its db mock): feedback PATCH, stale basis, PUT clears the fields, bulk save.
- `admin-concepts.test.mjs`
- Extend `custom-challenges.test.mjs` and `ai-questions.test.mjs`.
- `db-migrate` additions.

**Manual checks**
1. **Quiz in Practice mode:**
   - the first miss shows only the learner's pick in red, strikes it through, and shows its note
   - the second miss reveals the answer, and "Continue" requeues the item
   - the item comes back at the end, and a correct answer pays capped XP that equals the server's figure
2. **Learn mode on a lesson with no concept:** the reading panel opens and the first miss explains the answer.
3. **Fill-blank and ordering items:** no answer is shown before the last attempt.
4. **Admin feedback on a built-in question:**
   - it saves through PATCH and the question is not marked "modified"
   - changing the options in source flags the feedback as stale
5. **Practice sessions:**
   - signed in, the cap is reached
   - as a guest and then signing in, the capped XP merges
   - offline, the session syncs after reconnecting
6. **Keyboard:** number keys skip ruled-out options, and Enter activates "Continue".
7. **Phone width:** notes do not overflow.

---

### Phase 5: Onboarding, placement, test-out, server-enforced progression

**Migration (next SCHEMA_VERSION)**
- `assessments: {}`; `users[].onboarding` is normalized.
- Progress `testedOut` and `seenConcepts` are lazy; reset creates fresh objects.
- `deleteUser` removes assessments.
- On the first restore after deploy, the client pushes local `trackId`, `learningMode` and `seenConcepts` up, **unioned** (the first device wins).
- Onboarding is never forced on learners who already have progress: `needsOnboarding` requires no `completedAt`, no `dismissedAt` **and** `completedChallenges.length === 0`.

**Settings added:**
- the `onboarding`, `placement` and `testOut` sections
- `access.solveGate`, `access.mergeGate`, `access.requireServerVerification`, `access.acceptGuestClaims`
- `copy.landing.pathLineWithSkip` and `copy.landing.buildStepWithSkip`

**Steps**

1. **Progress model.**
   - Move `groupIntoStages` to `src/platform/progress/stages.ts` (re-exported from `session/content.ts`).
   - `applyProgress` rules:
     - **cleared** = today's rule, or `testedOut[id].clears`
     - **open** when the chain allows it, when the stage has a test-out record, when a later stage in the same track was tested out, or when there is evidence (a lesson or the test of the stage is already solved)
     - the premium lock is checked first
   - `Stage.testedOut?: boolean`.
   - `hydrateStats` fills `testedOut`.
2. **Access rules.** New `src/platform/progress/access.ts`:
   - `canSolve`, `settleExpired`, `testOutEligibility`, `placementEligibility`, `placementQueue`
   - `filterMergeIds`: evidence comes only from ids already accepted
   - `leveling.ts` gains `xpForTestOut(xpReward, xpPercent, a, h, rules)`
3. **Server gates.**
   - `server/progression.js` gains `learnerAccess(user, progress)` and the lock part of `checkSolveAccess` under `access.solveGate`. `log` mode counts would-be rejections in memory; the counts appear on the Limits & access page.
   - `completedStagesFor` moves here and counts `clears` records.
   - The client handles a 403 by rolling back and refetching settings and progress.
4. **Merge.**
   - `asyncRoute`.
   - Guest `assessmentClaims` are verified (`verifySubmission`, the pass mark, hints, reachability, `requireServerVerification`, `acceptGuestClaims`).
   - `filterMergeIds` runs under `mergeGate`.
   - Response: `droppedChallenges` and `claims`.
   - Client: `heldChallenges`, a toast, and a notice on `LearnPage`.
5. **Assessments.**
   - `server/assessment-routes.js` `createAssessmentRouter(deps)` with the routes in §4.9 and the error codes from the onboarding design:
     - 409 `active-exists` (the client offers Resume)
     - 429 `cooldown` or `limit` with `retryAt`
     - 403 `premium`, `not-reachable` or `disabled`
     - 422 for wrong answers or unexpected hints (not counted against the learner)
     - 503 `unverifiable` (not counted)
   - Records snapshot `rules` at start; a pass writes `testedOut` with `clears` copied from settings.
   - Submits share `applySolveCore` with the solve route.
6. **Client assessments.**
   - `src/platform/session/useAssessments.ts`: server routes for signed-in learners; a local engine for guests (same `access.ts`, a log in `cq-assessments-v1`, local `testedOut` and XP, and `assessmentClaims` holding the passing answer or code).
   - `assessment:open` intent.
   - `PracticeMode 'assessment'`:
     - header "Test out · Stage 03" or "Placement · 2 of 3"
     - a run pill "Run n of maxRuns · pass mark X%"
     - no reveal, no skip; closing asks for confirmation, then `failAssessment('gave-up')`
     - result screens
   - `LearningPath.tsx`: a Test out button on locked non-premium rows (`testOut.copy.buttonLabel`), or "Try again {when}" during a cooldown; a Test out link on open stages; a "Tested out" badge.
   - `LearnPage.tsx`: the "Find your level" link.
   - Offline signed-in learners see disabled buttons with an explanation.
7. **Preferences and concepts sync.**
   - `PATCH /api/me/preferences` accepts `trackId`, `learningMode`, `motivation`, `experience` and `onboarding`.
   - `POST /api/progress/concepts {conceptIds[]}`: known ids only, capped at 500.
   - `SessionProvider`:
     - debounced (1500 ms) sync of `setSelectedTrack` and `setLearningMode`, with a `lastSynced` ref so adopting server values is not echoed back
     - `markConceptSeen` also pushes to the server
     - **the `restoreSession`, `adoptSession` and `completeChallenge` reconciles union `seenConcepts`** (via `unionConcepts`)
     - guest sign-in uses `reconcilePreferences` (the account wins, local values fill gaps)
8. **Onboarding.**
   - UI primitives: `src/ui/primitives/TrackChoiceList.tsx` and `LearningModeCards.tsx`. `LanguageTrackPicker` becomes a thin wrapper; `LearningModeChooser` copy comes from settings.
   - New module `src/modules/onboarding/`:
     - `index.ts` exports `OnboardingPage`
     - `flow.ts` with `visibleSteps` and `nextAction`
     - steps `MotivationStep`, `TrackStep`, `ExperienceStep`, `GoalStep` (ChoiceCards with `goals.options`) and `ModeStep`
   - `src/config/routes.ts` gains `onboarding: '/welcome'` (also in `STATIC_ROUTES`), with a lazy route in `App.tsx` outside the dashboard.
   - `Landing.tsx` `enter()` goes to `/welcome` when `needsOnboarding && onboarding.enabled && showAfterEnter`.
   - `DashboardHome` shows a "Finish setting up" card; `SettingsPage` gets "Redo setup".
9. **Admin.**
   - Custom `OnboardingSection` with a live preview from the shared primitives.
   - `placement` and `testOut` sections: stage checkbox lists, a derived "at most N runs" beside each pass mark, per-stage verifiability ("Python: not verifiable on this server"), and links to edit each stage test in `QuestionWizard`.
   - `access` gains the gate counters.
   - `AdminUsers` drawer Learning tab: onboarding answers, tested-out stages, the last 20 assessments, and "Clear test-out cooldowns" (`POST /users/:id/assessments/clear-cooldown`, audited).
   - `GET /analytics/onboarding` feeds a card on `AdminAnalytics`.
10. **Landing.** `HowItWorks.tsx` uses `copy.landing.pathLineWithSkip` and `buildStepWithSkip` when placement or test-out is enabled, otherwise the base lines.
11. **Enforcement** (a separate, later commit). Once the log counters stay clean for a week, change the code defaults of `access.solveGate` and `access.mergeGate` to `enforce` (admins can also flip them at runtime). Write `docs/adr/0012-server-enforced-progression.md` and update `README.md`.

**Tests**
- `src/platform/progress/__tests__/stages.test.ts`: all existing fixtures are unchanged without `testedOut`; `clears` true and false; skip-ahead; premium still wins; sticky evidence.
- `src/platform/progress/__tests__/access.test.ts`
- `src/modules/onboarding/__tests__/flow.test.ts`
- `src/platform/session/__tests__/preferences.test.ts`: `reconcilePreferences`, `unionConcepts`.
- Extend `leveling.test.ts`: `xpForTestOut`.
- `server/__tests__/assessments.test.mjs`: every status in step 5, expiry, placement stop-on-fail, another user's id → 404, `__proto__` ids.
- `server/__tests__/progression.test.mjs`: gate modes; `acceptClaims`; `filterMergeIds` drops forged later-stage lessons.
- Extend `preferences.test.mjs`.
- Extend `index-guards.test.mjs`: the solve source calls `checkSolveAccess(`.

**Manual checks**
1. A fresh guest goes from Enter to onboarding to placement, passes 2 tests and fails the 3rd. Stages 01-02 show "Tested out", 03 is open, and XP matches.
2. Sign in: claims are verified and rejected ones are explained.
3. After a cooldown, the admin clears it.
4. An existing account with progress sees no onboarding, and its stage states are the same as before deploy.
5. No reveal on any test, test-out or placement.
6. Admin edits to pass marks and copy apply live.
7. `curl` a locked stage in log mode, then in enforce mode.
8. Signed-in offline behaviour, and the phone-width onboarding layout.

---

### Phase 6: Weekly league and leaderboard polish

**Migration (next SCHEMA_VERSION)**
- `leagues: { members: {}, weeks: {} }`.
- Progress `everSolved` is lazy (`= completedChallenges`), and reset keeps the union.
- The pure `forgetLeagueIdentity(state, userId)` is called from `deleteUser`.
- Store functions: `getLeagueWeek`, `putLeagueWeek`, `allLeagueWeeks`, `deleteLeagueWeek`, `getLeagueMember`, `setLeagueMember`.

**Settings added:** the `league` section, `reminders.leagueResult`, and `retention.leagueWeeksKept`.

**Steps**

1. **Pure league logic.** `src/platform/league/league.ts`:
   - `weekFor(day, weekStartsOn, openWeek)`: weeks never overlap; a change of start day produces one shorter transition week.
   - `finalizeAt(endDay, delayHours)`: UTC midnight after the last day, plus the delay.
   - Ranking: XP descending, then earlier `joinedAt`, then username; competition-style ranks (1, 2, 2, 4).
   - Group filling and promotion/demotion outcomes.
2. **Day XP.**
   - Solve: `leagueXp = firstEver && (verified || countUnverifiedSolves) ? awarded : 0`, plus the goal bonus.
   - Review answers add review XP when `countReviewXp` is on.
   - Test-out XP counts.
   - Merged days get `leagueXp: 0` unless `countMergedXp`.
   - `everSolved` is updated.
3. **Server.**
   - `server/leagues.js`: `standings`, `noteLeagueXp`, `closeWeek`, `closeDueWeeks`, `resetWeek` (baseline), `exclude`, `setTier`.
   - `server/leagues-routes.js`: `GET /api/leagues/current` returns `LeagueView` (guests may pass `?tz=`, validated).
   - Weeks close lazily on reads, plus a `setInterval(() => leagues.closeDueWeeks(new Date()), 10*60_000).unref()` started next to the listen call, with one run at startup.
4. **All-time leaderboard.** Rows gain `isYou`; the response adds `me: {rank, ...row} | null` (computed before trimming) and uses `slice(0, league.boardSize)`.
5. **Client.**
   - `LeaderboardPage.tsx`: "This week" / "All time" tabs (remembered in `leaderboardTab`).
   - New `WeeklyLeague.tsx`: a countdown, zone markers when tiers are on, and a pinned "You · #34" row. Guests see "Sign in to join".
   - `Leaderboard.tsx`: a streak column and the `me` row.
   - `HabitBanner` adds the last week's result (`reminders.leagueResult`).
6. **Admin.**
   - `server/leagues-admin.js` mounted inside `createAdminRouter` after `requireAdminAuth`, with the routes in §4.9. Close and reset require `{ confirm: weekId }`; a closed week returns 409; every action is audited.
   - New `pages/AdminLeagues.tsx`:
     - current standings with raw XP, baseline, exclusion and zone
     - Exclude/Reinstate and Move tier row actions
     - Close week now and Reset week XP, each confirmed by typing the week id
     - a table of past weeks
   - The `league` section is edited at `/admin/rules/league`.
   - `GET /users/:id/learning` adds `league`.
7. **Tiers** (behind `tiers.enabled`, off by default): groups, outcomes at close, the tier UI, and the admin Move tier action.
8. **Docs:** `docs/adr/0013-weekly-leagues.md`.

**Tests**
- `src/platform/league/__tests__/league.test.ts`
- `server/__tests__/leagues.test.mjs`: standings, baseline, exclusion, `closeDueWeeks` with an injected `now` (not before finalize, idempotent), weekly XP never negative, re-solves after a reset earn no league XP
- `server/__tests__/leagues-admin.test.mjs`
- `db-forget.test.mjs`: `forgetLeagueIdentity`

**Manual checks**
1. The weekly tab shows your row outside the top 50, the countdown, and the automatic close after finalize.
2. The last-week banner appears.
3. Admin close and reset work and are audited.
4. Resetting progress and re-solving adds no league XP.

---

## 6. Owner decisions (recommendations in bold)

1. **Answer key.** Answers, `solutionCode` and hidden-test expectations ship in the bundle and in `/api/content`.
   - **A:** keep free answers on the client and move premium content off it. Premium questions leave the public bundle and are served only by `/api/content` to entitled users. P1T already does this for the API.
   - **B:** remove solutions and hidden tests from the client. `solutionCode` moves to server-only files and a new `POST /api/challenges/:id/solution` releases it after 2 attempts recorded on the server (forfeiting XP).
   - **C:** grade everything on the server. This breaks offline guest practice and adds a network round trip per answer.
   - **Recommendation: A now, together with P1T's gate.** Revisit B once the backend is off the laptop. Client-side hashing is rejected (4 guesses brute-force a choice).
   - P0 already closes the stage-test reveal and the `/api/grade` stage-test oracle, independent of this decision.
2. **Retuned level curve as the P2 default.** **Yes.** It never lowers a level and makes the top rank reachable.
3. **Daily-goal bonus XP 5/10/25/50.** **Yes.** Set to 0 in admin if unwanted.
4. **League tiers.** **Off** until there are enough weekly learners to fill groups (about 60 or more).
5. **Rollout modes:**
   - premium gate `enforce`
   - CORS `report`, then `enforce` after reviewing origins
   - progression gates `log`, then `enforce`
   - rate limits `enforce` with generous per-IP limits

---

## 7. Cross-cutting risks and final checks

- **Single-process JSON store.** All writes for one request (progress, activity, leagues) happen synchronously after the last `await`. The growth of `db.json` is bounded by the `retention.*` keys, `runsKept`, `leagueWeeksKept` and per-user caps. Watch the file size after P1 and P4.
- **Client and server disagreement.** The server always wins. Solve responses carry `settingsRevision`, and a newer revision triggers a refetch. When revisions differ, the client adopts the server's `xp`. Today's `Math.max(prev.xp, progress.xp)` keeps local-only work, so trust the server value only when revisions differ.
- **Mocked admin tests.** New admin behaviour arrives through `deps.learning` and falls back safely. When a tested route starts calling a new store function, update that test's `vi.mock('../db.js')` list in the same PR.
- **Time zones.** Abuse is limited by the cooldown and the monotonic day. `hoursLeft` can be off by an hour on DST days. Old clients without the header fall back to today's server zone.
- **Privacy.** Typed blank answers are capped at `answerMaxChars`, visible to admins only, and deleted with the account. Audit details never hold tokens or secrets.
- **The answer key remains public** until decision 1 is carried out. League and leaderboard fairness rely on server re-grading, the first-ever XP rule and per-account limits.
- **Final end-to-end pass** after P6, on a copy of production data:
  - guest flow → sign-up → offline → reconnect
  - every admin section: edit, then reset
  - `npm run check`, `npm run build`, `scripts/check-dist.mjs`
  - bundle check: the shell chunk has no zod or motion

Key files verified for this plan (all under `C:\Users\KIIT0001\Desktop\Devlingo-dev`):
- Server: `server/db.js`, `server/index.js`, `server/admin.js`, `server/content.js`, `server/build.js`, `server/billing.js`
- Platform: `src/platform/xp-leveling/leveling.ts`, `src/platform/xp-leveling/insights.ts`, `src/platform/session/SessionProvider.tsx`, `src/platform/storage/storage.ts`, `src/platform/api-client/api.ts`, `src/platform/events/intents.ts`
- Admin: `src/modules/admin/AdminApp.tsx`, `src/modules/admin/layout/AdminLayout.tsx`, `src/modules/admin/services/adminApi.ts`, `src/modules/admin/components/ui.tsx`
- Challenges and achievements: `src/modules/challenges/components/PracticeModal.tsx`, `src/modules/challenges/session/PracticeSessionProvider.tsx`, `src/modules/achievements/services/badgeWatcher.ts`
- Build and tests: `scripts/check-boundaries.mjs`, `vite.config.ts`, `package.json`, `.github/workflows/ci.yml`, `server/__tests__/*.mjs`
- Input designs: `docs/design/*.md`