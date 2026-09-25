# 0008 - One settings store, and a daily activity log in the learner's time zone

## Context

The learning loop (units, a daily goal and a forgiving streak, wrong answers
that teach, placement, a weekly league) needs dozens of rules - XP penalties,
the level curve, streak and time-zone rules, data limits - and the owner wants
every one of them visible and editable in the admin panel, applied without a
redeploy. Guests must keep playing with no account, and the server must stay
the only authority on XP.

It also needs to know *when* a learner did things, in their own day. Before
this, the only history was `progress.attempts[id].solvedAt` - overwritten by
every re-solve, counted in the server's zone - so "XP today" counted
re-solves, old lessons jumped onto today's heatmap cell, and a learner in
Los Angeles had their evening counted as tomorrow. Wrong answers were not
recorded at all, which is why the admin's "Most missed" list could never show
anything.

## Decision

1. **Settings are numbers, switches and short copy - nothing else.** Defaults
   live in code (`src/platform/settings/defaults.ts`, importing the constants
   from the functions that use them so they cannot drift). `db.json` holds
   only the admin's sparse overrides and a revision
   (`db.settings = { overrides, revision, updatedAt, updatedBy }`). The
   effective settings are *defaults → environment → overrides*.
2. **Content is not settings.** Unit groupings, explanations, per-option
   feedback and concept cards are content: they live in `contentOverrides`
   and reach learners through `/api/content`, edited on their own admin
   pages. The settings store never holds lesson text.
3. **One metadata table drives everything.** `SETTING_META` gives every key
   its label, help, kind and bounds; the zod schema, the admin form and the
   merge's notion of a "leaf" are all built from it, and a unit test fails if
   any default has no metadata. A stored section that stops validating after
   a code change falls back to its defaults (and is reported to the admin) -
   the server never crashes on bad settings.
4. **Learners follow the revision.** `/api/health` and every solve response
   carry `settingsRevision`; a client whose cached revision differs refetches
   `GET /api/settings` (public, no retention/access sections). The server
   applies a change to the very next request.
5. **One shared implementation.** Settings, day maths, the activity reducer
   and the miss reducer are pure code in `src/platform`, bundled for the
   server as `server/generated/learning.mjs` (`src/platform/server-lib.ts`).
   Guests run it locally; the server re-runs it and wins.
6. **Days are the learner's.** A day is a `yyyy-mm-dd` key in the learner's
   IANA zone:
   - the zone comes from the browser (`X-Time-Zone` on every request) and is
     stored on the account (`users[].preferences.timeZone`) by write routes
     only - on first sight, or when it changed and
     `streak.timeZoneChangeCooldownHours` has passed; invalid values are
     ignored;
   - without one, `streak.defaultTimeZone`, else the server's own zone (the
     old behaviour);
   - **the day never moves backwards**: today is the latest of the local day,
     the log's last day and `lastActiveDay` (anything later than UTC+14 is
     ignored), so flipping zones cannot replay a day.
7. **One activity store per learner.** `db.activity[userId]` holds day rows
   (XP actually awarded, first-time lessons and tests, re-solves, mistakes),
   per-question miss summaries and a capped miss log. A miss is never an
   attempt (badges are derived from `attempts`), a correct answer is never a
   miss (the server re-grades), and code is never stored (a code miss is a
   pass count). Guest logs merge into an account idempotently: XP only from
   re-priced new solves, max per day for counters, a union for the log.
8. **Additive migration.** `SCHEMA_VERSION` 2 adds `settings`, `activity` and
   `users[].preferences`; `load()` copies the old file to
   `db.json.pre-v2-<ts>` first. No progress row is rewritten; old history is
   backfilled once from `attempts` and marked `source: 'backfill'`.

## Consequences

- Every later phase adds its keys to the same store, its sections to the same
  admin page (`/admin/rules/:sectionId`), and its per-day counters to the same
  day row - no new stores for goals, reviews or leagues.
- `attempts[id].solvedAt` now means the first solve; `lastSolvedAt` and
  `solves` are new. The backfill is approximate (old solve times were
  overwritten) and says so.
- A level curve change is retroactive by design (levels derive from XP); the
  admin page previews how many learners it moves and never touches XP.
- zod stays out of the learner shell: only the server and the lazy admin
  chunk import `settings/schema.ts`.
