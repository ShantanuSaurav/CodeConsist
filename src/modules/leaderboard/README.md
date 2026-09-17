# modules/leaderboard

**Owns:** the ranking table and page.

**Public API (`index.ts`):** `LeaderboardPage`, `Leaderboard`.

**Emits:** `account:openAuth` (sign-in prompt).

**Listens:** `challenge:completed` - refreshes the standings while the API is online.

**Does not own:** the data (`platform/session` fetches it; the server ranks it).

Same layout as every module: `content/` (data + `spec.ts` + glob `index.ts`),
`components/`, `pages/`, `services/`, `schema.ts`, `__tests__/`. Anything not
exported from `index.ts` is private; `npm run lint:boundaries` enforces it.
