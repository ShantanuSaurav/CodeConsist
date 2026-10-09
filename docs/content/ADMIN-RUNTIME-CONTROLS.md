# Dynamic capacity and admin runtime controls

## Scope — 9 October 2026

Requested: hardware-adaptive concurrency with an editable admin ceiling, language switches, useful workflow controls and language visuals. Implement in the redesign worktree; do not change live settings, deploy, or push this new feature without publication authorization.

Plan:
1. Extend existing validated, revisioned and audited settings; preserve all existing overrides.
2. Read capacity settings live, with CPU, free-memory and global-runner constraints. Show configured and effective capacity separately.
3. Add global execution, per-language and coding-workflow controls. Enforce server execution policy again after queueing; prevent browser fallback from bypassing an explicit refusal.
4. Add admin status and language illustrations; preserve editing, saved code, content and progress when execution is paused.
5. Test policy, dynamic scheduling, admin validation and regressions; run all gates and record results.

Workflow scope: playground, challenge code, interactive lesson examples, web preview and AI authoring. Existing settings already govern practice sessions, placement, test-out, rewards and access. Payments, authentication and stored learner data are not indiscriminately switched off.

Browser controls govern the shipped app, not arbitrary code someone runs outside it. Offline clients retain their last known settings; server-side controls remain authoritative for server runs. Local memory measurements cannot measure a remote Judge0 host. Its provisioned capacity and the global execution ceiling remain operator responsibilities.

## Status

Implemented:
- `access.largeExecution` stores the admin ceiling (default 2, validated 1–64), waiting capacity (0–200), admission deadline (0–30 seconds), host headroom and estimated memory per admitted run. Global execution maximum is now validated through 64. Existing defaults and stored overrides are preserved.
- Scheduler reads settings each dispatch and while waiters exist; effective capacity is `min(admin ceiling, global runner ceiling, CPU capacity, floor((currently free RAM - headroom) / per-job reservation))`. Already-running work drains rather than being killed after a lower ceiling. Newly queued work keeps its original deadline. Queue messages report the actual assigned policy, not a hard-coded number.
- Admin Limits & access reports real queue counts, configured ceiling, effective capacity, CPU, free RAM and reservation estimates. Public health retains counts only.
- New Coding & workflows section has global, ten-language and five-workflow switches, using existing schema validation, authorization, revision conflict handling, audit logging and persistence. No new database schema is needed. All defaults are enabled.
- Shared policy guards client workers and server dispatch/verification; an explicit administrator refusal never falls back to a JavaScript worker. Refusals are not learner failures. Browser HTML/CSS/JS previews require all three switches and stop rendering when paused. Existing code remains editable.
- Added lightweight original SVG language emblems to language choices, the workspace and admin controls. These are code-native illustrations, not remote images or claimed official logos; no raster downloads or extra dependencies.
- AI authoring switch blocks provider calls before execution. Billing, authentication, progress and existing workflow settings remain intact.

Isolated real HTTP checks passed on port 4200 with a disposable database: admin ceiling changed live to 8; global ceiling reflected 8; actual effective capacity was correctly 0 under low RAM; JavaScript/Python/C/C++/SQL were rejected with 403/admin-disabled; all three coding workflow switches and AI authoring were enforced. Restoring defaults allowed JavaScript to produce `42` again. No production settings were changed during these checks.

## Verification complete

- `npm run check`: TypeScript, import boundaries, content validation/expansion verification and **103 suites / 2,763 tests passed**. Includes runtime disablement before engine initialization, explicit-server-refusal/no-fallback behavior, default/schema consistency, authenticated admin writes, revision conflicts, invalid settings and AI pause enforcement.
- Scheduler tests demonstrate a live ceiling increase from two to five admitted requests, CPU and global-slot caps, draining after a ceiling decrease, FIFO, changing memory, disconnect cleanup, queue bounds and the original assigned timeout message. Hardware-rich concurrency was tested with injected measurements, not by stressing the laptop.
- Production build passed; no source maps; **182.26 kB gzipped first-paint shell**, under 195 kB. The existing large-chunk advisory remains non-fatal.
- Browser QA used disposable `runtime-qa` administrator on the isolated preview, never the production admin. A language switch saved a real revision, the learner editor remained available, Run was disabled, the picker explained “Paused by admin,” and web previews did not mount an executable iframe when JavaScript was paused. Restored the default switch afterward through Reset + Save.
- Admin UI displayed actual CPU/RAM measurements and the distinction between configured ceiling and effective capacity. Mobile check at 390px (375px content viewport with scrollbar) showed no horizontal overflow. Temporary viewport override was reset.
- Screenshot artifacts: `C:/Users/KIIT0001/.codex/visualizations/2026/10/04/01a10852-76c8-7531-baf9-c25d20bf42e7/admin-coding-controls.png` and `admin-coding-mobile.png` in the same folder.

## How to use after publication

1. Open `/admin/rules/access`. Set **Large runs: admin ceiling** and ensure **Code runs at once** is at least as high. Set waiting capacity, bounded wait, host headroom and per-job reservation as appropriate for the actual worker host. Save; no restart needed.
2. Refresh the dynamic capacity card. An admin ceiling is permission, not guaranteed available capacity. Effective capacity still respects CPU/free RAM/global slots. Current defaults remain two large runs; increasing the saved ceiling replaces that default without editing code.
3. Open `/admin/rules/coding` for the master, per-language and workflow switches. Save. Normal online learner tabs refresh within the existing health/settings cycle (about 30 seconds); server dispatch checks the current policy immediately.
4. Reference-solution validation, verification and browser runs honor language pauses; ordinary non-code quiz reading/answering is intentionally not removed. The existing settings sections continue to govern practice sessions, placement, test-out and rewards.

## Handoff / publication

Implementation is complete in `C:/Users/KIIT0001/Desktop/Devlingo-redesign`. On 9 October 2026 the owner explicitly requested “push” and “and update”, authorizing publication to `adi` and live deployment. Deployment is in progress; leave `main` unchanged and retain existing language/workflow settings.

After explicit approval: inspect remote drift, commit the scoped changes, push to `adi` without force, back up the live database, fast-forward the live checkout, build and verify, then restart only its verified API child under its supervisor. Leave `main` unchanged unless separately authorized. Compare live database sections before/after; do not migrate or reset learner data. Record source commit, build budget and local/public health here.

Key implementation locations: `server/execution-admission.js` (dynamic scheduler); `server/index.js` (dispatch/verification enforcement and status); `server/admin.js` (protected status and AI controls); `server/{progress,review,assessment}-routes.js` (no-penalty refusal responses); `src/platform/settings/{types,defaults,meta}.ts` (validated settings); `src/platform/execution/{policy,useCodingPolicy,compilerService}.ts` (shared client policy); `src/modules/admin/components/settings/{AccessSection,CodingSection}.tsx` (admin controls); playground and challenge previews (disablement UX); `src/ui/primitives/LanguageEmblem.tsx` (original token-based SVG illustrations). API/session option plumbing carries workflow context without changing challenge runtime budgets.

Remaining limits are intentional: single-process/non-durable admission; remote Judge0 RAM/worker count is not discoverable from local host measurements; no cancellation of already-running jobs; offline browser code cannot be remotely revoked; per-language/workflow switches are product controls rather than new authorization roles. Runtime heap/time budgets, sandbox boundaries, rate limits, authentication, payments and saved-code semantics are preserved.
