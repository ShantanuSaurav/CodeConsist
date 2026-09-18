# 0007 - Language tracks, Learn/Practice modes and the admin console

## Context

Two implementations of Devlingo existed: this modular monolith (articles,
roadmap.sh-style roadmaps, the content registry, tests, code splitting) and a
flat-layout fork that had grown beginner teaching (`Concept` walk-throughs),
language tracks with C and C++ stages, a server-side Judge0 proxy and an
administrator console. They had to become one product without losing either.

## Decision

1. **This architecture stays.** Everything from the fork was integrated *into*
   `app → modules → platform → ui/types/config`; nothing was flattened.
   The teaching components live in `modules/challenges/components/lesson`,
   the console is `modules/admin` (its own lazy chunk), tracks are content
   metadata next to `stages.ts`.
2. **The ten-stage path is untouched.** The fork split the path per language
   (Python alone, JavaScript as nine stages). We keep the core path as ONE
   track - Programming Basics → Python → … → Shipping, each stage gated by
   its test exactly as before - and add C and C++ as *additional* tracks.
   `platform/progress.applyProgressByTrack` runs the unchanged lock rule once
   per track, so a C stage never waits on Stage 10 and Stage 3 never waits
   on C.
3. **One progress system.** Tracks are a filter over the one bank, not a
   store; the only new field is `seenConcepts`, local-only and worth no XP.
   The Learn/Practice preference is a session preference like the theme.
4. **Two journeys, one engine.** Learn mode shows a concept once (intro →
   example → why → try-it → quick check), marks later lessons as practice and
   explains wrong answers immediately. Practice mode goes straight to the
   question and keeps the "have another look" rule. Grading, XP, streaks,
   stage tests and unlocking are identical; the mode is asked once and can be
   changed anywhere.
5. **Judge0 moves behind the API.** The browser never sees the key again;
   `/api/health` reports only whether compiled languages are available.
6. **Answer-graded stage tests where no engine exists.** The schema still
   requires a `code_runner` with examples for JavaScript/Python; C and C++
   stage tests are `fill_blank`, verified server-side like every lesson.
7. **Admin edits are overrides.** The console can hide, reorder, re-label and
   re-price content, stored in `db.json` and merged by `server/content.js`.
   The questions' logic stays in authored TypeScript where `npm run check`
   executes it.

## Consequences

- Content counts change: 244 challenges, 12 stages, 7 concepts. Stage 1 has
  22 lessons (two concept-led openers before the original twenty).
- C and C++ have no stage article yet; `validate-extras` reports it as a
  warning and the cards offer no "Read first". Authoring those is open work.
- `.env` is loaded by `server/env.js` rather than `--env-file-if-exists`:
  under `--watch-path` the flag restarted the API on every `db.json` save.
- Every `Stage` now carries `language`; every stage id belongs to exactly one
  track (a test enforces both).
