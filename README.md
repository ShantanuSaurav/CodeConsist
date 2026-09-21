# CodeConsist

The developer training environment. 232 hand-checked lessons across 12 stages
on three tracks - the ten-stage developer path plus C and C++ - each stage
capped by a mandatory test, all graded for real. Two ways through: **Learn
mode** teaches each new idea before asking about it (theory → example → try it
→ quick check → practice); **Practice mode** goes straight to the questions.
Wrapped in a landing page, a dashboard with XP, streaks, ten roadmap.sh-style
roadmaps, a reading article per stage, a leaderboard and an admin console.

Everything runs on your machine. No cloud account, no Docker, no native build step.

Live demo of the front end: <https://devlingo-sand.vercel.app/> (static hosting
only, so it runs in guest mode - see **Deploying** below).

```bash
npm install
npm run dev
```

Then open <http://localhost:3000>. That starts two things:

| | |
| --- | --- |
| **web** | Vite dev server on `:3000` |
| **api** | Node API on `:4000`, proxied at `/api` |

The app works with the API down — progress falls back to `localStorage` and
JavaScript runs in a Web Worker instead — it just tells you so rather than
failing silently. If the API is simply slower to boot than Vite, the page
retries and connects on its own.

To run it as one process instead:

```bash
npm run build
npm start          # app + API together on http://localhost:4000
```

## The app

| Route | What is there |
| --- | --- |
| `/` | Landing page - hero, how it works, a real challenge to try, your own streak and level |
| `/dashboard` | Streak, XP, level, "continue learning", activity heatmap, daily goals, achievements |
| `/dashboard/learn` | Pick a track (developer path, C, C++), choose Learn or Practice, and work the stages and their tests |
| `/dashboard/challenges` | Search and filter all 244 challenges, by track, stage, type, difficulty and status |
| `/dashboard/practice` | Playground - run JavaScript or Python for real; Java, C and C++ through Judge0 when configured |
| `/dashboard/roadmap` | Developer roadmaps (roadmap.sh-style) plus your track as one connected path |
| `/dashboard/roadmap/:slug` | One roadmap: topic graph, per-topic notes and links, done/learning/skip tracking |
| `/dashboard/learn/:stage/read` | The stage's article - the reading that goes with its lessons |
| `/dashboard/leaderboard` | Accounts ranked by server-verified XP |
| `/dashboard/achievements` | Figures, coverage by language, badges |
| `/dashboard/settings` | Account, Pro unlock, theme, learning mode, track, reset |
| `/admin` | Administrator console - its own sign-in, users, tracks, stages, challenges, analytics, audit log |

You can use every page as a guest - progress is kept in the browser and merged
into an account when you sign in. Light and dark themes throughout.

## What is in the box

**232 lessons** (the ten core stages have 20 each - Stage 1 opens with two
extra concept-led lessons - and the C and C++ stages 15 each), in seven
formats, plus one stage test per stage:

| Type | What you do |
| --- | --- |
| `quiz` | Pick the right answer, usually about a snippet |
| `output_prediction` | Say exactly what a program prints |
| `multi_select` | Pick every answer that applies |
| `fill_blank` | Type or choose the missing tokens, inline in the code |
| `pseudocode_order` | Drag scrambled pseudocode into the one correct order |
| `code_runner` | Write a function; it is graded by real test runs |
| `debug` | Find and fix a planted bug |

The developer path runs Programming Basics → Python → Data Structures →
Algorithms → Web → Backend → SQL → Git and Testing → System Design → Shipping.
C Fundamentals and C++ Fundamentals are separate tracks with their own lock
chain - switch tracks from the Learn page or the sidebar; each keeps its own
progress, all of it in the one account.

**Learn mode and Practice mode.** The first stage you open asks how you want
to learn, and remembers the answer (change it any time from the modal header,
the Learn page or Settings). In Learn mode a lesson that introduces a new idea
first walks through it - a plain explanation, an annotated example, *why it
works*, a tiny ungraded "try it" that really runs, then the quick check - and a
wrong answer explains itself immediately, naming the option you picked. The
lessons that follow are marked as practice of that idea. Practice mode shows
the question straight away and keeps the "have another look" rule. Both modes
use the same challenge engine, grading, XP, streaks and stage unlocking; only
the journey to the question differs.

**Stage tests.** Every stage ends in a mandatory test on its own topic - a
coding problem wherever the language has an engine here (run-length encoding
for Basics, an LRU cache for Data Structures, a sliding window for Algorithms,
a route matcher for Backend, an in-memory INNER JOIN for SQL, a rate limiter
for System Design, and so on), and an answer-graded problem for C and C++,
which have no local compiler. It unlocks once every lesson in the stage is
solved, and the **next stage in the track stays locked until it is passed**.
Tests are presented LeetCode-style: statement, worked examples, constraints, a
mix of visible and hidden test cases, and no hints until you have made an
attempt. Nothing can be skipped.

**Reading before doing.** Every stage has an article (`src/modules/articles/content/*.md`,
about 10 minutes each) split into sections tagged with the concepts they explain.
The stage card offers it as "Read first", every challenge card links to the exact
section, and inside the practice modal a "Read about this topic" panel unfolds the
matching section above the prompt - reading is never penalised. `npm run
content:extras` checks that every core-path challenge maps to a section by tag.
The C and C++ stages have no article yet (their lessons carry the concept
walk-throughs instead); the check reports it and their cards offer no "Read first".

**Roadmaps.** Ten roadmap.sh-style maps - Frontend, Backend, Full Stack, DevOps,
JavaScript, Python, SQL, Computer Science, System Design, Git & GitHub - with 200+
topics. Each topic has a short explanation, curated free resources (official docs,
MDN, free courses and books), a link to the community version on roadmap.sh, and,
where CodeConsist covers it, a jump into the stage's lessons and article. Topics can
be marked done / learning / skipped; that lives in the browser and earns no XP,
because nothing verifies it. The roadmaps' structure and text are CodeConsist's own:
roadmap.sh's content is copyrighted and is linked to, never copied.
`npm run content:links` HEAD-requests every external URL.

**Three real execution engines, and no faking.**

- JavaScript runs in a sandboxed Node child process (`node:vm`, no `require`,
  no `fs`, hard-killed after 8s). If the API is down it runs in a Web Worker,
  which the main thread can terminate — the only way to stop an infinite loop.
- Python is CPython compiled to WebAssembly (Pyodide) in a Web Worker, so an
  infinite loop is killed after 8s instead of freezing the tab. Each run gets a
  fresh namespace; the runtime itself is downloaded once per session.
- C, C++, Java and Go run only if you configure a Judge0 endpoint **on the API
  server** (`JUDGE0_API_URL` / `JUDGE0_API_KEY` in `.env`). The key never
  reaches the browser: every compiled-language run goes through
  `POST /api/execute`, and `/api/health` only says whether one is configured so
  the Playground can label those languages "needs setup". Without one the app
  says there is no runtime rather than pretending to compile.

**Accounts and progress.** bcrypt password hashing, JWT sessions, XP, levels,
day-based streaks and a leaderboard, stored in `server/data/db.json` (atomic
writes, so a crash mid-save cannot truncate it). Play as a guest and your local
progress is merged into the account when you sign in.

The server owns the verdict as well as the XP. A solve sends what you answered;
the server re-checks it - quiz, blanks and ordering by the same rules the
browser used, JavaScript by running the tests in its own sandbox, Python through
a local CPython when one is installed - and only then pays out. Solves made
while the API was unreachable are kept locally and pushed up on the next visit.

**Sandboxing.** Submitted JavaScript runs in a `node:vm` context that receives
nothing from the host realm - not even a console callback, since any host
object's `.constructor` chain leads back to the real `process`. Code
generation (`eval`, `new Function`) is disabled inside it. Do not loosen this.

**Administrator console.** `/admin` is a separate app with a separate credential
system - an Admin User ID and password you choose in `.env` (`ADMIN_USER_ID`,
`ADMIN_PASSWORD`) the first time the server starts; the password is hashed with
bcrypt, stored once, and never read from `.env` again. It is not a learner
account, never appears in the leaderboard, and its 12-hour token is invalidated
the moment the credentials change. From there you can see users and their
progress, hide or reorder stages within a track, re-word or re-price a
challenge, unpublish a track, read the audit log and, optionally, mirror
learner accounts into an Excel table through Microsoft Graph. Every one of
those edits is an *override* layered on the authored content in `db.json` -
the questions themselves stay in TypeScript where `npm run check` executes
them. Every `/api/admin/*` route re-checks the admin token against the live
admin record on each request; nothing in the browser is the gate.

## Commands

| Command | Does |
| --- | --- |
| `npm run dev` | API + web together |
| `npm run dev:api` | API only (restarts when content changes) |
| `npm run dev:web` | Web only |
| `npm run build` | Type-check and build to `dist/` |
| `npm run preview` | Serve `dist/` as production would (guest mode; no API) |
| `npm start` | Serve the built app **and** the API from one process on `:4000` |
| `npm run check` | Everything below, in sequence - required before a merge |
| `npm run lint:boundaries` | Enforce the dependency direction between areas and modules |
| `npm run content:parity` | Prove the Vite and Node content loaders select the same files |
| `npm run test` | Unit and integration tests (vitest) |
| `npm run content:validate` | Correctness check: structure (incl. concepts and tracks) + really run every solution |
| `npm run content:lint` | Quality check: leaked hints, duplicate options, answer bias |
| `npm run content:extras` | Validate the articles and roadmaps (sections, tags, node ids, URLs) |
| `npm run content:links` | The same, plus a live check of every external link |

## Adding challenges

Challenges live in `src/modules/challenges/content/<topic>/<batch>.ts`, each
exporting `challenges: Challenge[]`. Stage tests live in
`content/stage-tests.ts` with `isStageTest: true`. Stage metadata is
`content/stages.ts` and the tracks (which stages form which path) are
`content/tracks.ts`. Every other file under `content/` is discovered
automatically - a new topic is a new folder, with no index to regenerate.
`docs/CONTENT_AUTHORING.md` has the rules, including how to give a lesson a
beginner `concept`; `content/programming-basics/a.ts` shows every type and the
first two lessons show concepts.

After adding a file:

```bash
npm run check
```

Content goes through the **content registry** (`src/platform/content-registry`):
a zod schema per content kind (`modules/<name>/schema.ts`) is applied at build
time by the same code the browser, the API server and the scripts all use, so
a malformed challenge fails with its file path and field rather than crashing a
learner's session. `scripts/validate-content.mjs` then adds what a schema
cannot express, and for every executable challenge it **runs the reference
solution against every test case** — and separately checks that a `debug`
challenge's starter code actually fails. A challenge that cannot be solved as
written will not pass.

JavaScript runs in a Node VM. Python runs through a local CPython 3 if one is on
PATH (`python3`, `python` or `py`); if there is none the run says so explicitly
rather than quietly reporting those challenges as verified.

## Deploying

`npm run build && npm start` serves the app and the API from one Node process,
which is the whole thing. A static host (Vercel, Netlify, GitHub Pages) can only
serve `dist/`: the app then runs in **guest mode** - progress in
`localStorage`, JavaScript graded in a Web Worker, Python via Pyodide - and
says so, but there are no accounts, no leaderboard and no server-verified XP.
For the full experience host the API on a Node service and point the front end
at it with `VITE_API_PROXY` (dev) or same-origin `npm start` (prod).
`vercel.json` adds the SPA rewrites client-side routing needs.

## Layout

A modular monolith with one dependency direction, enforced by
`npm run lint:boundaries` (see `docs/adr/`):

```
app  →  modules  →  platform  →  ui / types / config
```

```
src/
  app/                composition root: providers, lazy routes (routes/), the shell,
                      the async content loader, content-specs.ts
  modules/            business domains - same shape in every folder, own README
    challenges/       the bank (content/<topic>/, stages.ts, tracks.ts), 7 challenge
                      types (a registry), the concept walk-through (components/lesson/),
                      Learn/Practice chooser, practice modal + session, learning path, library
    admin/            the administrator console at /admin (own session, own chunk)
    articles/         per-stage reading (content/*.md), reading panel, article page
    roadmaps/         roadmap.sh-style maps (content/*.ts), topic progress, hub/detail
    dashboard/  leaderboard/  achievements/  playground/  account/  landing/
  platform/           infrastructure any module may use
    session/          identity, verified progress, content bank, execution, leaderboard
    events/           the typed event bus modules talk through
    content-registry/ discovery + zod validation shared by Vite and Node loaders
    grading-engine/   grading primitives (shared with the server), answer helpers
    xp-leveling/      level curve, streaks, scoring, derived insights
    progress/         stage unlocking, evaluated once per language track
    execution/        JS sandbox worker, Pyodide worker, Judge0 client
    api-client/  storage/  theme/  markdown/
  ui/                 presentational primitives (CodeBlock, CodeEditor, toasts, hooks, theme CSS)
  types/              contracts shared across areas
  config/             routes, env
server/               Express API — auth, progress, grading, execution, admin
  env.js              loads .env first (in code - see docs/adr/0007)
  content.js          loads the bank through the content registry, caches to JSON,
                      merges admin overrides
  auth.js / admin-auth.js / admin.js   learner and administrator sessions, the admin API
  excel.js            optional, best-effort Microsoft Excel mirror of learner accounts
  runner/             the sandboxed child process that runs submissions
scripts/              validators, linters, parity and boundary checks
docs/adr/             why the structure is the way it is
```

Modules never import each other. They cooperate through `platform/events`
(`challenge:completed`, `practice:open`, …) or through props the app passes in
(`readingFor`, `relatedFor`).

### What the browser downloads

Every screen is its own chunk and the challenge bank is another, fetched with
`import()` after the shell paints (`docs/adr/0006`). Production build:

| Chunk | Loaded | gzipped |
| --- | --- | ---: |
| `index` (providers, router, layout, practice modal) + `react` + `icons` | first paint | ~91 kB |
| `challenges-content` | right after, in parallel | 94 kB |
| `landing` + `motion` | on `/` | 47 kB |
| `dashboard`, `route-learn`, `roadmaps`, `articles`, … | the screen you open | 1-43 kB each |
| `types` (zod + the schemas) | never - development and CI only | - |

Content-only releases leave every UI chunk cached in returning browsers, and
the other way round. `npm run build` prints the table; the boundary check
refuses a static import of a content bank, which is what would silently put it
back on the critical path. `src/platform/grading-engine/grading.ts` and
`src/platform/xp-leveling/leveling.ts` are compiled and imported by the server
too, so "correct" and "level 4" mean the same thing on both sides.

## Configuration

None required. Copy `.env.example` to `.env` for the optional knobs (API port,
JWT secret, Judge0 credentials, the administrator bootstrap, the Excel mirror).
The API loads it itself (`server/env.js`) and Vite reads it for the dev proxy.

Styling is Tailwind CSS v4 for pages and layout, with a small amount of plain
CSS (`src/styles`) for the practice modal and editor, both reading the same
theme tokens. Dark mode is the `.dark` class on `<html>`.

The `supabase/` directory is left over from an earlier hosted design and is not
wired up — the local API replaced it.
