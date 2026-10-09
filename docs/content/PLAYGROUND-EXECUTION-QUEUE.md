# Memory-aware playground execution queue

## Request and scope — 9 October 2026

The owner requested that large server runs wait instead of immediately failing busy, with parallel execution when memory allows. Publishing to `adi` and deploying the live backend is authorized; leave `main` unchanged. Work in `Devlingo-redesign`, preserving existing account saves and learner data.

## Design

- Replace the one-large-request gate with a FIFO in-memory scheduler: at most two concurrent large requests (one on a single-logical-CPU host), eight waiting, 30-second admission deadline.
- Keep 768 MiB host headroom and conservatively reserve 1 GiB per admitted large request before launching it. Admission requires currently free RAM of at least headroom plus all reservations including the new job. This deliberately double-counts some already allocated RAM rather than oversubscribing the laptop.
- Thus the first admission requires at least 1.75 GiB currently free; a second needs 2.75 GiB currently free. The reservation is an estimate, not an enforced total-RSS cap. Existing per-engine limits remain unchanged.
- Recheck every 250ms only while requests wait; finishing or failing a job immediately tries to dispatch waiting jobs. No unbounded timers, output, queue or automatic resubmission.
- Existing global execution slots and per-account/IP rate limits still apply. A reservation can include time waiting for the existing global slots; this is conservative and does not increase global concurrency settings.
- Disconnecting removes waiting requests. A second cancellation check inside the existing global slot prevents later execution if a request disconnected while waiting there. An already executing program retains its reservation until its bounded runner completes; this feature is not hard cancellation of remote Judge0 work.
- Queue-full and admission-timeout errors explain what happened and explicitly state that no code ran. Successful-run history/saves are still populated only by successful results.
- Browser JavaScript, Python, SQLite and HTML previews do not enter this server queue. Server JavaScript, compiled languages, and the existing SQL API path do.
- Large HTTP client timeout becomes 100 seconds to cover up to 30s admission wait, the existing global-slot wait and the 45s compiler request deadline. External proxies may impose shorter deadlines; disconnected queued work is dropped. This is a bounded synchronous HTTP queue, not a durable background-job service.
- Frontend progress says “Waiting for server resources or running…” rather than falsely claiming an exact queue position or phase. Health exposes aggregate queue counts only, never code or identities.
- Capacity accounting is local to one API process and measures that host's free memory, not a remote Judge0 machine. The current single-process deployment is the target. Multiple API replicas would require shared admission accounting; queue contents are not retained across restarts. Parallelism improves throughput when capacity permits, not the speed of an individual program.

## Validation and deployment

Targeted validation passed: four suites, 74 tests. The new scheduler suite covers parallel admission, FIFO, changing RAM, reservations before allocation, queue overflow/expiry, cancellation, failures and timer cleanup. Existing runner and compiler-service regression tests also pass.

Real isolated HTTP checks on port 4200 used a separate temporary database. With approximately 1.09 GiB host RAM free, three large JavaScript requests correctly queued without starting. Aborting the third request reduced the waiting count from three to two. The remaining two returned the explicit 30-second memory-wait timeout; all counts returned to zero. A standard JavaScript request still returned HTTP 200. Parallel admission is verified with injected memory readings in unit tests; this low-memory HTTP check does not claim actual parallel execution.

Full `npm run check` passed, including TypeScript, boundaries, content checks and 102 test files / 2,742 tests. Production build and distribution guard passed: first-paint shell 181.67 kB gzipped against a 195 kB budget; no source maps shipped.

Before deployment, the live tracked checkout/index were clean. A private database backup was created at `ops/backups/db-pre-execution-queue-20261009.json`, SHA256 `022F7B3B84C9903A3EAE10787F3C15072B94CDA6D5E543A080D0FEF6121783E1`. It is not committed. Publication and live restart follow these passing gates; deployment results will be appended below.

## Published and deployed

- Source commit: `7817b809e9709ee2d2d590fbb8a3813d608ce70a`, pushed to `origin/adi`. The live `Devlingo-merged` checkout was fast-forwarded and rebuilt successfully; live shell 181.65 kB gzipped. No changes were pushed or merged into `main`.
- Restarted only the verified live API child under its existing supervisor; left Judge0, the tunnel and unrelated processes alone. Local and public `/api/health` both expose the new queue policy: maximum two running, eight waiting, 30-second wait. Both report 846 challenges and three accounts.
- Compared every top-level database section against the private predeployment backup after restart: no differences. No schema migration or learner-data edits were required.
- Standard live JavaScript smoke run returned HTTP 200, passed, output `42`. A large live JavaScript request was observed queued, automatically resumed when capacity became available and returned HTTP 200, passed, output `42`: approximately 7.8 seconds end-to-end, 173ms actual sandbox run. This verifies real waiting/resumption, not just immediate admission.
- A second isolated low-memory batch also demonstrated automatic resumption: two of three requests completed successfully after waiting; the third hit its bounded deadline. Queue counts returned to zero. The temporary isolated API was stopped afterward.
- Parallel dispatch is covered deterministically in unit tests with sufficient simulated memory; no claim is made that this low-memory laptop ran two large jobs simultaneously during HTTP smoke checks.
- GitHub Actions for the source commit was still running at the last check: https://github.com/ShantanuSaurav/CodeConsist/actions/runs/37826762020. Local full validation passed independently. The new frontend progress copy is built locally and published on `adi`; production frontend promotion remains controlled by `main`.

## Continuation notes

Implementation and authorized backend deployment are complete. Keep finite execution limits, per-account/IP rate limits and successful-run-only saves intact. If users still time out while waiting, inspect actual free server RAM and competing workloads; do not remove safety reservations or claim unlimited capacity. More sustained parallelism needs more server resources, and multiple API replicas need shared scheduling rather than duplicating this process-local queue.
