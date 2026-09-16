# 0001 - Modular monolith

**Status:** accepted (2026-09)

## Context

The app started as a flat SPA: `components/`, `lib/`, `services/`, `data/`, one
827-line context holding auth, progress, theme, toasts and the practice modal.
Every new feature (roadmaps, articles, stage tests) widened that context and
added imports between unrelated screens. Growth was going to mean a rewrite.

## Decision

One deployable app, internally partitioned by business domain with a strict
dependency direction:

```
src/
  app/        composition root: providers, routes, the shell (Sidebar, DashboardLayout)
  modules/    business domains: challenges, articles, roadmaps, dashboard,
              leaderboard, achievements, playground, account, landing
  platform/   infrastructure any module may use: session, events, content-registry,
              grading-engine, xp-leveling, progress, execution, api-client,
              storage, theme, markdown
  ui/         presentational primitives with no business logic
  types/      contracts shared by two or more areas
  config/     routes, env
```

`app → modules → platform → ui / types / config`. Arrows only point down.
Modules never import each other (see 0003 for how they cooperate). Every module
has the same shape - `index.ts` (public API), `content/`, `components/`,
`pages/`, `services/`, `schema.ts`, `__tests__/`, `README.md` - so anyone can
navigate any module.

Where one module's screen needs another module's data (a challenge card wants
the link to its article section; the article page wants the roadmap topics
that reference the stage), the **app passes it in as a prop** (`readingFor`,
`relatedFor`). The module declares what it needs; the app decides who provides
it.

## Consequences

- A contributor adding a topic touches one folder. Adding a feature adds one
  module folder and one line in `app/App.tsx`.
- The god-context is gone: `platform/session` holds identity + verified progress
  + content; theme and toasts are their own providers; the practice modal's
  state is owned by the challenges module.
- The cost is indirection: opening the practice modal from the roadmap is an
  event, not a function call, and reading links are props rather than imports.
  That indirection is the point - it is what keeps N modules from becoming N²
  import edges.
- Not done (deliberately): no re-export shims for the old paths. Nothing outside
  this repo imported them, and shims would themselves violate the boundaries.
