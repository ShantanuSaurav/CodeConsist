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
- [x] Published `adi`, deployed the live backend, verified public API and complete preservation of existing database sections.

## Decisions
- Existing challenge drafts remain separate from the playground library.
- Account library stores immutable snapshots; rename changes only the title. Saves are idempotent by identifier, capped at 100/account and 2,000,000 UTF-8 serialized bytes with a metadata allowance. Full libraries reject new saves rather than deleting existing work.
- The API derives ownership from authentication. It does not accept a user ID from the body. Account deletion removes the library.
- Success is a playground UX gate, not an anti-cheat or server-verification claim. Saving does not rerun the program, award XP or affect challenge completion. Web success means the sandbox reached readiness without observed errors, not validation of all possible future asynchronous behavior.
- No dependencies or heavy animation libraries added. Use limited test concurrency after the user's RAM-related interruption.

## Continuation prompt
Playground saves are implemented, tested, pushed to `adi` and deployed to the live backend. Read this log, inspect Git status and live health before any further work. Source commit is `039a16aea7487120c965451aa55528679a23e0ed`; a documentation follow-up records deployment. Never push/merge `main` without a new request. Preserve schema-8 account libraries and all existing user data. Successful-run history is memory-only and per language; named immutable snapshots sync through authenticated API routes. For subsequent features, work in `Devlingo-redesign`, record checks/handoff in Markdown, and obtain relevant live-deployment authorization rather than reusing permission for this completed feature. New UI promotion to the Vercel production domain requires a separate `adi` → `main` decision; the backend is already ready.

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

## Completed publication and deployment
- Source commit **`039a16aea7487120c965451aa55528679a23e0ed`** pushed normally to `origin/adi` at `https://github.com/ShantanuSaurav/CodeConsist`. No force push or `main` merge/push.
- GitHub CI for that exact source commit: **success**, `https://github.com/ShantanuSaurav/CodeConsist/actions/runs/37674413961`.
- Vercel reports successful Preview deployment for that commit: `https://devlingo-d54qwnxr6-shantanu-sauravs-projects.vercel.app/dashboard/practice`. Its deployment status was verified through GitHub; authenticated preview browsing is not claimed tested. Vercel sign-in may be required.
- Fast-forwarded live `Devlingo-merged` on `adi`, built successfully, and passed distribution guard: **180.70 kB gzip**, no source maps. All pre-existing untracked Markdown preserved; no dependency changes or secret edits.
- Restarted only API child **40664**; its existing supervisor **35836** started replacement **26972** on 4000. Tunnel/Judge0 were not restarted.
- Both local and public `https://devlingo-sand.vercel.app/api/health` confirm **846 questions, 3 users**, SQLite available. Both local and public `/api/playground/snippets?language=…` return the expected **401 Sign in to continue**, proving the new account-protected endpoint is deployed, not a missing-route 404.
- Automatic migration backup: `server/data/db.json.pre-v8-1791401322145`. Compared every existing top-level section against the post-migration database: **no changes**, excluding only schema version. Schema 8 adds the initially empty account-library collection; 3 users, 3 progress records, 2 orders and 0 certificates preserved exactly. No production test accounts/snippets were inserted.
- Remote `main` remains **`d9cca1c39f3d4fb37dc417036167d9919f6990f5`**. The production domain's backend is updated; this new frontend stays on the `adi` preview until a separately authorized main promotion. Local production UI is at `http://localhost:4000/dashboard/practice`.
- Temporary QA API (4200) and Vite (3202) stopped after verification to reduce RAM use. Their isolated test database remains under `%TEMP%` for reproducibility; it is not published. The browser is handed off to the existing production service on 4000 instead.
- Deployment evidence is saved in this Markdown-only follow-up, pushed to `adi` and fast-forwarded into the live checkout. No second API restart is needed for documentation alone.
