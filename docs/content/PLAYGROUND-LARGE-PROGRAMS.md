# Larger playground programs

## Status — 8 October 2026

Complete: implemented, checked, pushed to `adi`, integrated and verified on the live backend. Source commit `8d77c9dd3ddc7e6d4fea57591bcde5af79226c8e`. `main` was not changed. No database migration or dependency change was needed. The publication/deployment evidence below supersedes the historical plan and checkpoint wording.

## Findings

- The screenshot's C program declares N=22: an N × 2^N table of four-byte integers alone needs 352 MiB. The configured Judge0 default is 128000 KB (125 MiB), so an allocation failure is plausible; NZEC alone does not prove it.
- Confirmed Judge0 supports a maximum 1024000 KB address-space allowance, 10 CPU seconds and 15 wall seconds. The initial proposal of 20 wall seconds was reduced to 15 to fit the real installation without changing its global configuration. Standard limits are not a guarantee that every algorithm will finish.
- JavaScript has independent VM, process and browser-worker deadlines. Python has a separate download deadline and execution deadline. SQL has both heap and database-page caps, separate from result rendering caps.
- Existing Python early returns leave namespace proxies undisposed and output collection is unbounded. Larger runs need cleanup and bounded output, not just longer timers.
- SQL's hard-heap PRAGMA can lower but not raise an existing runtime's cap. Production SQL already starts a fresh worker/process per run; maintain that isolation.

## Implementation plan

1. Shared, fixed Standard/Large program profiles. Never accept arbitrary client memory/time limits. Challenges retain standard budgets.
2. Playground budget selector with honest per-engine limits. Preserve code history, account saves, routing, and success-only save behavior.
3. Backend resource policy: one large request at a time in addition to existing slots/rate limits, and refuse admission when server memory is low.
4. Increase large-program allowances across JavaScript, Python, SQLite, C, C++, Java and existing Go execution. Improve resource and nonzero-exit diagnostics without pretending all failures are memory failures.
5. Targeted tests, full checks/build, real bounded sandbox runs and browser QA. Then scoped commit/push, fast-forward live checkout, backup, rebuild/restart only the API child, and verify.

## Fixed large-program budgets

| Engine | Budget |
| --- | --- |
| Server JavaScript | 20s VM execution, 25s process watchdog, 512 MiB V8 old-space; this is not a total RSS limit |
| Browser JavaScript | 20s worker deadline; memory depends on browser/device |
| Browser Python | 20s after runtime ready; memory depends on browser/device; release large worker after completion |
| SQLite | 20s execution, 128 MiB SQLite heap, 64 MiB database; unchanged 1,000 rows / 200 KB output cap |
| C / C++ / existing Go API | 10s CPU, 15s wall, 512 MiB address space; compiler installation must support these limits |
| Self-hosted Java | 512 MiB Java heap, existing 1024000 KB address-space cap, 10s CPU / 15s wall |

Unlimited memory, infinite loops, OS access, arbitrary packages and unbounded output are not supported. HTML/CSS/JS previews retain their separate iframe behavior. Account saves contain code/stdin, not an elevated execution entitlement; budget selection is temporary and explicit.

## Evidence and handoff

### Implementation inventory

- `src/platform/execution/limits.mjs` and its `.d.mts` declaration are the small, dependency-free shared policy. Only explicit `large` free-form runs receive the higher budget. Entry functions or test cases force standard limits, so this cannot elevate challenge grading.
- Playground adds an accessible Run budget dropdown, disabled during a run, and per-runtime descriptions/warnings. The choice is temporary; it does not change stored code, account entitlements or language filtering.
- Session/compiler/API plumbing carries the optional profile. Large API requests allow 65s including initialization/queue/compiler overhead; actual code deadlines remain smaller. A refused/failed large JavaScript API request is not silently rerun in the browser.
- Backend rejects unknown profiles with HTTP 400 and ignores arbitrary limit fields. Existing rate limits and execution slots remain. `server/execution-admission.js` admits at most one large API request at a time, and refuses it if host free RAM is below 768 MiB. This is admission control, not a total-process RSS guarantee or a browser memory limiter.
- Node child processes use the selected heap/watchdog budget, bounded stdout/stderr transport, and clearer heap/timeout failures. Existing VM restrictions remain.
- Judge0 receives explicit CPU/wall/memory budgets only for large mode. C/C++ receive `-O2`, C++ retains C++17. Self-hosted Java uses a 512 MiB runtime heap while javac retains 256 MiB. An initial 384 MiB Java heap could not fit a single 300 MiB array under SerialGC; the final 512 MiB setting passed on the actual installation without raising its address-space cap.
- Judge0 response fields now request exit code/signal. NZEC reports possible causes rather than asserting memory failure; unsupported budgets receive an actionable 422 message. Queued, processing or missing statuses are never reported as successful, preserving the successful-run save gate.
- Python limits stdout/stderr collection, destroys namespaces even on early/error returns, prevents overlapping jobs, and disposes the entire worker after large runs to release grown Wasm memory. Standard runs still reuse the loaded runtime. Python remains Pyodide in the browser, not an unrestricted server interpreter.
- SQL shares the same policy between fresh browser workers and fresh server processes. Database/file isolation, per-dataset grading, statement/source/output caps and close/terminate cleanup remain intact. Larger datasets do not imply rendering unlimited result rows.

### Validation so far

- `npm run check` passed: **100 test files / 2,723 tests**, plus TypeScript, import boundaries, content parity, validators, question expansion checks, content lint/extras/stats. Includes all 100 SQL reference solutions and starters. Test workers capped at two to reduce RAM demand.
- Added 18 tests covering fixed limits, no grading elevation, C/C++/Go payloads, Java archive flags, memory/concurrency admission and release, real SQLite page-cap expansion and isolation/output bounds, real Node VM deadlines, Python cleanup/output/timer/concurrency disposal, client no-retry handling, and Judge0 failure/queued statuses.
- Isolated API at 4200 rejects an unknown profile with HTTP 400. QA data lives under `%TEMP%/codeconsist-large-programs-20261008`, not production.
- Real configured Judge0, sequential synthetic workloads: C 352 MiB allocation/initialization fails in Standard with NZEC and succeeds in Large (1095ms); C++ 48,234,496 integers (184 MiB) succeeds (244ms); final Java 300 MiB byte array succeeds (712ms). This does not prove the user's unseen complete algorithm finishes within 10 CPU seconds.
- Browser preview 3202 with isolated API4200: JavaScript 3.5s loop finishes beyond its old 3s VM cap; Python 9s loop finishes beyond its old 8s execution cap; a 20 MiB SQLite payload returns the real result `20`, beyond the old 16 MiB database cap. Success enables Save; account library implementation is otherwise unchanged.
- Mobile override 375×812: budget menu works, descriptions wrap, document has no horizontal overflow (360px content width after scrollbar). Restored normal viewport. Evidence: `playground-large-sql.png` and `playground-large-mobile.png` under `C:/Users/KIIT0001/.codex/visualizations/2026/10/04/01a10852-76c8-7531-baf9-c25d20bf42e7/`.
- Fresh fetch shows `origin/adi` at `811d1df` and `origin/main` independently advanced to `d2c327a` (user PR #18 merged the prior playground-saving feature). Never state that `main` still lacks saving; this new large-program feature alone remains scoped to `adi`.

### Continuation / next-agent prompt

Read this Markdown and check actual Git/service state. Larger-program support is complete and deployed (evidence below). Do not repeat implementation or restart services without a new reason. User authorized this completed feature on `adi` and the live backend, not merging `main` or unlimited future deployments. Preserve fixed limits, grading budgets, worker/process isolation, low-memory/concurrency admission and successful-run-only saves. Work on future requests in `Devlingo-redesign` and record changes/evidence/handoff in Markdown. Before any newly authorized deployment, validate/back up the live schema-8 database, confirm tracked live checkout is clean and fast-forwardable, and verify current port4000 child/parent identity. Leave Judge0, tunnel, existing saved code and unrelated processes alone. Do not claim unlimited programs, server-side Python, unrestricted SQL or authenticated production saves were tested. A future request to promote the frontend to the production Vercel domain requires explicit `adi` → `main` authorization.

References: [Judge0 submission limits](https://ce.judge0.com/#submissions-submission), [SQLite hard heap limit](https://www.sqlite.org/pragma.html#pragma_hard_heap_limit).

## Publication gate

- Production build succeeds; distribution guard reports **181.59 kB gzipped** first-paint shell (budget 195 kB), no source maps.
- Real isolated API: large JavaScript allocated/fill-read 26,214,400 array elements (about 200 MiB backing storage) successfully. A simultaneous second large request received HTTP 503/busy; the first completed and a subsequent request succeeded. No silent browser rerun or success-on-refusal.
- Remote main baseline immediately before publication: `d2c327aef540f8ccfeac63ea1124414354f97319`. Existing live port4000 child is 26972 under supervisor35836. Tracked live checkout is clean on `adi`; pre-existing untracked Markdown will be preserved.
- Deployment results will be appended after the actual push, integration, restart and verification; this checkpoint is not a deployment claim.

## Completed deployment — 8 October 2026

- Pushed source commit **`8d77c9dd3ddc7e6d4fea57591bcde5af79226c8e`** to `origin/adi`, normally (no force push). GitHub CI for that commit succeeded: [CI run](https://github.com/ShantanuSaurav/CodeConsist/actions/runs/37745222350).
- Vercel reports successful **Preview** deployment: [adi playground](https://devlingo-3fv3pr5ku-shantanu-sauravs-projects.vercel.app/dashboard/practice). Status verified through GitHub deployments; browser authentication to a protected Vercel preview is not claimed tested.
- Live checkout `Devlingo-merged` fast-forwarded from `811d1df` to the source commit; existing untracked audit/prompt files preserved. Live build and distribution guard passed: **181.60 kB gzip**, no source maps.
- Fresh local-only backup: `C:/Users/KIIT0001/Desktop/Devlingo-merged/ops/backups/db-pre-large-programs-20261008-074426.json`; SHA-256 **`712E4345990558CDC9C199DCD86C45CDBE55AE86D3B452D3ED391CC3F504B13C`**. Never commit the database or backups.
- Restarted only verified API child26972. Existing supervisor35836 started replacement **19484** on port4000. Judge0 and the tunnel were not restarted; global compiler configuration and credentials were not edited.
- Parsed database comparison before/after restart: **identical**, no changed sections. Schema8, 3 users, 3 progress records, 2 orders and 1 existing account-library owner preserved. No production test accounts or snippets created.
- Through the deployed local API, a C program allocated and initialized **352 MiB**, returning success in **604ms** with `profile: large`.
- Public `https://devlingo-sand.vercel.app/api/health` returned healthy, 846 challenges, 3 users and SQL available. Its `/api/execute` rejects an unknown profile with HTTP400 and runs a large-mode JavaScript request successfully (HTTP200, output42). This verifies the actual public backend, not only a local build.
- Existing live browser tab was refreshed and the new Run budget dropdown was verified. Selected Large program without editing/executing the existing draft. Screenshot: `C:/Users/KIIT0001/.codex/visualizations/2026/10/04/01a10852-76c8-7531-baf9-c25d20bf42e7/playground-large-live.png`.
- Temporary QA services3202/4200 and the QA tab were closed to reduce RAM use. The live4000 playground remains open. Temporary viewport override reset.
- Remote `main` remains **`d2c327aef540f8ccfeac63ea1124414354f97319`**. The new selector is in the local production UI and adi preview; the public production-domain frontend has not been promoted to this feature. Its backend is already updated.
- A Markdown-only follow-up records these outcomes, pushed to `adi` and fast-forwarded into live without another API restart.
