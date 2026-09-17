# modules/roadmaps

**Owns:** the roadmap.sh-style skill maps (`content/*.ts`, one file each), per-topic done/learning/skipped tracking in `localStorage`, the hub and detail pages, and the stage skill tree.

**Public API (`index.ts`):** `RoadmapPage`, `RoadmapDetailPage`, `SkillRoadmap`, `ROADMAPS`, `roadmapsForStage`, `roadmapLinksForStage`, `RoadmapSchema`, `summarise`.

**Emits:** `practice:open`, `practice:openTest`, `account:openPro` (from topic nodes).

**Listens:** nothing.

**Does not own:** XP - roadmap progress is the learner's own judgement and is never verified. The reading link in a topic drawer comes from the app (`readingFor`).

Same layout as every module: `content/` (data + `spec.ts` + glob `index.ts`),
`components/`, `pages/`, `services/`, `schema.ts`, `__tests__/`. Anything not
exported from `index.ts` is private; `npm run lint:boundaries` enforces it.
