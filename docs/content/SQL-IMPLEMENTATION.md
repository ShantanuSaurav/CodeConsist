# SQL execution and 100 exercises — 7 October 2026

## Scope and authorization

Add real SQLite execution to the existing playground and challenge runner, exactly 100 executable SQL exercises in the existing Databases & SQL stage, and update the live backend. Preserve existing questions, accounts, progress, routes, database and settings. This adds a learning runtime; it does not migrate the application's account/progress storage to SQL.

The owner authorized pushing to GitHub `adi` and explicitly said **"Keep changes on adi only"** when asked about `main`. Do not merge or push `main`. Vercel production deploys `main`; `adi` creates a preview. Updating the backend is a separate, explicitly authorized operation.

Implementation checkout: `C:/Users/KIIT0001/Desktop/Devlingo-redesign` (`redesign`). Live API checkout: `C:/Users/KIIT0001/Desktop/Devlingo-merged` (`adi`). The live API is reached through ngrok and the Vercel `/api` rewrite. The separate development API on port 4100 is not part of this deployment.

## Progress

- [x] Audit language types, playground, compiler service, server verification, content discovery and deployment path.
- [x] Add isolated, resource-bounded SQLite execution in a browser worker and server child process.
- [x] Add SQL playground examples, result tables, runtime labels, schema/sample-data disclosure and admin authoring support.
- [x] Add 100 exercises, two independent datasets per exercise, frozen expected outputs, hints, explanations and stage/topic links.
- [x] Final validation passed after the copy correction: full checks, 97 test files / 2,670 tests, production build and first-paint budget check.
- [x] Validate and back up the live database before deployment.
- [x] Commit and push the tested source to `adi` only (`aa45ea9`).
- [x] Fast-forward the live checkout, install dependencies, rebuild/restart only the API and verify the hosted API.
- [x] Record final deployment evidence and the cross-assistant handoff. Vercel preview browser access requires the owner's Vercel login; the production-built worker was verified locally instead, without weakening preview protection.

## Runtime and grading decisions

- `sql.js` is pinned to **1.14.2**, with the bundled SQLite **3.49.1** engine and locally served Wasm. No CDN runtime or paid compiler is required for SQL.
- Each playground run and each exercise dataset gets a new in-memory database, closed after execution. Learner SQL never receives the application database, credentials or a host filesystem handle.
- Browser execution uses a disposable Web Worker; server execution uses a disposable Node child with a minimal environment. The shared evaluator is compiled through the existing server TypeScript bundler.
- SQL initialization has a 30-second budget; query execution has a separate 6-second budget. Timed-out workers/processes are terminated. The server retains the existing execution concurrency and rate limits.
- Limits: 100,000 SQL characters, 100 statements per setup/submission, 1,000 returned rows and 200,000 serialized row-data characters per query batch, 25 test datasets, 32 MiB SQLite allocation limit, 4,096 database pages. The child also has a 96 MiB V8 old-space limit and a 2,000,000-character response cap.
- Foreign keys are enabled. User `ATTACH`, `DETACH`, `PRAGMA`, `VACUUM`, host-file functions and extension loading are disallowed; SQLite/Wasm isolation and hard process termination provide additional boundaries.
- Exercise `testCases[].input` contains setup SQL. Expected output is a frozen JSON array of rows. Exactly one result set is required. Row/column order, values, types, duplicates and NULL matter; column aliases do not.
- `/api/execute`, authoritative progress submission verification and admin solution validation use the same SQL evaluator. The server reruns the authored tests, not a client-supplied pass result.
- These are output-graded exercises: equivalent correct queries pass. Tests do not enforce use of a particular keyword or prove that a requested index/transaction was used merely from an equivalent final result.
- SQLite is identified explicitly; this is not a claim of MySQL/PostgreSQL compatibility. Runs are intentionally not persistent database hosting.

## Content and placement

| Inventory | Before | After |
|---|---:|---:|
| All authored questions | 746 | 846 |
| Lessons | 734 | 834 |
| Stage tests | 12 | 12 |
| Databases & SQL lessons (`stage-7`) | 60 | 160 |
| Databases & SQL stage tests | 1 | 1 |
| Default lesson units, all stages | 146 | 166 |

- IDs: `stage-7-d01` through `stage-7-d99`, then `stage-7-d100`. All are `language: 'sql'`, `type: 'code_runner'`, in the existing core/Developer track. No new roadmap or incorrect language track was invented.
- The previous 746 questions remain intact. All previous unit memberships are preserved; 20 SQL units are appended only to stage 7. Existing JavaScript-backed database exercises and the stage test are not silently replaced.
- The exercises cover selection, filters, ordering, NULL, strings, CASE, aggregates, joins, subqueries, CTEs, window functions, recursive queries, mutations, transactions/savepoints, DDL/indexes, set operations, dates, constraints and upserts.
- Both fixtures contain five tables: departments, employees, products, customers and orders. They use different IDs/values and include salary ties, NULLs, empty departments, unassigned employees and customers without orders.
- Expected outputs were generated once using CPython's independent SQLite implementation and frozen in `sql-expected.json`. All 200 reference executions were then checked with the actual SQLite/Wasm runtime. Expectations are never computed from the solution during grading.
- Every new exercise has a hint and explanation and resolves to a relevant section of the existing SQL article and roadmap. The SQL article gains expression/date, CTE/window and set/mutation coverage without removing existing sections.
- See `SQL-COVERAGE.md` for all 100 IDs, topics, titles, difficulties and tasks.

## Changed files

### Execution and API

- New: `src/platform/execution/sql-engine.ts`, `sql-client.ts`, `sql.worker.ts`; `server/sql.js`; `server/runner/sql-runner.mjs`.
- Updated: `src/platform/execution/compilerService.ts`, `src/types/index.ts`, `server/index.js`, `server/judge0.js`.
- Dependencies: `package.json`, `package-lock.json` add SQL.js and its development TypeScript definitions. Wasm and the SQL worker remain outside the first-paint shell.

### Playground, challenges and admin

- New: `src/modules/playground/components/sqlExamples.ts` and `src/ui/primitives/SqlResults.tsx`.
- Updated: `src/modules/playground/components/Playground.tsx` (SQL selector, filename, examples, isolated-run notice, table results, duplicate-run guard).
- Updated: `src/modules/challenges/challenge-types/CodeChallenge.tsx` (visible sample schema/data); `src/ui/code/highlight.ts` (SQL vocabulary).
- Updated: `src/modules/challenges/schema.ts`, `server/custom-challenges.js`, `server/ai-questions.js`, `src/modules/admin/components/QuestionWizard.tsx`, `ConceptEditor.tsx` (SQL executable, no function name, SQL fixtures/results and authoring guidance).
- Updated: `src/platform/settings/defaults.ts` mentions SQL in a concise default playground description within the existing 300-character limit; saved admin copy remains authoritative.

### Content and documentation

- New: `src/modules/challenges/authoring/sql-exercises.ts`, `sql-fixtures.ts`, `sql-expected.json`; `src/modules/challenges/content/databases-sql/d.ts`.
- Updated: `src/modules/articles/content/databases-sql.md`, `README.md`, `docs/CONTENT_AUTHORING.md` and the package description.
- New: this progress/handoff file and `docs/content/SQL-COVERAGE.md`.

### Validation and regressions

- New: `src/platform/execution/__tests__/sql.test.ts`, `src/app/__tests__/sql-exercises.test.ts`, `server/__tests__/sql-runner.test.mjs`.
- Updated: `scripts/validate-content.mjs` executes every SQL reference and starter against all fixtures instead of skipping SQL.
- Updated: compiler service, admin custom challenge, runtime inventory, registry and unit-count tests for the new supported language/counts.
- Updated: `src/app/__tests__/question-expansion.test.ts` continues independently verifying the earlier 500-question expansion and the original 246-question fingerprint while accepting the additional 100 SQL exercises. No validator or assertion was disabled.

## Verification and review

- Final `npm run check` passed after all source changes: typecheck, module boundaries, content parity, content validation, the previous expansion verifier, content lint/extras/stats, and **97 test files / 2,670 tests**. The six affected settings/regression suites also passed separately (163 tests).
- The validator executes all 100 SQL solutions and rejects each placeholder starter against both datasets. Unit/integration tests cover exact output grading, independent databases, invalid SQL, constraints, file/extension denial, resource limits and runaway-query termination/recovery.
- Final `npm run build` and `node scripts/check-dist.mjs` passed. First-paint shell: **180.63 kB gzip**, below the 195 kB limit; no source maps. SQLite's approximately 643 KiB Wasm asset loads only on SQL execution. The lazy content chunk still produces Vite's advisory size warning; the budget was not raised.
- Browser preview: SQL selection, highlighted code, join/aggregate results (Ada 2/80, Lin 1/20, Sam 0/0), clear missing-table errors and recovery to a successful run were exercised. At 375px width the same query succeeded and the table remained readable without page-level horizontal overflow; the temporary viewport was reset.
- Production-built browser verification passed at `http://localhost:4000/dashboard/practice`: selected SQL, loaded the bundled worker/Wasm and ran the join/aggregate example, returning all three expected rows in 131 ms. Screenshot: `C:/Users/KIIT0001/.codex/visualizations/2026/10/04/01a10852-76c8-7531-baf9-c25d20bf42e7/sql-production.png` (local artifact, not a repository asset). Earlier development HMR and Vercel sign-in messages remain in the reused tab's log; they are not evidence of a production SQL execution failure.
- Removed repeated execution instructions from every question prompt because the SQL challenge already displays them once in its schema panel. Content lint now reports 73 advisory near-duplicate pairs instead of 1,168; 71 belong to pre-existing content. The two SQL pairs were reviewed: unique categories versus ordered categories, and employee/department joins versus empty departments. They are different tasks, not duplicate questions. No lint rule was weakened.
- The publication rerun caught a new 339-character playground description exceeding the established 300-character copy limit; this invalidated settings defaults and caused 40 related assertions to fail. Shortened the description instead of increasing the limit or relaxing tests. No failing build was deployed.
- Dependency audit was attempted separately; npm's audit endpoint returned HTTP 400/retirement information. Do not treat the build/test pass as a clean vulnerability scan or claim the reported dependency warnings are resolved.
- This is strong automated and targeted manual verification, not a guarantee that no future edge case exists. No authenticated production solve or purchase was performed for testing.

## Publication and live deployment

- Before publication: local `redesign`, live `adi` and `origin/adi` at `ae4a89f426ca1ed4fa67573598a89beec56165db`; `origin/main` at `f037b49dd261caa23432d8358749c333443ae0f7`.
- Validated JSON backup: `C:/Users/KIIT0001/Desktop/Devlingo-merged/ops/backups/db-pre-sql-20261007-090840.json` (UTC filename). SHA-256 equals the source: `70094EA56A5217E184FC60F7FC0E772D3A7A498AFB88D41E8BC241BA688278B0`. The backup is local-only and must never be committed.
- Pre-deployment health: 746 questions, 12 stages, 3 users. Only the confirmed API child serving port 4000 may be restarted; leave the supervisor, ngrok, Judge0, the separate 4100 API and existing user files alone.
- Implementation commit **`aa45ea9b370085e4c2fccd4b60af036fed89beec`** was pushed normally to `origin/adi` at `https://github.com/ShantanuSaurav/CodeConsist`. No force push, main merge or main push occurred.
- GitHub CI for that source commit completed successfully: https://github.com/ShantanuSaurav/CodeConsist/actions/runs/37599800781.
- Vercel reported a successful **Preview** deployment for that exact source commit: https://devlingo-fsq5t4y8u-shantanu-sauravs-projects.vercel.app/dashboard/practice. Opening it redirects to Vercel login in the test browser; sign-in is required to view the protected preview. Its protection settings were not changed, and authenticated preview behavior was not claimed as tested.
- Fast-forwarded the live `adi` checkout to the implementation commit. Installed the five added runtime/type packages from the lockfile with `npm install --ignore-scripts --no-audit --no-fund`. Installation/build left tracked source and `.env` unchanged.
- Built successfully in the authorized live checkout and passed the dist check: **180.63 kB gzip**, no source maps. Restarted only the verified API child (PID 4260); the existing supervisor started the healthy replacement (PID 40664). Port 4100 remained PID 35404 and port 3200 remained PID 1628. ngrok and Judge0 were not restarted.
- Local and public `https://devlingo-sand.vercel.app/api/health` both confirmed **846 questions, 12 stages, 3 users** and the available SQLite runtime.
- Public `/api/content` contains all **100** new `stage-7-d*` IDs, all assigned to SQL-stage units; stage 7 now has **32 units**. Existing premium gating remains active; this check did not bypass it.
- Public `/api/execute` ran real CREATE/INSERT/SELECT SQL and returned `[[1,"Ada"],[2,"Lin"]]`. A deliberately incorrect result with a client `passed: true` flag was still reported **failed**.
- Data preservation: all three prior account/progress records and all prior completed-question IDs are retained, with no decreased XP records. One learner's concurrent activity changed preferences and added three completions while work was in progress; their legitimate changes were retained, not rolled back to the backup. Admin, content overrides, custom challenges, orders, certificates, pricing, drafts, saved settings, password-reset data, concept cards, review sessions and assessments matched the pre-deployment backup. Activity/league state reflects the concurrent learning activity; the entire database is therefore not byte-identical, and no such claim is made.
- Confirmed `main` remains **`f037b49dd261caa23432d8358749c333443ae0f7`**. The public domain's API is updated, but its production frontend remains on the older `main` build by the owner's explicit choice. Use the `adi` preview (Vercel login) or the local production build for the new SQL UI. A future `adi` → `main` merge requires new authorization.
- This log is published in a documentation-only follow-up on `adi` and fast-forwarded into the live checkout; no second backend restart is needed for Markdown-only changes. Existing untracked design notes and `BACKEND-DEPLOYMENT.md` are preserved.

## Cross-assistant handoff

> Continue CodeConsist from `docs/content/SQL-IMPLEMENTATION.md` and `SQL-COVERAGE.md`; inspect current Git status and live health before editing. SQL implementation is complete: source commit aa45ea9 on `adi`, 100 new SQL exercises, 846 total questions, 97 test files / 2,670 passing tests, passing GitHub CI and a deployed live backend. The owner explicitly chose `adi` only: do not merge or push `main` without a new request. The protected Vercel preview needs the owner's login; the production-built worker was verified locally on port 4000. Use the shared SQLite/Wasm evaluator, fixed fixtures and frozen expected outputs. Do not regenerate answers merely to silence failures, remove existing questions, change unit IDs, or overwrite live account/progress/settings data. Work in `Devlingo-redesign`; touching the live checkout or restarting services requires authorization relevant to the new task. The current backend uses the authorized SQL release; its live database includes legitimate activity since the backup. For any next requested feature, keep a phased Markdown change/verification/deployment log and include a tool-agnostic handoff. If the next task is making the new frontend public, first obtain explicit permission to promote `adi` into `main`, then verify the production deployment rather than treating a push as proof.
