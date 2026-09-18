# modules/achievements

**Owns:** the achievements page (level, figures, coverage by language, badges) and the `BadgeToaster` that announces a badge the moment it is earned.

**Public API (`index.ts`):** `AchievementsPage`, `BadgeToaster`.

**Emits:** nothing.

**Listens:** it watches session state rather than one event, so badges earned through a merge or restore are announced too.

**Does not own:** badge definitions (`platform/xp-leveling/insights.achievements`).

Same layout as every module: `content/` (data + `spec.ts` + glob `index.ts`),
`components/`, `pages/`, `services/`, `schema.ts`, `__tests__/`. Anything not
exported from `index.ts` is private; `npm run lint:boundaries` enforces it.
