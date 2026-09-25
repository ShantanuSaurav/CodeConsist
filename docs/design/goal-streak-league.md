# Daily goal, streak, in-app reminders and weekly league: design

## 0. What this design needs from the foundations design

The foundations design (the activity log and the settings store) is being written in parallel. I could not read it, so the names below are my proposal. The integrator should keep whatever names foundations chose. The shapes and behaviours are the parts this design relies on.

**F1. Settings store.** Admin edits are saved on the server and layered over defaults that ship in code.
- In `server/db.js` `EMPTY`: `settings: {}`. It holds sparse overrides per namespace, like `pricing`, and `migrate()` loads it with `plainObject(loaded.settings)`.
- `server/settings.js`:
  - `registerNamespace(name, { defaults, validate, isPublic })`
  - `effective(name)`: a deep merge of defaults and overrides. Arrays are replaced whole.
  - `setOverrides(name, patch)`: `null` puts a key back to its default.
  - `publicSettings()`
- Routes:
  - `GET /api/settings` (public, no auth): `{ settings, version }`.
  - `GET` and `PUT /api/admin/settings/:ns` and `POST /api/admin/settings/:ns/reset`, all under `requireAdminAuth`. Each change is audited as `settings.update`. Validation failures return 422 `{ error, issues:[{path,message}] }`, the same as the question routes in admin.js:483 and :505.
- Client: `useSettings()` returns the effective public settings. They are cached in localStorage and fall back to the code defaults when offline.

**F2. Activity log.** One record per learner per day.
- In `db.js`: `activity: { [userId]: { [day]: DayActivity } }`. `day` is the learner's local day, from `learnerToday()` in section 3.2.
- Store functions: `store.addActivity(userId, day, delta)` returns the updated day, `store.getActivityDay(userId, day)`, and `store.activityRange(userId, fromDay, toDay)`.
- Fields this design reads: `xp` (XP the server awarded that day, all sources), `solves` (passing solves, re-solves included, each challenge counted once per day), `firstSolves`, and `units` (once units exist).
- Fields this design adds (section 2.4): `leagueXp` and `goal`.
- Client mirror: `stats.activity: Record<day, DayActivity>`. For guests it is the only copy. For signed-in learners it is a cache that each solve response updates.

Steps 1-4 in section 8 are pure code and do not need F1 or F2. Everything from step 5 onwards does.

---

## 1. Goal

Give every learner a daily target they choose, a streak that is visible everywhere and is forgiving (freezes and repair), and in-app nudges at the moments that matter. Add a weekly XP race next to the all-time board. The server works out every streak, goal and league number from its own XP and the activity log. Days are counted in the learner's time zone, guests get the same experience locally, and every number and piece of text can be edited in the admin panel.

---

## 2. Data model

### 2.1 Settings namespaces

Defaults live in `src/platform/habits/defaults.ts` as `HABIT_DEFAULTS`. The validators are zod schemas in `src/platform/habits/validate.ts`, and the client, the server and the admin panel share them. Each namespace is registered with F1.

**`goals`**

| Key | Default | Allowed | Meaning |
|---|---|---|---|
| `enabled` | `true` | bool | Off hides the ring, the picker and the goal card. |
| `options[]` | casual (units 1), regular (units 2), serious (units 3) and intense (units 5), all enabled; `xp-50` and `xp-100` (xp metric), disabled | 1-8 items. `id` is a slug `^[a-z0-9-]{1,32}$` and unique. `label` ≤ 24 chars, `blurb` ≤ 60, `metric` ∈ `units` \| `solves` \| `xp`. `target`: units 1-20, solves 1-50, xp 10-2000. `enabled` bool. | What the learner can pick. |
| `defaultOptionId` | `casual` | Must be an enabled option. | Used for guests and new accounts until they choose. |
| `unitFallbackSolves` | `5` | 1-20 | Until units ship, one unit counts as this many passing solves. |
| `goalMetBonusXp` | `0` | 0-100 | Extra XP the server awards once per day when the goal is met. |
| `oneMorePrompt` | `true` | bool | Show the "goal met, one more?" card. |

**`streak`**

| Key | Default | Allowed |
|---|---|---|
| `dayRule` | `any-solve` | `any-solve` \| `xp-earned` \| `goal-met` |
| `freeze.enabled` / `earnEveryGoalDays` / `maxHeld` / `startingCount` | `true` / `7` / `2` / `0` | bool / 1-60 / 0-10 / 0 to maxHeld |
| `repair.enabled` / `windowDays` / `solvesPerMissedDay` | `true` / `2` / `3` | bool / 1-7 / 1-20 |
| `defaultTimeZone` | `null`, meaning the server's own zone, which is today's behaviour | IANA name or null |
| `timeZoneChangeCooldownHours` | `20` | 0-168 |
| `historyDaysKept` / `runsKept` | `400` / `50` | 30-1000 / 5-200 |

**`reminders`** (text only; every string is rendered as plain text)

| Message | Fields and default text | Allowed placeholders |
|---|---|---|
| `atRisk` | `enabled:true`, `fromLocalHour:0` (0-23)<br>title: "Your {streak}-day streak is at risk"<br>body: "Finish one lesson in the next {hoursLeft} hours to keep it."<br>bodyWithFreeze: "Miss today and a streak freeze covers it ({freezes} left)."<br>cta: "Practise now" | streak, hoursLeft, freezes |
| `goalMet` | toast: "Daily goal met: {goal}."<br>cardTitle: "Daily goal met"<br>cardBody: "{streak} days in a row. One more lesson?"<br>moreLabel: "One more"<br>doneLabel: "Done for today" | goal, streak, bonusXp |
| `freezeEarned` | "You earned a streak freeze ({freezes} of {maxFreezes})." | freezes, maxFreezes |
| `freezeUsed` | "A streak freeze kept your {streak}-day streak alive on {days}." | streak, days |
| `streakBroken` | title: "Your {lostStreak}-day streak ended"<br>body: "Complete {remaining} more lessons by {deadline} to repair it."<br>cta: "Repair my streak" | lostStreak, remaining, deadline |
| `streakRepaired` | "Streak repaired: {streak} days." | streak |
| `welcomeBack` | `enabled:true`, `cta:"Start a lesson"`<br>`tiers:[{minDays:3,title,body},{minDays:14,title,body}]` (1-5 tiers, minDays 1-365, strictly increasing) | name, days, bestStreak |
| `leagueResult` | `enabled:true` and texts for `single`, `promoted`, `demoted`, `stayed` | rank, xp, tier |

Titles are at most 80 characters and bodies at most 200. Unknown `{tokens}` are rejected. The per-message list of allowed placeholders is `COPY_VARS` in `copy.ts`.

**`league`**

| Key | Default | Allowed |
|---|---|---|
| `enabled` | `true` | bool |
| `weekStartsOn` | `1` (Monday) | 0 or 1 |
| `finalizeDelayHours` | `12` | 0-48. The 12-hour default covers UTC-12. |
| `boardSize` | `50` | 10-200. Rows shown on both tabs. |
| `countMergedXp` | `false` | bool. Guest and offline merges are not verified by the server. |
| `countUnverifiedSolves` | `true` | bool. Python without CPython, and HTML. |
| `historyWeeksKept` | `26` | 4-104 |
| `tiers.enabled` | **`false`** | bool |
| `tiers.list` | Bronze, Silver, Gold, Platinum, Diamond | 2-10 items; `{id slug, name ≤20}` |
| `tiers.groupSize` / `promoteCount` / `demoteCount` / `minXpToPromote` | `30` / `7` / `5` / `1` | 5-100 / 0+ / 0+ / 0-10000. Must satisfy `promote + demote < groupSize`. |

### 2.2 Learner preferences (`users[]` rows)

New field on each user row:

```
preferences: {
  dailyGoalOptionId: string|null,
  timeZone: string|null,
  timeZoneSetAt: string|null
}
```

In `migrate()` (db.js:159-174, inside the `users.map`), add:

```
preferences: { dailyGoalOptionId: null, timeZone: null, timeZoneSetAt: null, ...plainObject(rest.preferences) }
```

If foundations already adds `preferences`, only these keys are added. `publicUser()` (index.js:206-227) gains `preferences: { dailyGoalOptionId, timeZone }`.

### 2.3 Progress (`progress[userId]`)

The existing `streak`, `bestStreak` and `lastActiveDay` keep their stored meaning: the length of the current run, the best run, and the last day that counted as a streak day. From now on `streak` holds the **raw stored value**. Display code uses the value derived in section 3.3.

Additions:
- `everSolved: string[]`: every challenge id this account has ever been paid XP for. It survives `/api/progress/reset`, so XP earned again after a reset cannot count toward the league.
- `habit: HabitState`:

```
{
  v: 1,
  freezes: number,
  freezeProgress: number,
  settledThrough: string|null,
  frozenDays: string[],
  repairedDays: string[],
  repair: null | { lostStreak, lostRunStart, missedDays: string[], expiresDay, required, done },
  runStart: string|null,
  runs: [{ start, end, length, ended: 'missed'|'reset'|'admin' }]
}
```

`EMPTY_PROGRESS` (db.js:453-462) gets `habit: EMPTY_HABIT` and `everSolved: []`. `getProgress()` already backfills with a shallow spread, and `normalizeHabit(raw, progress, rules)` in `streak.ts` fills in sub-fields, trims arrays to `historyDaysKept` and `runsKept`, and derives values for existing rows:
- `runStart = addDays(lastActiveDay, -(streak-1))`
- `everSolved = completedChallenges`
- `freezes = startingCount`

### 2.4 Additions to each activity day (F2)

- `leagueXp: number`: the part of `xp` that counts toward the week.
- `goal: null | { optionId, metric, target, metAt }`: a snapshot taken when the goal is met, so a later change of goal never un-meets a day.

### 2.5 League data (new top-level `leagues`)

```
leagues: { members: { [userId]: { tierId, since } }, weeks: { [weekId]: LeagueWeek } }
```

A `LeagueWeek` has these fields:
- `id`: the week's start day key.
- `startDay`, `endDay`, `weekStartsOn`.
- `rules`: a snapshot of the tier rules, taken when the week is created.
- `status`: `'open'` or `'closed'`.
- `groups: { [groupId]: { tierId, memberIds[] } }` (only when tiers are on).
- `joinedAt: { [userId]: iso }`.
- `baseline: { [userId]: xp }`: set by an admin reset.
- `excluded: { [userId]: { by, at, reason } }`.
- `closedAt`, `closedBy` (`'auto'` or the admin id).
- `results: [{ userId, username, xp, rank, groupId, tierId, outcome, toTierId }]`.

`migrate()` adds `leagues: { members: plainObject(...), weeks: plainObject(...) }`. Store functions:
- `getLeagueWeek(id)`, `putLeagueWeek(week)`, `allLeagueWeeks()`, `deleteLeagueWeek(id)`
- `getLeagueMember(userId)`, `setLeagueMember(userId, patch)`

All of them use `ownEntry`/`defineEntry` for `__proto__` safety.

`deleteUser()` (db.js:280-293) also calls a new pure function, `forgetLeagueIdentity(state, userId)`. It removes the user from `members`, `joinedAt`, `baseline`, `excluded` and `groups`, and sets `userId` and `username` to null in `results`. It follows the same pattern as `forgetBillingIdentity`.

### 2.6 TypeScript types

**`src/types/index.ts`**
- `DailyGoalMetric`, `DailyGoalOption`, `HabitState`, `StreakRun`, `StreakRepair`.
- `UserStats.habit?`, `UserStats.everSolved?`, `UserProfile.preferences?`.
- `LeaderboardEntry.isYou?`.
- `LeagueView`, `LeagueRow`.

**`src/platform/habits/types.ts`**
- `HabitSettings` (all four namespaces), `HabitStatus` (derived) and `HabitEvents`.

**`api.ts`**
- `ServerProgress` gains `habit` and `everSolved`.

### 2.7 Migration and compatibility

- The migration is lazy and there is no batch rewrite. Old rows load as they are. `normalizeHabit` derives the new fields when a row is read, and the next solve or merge writes them back.
- Until a learner's browser reports a time zone, `defaultTimeZone: null` makes the server keep its own clock, so today's behaviour is unchanged.
- Streak history ("runs") starts at the deploy date, and the UI says so.
- The first settle after the deploy may open a repair offer for a learner whose run broke within `windowDays`. That is intended.
- `/api/progress/reset` (index.js:795-799) now writes a fresh progress row but carries over `everSolved` (the union with `completedChallenges`) and `habit.runs`, closing the current run with `ended:'reset'`.

---

## 3. Server API and where the rules live

### 3.1 Where the rules live

- **Pure rules, shared by client and server:** `src/platform/habits/`. The files are `days.ts`, `defaults.ts`, `validate.ts`, `goals.ts`, `streak.ts`, `league.ts`, `copy.ts` and `types.ts`, with `index.ts` as the barrel. There is no React in this folder.
  - `bootstrap()` (index.js:116-118) compiles it the same way it compiles leveling: `compileTsModule(.../src/platform/habits/index.ts, 'habits.mjs')` into `habitDeps.lib`.
  - `check-boundaries.mjs` rule 5 allows it: the server may import from `platform/**` only.
- **Server glue:**
  - `server/habits.js`: `learnerTimeZone`, `learnerToday`, `recordSolveHabits`, `mergeHabitsFor`, `habitSummary`, `streakFor`.
  - `server/leagues.js`: standings, membership, closing weeks, reset and exclude.
  - `server/habits-routes.js`: `createHabitsRouter`.
  - `server/leagues-routes.js`: `createLeaguesRouter`.
  - `server/habits-admin.js`: `createHabitsAdminRouter`.
  - Each takes `habitDeps` and reads `.lib` per request, the same way `adminDeps` works.
- **Dev watch list:** add all five new server files to `dev:api --watch-path` in `package.json`.

### 3.2 Days and time zones

In `days.ts`:
- `dayKeyIn(date, tz)` uses `Intl.DateTimeFormat('en-CA', {timeZone})`, with one cached formatter per zone.
- `addDays` and `daysBetween` do their arithmetic in UTC on day keys, so they are safe across daylight-saving changes.
- `isValidTimeZone(tz)`: at most 64 characters, matching `/^[A-Za-z0-9_+\-\/]+$/`, and the `Intl` constructor does not throw.
- `msUntilLocalMidnight(now, tz)`.
- `weekStartFor(day, weekStartsOn)`.

In `server/habits.js`:
- `learnerTimeZone(user)` returns the first of: `user.preferences.timeZone`, then `settings.streak.defaultTimeZone`, then the server's own zone.
- `learnerToday(user, now)` replaces `leveling.dayKey()` at index.js:529 and :667.

**Clamp rule.** If a learner moves west and `today < lastActiveDay`, the day is treated as `lastActiveDay`, so a streak day is never counted twice.

### 3.3 Streak engine (`streak.ts`, pure and deterministic)

**`settle(state, today, rules)`**
- If the learner has no run (`!lastActiveDay` or `streak === 0`), only close a repair offer whose window has passed.
- Otherwise, walk each day `d` from `max(lastActiveDay, settledThrough) + 1` to `today - 1`:
  - If freezes are enabled and `freezes > 0`, use one: `freezes--` and add `d` to `frozenDays`. Freezes are used **greedily, day by day**, so the result is the same however late the settle runs.
  - Otherwise the streak **breaks**:
    - Save the run to `runs` with `ended:'missed'`.
    - If repair is enabled and the number of missed days so far ≤ `windowDays`, open `repair` with `missedDays = d..today-1`, `expiresDay = d + windowDays` and `required = solvesPerMissedDay × missedDays.length`.
    - Set `streak = 0`.
- Set `settledThrough = today - 1`.
- If a repair is already open and more days are missed, add them to the repair and raise `required`. The repair expires when `today > expiresDay`.

**`applySolve(state, { today, day, goal, rules, passing })`**

This settles first, then:
1. **Repair.** If a repair is open, `done += 1`. Once `done ≥ required`, the repair completes:
   - `streak = lostStreak + streak`
   - `runStart = lostRunStart`
   - `repairedDays += missedDays`
   - the matching `missed` run is removed from `runs`
   - an event is recorded
2. **Streak day.** If today now counts under `dayRule` (`any-solve` = any passing solve, `xp-earned` = `day.xp > 0`, `goal-met` = `day.goal` is set) and `lastActiveDay !== today`, the streak grows by one (or starts at 1 with `runStart = today`). Then `lastActiveDay = today` and `bestStreak = max`.
3. **Goal.** If `day.goal` is null and the goal is now met:
   - Snapshot `day.goal`.
   - If `freezes < maxHeld`, increase `freezeProgress`. When it reaches `earnEveryGoalDays`, add a freeze and reset `freezeProgress` to 0. It does not keep counting while the learner holds the maximum.
   - Record the `goalMet` event (and `freezeEarned` if one was added).

Frozen and repaired days bridge a gap but do not add to the count.

**`habitStatus(state, { today, now, tz, day, goal, rules })`**

This runs a settle on a copy, so reads never write. It returns `HabitStatus`:

```
{ day, timeZone, streak, bestStreak, activeToday, atRisk, msUntilDayEnd, freezes, maxFreezes,
  freezeProgress, freezeEvery, frozenNow: string[], repair: {…remaining, deadline}|null,
  goal: { optionId, label, metric, target, done, met, metAt, unitsFallback }, daysAway, lastActiveDay }
```

`atRisk` means `streak > 0`, not active today, and the local hour ≥ `fromLocalHour`.

The rule for the whole engine: **reads derive, writes persist.** Persisting a settle later gives the same result as persisting it straight away.

### 3.4 Goals (`goals.ts`)

- `effectiveGoal(prefId, goals)`: if the chosen option is unknown or disabled, it falls back to `defaultOptionId`. The learner's stored choice is kept, so re-enabling the option restores it.
- `goalProgress(day, goal, goals)`:
  - `xp` counts `day.xp`, which is XP the server actually paid. This fixes the bug where re-solves counted toward the XP goal (insights.ts:39-47).
  - `solves` counts `day.solves`.
  - `units` counts `day.units`, or `floor(day.solves / unitFallbackSolves)` while units do not exist yet.

### 3.5 Changes to existing routes (`server/index.js`)

**`POST /api/progress/solve`** (641-711)
- Keep the existing verification, the pass mark and the XP calculation. Set `firstEver = !everSolved.includes(id)`.
- Replace the streak lines (691-694) with `recordSolveHabits({ user, progress: next, challengeId, awarded, firstSolve, firstEver, verified, today, now })`, which:
  1. Adds activity through `store.addActivity`. `leagueXp = firstEver && (verified || countUnverifiedSolves) ? awarded : 0`.
  2. Calls `lib.applySolve` and updates `next.habit`, `streak`, `bestStreak` and `lastActiveDay`.
  3. If the goal was just met and `goalMetBonusXp > 0`, adds the bonus to `next.xp`, to the day's `xp` and to its `leagueXp`.
  4. Calls `leagues.noteLeagueXp(...)`.
  5. Adds the id to `everSolved`.
- Response: `{ progress, awardedXp, score, firstSolve, verified, habits: HabitSummary, habitEvents: { goalMet, freezeEarned, repaired, bonusXp } }`. The existing keys stay, so older clients keep working.

**`POST /api/progress/merge`** (738-793)
- The body may carry `preferences`.
- After the XP merge, call `mergeHabitsFor(user, current, incoming, mergedDays)`:
  - **New account** (no server `lastActiveDay`): adopt the guest's `habit` after `normalizeHabit`. Freezes are capped at `maxHeld`, days must be valid and ≤ today, and the streak keeps the existing clamp rule (772-779).
  - **Existing account:** the server's habit wins. Client activity days newer than the server's `lastActiveDay` (at most 30, never in the future) are replayed through `applySolve` in date order.
- Merged days get `leagueXp: 0` unless `countMergedXp` is on.

**`recalc()` and `GET /api/progress`** (528-539)
- Add `habits`. The derived `streak` in that response stays for compatibility; nothing in `src` calls this route.

**`GET /api/auth/me`** (391-396)
- Also returns `habits`, and runs `touchLastSeen` as today.

**`GET /api/leaderboard`** (811-831)
- `streak` becomes `streakFor(user, progress)`: the derived status in each learner's own zone, with freezes applied.
- Rows gain `isYou`, set when `req.user` is present.
- The response adds `me: { rank, ...row } | null`, computed before the list is trimmed.
- `slice(0, 50)` becomes `slice(0, league.boardSize)`.
- `publicUser` and `deleteUser` change as described in section 2.

### 3.6 New learner routes

**`server/habits-routes.js`**, mounted with `app.use('/api', createHabitsRouter({ requireAuth, habitDeps }))`:

- **`GET /api/habits`** (`requireAuth`) returns `{ habits: HabitSummary, preferences }`.
- **`PUT /api/habits/preferences`** (`requireAuth`), body `{ dailyGoalOptionId?: string|null, timeZone?: string }`:
  - `dailyGoalOptionId` must name an enabled option or be null, otherwise 400 `{ error: 'That goal is not available.' }`.
  - `timeZone` must pass `isValidTimeZone`, otherwise 400.
  - If the zone was changed less than `timeZoneChangeCooldownHours` ago, the request is not an error: it returns 200 with `applied: { timeZone: false }`, because the client sends the zone automatically and should not show an error.
  - Response: `{ preferences, habits, applied }`.
  - The input handling follows index.js: `String(req.body?.x ?? '')`, an early 400 with a single `error`.

**`server/leagues-routes.js`**:

- **`GET /api/leagues/current`** uses the global `optionalAuth`. Guests may pass `?tz=`, which is validated. It returns a `LeagueView`:

```
{ enabled,
  week: { id, startDay, endDay, status, endsInMs },
  tiersEnabled,
  tier: {id,name,index,count}|null,
  zones: {promote,demote}|null,
  rows: [{ rank, username, xp, streak, isYou, zone: 'up'|'down'|null }],
  me: { rank, xp, zone, inRows }|null,
  participants,
  lastResult: { weekId, rank, xp, outcome, tierName }|null }
```

### 3.7 League engine (`league.ts` pure, `server/leagues.js` glue)

**Week boundary rule**
- A week is Monday to Sunday (or Sunday to Saturday, per `weekStartsOn`) on **each learner's local calendar**, using the same day keys as the activity log.
- `weekFor(day)`:
  - If an open week already covers `day`, use it.
  - Otherwise use the rule, with `startDay` set to at least the previous week's `endDay + 1`. Weeks therefore never overlap. Changing `weekStartsOn` produces one shorter transition week.
- A week becomes final at `finalizeAt = UTC midnight after endDay + finalizeDelayHours`. By then every time zone has finished the week's last day.

**Weekly XP and membership**
- A learner's weekly XP is `max(0, Σ activityRange(start, end).leagueXp − baseline)`.
- Membership is every user with weekly XP above 0 who is not excluded. `noteLeagueXp` records `joinedAt` and, when tiers are on, assigns a group: the newest group in that tier with room, otherwise a new group.

**Ranking**
- Sort by XP descending, then earlier `joinedAt`, then username.
- Ranks use competition style (1, 2, 2, 4).

**`closeWeek(id, by, now)`**
- An already closed week returns 409.
- Closing writes `results` and sets `status:'closed'`. If the week's `rules.tiersEnabled`, it also applies outcomes group by group:
  - The top `promoteCount` learners with XP ≥ `minXpToPromote` move up, unless already in the top tier.
  - The bottom `demoteCount` move down, but only when the group is larger than `promote + demote`, and never below the lowest tier.
- Old weeks beyond `historyWeeksKept` are pruned.

**When weeks close**
- Lazily, on any leagues or leaderboard read.
- On a timer: `setInterval(() => leagues.closeDueWeeks(new Date()), 10*60_000).unref()`, started in `bootstrap().then` next to the listen call, plus one run at startup.

Tier rule changes are snapshotted into `week.rules` when a week is created, so they take effect from the next week.

### 3.8 Admin routes

These live in `server/habits-admin.js`. `createAdminRouter` mounts them with `router.use(createHabitsAdminRouter({ audit, habitDeps, leagues }))` **after** `router.use(requireAdminAuth)` (admin.js:99), so every route is gated. Every change calls the local `audit()`.

**Settings**
- The four namespaces use F1's `/api/admin/settings/:ns`. Validation failures return 422 with `issues[{path,message}]`.

**`GET /admin/habits/overview`**
- `{ goalChoice: {optionId: count}, metGoalToday, atRiskNow, avgStreak, freezesHeld, freezesUsed7d, repairsOpen, repairsDone7d, learnersWithTimeZone }`. The settings pages use it to show who a change affects.

**Per-user support**
- `GET /admin/users/:id/habits` returns `{ preferences, habit, summary, activity (last 30 days), league: { tierId, week: { xp, rank } } }`.
- `PATCH /admin/users/:id/habits` accepts:
  - `freezes`: 0 to maxHeld
  - `streak: { value: 0-400, lastActiveDay ≤ today }`
  - `dailyGoalOptionId`: string or null
  - `clearTimeZone: true`
- The change is audited as `habits.user.update` with from and to values.

**Leagues**
- `GET /admin/leagues/weeks?limit=12`: one row per week with id, days, status, participants, total XP, `closedAt` and `closedBy`.
- `GET /admin/leagues/weeks/:id`: standings with raw XP, baseline, exclusion, group and tier, zone and `joinedAt`, plus the groups.
- `POST /admin/leagues/weeks/:id/close`: the body must be `{ confirm: id }`, otherwise 400. An already closed week returns 409.
- `POST /admin/leagues/weeks/:id/reset`: body `{ confirm: id }`. It sets `baseline` to each learner's current XP, which zeroes the board; the activity log itself is left alone.
- `POST /admin/leagues/weeks/:id/exclude`: body `{ userId, excluded: bool, reason ≤ 200 }`.
- `PATCH /admin/leagues/members/:userId`: body `{ tierId }` (tiers only).

**`adminUserRow`** (admin.js:64-83)
- Its `streak` becomes the derived value. It must stay null-safe when `habitDeps.lib` is not loaded, because the existing admin tests mock `db.js`.

---

## 4. Client

### 4.1 Platform

**`src/platform/habits/useHabitState.ts`**
- A React hook that is not exported from `index.ts`, so the server bundle stays free of React.
- Inputs: `stats`, `user`, `settings`, the goal preference and `today`. `today` comes from `dayKeyIn(now, user.preferences.timeZone ?? browserTz)`, and a timeout at `msUntilLocalMidnight` moves it to the next day.
- It returns `habits: HabitStatus`.
- It works as a watcher, in the style of `badgeWatcher`, and emits bus events once each:
  - `habit:goalMet` (with `source: 'solve' | 'sync'`)
  - `habit:freezeEarned`
  - `habit:freezeUsed`
  - `habit:streakRepaired`
- What has already been announced is stored under `STORAGE_KEYS.habitSeen`, so a refresh never announces the same thing twice.

**`SessionProvider.tsx`**
- New context fields: `habits`, `goalOptions`, `dailyGoal`, `setDailyGoal(optionId)`, `league` and `refreshLeague()`. The last two sit next to `leaderboard` (1237-1250).
- Stop overwriting the raw streak: replace `currentStreak(...)` at 198, 769, 995 and 1060 with the raw value.
- `completeChallenge` (928-938): replace the `nextStreak` call with `applySolveLocally` (a wrapper over `lib.applySolve` plus the activity mirror).
  - For signed-in learners, bonus XP is never added optimistically. It appears only when `habitEvents.bonusXp` comes back from the server.
  - When the server responds, adopt `progress.habit` and today's activity (987-999).
- Time zone and goal on sign-in:
  - After `adoptSession`, and on `restoreSession`, if the browser's zone differs from the account's, or the account has no goal but the guest had one, call `api.setHabitPreferences`.
  - If that fails, keep `STORAGE_KEYS.pendingPrefs` and retry on the next restore.

**`storage.ts` `STORAGE_KEYS`**
- `dailyGoal: 'cq-daily-goal'`
- `habitSeen: 'cq-habit-seen-v1'`
- `pendingPrefs: 'cq-pending-prefs'`
- `leaderboardTab: 'cq-leaderboard-tab'`

**`api.ts`**
- New: `habits()`, `setHabitPreferences(body)`, `leagueCurrent(tz?)`.
- `solve()` and `leaderboard()` return types gain `habits`, `habitEvents` and `me`.

**`events/index.ts`**
- Add the four `habit:*` events to `AppEvents`.

### 4.2 UI primitives

New files in `src/ui/primitives`, driven only by props, exported from `src/ui/index.ts`:
- `ProgressRing`: an SVG ring with `value`, `size` and `label`.
- `StreakFlame`: `count` plus a state of `active`, `atRisk`, `frozen` or `none`.
- `GoalPicker`: `options`, `value`, `onChange`. The onboarding design can reuse it.
- `StreakStrip`: day cells marked active, frozen, repaired, missed or today.
- `GoalMetCard`: title, body, two actions and an optional bonus.

### 4.3 App shell

- **`src/app/layout/HabitChip.tsx`**: a flame with the streak count and the goal ring. Its aria-label reads like "12-day streak, at risk. Daily goal 1 of 2 units."
  - In the Sidebar identity block (Sidebar.tsx:164-188), it goes on a new row above the ProgressBar.
  - In the mobile top bar (DashboardLayout.tsx:44-55), it goes between the logo and the menu button, in compact form.
  - Clicking it goes to the dashboard's goal section.
- **`src/app/layout/HabitBanner.tsx`**: mounted in DashboardLayout under the guest banner (after line 88). It shows one banner at a time, in this priority order:
  1. welcome back
  2. streak broken / repair
  3. freeze used
  4. at risk
  5. last week's league result

  Each can be dismissed for the day through `habitSeen`. The text comes from `reminders` through `fillCopy`, and the CTA calls `intents.openPractice()`.
- **`src/app/HabitToaster.tsx`**: mounted in App.tsx after `<BadgeToaster />` (line 174). It shows toasts for `freezeEarned`, `streakRepaired`, and `goalMet` when `source === 'sync'`, meaning the goal was met while offline and synced later.

### 4.4 Pages

- **`DashboardHome.tsx`**
  - Delete `DAILY_SOLVES` and `DAILY_XP` (14-15) and the `goals` array (35-44).
  - The header line (56-62) uses `habits`: at-risk text when at risk, "Today's goal is done" when met, otherwise the existing lines.
  - The Streak stat (128-132) uses `habits.streak` and adds a "N freezes" hint.
  - The "Daily goals" section (212-235) becomes a goal card: the ring, "1 / 2 units", the option label, a **Change** control that opens `GoalPicker`, "Freezes 1/2 · next in 3 goal days", and a 14-day `StreakStrip`.
- **`SettingsPage.tsx`**, Learning section (441-458): add a "Daily goal" row with `GoalPicker`, and a "Time zone" row ("Days end at midnight in Asia/Kolkata") with a "Use this device's time zone" button.
- **`PracticeModal.tsx`**
  - Listen with `useAppEvent('habit:goalMet')`, handling only `source:'solve'`, and show `GoalMetCard` below the feedback banner (~821).
  - "One more" dismisses the card. "Done for today" closes the modal.
  - The celebration view uses `habits.streak` (624) and shows the goal status.
- **`AchievementsPage.tsx`**
  - The Streak stat (79) uses `habits.streak`.
  - New "Streak history" section: the current run, the best run, past runs (dates, length and how each ended), and a 30-day `StreakStrip`.
  - Optionally, `insights.ts:140-149` can date streak badges from `runs`.
- **Leaderboard**
  - `LeaderboardPage.tsx` gets "This week" / "All time" tabs using `Segmented`, remembered under `leaderboardTab`.
  - The new `WeeklyLeague.tsx` shows: # / user / week XP / streak, promotion and demotion zone markers when tiers are on, an "Ends in 2d 5h" line, and a pinned "You · #34" row when the learner is outside the shown rows. Guests see "Sign in to join this week's league".
  - `Leaderboard.tsx` (all-time) adds a Streak column (flame) and the pinned `me` row, and uses `isYou` when present, with username matching as the fallback.
- **Landing** `Gamification.tsx:9,42`: use the default option's label and `habits.streak`.

### 4.5 States

| State | Behaviour |
|---|---|
| Guest | The goal choice is kept in `cq-daily-goal`. Habit and activity are computed locally with the same pure functions, so freezes, repair and reminders all work. The league board can be viewed but the guest is not ranked. On sign-in, `merge` plus the preferences PUT carry the goal over. |
| Signed in, online | The server is authoritative. The UI updates optimistically and then adopts `progress.habit` and today's activity from the response. |
| Signed in, offline | Local optimistic update. The solve is kept and synced through `/progress/merge` on restore (league XP from merges is off by default). A goal change is kept in `pendingPrefs`. The league tab shows a neutral "unavailable" state. |
| Older server (routes return 404) | Status is derived locally. The preferences PUT failure is ignored. The weekly tab is hidden when `leagueCurrent` returns 404. |

---

## 5. Admin panel

**Navigation**
- New group **"Engagement"** in `AdminLayout.tsx` `GROUPS` (23-50): Daily goals `/admin/goals`, Streaks `/admin/streaks`, Reminders `/admin/reminders`, Leagues `/admin/leagues`.
- Matching routes in `AdminApp.tsx` (25-37).

**`adminApi.ts`**
- `settings(ns)`, `updateSettings(ns, patch)`, `resetSettings(ns)`
- `habitsOverview()`, `userHabits(id)`, `updateUserHabits(id, patch)`
- `leagueWeeks()`, `leagueWeek(id)`, `closeLeagueWeek(id)`, `resetLeagueWeek(id)`, `excludeFromLeague(id, userId, excluded, reason)`, `setLeagueTier(userId, tierId)`

**Shared page pattern**
- Built from `components/ui.tsx`: Card, Field, NumberField, TextField, TextArea, SelectField, Toggle, ConfirmDialog, Badge.
- Every field shows "Default: X" and a per-field "Reset to default" (sends `null`).
- A dirty-state save bar.
- 422 `issues` are mapped to fields by `path`, as QuestionWizard does.
- A "who this affects" line comes from `habitsOverview`.

**The pages**
- **AdminGoals**:
  - an option table (label, metric, target, blurb, enabled, move up/down, default radio, "N learners chose this")
  - `unitFallbackSolves`, with a note on whether real units are live
  - `goalMetBonusXp`, `oneMorePrompt` and `enabled`
- **AdminStreaks**:
  - `dayRule`
  - the freeze block and the repair block
  - `defaultTimeZone` (a searchable list of `Intl.supportedValuesOf('timeZone')`), `timeZoneChangeCooldownHours`, `historyDaysKept`, `runsKept`
  - a worked example that updates live ("Miss 1 day with 1 freeze → protected")
- **AdminReminders**:
  - every message in section 2.1 with its placeholders listed
  - a live preview using sample values
  - `fromLocalHour`
  - a tier editor for welcome back
- **AdminLeagues**:
  - a settings card (`enabled`, `weekStartsOn`, `finalizeDelayHours`, `boardSize`, the two anti-cheat toggles, `historyWeeksKept`, and a tiers editor with the warning "applies from the week starting X")
  - the **current week's standings**, per group when tiers are on, with raw XP, baseline, excluded and zone
  - row actions: Exclude/Reinstate, and Move tier
  - week actions: **Close week now** and **Reset week XP**. Both use ConfirmDialog, and the admin must type the week id.
  - a past weeks table with results
- **AdminUsers**: add "Streak" (derived) and "Goal" columns, and a "Habits" row action that opens a Drawer. The Drawer shows the preferences, freezes, repair, a 30-day strip and the league tier, and edits them through `PATCH /admin/users/:id/habits`.
- **AdminDashboard** (optional): an "Engagement" card with goal met today, at risk now and repairs open.

---

## 6. Tests to add

**Unit tests** (vitest, `src/platform/habits/__tests__/`, following the pattern of `leveling.test.ts`)
- `days.test.ts`
  - `dayKeyIn` across zones, for example `2026-09-25T20:00Z` is the 26th in Asia/Kolkata and the 25th in America/Los_Angeles
  - `addDays` and `daysBetween` across month ends, year ends and daylight-saving changes
  - `weekStartFor` with Monday and Sunday starts
  - `finalizeAt` and `msUntilLocalMidnight`
  - `isValidTimeZone`
- `streak.test.ts`
  - greedy freeze use: 1 missed day with 2 freezes; 3 missed days with 2 freezes gives 2 frozen days, then a break and a repair offer
  - **settling day by day gives the same result as settling at once**
  - settle is idempotent
  - repair succeeds within the window, fails when it expires, and grows when more days are missed
  - freezes earned every N goal days and capped at `maxHeld`
  - each `dayRule` variant; freezes disabled
  - moving west clamps to the same day
  - runs history and the caps
  - `normalizeHabit` backfills an old row
- `goals.test.ts`
  - fallback when the chosen option is disabled or unknown
  - unit fallback arithmetic
  - the xp metric ignores 0-XP re-solves
  - a met goal stays met after the goal is changed
- `league.test.ts`
  - `weekFor`, including the transition when `weekStartsOn` changes
  - competition ranking and tie-breaks
  - group filling
  - promotion and demotion at the top and bottom tiers, small groups, `minXpToPromote`
- `validate.test.ts`
  - the defaults pass
  - rejected: duplicate ids, a disabled default, targets out of range, `promote + demote ≥ groupSize`, unknown placeholders, `minDays` not increasing
- `copy.test.ts`: `fillCopy` and welcome-back tier selection.

**Server tests** (`server/__tests__/`)
- `habits-routes.test.mjs`: the **real `db.js` with `node:fs/promises` mocked** and `x-user` authentication, as in `drafts.test.mjs`.
  - the preferences PUT: unknown goal returns 400, invalid zone returns 400, the cooldown returns `applied.timeZone:false`, null resets the goal
  - `GET /habits`, and 401 for guests
  - The pure library is injected directly (`habitDeps.lib = await import('../../src/platform/habits/index.ts')`), so the test needs no esbuild step.
- `habits-solve.test.mjs`: `recordSolveHabits` against the real store.
  - activity and `leagueXp` are written, including `firstEver` after a reset and the unverified toggle
  - goal met gives a freeze and the bonus XP, once per day
  - a repair completes
- `leagues.test.mjs`:
  - standings from activity, reset baseline, exclusion
  - `closeDueWeeks` with an injected `now`: not before `finalizeAt`, closed after it, idempotent
  - outcomes applied to members
  - the weekly XP is never negative
- `habits-admin.test.mjs`: the admin router with `admin-auth.js` mocked, as in `admin-questions.test.mjs`, and the real store with fs mocked.
  - settings 422 carries `issues`
  - close and reset require `confirm` to match the week id; a closed week returns 409
  - audit rows are written
  - the user habits PATCH is range-checked
- `db-habits-migrate.test.mjs`: an old `db.json` with no `leagues`, `preferences` or `habit` loads, gets defaults, and keeps its streak. `forgetLeagueIdentity` gets a pure test in the style of `db-forget.test.mjs`.
- `index-guards.test.mjs` gets new source assertions:
  - the solve route calls `recordSolveHabits(` and no longer calls `leveling.dayKey()`
  - `createHabitsAdminRouter` is mounted after `router.use(requireAdminAuth)` in `admin.js`

---

## 7. Risks, edge cases and manual checks

**Anti-cheat**
- League XP only counts first-ever, server-paid XP.
- These are excluded or controlled: merged XP (off), XP re-earned after a reset (`everSolved`), and unverified solves (a toggle). Admins can exclude a learner or reset a week.
- Known gaps from the feature map:
  - The answer key is shipped to every browser.
  - Premium XP has no entitlement check.
  - Python and HTML solves are partly trusted.
- Leagues are only as fair as those fixes (trust fixes 4.2 and 4.3). Any future XP source that can repeat, such as review XP, must set `leagueXp` explicitly and have a daily cap.

**Time zones**
- A learner could change zone to game day boundaries. This is limited by the clamp rule, the cooldown and the server clock.
- On daylight-saving days `hoursLeft` can be off by an hour.
- If a device clock is wrong, only a guest's local data is affected.

**Admin edits in the middle of a period**
- Lowering `maxHeld` below what a learner holds: nothing is taken away, and extra freezes are simply not used above the cap.
- Disabling freezes keeps them saved but stops using them.
- Tier and group-size changes take effect from the next week.
- Removing a goal option makes learners fall back to the default while keeping their stored choice.

**Other edge cases**
- Double announcements across devices are possible and accepted. Within one browser, `habitSeen` prevents them.
- Existing admin tests mock `db.js` completely. New `store.*` calls reached from `adminUserRow` would throw there, so keep that code null-safe or update the mocks.
- db.json growth is bounded by `historyDaysKept`, `runsKept` and `historyWeeksKept`.
- Standings cost is users × 7 day lookups, which is fine at today's scale. If there are thousands of users, cache the result per minute.
- Closing a week early is irreversible (it is confirmed and audited). XP in the rest of that week then counts nowhere. The admin page says so.

**Manual checks**
1. Set the device to America/Los_Angeles and solve near local midnight. Then the reverse with Pacific/Kiritimati.
2. Fake the date forward (set `DATA_DIR` to a scratch copy and change the system clock): miss 1 day with a freeze and 2 days without one, then repair within the window and let a repair expire.
3. Meet the goal and see the card, the toast and a freeze earned on the 7th goal day.
4. Guest → sign-up carries over the goal and the streak.
5. Offline solve, then reconnect.
6. Weekly tab: your own row when outside the top 50, the countdown, the automatic close after `finalizeAt`, and the last-week banner.
7. Admin: every field saves and resets. Invalid values show field errors. Close and reset week work, and the audit log shows them.
8. Mobile width: the chip in the top bar, the banner does not overflow, and 44px targets on the new controls.

---

## 8. Implementation steps (each one can be tested on its own)

1. `src/platform/habits/days.ts` and its tests.
2. `defaults.ts`, `validate.ts` (zod) and `copy.ts`, with tests.
3. `streak.ts` and `goals.ts` (normalize, settle, applySolve, habitStatus, effectiveGoal, goalProgress), with tests.
4. `league.ts` (weekFor, ranking, groups, outcomes), with tests.
5. *(Needs F1 and F2.)* Register the four settings namespaces with the foundations settings store. `db.js`: user `preferences`, `progress.habit` and `everSolved`, `leagues`, the migrations, `forgetLeagueIdentity`, and the new store functions. Add the migration test.
6. Server bootstrap compiles `habits.mjs`. Add `server/habits.js` and use `learnerToday` in the solve route and in `recalc`. Add `recordSolveHabits`, the merge and reset changes, and `habits` in the me, solve and progress responses. Add the solve and guard tests.
7. `habits-routes.js`: GET habits and PUT preferences, and `publicUser.preferences`. Route tests. Update the `package.json` watch paths.
8. Client plumbing: types, `api.ts`, `STORAGE_KEYS`, bus events, `useHabitState`, the SessionProvider wiring. Remove the raw-streak overwrites and move the 5 display sites to `habits.streak`.
9. UI primitives, then HabitChip in the Sidebar and mobile top bar, the DashboardHome goal card (removing the hardcoded goals), and the Settings goal and time zone rows.
10. In-app reminders: HabitBanner, HabitToaster, and the GoalMetCard in PracticeModal.
11. Streak history on the Achievements page, and the 14-day strip on the dashboard.
12. Admin: the Goals, Streaks and Reminders pages, `habits/overview`, and the per-user habits Drawer and PATCH. Admin route tests.
13. All-time leaderboard: the streak column, `isYou`, the `me` row and `boardSize`.
14. `server/leagues.js` and `leagues-routes.js` (single board), `noteLeagueXp` in the solve route, and the due-week closer timer. League tests.
15. Client weekly tab with your own rank, the countdown, and the last-week result banner.
16. AdminLeagues page: settings, current standings, close, reset, exclude and history.
17. Tiers behind `tiers.enabled` (off by default): groups, promotion and demotion at close, tier UI, and the admin move-tier action. Tests.
18. Docs: ADR `docs/adr/0008-habits-streaks-leagues.md`, and README updates for the leaderboard, dashboard and admin modules.