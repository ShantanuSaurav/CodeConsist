# Playground saves — progress and handoff

Updated: 8 October 2026 (Asia/Kolkata). Worktree: `Devlingo-redesign`. The owner now authorizes the live backend update and a push to `adi`. Never push or merge `main`.

## Requested behavior
- Automatically retain successful executions in memory until a full refresh.
- Explicitly named saves sync with the signed-in account, across devices.
- Filter both lists by the current language. A web project contains its HTML, CSS and JavaScript together; it is separate from standalone JavaScript.
- Failed runs never enter history. Editing code or standard input requires a new successful run before saving that new version.
- Preserve existing draft recovery, learning progress, grading, authentication and SQL execution.

## Phases
- [x] Audit existing playground, execution results, authentication, storage and server routes.
- [x] Account-owned storage, API, additive migration and security/limits tests.
- [x] Shared library UI, language-scoped history and exact-run save eligibility.
- [x] Console languages and sandboxed web previews.
- [x] Initial full checks: 99 files / 2,705 tests, build, shell 180.71 kB gzip (195 kB budget).
- [x] Browser checks: success/error, edits, refresh, account sync, language filtering, rename/open, web late errors, guest sign-in handoff, 375px mobile.
- [x] Final recheck after guest-handoff refinement: 99 files / 2,705 tests, build, no source maps, shell **180.69 kB gzip**.
- [ ] Publish `adi`, deploy backend and verify live data preservation.

## Decisions
- Existing challenge drafts remain separate from the playground library.
- Account library stores immutable snapshots; rename changes only the title. Saves are idempotent by identifier, capped at 100/account and 2,000,000 UTF-8 serialized bytes with a metadata allowance. Full libraries reject new saves rather than deleting existing work.
- The API derives ownership from authentication. It does not accept a user ID from the body. Account deletion removes the library.
- Success is a playground UX gate, not an anti-cheat or server-verification claim. Saving does not rerun the program, award XP or affect challenge completion. Web success means the sandbox reached readiness without observed errors, not validation of all possible future asynchronous behavior.
- No dependencies or heavy animation libraries added. Use limited test concurrency after the user's RAM-related interruption.

## Continuation prompt
Continue from this log in `C:/Users/KIIT0001/Desktop/Devlingo-redesign`. Inspect status and finish only unchecked phases. The user explicitly authorizes a push to `adi` and backend deployment. Never push/merge `main`. After final checks, commit the scoped feature, push normally, fast-forward the clean live `adi` checkout, build, restart only the verified API child, then verify health, schema 8, endpoint authentication and data preservation. Never copy test fixtures or an old backup over live data. Record actual commit/CI/deployment results here. Vercel production frontend promotion from `adi` to `main` requires separate authorization.

## Implementation inventory
- `src/platform/playground/model.ts`: shared seven-mode model and validation, exported through `src/platform/server-lib.ts`. Code limit 100,000 characters, input 10,000, title 1–80. Only Java/C/C++ accept stdin. Web stores all three files together.
- `server/playground-routes.js` + `server/index.js`: authenticated `GET /api/playground/snippets?language=…`, idempotent `PUT /api/playground/snippets/:id`, title-only `PATCH`, and `DELETE`. Account write limiter, own-property lookup, reserved-key protection, private/no-store responses. Owner/timestamps come from the server.
- `server/db.js`: additive schema **7 → 8**, `playgroundSnippets` collection, removal on account deletion, automatic pre-migration backup. Optional strict persistence reports failed disk writes instead of claiming a cloud save; existing callers retain their behavior.
- `src/platform/api-client/api.ts`: authenticated list/save/rename/delete methods. No false offline-save success or queued cloud-write claims.
- `PlaygroundLibrary.tsx`: existing accessible modal primitive, This visit / Account saves, names, rename, explicit open/replace, confirmed delete, loading/empty/retry/error states. Keyed by owner and language; request revisions prevent stale list updates.
- `runHistory.ts`: memory-only, 20 distinct successful programs per language, owner-scoped. Route changes keep history, full refresh clears it. A guest explicitly choosing Save carries only that chosen snapshot through sign-in; cloud storage still requires an explicit save.
- `Playground.tsx`: immutable submitted code/language/stdin snapshots, concurrent-run guard, stale/unmounted result handling, per-owner/per-language draft recovery. Unowned legacy drafts migrate only to guest scope, not arbitrary accounts.
- `WebPlayground.tsx`: exact three-file snapshots, readiness/error-settling gate, late-error revocation, sandbox remains mounted while viewing console. Future timers/interactions can still fail; saving is not a proof of all possible behavior.
- `styles/workspace.css`: restrained library strip and responsive rows/controls with existing tokens. No new dependencies, eager worker imports or animation libraries.

## Tests and browser evidence
- New tests: 21 model cases and 14 HTTP/store cases. Filesystem mocked in server tests, never the production database. Coverage: auth, owner/language separation, immutable/idempotent writes, rename/delete, migration, UTF-8 quota, reserved IDs, bounds, durable writes, disk-failure retry, account deletion cleanup.
- `server/__tests__/db-migrate.test.mjs` updated for schema 8. Existing web helper tests remain intact (43 cases).
- Initial `npm run check`: **99 files / 2,705 tests pass**, including typecheck, boundaries and content checks. Targeted recheck after guest-handoff change: **78 tests pass**.
- Browser uses a real isolated API at **4200**, Vite **3202**, and synthetic QA account. Database: `%TEMP%/codeconsist-playground-saves-20261007`. No production account created or mutated for testing.
- JavaScript success enables Save; edits disable it; thrown errors stay out of history. Refresh removes history but preserves account saves. Guest Save → sign-in preserves the selected code and its eligibility.
- Stopping only the isolated QA API produced a visible request failure with Retry, not an empty-library/success claim. Restarting it and choosing Retry restored the named save, also proving persistence through a server restart. Dark-theme desktop modal inspected; screenshot: `C:/Users/KIIT0001/.codex/visualizations/2026/10/04/01a10852-76c8-7531-baf9-c25d20bf42e7/playground-saves-desktop.png`.
- SQL `SELECT 6 * 7 AS answer` returns 42, saves, renames and restores with explicit replacement confirmation. JavaScript entries do not appear in SQL.
- Web projects save all files; immediate and delayed errors revoke eligibility. Console view keeps receiving messages. React renders names/code as text, not HTML.
- Mobile library/modal visually checked at **375×812**, viewport restored. Screenshot: `C:/Users/KIIT0001/.codex/visualizations/2026/10/04/01a10852-76c8-7531-baf9-c25d20bf42e7/playground-saves-mobile.png`.
- Java/C/C++ not browser-executed in the isolated preview because its Judge0 is not configured; shared model/gating tests cover these modes and their existing execution path remains unchanged. Live health confirms their configured runtime. No authenticated production save/solve is claimed tested.

## Deployment checkpoint
- Implementation/live/origin `adi` before publication: `543f939f87c229ab1facfbf7dc8f66aa8511f959`.
- Fresh fetch: `main` independently advanced to **`d9cca1c39f3d4fb37dc417036167d9919f6990f5`**, PR #17 merged prior SQL work. Do not repeat the old assumption that production lacks SQL. This new feature still stays on `adi`.
- Fresh valid schema-7 backup: `C:/Users/KIIT0001/Desktop/Devlingo-merged/ops/backups/db-pre-playground-saves-20261007-191624.json` (UTC filename), 3 users, 3 progress records, 2 orders, 0 certificates. SHA-256 **`DEBBD3BD05DFA25996FD4E1E7D21CC892782D2D9F571D35EA496E1D6A2C33B37`**. Local-only; never commit it.
- Confirmed port 4000 API child **40664**, parent supervisor **35836**, live checkout. Only restart the verified child after integration/build; leave supervisor, tunnel, Judge0 and other services alone.
- Live checkout has existing untracked design/deployment Markdown; preserve it. No new dependencies to install.
