# 0010 - Daily goal, a forgiving streak, and days in the learner's own time zone

## Context

The dashboard showed three hard-coded "daily goals" (`DAILY_SOLVES = 3`,
`DAILY_XP = 100`) that nothing else knew about, and the streak was one
unforgiving counter: miss a single day - a flight, an illness - and a
40-day streak was gone for good, with nothing to win it back. The streak
was also judged in four places in the browser (`currentStreak(...)` at load,
after a solve, on a restore and on a merge), each one overwriting the stored
number with "0 unless it was today or yesterday". That hid the very missed
days any forgiving rule would need to look at. Reminders did not exist.

## Decision

1. **One pure engine, run by both sides.** `src/platform/habits/`
   (`streak.ts`, `goals.ts`, `learner.ts`, `reminders.ts`) holds every rule
   and is compiled into the server bundle (`server-lib.ts`). The browser runs
   it for guests and for the optimistic copy; the server runs it for
   accounts (`server/habits.js`). Nothing in it reads a clock: it is told the
   learner's day.
2. **The streak is stored raw; what screens show is derived.** A progress
   row keeps `streak`, `bestStreak`, `lastActiveDay` and a lazily created
   `habit` (`HabitState`: freezes, progress towards the next one, what has
   been settled, frozen and repaired days, an open repair offer, past runs).
   `habitStatus` settles a *copy* and describes it (streak, at risk, freezes,
   repair, today's goal, days away) - reads derive, writes persist. The four
   browser overwrites are gone; `/auth/me`, login, `GET /progress` and a merge
   hand over the row with its missed days worked out (`settledRow`), which
   settling again leaves unchanged.
3. **Settling is day by day and idempotent.** Each missed day after the later
   of `lastActiveDay` and `settledThrough` is covered by a freeze while one is
   held (greedy); with none left the run breaks into `runs` (`ended:
   'missed'`) and, within `streak.repair.windowDays`, a repair offer opens
   (`lessonsPerMissedDay` per missed day). An offer grows with further missed
   days and expires after its window. Settling day by day equals settling at
   once, so a settle persisted later (on the next solve) gives the same
   result as one persisted now. Frozen and repaired days bridge a gap; they
   never add to the count.
4. **A solve** (`applySolve`, pipeline step 11) settles, counts towards an
   open repair (complete: `streak = lostStreak + streak`, the run comes out of
   the history), snapshots the daily goal the first time the day meets it
   (moving towards the next freeze, not while holding `maxHeld`), and counts
   today under `streak.dayRule` (`any-solve`, `xp-earned`, `goal-met`). The
   day never moves backwards: a solve on a day before the last counted one
   (a flight west), or on a day already settled (an older day replayed by a
   merge), adds no streak day - the missed days after it were worked out
   without it. `goal-met` with no goal to meet (daily goals off, or no
   option enabled) counts any passing solve, so one admin save can never
   stop every streak; screens read the rule in effect (`HabitStatus.dayRule`).
   A completed repair records the day it was won back (`habit.repairedOn`),
   which is what the admin's "repairs completed this week" counts.
5. **The daily goal is an admin-edited option list** (`goals.options`:
   xp / lessons / units, target, bonus). The learner's choice is
   `users[].preferences.dailyGoalId`; `effectiveGoal` falls back to the
   default option without touching the stored choice. A day met records a
   snapshot (`DayRecord.goal`), so changing the goal later never un-meets it.
   Only a snapshot makes a day "met": progress that already reaches a goal
   the learner lowered after the day's last lesson is shown as reached, and
   the next solve that day meets it (and pays the bonus).
   The goal bonus is paid by the server once per day into `progress.xp` and
   `DayRecord.goalBonusXp` - never into `DayRecord.xp`, which the XP goal
   reads, so the bonus cannot feed itself. A guest's bonus is paid in the
   browser; a signed-in learner's comes only from the server
   (`habitEvents.bonusXp`), or from the merge that replays their offline
   days (`streak.mergeReplayDays`).
6. **A merge**: a new account - one that never had streak state (no
   `habit`, no last day, no solves; a reset keeps `habit`, so a reset
   account is not new) - adopts the guest's habit, held to what could have
   happened: freezes capped at `maxHeld`, nothing after today, the
   plausibility clamp on the streak, run starts and past runs that fit their
   lengths, and a repair offer only while repair is on and its window (as
   set now) is open, worth no more than the plausible streak. Any other
   account keeps its own habit and replays, in date order, only the days
   this merge credited solves on (priced by the server). Either way goal
   bonuses are paid only for those credited days. Counters a browser reports
   for a day (its re-solves) are kept as activity but never make a streak
   day or a goal, so an offline re-solve counts only once it is sent as a
   solve.
7. **Days are the learner's.** The zone is stored on the account
   (`preferences.timeZone`), captured from `X-Time-Zone` on write routes and
   settable through `PATCH /api/me/preferences`; both honour
   `streak.timeZoneChangeCooldownHours`, and a change inside it is answered
   `applied.timeZone: false`, not an error. The browser sends its zone on
   every restore when it differs; a refused change is simply sent again next
   time.
8. **Reminders are in-app only.** One banner at a time (welcome back, a
   streak to repair, a freeze used, at risk - not before
   `reminders.atRisk.fromLocalHour`), each dismissable for the day; toasts for
   a freeze earned, a repair, a milestone, and a goal met elsewhere; a
   "goal met - one more?" card in the lesson that met it. Every word is the
   admin's (`settings.reminders`); a guest has no name, so a `{name}` is left
   out for them. `useHabitState` announces each event once per learner,
   remembered in `cq-habit-seen-v1` per owner (an account, or the guest -
   whose keys go to the account they sign in to, with their progress), and
   holds its sync watcher while a solve is on its way, so an optimistic day
   row never passes for a goal met elsewhere.
9. **Support edits are audited.** `PATCH /api/admin/users/:id/learning` sets
   freezes (0 to `maxHeld`), a streak (0-400 with a last day not after the
   learner's today; 0 closes the run as `ended: 'admin'`), the goal, or
   forgets the zone, and writes `learning.user.update` with each value's
   before and after. `GET /api/admin/analytics/engagement` feeds the "who
   this affects" lines and the dashboard's Engagement card.

## Consequences

- No schema bump and no rewrite: `habit` appears on a row's first write;
  `normalizeHabit` derives the run start of an old row from its streak. The
  first settle after the deploy may open a repair offer for a run that broke
  within the window - intended. Streak history ("runs") starts at the deploy.
- The leaderboard and the admin's user list show the derived streak (the
  learner's zone, freezes applied), so a stale number is never shown alive.
- A progress reset keeps `runs` and closes the current run as `ended:
  'reset'`; freezes go back to `freeze.startingCount`.
- A freeze earned or a repair completed on another device is not toasted on
  this one (only the day's goal is re-announced from a sync); the numbers
  themselves are always right, because they are derived.
- The Excel mirror still exports the raw stored streak.
