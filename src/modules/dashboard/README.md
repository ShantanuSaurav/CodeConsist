# modules/dashboard

**Owns:** the home screen: streak / XP / level cards, continue-learning, the 14-week activity heatmap, daily goals and recent achievements - all derived from the session.

**Public API (`index.ts`):** `DashboardHome`.

**Emits:** `practice:open`, `practice:openTest`.

**Listens:** nothing.

**Does not own:** the numbers themselves (`platform/xp-leveling/insights`).

Same layout as every module: `content/` (data + `spec.ts` + glob `index.ts`),
`components/`, `pages/`, `services/`, `schema.ts`, `__tests__/`. Anything not
exported from `index.ts` is private; `npm run lint:boundaries` enforces it.
