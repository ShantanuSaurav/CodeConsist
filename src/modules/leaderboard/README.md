# modules/leaderboard

**Owns:** the ranking tables and page - "This week" (the weekly league) and
"All time" tabs, the tab remembered in this browser (`leaderboardTab`).

- `WeeklyLeague` - this week's board (`GET /api/leagues/current` through the
  session's `league`): week XP and streak per learner, when the week ends,
  with tiers on the learner's tier and who is in line to move up or down,
  and the learner's own place pinned below when it is not among the rows.
  A guest can watch; "Sign in to join" asks them to sign in. The tab is
  hidden while the admin has the league off, and on an older server.
- `Leaderboard` - the all-time board (XP, level, solved, streak), the
  learner's own row marked by the server (`isYou`) and their place pinned
  below when it is outside the shown rows (`me`).

**Public API (`index.ts`):** `LeaderboardPage`, `Leaderboard`, `WeeklyLeague`.

**Emits:** `account:openAuth` (sign-in prompt).

**Listens:** `challenge:completed` - refreshes the standings while the API is online.

**Does not own:** the data (`platform/session` fetches it; the server ranks
it) or last week's result banner (`app/layout/HabitBanner`).

Same layout as every module: `content/` (data + `spec.ts` + glob `index.ts`),
`components/`, `pages/`, `services/`, `schema.ts`, `__tests__/`. Anything not
exported from `index.ts` is private; `npm run lint:boundaries` enforces it.
