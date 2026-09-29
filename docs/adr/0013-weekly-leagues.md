# 0013 - A weekly league on each learner's own calendar, counted from the activity log

## Context

The only board was all time: ranked by total XP, so a newcomer could never
catch up and nothing changed from week to week. The board also did not know
who was looking at it - it matched the learner's row by username, and a
learner below the top 50 could not see their place at all.

A weekly board is only fair if the XP it counts cannot be farmed. Before
this phase, a progress reset let a learner solve the same lessons again and
be paid again, merged guest or offline days were not checked by the server
as they happened, and the answer key is still in the client bundle (owner
decision 1). Learners are spread over time zones, so "this week" is not the
same span of hours for everyone.

This record covers all of Phase 6: the weekly league, its tiers (off by
default), the admin page, and the all-time board's polish.

## Decision

1. **A week is days, on each learner's own calendar.**
   - A week runs Monday to Sunday (or Sunday to Saturday, `league.weekStartsOn`)
     over the same day keys as the activity log, so a learner's week starts
     at their own midnight. Its id is its first day.
   - `weekFor(day, weekStartsOn, knownWeeks)` (src/platform/league/league.ts)
     returns the stored week that covers the day, else the natural week cut
     so it never overlaps a stored one. Changing the start day therefore
     makes one shorter transition week, never two weeks covering one day.
   - A week is final at UTC midnight after its last day plus
     `league.finalizeDelayHours` (12 by default), by which time every zone
     has finished that day.

2. **Weekly XP is summed, never stored.**
   - Each activity day has a `leagueXp` field: the part of that day's XP that
     counts. A solve counts only when it is the first time this account was
     ever paid for that challenge (`everSolved`, kept by a progress reset),
     and - unless `league.countUnverifiedSolves` is on - only when the server
     checked the answer itself. The daily-goal bonus and test-out XP count
     under the same rules; Practice XP counts while `countReviewXp` is on;
     merged days count only while `countMergedXp` is on (off by default).
   - A learner's weekly XP is `max(0, Σ leagueXp over the week's days −
     baseline)`. Nothing else is stored per learner, so a merged or corrected
     day changes the board without bookkeeping, and an admin reset is only a
     baseline.
   - Ranking is XP descending, then the earlier join time, then the
     username; ranks are competition style (1, 2, 2, 4).

3. **Weeks close lazily and on a timer, never twice.**
   - `closeDueWeeks(now)` closes every open week past its final time: on any
     league or leaderboard read, once at startup and every ten minutes on an
     `unref()`'d interval next to the listen call. It never throws; a
     closed week is skipped, so it is idempotent.
   - Closing writes `results` (with tiers: each group's outcomes and the new
     tier records) and prunes closed weeks beyond
     `retention.leagueWeeksKept`.
   - A week past its final time takes no more changes even before the close
     has run: a reset or an exclusion answers 409, and every admin league
     route closes due weeks first.

4. **Tiers ship off** (owner decision 4) until about 60 learners play each
   week. With `league.tiers.enabled`, a learner joins the newest group of
   their tier with room; at close the top `promoteCount` (with at least
   `minXpToPromote`) move up and, in a group larger than up plus down, the
   bottom `demoteCount` move down, never past either end. A week keeps the
   tier rules it started with, so a change applies from the next week.
   - A group is ranked at close over the same learners its board shows (XP
     above 0, not excluded), so the zones a learner sees are what happens;
     a member left at 0 XP by an admin reset keeps their tier.
   - A learner who joined the next week before this one closed (Monday
     morning) is moved to a group of their new tier when it does.
   - An admin's Move tier during the week wins over that week's outcome;
     the result records the tier they end up in.

5. **Admin actions are deliberate and audited** (server/leagues-admin.js,
   mounted inside `createAdminRouter` after `requireAdminAuth`).
   - Close week now and Reset week XP need `{ confirm: <week id> }` in the
     body (the page makes the admin type it); a closed week answers 409.
   - Exclude/Reinstate (a reason of at most 200 characters) and Move tier
     (tiers on only; it applies from the next week).
   - Each is written to the audit log with ids and numbers - the exclusion
     reason cut to 120 characters, never anything else from the body.
   - The league's rules are the `league` section of the Rules page
     (`/admin/rules/league`); last week's banner texts are in `reminders`.

6. **The boards know who is looking.** `GET /api/leaderboard` and
   `GET /api/leagues/current` read the optional session: rows carry `isYou`,
   and the viewer's own place (`me`) is worked out before the board is cut
   to `league.boardSize`, so a learner below the shown rows still sees it,
   pinned under the table. A guest may pass `?tz=` (validated) to see the
   week and countdown in their zone; they can watch but are not ranked.

7. **Last week's result is a reminder banner**, the lowest priority of the
   in-app reminders, keyed to that week so dismissing it hides it for good.
   Only the closed week that ends the day before the current one is "last
   week": after weeks nobody played, or before last week has closed, there
   is no result to show.

8. **Deleting an account forgets it in the league** (`forgetLeagueIdentity`):
   its membership, join times, baselines, exclusions and groups go, and its
   past results keep their rank and XP with no id or name.

## Consequences

- The league is only as fair as the XP it counts. Re-solves after a reset
  and merged days are shut out; the public answer key is not, so any future
  XP source that can repeat must set `leagueXp` explicitly and carry a
  daily cap.
- Summing each learner's days on every read is O(learners × 7) per read.
  That is fine at this size; a busy server would cache the board per
  revision of the activity log.
- A learner who changes time zone mid-week may see their week shift by a
  day; the cooldown on zone changes (ADR 0010) limits how often.
- Admins see the id of the admin who closed a week, not a name; there is
  one admin today.
- The all-time board's `me.rank` is its position (1-based) on the sorted
  board, not a competition rank; ties there are broken by solves.
