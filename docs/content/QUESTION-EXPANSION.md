# Question expansion — 5 October 2026

## Request and boundaries

Add at least 500 original questions, with correct answers and correct topic, track, reading and roadmap placement. Work in `Devlingo-redesign`; do not rebuild/restart the live checkout. Preserve all 246 existing questions, their IDs, stage tests and progress data. No database migration, route change, authentication change or grading-engine replacement.

## Plan and progress

- [x] Audit registry, schemas, unit grouping, existing articles, stage/track boundaries and validation commands.
- [x] Author 500 additional questions with plausible distractors, explanations and hints.
- [x] Execute every new output-prediction snippet; review conceptual questions and reference contracts, with review limitations recorded in QUESTION-SOURCES.md.
- [x] Add regression checks for exact counts, existing-content preservation, unique IDs, stage/language/topic placement and article resolution.
- [x] Update current content counts and unit expectations without weakening gates.
- [x] Run complete checks, tests, production build and distribution budget.
- [x] Record final evidence, limitations and continuation instructions here.

## Coverage contract

| Stage | Subject | New questions | ID range |
| --- | --- | ---: | --- |
| stage-1 | JavaScript fundamentals | 50 | stage-1-c01–c50 |
| stage-2 | Python fundamentals | 50 | stage-2-c01–c50 |
| stage-3 | Data structures | 40 | stage-3-c01–c40 |
| stage-4 | Algorithms | 40 | stage-4-c01–c40 |
| stage-5 | Web development | 40 | stage-5-c01–c40 |
| stage-6 | Backend APIs | 40 | stage-6-c01–c40 |
| stage-7 | Databases and SQL | 40 | stage-7-c01–c40 |
| stage-8 | Git, tooling and testing | 40 | stage-8-c01–c40 |
| stage-9 | System design | 40 | stage-9-c01–c40 |
| stage-10 | Production projects | 40 | stage-10-c01–c40 |
| stage-c1 | C fundamentals | 40 | stage-c1-b01–b40 |
| stage-cpp1 | C++ fundamentals | 40 | stage-cpp1-b01–b40 |
| **Total** | | **500** | |

Expected bank: **746 questions = 734 lessons + 12 unchanged stage tests**. Default grouping adds 100 five-question units: **146 units total**. Existing batches and unit memberships remain intact. New batches have explicit stable numeric IDs; never renumber them when editing.

## Placement decisions

- Every question uses its existing stage and track. Topic tags match an existing section of that stage's article, never an unrelated article merely sharing a tag.
- C/C++ have no existing article or roadmap nodes. Keep their questions on their own language tracks; do not force them onto JavaScript/Python roadmaps.
- Roadmap nodes already link to stage practice. Preserve that routing instead of adding duplicate roadmap structures.
- SQL uses the SQL language label. HTTP and architecture questions are conceptual quizzes in their existing stages; no fictitious runnable HTTP environment.
- Existing completed IDs and stage-test results remain stored. Adding lessons increases completion denominators; existing users may see additional unfinished work. Custom admin unit layouts retain their overrides and receive new unassigned lessons through the existing mechanism.

## Verification approach

Executable predictions will be compared against real runtime output, not a second copy of the answer key. JavaScript uses Node, Python uses CPython, C/C++ use available compilers. Snippets avoid undefined behavior, nondeterministic output, network access and platform-size assumptions. Concept questions need human/source review; schema tests alone cannot prove factual correctness. No claim of infallibility.

## Handoff

Read this log, `docs/CONTENT_AUTHORING.md`, the new authoring helper and content tests before continuing. Keep old IDs and learning logic unchanged. The 500-question implementation and automated verification are complete. Do not commit, push, merge or deploy without a new explicit request.

## Implementation details

- Added 12 automatically discovered batch files, exactly as listed in the coverage contract: core folders use `c.ts`; C/C++ use `b.ts`.
- Added a typed authoring helper outside the content-discovery directory. Explicit row numbers preserve identity; one canonical answer is rotated into the stored choice position without changing the existing UI's shuffle or grader.
- The 500 additions comprise **360 conceptual quizzes and 140 output predictions**: **173 easy, 247 medium and 80 hard**. Each includes four distinct choices, a mechanism-based explanation, a hint and the existing 40/70/110 XP schedule.
- All old content remains unchanged, including 12 stage tests and all runner/debug/fill/multi-select/pseudocode exercises. The original 246-item Node snapshot SHA-256 is `0252be189926d6c2700a9e9620ddd7504b627b5203fb118548350dd8a410bc1c`; the key-order-independent digest pinned by the browser integration test is `11515e6a81a098fc4ca71beb305c6b78754c0031bdb45e8448dcaf85ecec930e`.
- Added `src/app/__tests__/question-expansion.test.ts` to exercise the real browser content registry, article resolver, track membership, roadmap stage links, XP, original content integrity and unit stability.
- Added `scripts/verify-question-expansion.mjs` and `server/__tests__/question-output-verifier.test.mjs`. The script compiles/executes code, compares actual output against the answer key, rejects embedded NULs, enforces timeouts and fails if a required runtime is missing. Temporary compiler files are removed only from the verified generated directory.
- Added `content:verify-expansion` to `npm run check`; no dependencies, grading logic or production server logic were changed.
- Updated README/package content counts and the browser/server tests that intentionally pinned the old bank/unit sizes. The server admin test fixtures now stay within the **unchanged 30-question hard limit per custom unit**. No validator was relaxed.
- Added a server regression test for an existing custom unit layout: old unit IDs, names and membership stay intact, and the 40 new stage-3 lessons appear through the existing “More lessons” behavior without writing over the override.
- Saved all 500 IDs, titles, topics, keyed answers and resolved reading targets in `QUESTION-COVERAGE.md`. Reference links and important qualifications are in `QUESTION-SOURCES.md`.

## Verification evidence

- TypeScript, import boundaries and content schema checks pass.
- Browser and Node content discovery both include the additions; both use the same existing registry contracts.
- **140/140 output predictions executed successfully**, with no skipped runtimes: 50 JavaScript, 50 Python, 20 C and 20 C++.
- Runtime versions: Node **22.14.0**, CPython **3.12.14**, MinGW GCC/G++ **6.3.0**; C compiled with `-std=c11`, C++ with `-std=c++14`, both with `-pedantic-errors -Wall -Wextra`.
- The dedicated browser/registry/unit/verifier subset passed **1,046 tests**. The server-unit subset passed after updating old count fixtures; the additional custom-layout preservation case also passes in the final full run.
- All 420 new core questions resolve to explicitly matching article sections. All 80 new C/C++ questions correctly have no unrelated reading or roadmap link. The 10-roadmap/209-node inventory is unchanged.
- Content-extras reports only its three pre-existing warnings: no C article, no C++ article and the original stage-1-a00 fallback. No new fallback warnings remain.
- Content lint reports **71 near-duplicate heuristics**, including existing warnings, shared C/C++ program scaffolding and deliberate contrasting exercises (value/reference, floor/remainder, size/length). Exact duplicate prompts plus snippets are rejected by tests. No new hint leaks, duplicate choices, answer-length tells or prompt leaks remain. These warnings were not disabled and are not a claim of 500 wholly unrelated concepts.
- Production build passes. First-paint shell: **180.15 kB gzipped**, below the 195 kB budget. No source maps. The lazy challenge-bank chunk is **577.39 kB minified / 184.63 kB gzipped**, triggering Vite's advisory 500 kB chunk warning; the bank remains outside the first-paint shell and the warning threshold was not raised.
- The initial full run found eight old admin-unit fixture/count failures. Their fixtures now account for the new 60-lesson stage while respecting the same hard limits. The final full `npm run check` exits **0**: **94 test files / 2,547 tests passed**. This includes TypeScript, import boundaries, Node/browser file parity, schema/runner validation, all 140 new runtime predictions, quality lint, article/roadmap checks and current content statistics.

### Final commands and artifacts

- `npm run check` — passed; the run reports 746 schema-valid questions and executes the original 59 JavaScript / 7 Python solutions in addition to the new prediction verifier.
- `npm run build` — passed with the lazy-content size advisory described above.
- `node scripts/check-dist.mjs` — passed, shell 180.15 kB gzipped, no source maps.
- `git diff --check` — passed.
- Temporary diagnostic logs: `%TEMP%/codeconsist-question-expansion-check.log` and `%TEMP%/codeconsist-question-expansion-build.log`. The durable result summary is this file; logs are not committed.
- Durable coverage: `QUESTION-COVERAGE.md` contains all 500 entries. `QUESTION-SOURCES.md` contains primary reference anchors, reviewed assumptions, caught defects and caveats.

### Next-assistant prompt

> The 500-question CodeConsist expansion is implemented and validated in `C:/Users/KIIT0001/Desktop/Devlingo-redesign`, not yet committed/pushed/deployed. First read `docs/content/QUESTION-EXPANSION.md`, `QUESTION-SOURCES.md`, `QUESTION-COVERAGE.md`, root AGENTS.md and `docs/CONTENT_AUTHORING.md`. There are 746 questions (734 lessons + 12 unchanged stage tests), 146 default units, 94 passing test files and 2,547 passing tests. All 140 new code-output answers were executed in Node/Python/C/C++; the rest are conceptual quizzes. Preserve the original 246 question objects, old IDs, unit memberships, auth, schema and grading logic. No live server or database was changed. The preview API on 4100 may still serve the old bank from Devlingo-dev: do not replace it with mock data. If the owner explicitly authorizes publication, review the exact diff, rerun the documented gates with Python/GCC/G++ available, then commit/push only to the requested branch and update frontend/API source together through the authorized deployment process. Record any subsequent change and evidence in this Markdown log. Never assume publication also authorizes a live rebuild/restart.

## Deployment and progress caveats

### Publication request — 7 October 2026

- The owner authorized committing and pushing the expansion to GitHub branch `adi` in `ShantanuSaurav/CodeConsist`. Publication results are recorded below after remote verification.
- The live `Devlingo-merged` checkout remains at `f466ae6`; the separate preview API checkout `Devlingo-dev` remains at `74780bf`. Neither contains these new question batches yet.
- The frontend registry and `server/content.js` load the same authored TypeScript bank when both run from the same updated source. The server keeps an in-memory content snapshot; a GitHub push does not refresh that process.
- The production server serves `dist/`. The previous redesign source was integrated without a live rebuild/restart, explaining why the running UI can still look unchanged. Deploying requires updating the authorized server checkout, building its frontend and restarting the server together, preserving its database and environment.
- No live merge, build, restart, database change or deployment is authorized by this publication-only step. Ask the owner before performing those operations.

### Pre-publication snapshot

- Work is in `C:/Users/KIIT0001/Desktop/Devlingo-redesign`, uncommitted. Nothing from this expansion has been pushed, merged into the live checkout, or deployed. No live server restart/build was performed.
- The existing preview's API on port 4100 is served from the older `Devlingo-dev` checkout. Its content may still be the old bank; do not interpret that as a frontend data bug or replace API data with mocks. Browser-registry and Node-loader tests validate the expanded bank from this worktree. Future deployment must update frontend and API source together.
- Existing solved IDs and test-pass evidence remain valid. Completion percentages can decrease because stages have more lessons. Under the unchanged progression rules, stages with existing solved evidence remain accessible; a previously unlocked but entirely unstarted later stage can become gated until the expanded earlier stage is complete.
- Previously customized units keep their layout and collect additions in “More lessons”. An administrator may need to divide that automatic overflow into appropriately sized named units before resaving a custom layout. No existing database was edited to do that automatically.
- Automated checks cannot prove every conceptual statement universally correct. Version assumptions, selected primary references, executable evidence and remaining limitations are stated rather than claiming infallibility.
