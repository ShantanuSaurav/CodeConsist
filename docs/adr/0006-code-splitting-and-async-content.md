# 0006 - Code splitting and an asynchronous content bank

**Status:** accepted (2026-09)

## Context

After 0001-0005 the app was well structured and shipped as one 737 kB
JavaScript chunk (plus React and framer-motion), all of it downloaded, parsed
and executed before the first pixel. Measured with the source map, the chunk
was:

| Source | kB | Share |
| --- | ---: | ---: |
| challenge bank (`modules/challenges/content`) | 292 | 40% |
| articles (`modules/articles/content`) | 94 | 13% |
| roadmaps (`modules/roadmaps/content`) | 77 | 11% |
| zod (validating that content in the browser) | 52 | 7% |
| every module's UI, combined | ~150 | 21% |
| platform, ui, app | ~50 | 7% |

Two things follow. First, the usual remedy - `React.lazy` on page components -
would move about a fifth of the chunk and leave the three content banks and
zod in the shell, because `App.tsx` imported `ALL_CHALLENGES`, `resolveReading`
and `roadmapLinksForStage` statically. Second, the goal of a 1,000-question
bank is impossible with eager content: at ~1.4 kB a question that is 1.4 MB on
the critical path.

## Decision

### The bank is a separate public entry, loaded with `import()`

`@/modules/challenges/content` is a second public surface next to the module
barrel. The barrel no longer re-exports it. `app/content.ts` fetches it with a
dynamic import and builds the `ContentBundle`; `SessionProvider` accepts
`content: ContentBundle | null` and exposes `contentReady`.

The boundary check enforces this: a *static* import of any
`@/modules/<name>/content` from outside the module is a violation. That rule
is what keeps the property true after the next refactor.

### One gate, in the layout

`DashboardLayout` renders `PageSkeleton` until `contentReady`, then the page.
Pages never see an empty stage list, so none of them can mistake "not loaded"
for "not found" and redirect. The landing page renders immediately (its
counters fill in when the bank lands; the stage column holds its shape with
placeholders). Two components had to learn about readiness: the badge
watcher, which would otherwise seed "already seen" from an empty list and
re-announce every stage badge on load, and the practice session, which now
says "still loading" instead of "no challenges" for a click in the first
few hundred milliseconds.

### Every screen is its own chunk

`App.tsx` lazy-loads each page from its module barrel. Screens that need two
modules (learning path + reading links, article + related roadmaps) are tiny
route files in `app/routes/` that compose them via props, and are lazy-loaded
themselves - so rollup shares the module chunks between the routes that need
them. The reading panel inside the practice modal, the sign-in and Pro modals
and confetti are lazy inside their owners: they cost nothing until used.

The shell keeps what every visit needs: providers, router, layout frame and
the practice modal (the landing page can open it).

### The schema leaves the production bundle

`ContentSpec.schema` is now `() => Promise<ZodType>`. The Node loader awaits
it. The browser loader orders the records and returns them without validating,
then - in development only - fetches the schema and throws (console + uncaught
error, same message as CI) if anything is wrong. Production never calls it: a
bundle exists only because `npm run content:validate` passed on exactly these
files, so re-validating in every visitor's browser bought nothing and cost
them ~55 kB. Rollup still emits the schema+zod chunk, but nothing fetches it.

### Stale-deploy safety

Hashed chunk names change on every deploy. A tab opened before a deploy that
first visits a route afterwards asks for a chunk that no longer exists.
`app/lazy.ts` catches that specific failure, reloads once (guarded by
`sessionStorage` so an outage cannot loop) and otherwise lets the error reach
the `ErrorBoundary`.

### Readable chunk names

`chunkFileNames` derives names from the facade module - `roadmaps-*.js`,
`challenges-content-*.js`, `route-learn-*.js` - so the network tab and this
document agree. The vendor `manualChunks` moved to the function form because
the object form filed `react/jsx-runtime` under framer-motion, which made
every JSX chunk preload framer-motion.

## Consequences

Before → after, production build:

| | Before | After |
| --- | ---: | ---: |
| JavaScript before first paint | 1,053 kB (331 gz) | 281 kB (91 gz) |
| of which app code | 737 kB | 74 kB |
| zod in the browser | 52 kB | 0 |
| framer-motion on the critical path | yes | no (landing / modals only) |
| content chunks | in the shell | `challenges-content` 301 kB, `articles` 106, `roadmaps` 93, each cached independently |

- A content-only release invalidates only the content chunk in returning
  visitors' caches; a UI release leaves the bank cached.
- Adding a page: one `lazyPage(...)` line. Adding a composed page: a file in
  `app/routes/`.
- The bank still arrives whole (94 kB gzipped). The next step, when it grows
  past roughly 500 questions, is a manifest/body split: stage membership and
  titles in the bundle, prompts and tests fetched per stage when the modal
  opens. Nothing here has to change for that - consumers already handle
  `contentReady`.
- Dev-mode validation is asynchronous now, so a broken file renders (once)
  before the error appears in the console. The API server, which starts
  alongside Vite, still refuses to boot on the same file with the same
  message, and `npm run check` is the gate that matters.
- Vitest runs in development mode and awaits each bank's deferred check
  (`CHALLENGES_VERIFIED`, `ARTICLES_VERIFIED`, `ROADMAPS_VERIFIED`), so an
  invalid file fails the test suite as well as the scripts.
