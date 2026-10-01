# modules/dashboard

**Owns:** the home screen: streak / XP / level cards, continue-learning, the 14-week activity heatmap, daily goals and recent achievements - all derived from the session.

**Public API (`index.ts`):** `DashboardHome`.

**Emits:** `practice:open`, `practice:openTest`.

**Listens:** nothing.

**Does not own:** the numbers themselves (`platform/xp-leveling/insights`).

**Motion (docs/design/MOTION.md):** the continue-learning card is the page's
one raised surface (never lifts) and its bar fills once on mount (slides in
from the track's clipped edge, `--dur-slower` `--ease-out`); the stat row is the
one `.stagger` group and its XP / Level / Solved figures count up once per
session (`components/CountUp`, `MOTION.slower` on the `--ease-out` curve,
skipped below 10, on later visits and under reduced motion). The streak tile
stays static so it never disagrees with the header. Local styles live in
`styles/dashboard.css`, tokens only.

Same layout as every module: `content/` (data + `spec.ts` + glob `index.ts`),
`components/`, `pages/`, `services/`, `schema.ts`, `__tests__/`. Anything not
exported from `index.ts` is private; `npm run lint:boundaries` enforces it.
