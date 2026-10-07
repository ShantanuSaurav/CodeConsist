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
- [ ] Commit and push the tested source to `adi` only.
- [ ] Fast-forward the live checkout, install dependencies, rebuild/restart only the API and verify the hosted API.
- [ ] Record final deployment evidence and the cross-assistant handoff.

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
- Browser preview: SQL selection, highlighted code, join/aggregate results (Ada 2/80, Lin 1/20, Sam 0/0), clear missing-table errors and recovery to a successful run were exercised. At 375px width the same query succeeded and the table remained readable without page-level horizontal overflow; the temporary viewport was reset. No browser errors/warnings were captured in the desktop pass. Production-built browser verification is pending deployment.
- Removed repeated execution instructions from every question prompt because the SQL challenge already displays them once in its schema panel. Content lint now reports 73 advisory near-duplicate pairs instead of 1,168; 71 belong to pre-existing content. The two SQL pairs were reviewed: unique categories versus ordered categories, and employee/department joins versus empty departments. They are different tasks, not duplicate questions. No lint rule was weakened.
- The publication rerun caught a new 339-character playground description exceeding the established 300-character copy limit; this invalidated settings defaults and caused 40 related assertions to fail. Shortened the description instead of increasing the limit or relaxing tests. No failing build was deployed.
- Dependency audit was attempted separately; npm's audit endpoint returned HTTP 400/retirement information. Do not treat the build/test pass as a clean vulnerability scan or claim the reported dependency warnings are resolved.
- This is strong automated and targeted manual verification, not a guarantee that no future edge case exists. No authenticated production solve or purchase was performed for testing.

## Deployment checkpoint

- Before publication: local `redesign`, live `adi` and `origin/adi` at `ae4a89f426ca1ed4fa67573598a89beec56165db`; `origin/main` at `f037b49dd261caa23432d8358749c333443ae0f7`.
- Validated JSON backup: `C:/Users/KIIT0001/Desktop/Devlingo-merged/ops/backups/db-pre-sql-20261007-090840.json` (UTC filename). SHA-256 equals the source: `70094EA56A5217E184FC60F7FC0E772D3A7A498AFB88D41E8BC241BA688278B0`. The backup is local-only and must never be committed.
- Pre-deployment health: 746 questions, 12 stages, 3 users. Only the confirmed API child serving port 4000 may be restarted; leave the supervisor, ngrok, Judge0, the separate 4100 API and existing user files alone.
- Deployment and public verification are still pending at this checkpoint. Record their actual results here rather than inferring deployment from a successful push.

## Cross-assistant handoff

> Continue CodeConsist from `docs/content/SQL-IMPLEMENTATION.md` and inspect the current Git status before editing. The owner authorized SQL in the playground, 100 correctly placed SQL exercises, backend deployment and pushing to `adi` only. Do not merge or push `main`. Use the existing SQLite/Wasm evaluator, fixed fixtures and independently frozen expected outputs; do not replace working backend logic or regenerate answers just to silence failures. Preserve the previous 746 questions, account/progress data, saved admin settings and existing unit IDs. Finish any unchecked publication/deployment steps, verify `/api/health`, `/api/content` and real SQL execution through the hosted API, and check the production-built browser worker. Update this Markdown file with changes, checks, deployment evidence, limitations and the next handoff. The production Vercel frontend remains on `main`; explain that SQL's new UI requires the `adi` preview or an explicitly authorized future merge.
