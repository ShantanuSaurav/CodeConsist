# Devlingo

The developer training environment. 200 hand-checked lessons across 10 stages,
each stage capped by a LeetCode-style coding test, all graded by really running
your code - wrapped in a landing page and a dashboard with XP, streaks, a skill
roadmap and a leaderboard.

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
| `/dashboard/learn` | The ten stages with lesson progress and each stage's coding test |
| `/dashboard/challenges` | Search and filter all 210 challenges |
| `/dashboard/practice` | Playground - run JavaScript or Python for real |
| `/dashboard/roadmap` | Skill tree, filled in from your progress |
| `/dashboard/leaderboard` | Accounts ranked by server-verified XP |
| `/dashboard/achievements` | Figures, coverage by language, badges |
| `/dashboard/settings` | Account, Pro unlock, theme, reset |

You can use every page as a guest - progress is kept in the browser and merged
into an account when you sign in. Light and dark themes throughout.

## What is in the box

**200 lessons, 20 per stage**, in seven formats, plus one stage test each:

| Type | What you do |
| --- | --- |
| `quiz` | Pick the right answer, usually about a snippet |
| `output_prediction` | Say exactly what a program prints |
| `multi_select` | Pick every answer that applies |
| `fill_blank` | Type or choose the missing tokens, inline in the code |
| `pseudocode_order` | Drag scrambled pseudocode into the one correct order |
| `code_runner` | Write a function; it is graded by real test runs |
| `debug` | Find and fix a planted bug |

The path runs Programming Basics → Python → Data Structures → Algorithms → Web →
Backend → SQL → Git and Testing → System Design → Shipping.

**Stage tests.** Every stage ends in a mandatory coding problem on its own topic
- run-length encoding for Basics, an LRU cache for Data Structures, a sliding
window for Algorithms, a route matcher for Backend, an in-memory INNER JOIN for
SQL, a rate limiter for System Design, and so on. It unlocks once all 20 lessons
in the stage are solved, and the **next stage stays locked until it is passed**.
Tests are presented LeetCode-style: statement, worked examples, constraints, a
mix of visible and hidden test cases, and no hints until you have made an
attempt. Nothing can be skipped.

**Three real execution engines, and no faking.**

- JavaScript runs in a sandboxed Node child process (`node:vm`, no `require`,
  no `fs`, hard-killed after 8s). If the API is down it runs in a Web Worker,
  which the main thread can terminate — the only way to stop an infinite loop.
- Python is CPython compiled to WebAssembly (Pyodide) in a Web Worker, so an
  infinite loop is killed after 8s instead of freezing the tab. Each run gets a
  fresh namespace; the runtime itself is downloaded once per session.
- C, C++, Java and Go run only if you configure a Judge0 endpoint. Without one the
  app says there is no runtime rather than pretending to compile.

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

## Commands

| Command | Does |
| --- | --- |
| `npm run dev` | API + web together |
| `npm run dev:api` | API only (restarts when content changes) |
| `npm run dev:web` | Web only |
| `npm run build` | Type-check and build to `dist/` |
| `npm start` | Serve the built app **and** the API from one process on `:4000` |
| `npm run check` | Index, type-check, validate and lint all content |
| `npm run content:validate` | Correctness check: structure + really run every solution |
| `npm run content:lint` | Quality check: leaked hints, duplicate options, answer bias |
| `npm run content:index` | Regenerate `src/data/index.ts` after adding a batch |

## Adding challenges

Challenges live in `src/data/challenges/<stage-slug>-<batch>.ts`, each exporting
`challenges: Challenge[]`. Stage tests live in `stage-tests.ts` with
`isStageTest: true`, `examples` and `constraints`; the index splits them out
into `stage.test`. `docs/CONTENT_AUTHORING.md` has the rules and
`src/data/challenges/programming-basics-a.ts` shows every type.

After adding a file:

```bash
npm run check
```

`scripts/validate-content.mjs` is not a schema check. It compiles the content,
verifies structure per type, rejects duplicate ids, and for every executable
challenge it **runs the reference solution against every test case** — and
separately checks that a `debug` challenge's starter code actually fails. A
challenge that cannot be solved as written will not pass.

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

```
server/            Express API — auth, progress, grading, execution
  db.js            atomic JSON store
  content.js       compiles src/data with esbuild, caches to JSON
  runner/          the sandboxed child process that runs submissions
src/
  pages/           routed screens: Landing, DashboardLayout and the dashboard pages
  components/
    layout/        landing sections, Navbar, Sidebar, SkillRoadmap
    ui/            AuthModal, PageHeader
    *.tsx          PracticeModal (all challenge types), CodeEditor, CodeBlock,
                   LearningPath, ChallengeLibrary, EditorShowcase, Leaderboard
  context/         GameContext - progress, auth, theme, modals
  data/            stage metadata + 20 challenge batches (index.ts is generated)
  lib/             grading, level curve, progress insights, highlighter, workers
  services/        execution and content loading
  index.css        Tailwind entry and theme tokens
  styles/          component CSS for the practice modal, editor, toasts
scripts/           content validator and index generator
```

`src/lib/grading.ts` and `src/lib/leveling.ts` are compiled and imported by the
server too, so "correct" and "level 4" mean the same thing on both sides.

## Configuration

None required. Copy `.env.example` to `.env` for the optional knobs (API port,
JWT secret, Judge0 credentials); both the API and Vite read it.

Styling is Tailwind CSS v4 for pages and layout, with a small amount of plain
CSS (`src/styles`) for the practice modal and editor, both reading the same
theme tokens. Dark mode is the `.dark` class on `<html>`.

The `supabase/` directory is left over from an earlier hosted design and is not
wired up — the local API replaced it.
