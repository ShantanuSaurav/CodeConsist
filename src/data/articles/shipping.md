# Shipping to Production: deploy, observe, respond

> Code that is not deployed helps nobody, and code that is deployed carelessly hurts everybody. This article covers CI/CD pipelines, deployment strategies, feature flags, configuration and secrets, database migrations in production, structured logging, metrics and percentiles, alerting, incident response, security headers and performance budgets.

## CI/CD pipelines
<!-- tags: ci-cd, pipelines, fail-fast, reproducible-builds, git, branching -->

**Continuous integration** runs the checks on every push. **Continuous delivery** produces a deployable artifact from every green build; **continuous deployment** ships it automatically.

A good pipeline is **fail-fast** - cheap checks first (lint, type-check), expensive ones after (integration tests, build) - and **reproducible**: the same commit yields the same artifact, because dependencies come from the lockfile and the build runs in a clean container. Build the artifact once and promote the *same* artifact through staging to production; rebuilding per environment means production runs something nobody tested.

Trunk-based development - short-lived branches merged to `main` several times a day, with `main` always deployable - keeps merges small and the pipeline honest.

## Deployment strategies and rollback
<!-- tags: deployment, rolling, blue-green, canary, zero-downtime, rollback -->

- **Rolling** - replace instances a few at a time. Zero downtime, but two versions run side by side during the roll, so they must be compatible.
- **Blue-green** - stand up the new version alongside the old, switch traffic at the load balancer, keep the old one warm. Rollback is switching back - seconds.
- **Canary** - send a small slice of traffic (1%, then 10%…) to the new version and compare its error rate and latency to the old before widening. Catches what tests miss.

Every strategy is only as good as its **rollback**. Rollback must be a rehearsed, one-command operation, not a hurried forward fix. The thing that makes rollback hard is the database - see migrations below.

## Feature flags and gradual rollout
<!-- tags: feature-flags, rollout -->

A **feature flag** separates *deploying* code from *releasing* it. The code ships dark; a flag turns it on for staff, then 5% of users, then everyone - and off again instantly if something breaks, without a deploy.

```javascript
if (flags.isEnabled("new-checkout", { userId })) return renderNewCheckout();
return renderOldCheckout();
```

Flags accumulate; every one is a branch in your code and a state your tests may not cover. Give each an owner and an expiry, and delete it once it is fully on.

## Configuration and secrets
<!-- tags: environment-config, secrets, secrets-scanning, validation, json, spread, objects -->

Configuration is everything that differs between environments: ports, URLs, feature flags, limits. Keep it out of the code and read it from the environment at start-up, with defaults for development and **validation** that fails fast when a required value is missing or malformed - a bad `DATABASE_URL` should crash on boot, not on the first request.

```javascript
const config = {
  port: Number(process.env.API_PORT ?? 4000),
  dbUrl: required("DATABASE_URL"),
  ...(process.env.NODE_ENV === "production" ? { secureCookies: true } : {})
};
```

**Secrets** - API keys, database passwords, signing keys - are configuration that must never be in the repository, in logs, or in error messages. Inject them from a secrets manager or the platform's secret store, rotate them, and run **secrets scanning** in CI so an accidental commit is caught before it lands. A leaked key is compromised the moment it is pushed, even if you force-push it away.

## Database migrations in production
<!-- tags: migrations, sql -->

The database outlives every deploy, so schema changes must work with **both** the old and the new code running. The expand/contract pattern:

1. **Expand** - add the new column or table (nullable, with a default). Deploy code that writes to both old and new.
2. **Backfill** - copy existing data in batches, not one giant `UPDATE` that locks the table.
3. **Switch** - deploy code that reads from the new location.
4. **Contract** - once nothing reads the old one, drop it in a later release.

Never combine a destructive migration with the deploy that stops using the column; you lose the ability to roll back. Test migrations against a copy of production-sized data - an index build that takes a second locally can take an hour in production.

## Structured logging and redaction
<!-- tags: structured-logging, redaction, regex -->

Log **events as objects**, not sentences: `{ "level": "info", "event": "order.paid", "orderId": 42, "userId": 7, "ms": 132, "requestId": "..." }`. Machines can filter and aggregate fields; nobody can grep a paragraph.

Attach a **request id** to every log line of a request so one user's journey can be reassembled. Log at the right level: `error` for things needing action, `warn` for recoverable oddities, `info` for business events, `debug` off in production.

**Redact** before writing: passwords, tokens, card numbers, personal data. A denylist of field names plus a pattern pass (`/\b\d{13,19}\b/` for card-like numbers, bearer tokens after `Authorization:`) catches most leaks. Logs are often less protected than the database they describe.

## Metrics, percentiles and aggregation
<!-- tags: metrics, percentiles, latency, aggregation, sorting, maps, sets -->

An average hides the pain. If 99 requests take 50ms and one takes 5 seconds, the mean is ~100ms and looks fine, while one user in a hundred is furious. **Percentiles** show the distribution: **p50** is the median, **p95** is what the slowest 5% see, **p99** is what the slowest 1% see. Track p95 and p99 per endpoint - the tail is where users leave.

To compute a percentile: sort the samples, then take the value at index `⌈p/100 × n⌉ - 1` (the *nearest-rank* method). Stage 10's test ranks endpoints by p95 exactly this way. In production, metrics systems use histograms with buckets to approximate percentiles without storing every sample.

Aggregate by dimension - endpoint, status code, region - but keep cardinality bounded: a metric labelled by user id has as many series as you have users, and your metrics bill with it.

## Alerting and on-call
<!-- tags: alerting, on-call, error-tracking -->

Alert on what users experience: error rate above a threshold, p99 latency over budget, a queue that has not drained in ten minutes. Do not alert on CPU at 80% - that is a dashboard. Every alert must name the runbook step someone should take; if there is no action, it is noise, and noise trains people to ignore pages.

**Error tracking** (Sentry-style) groups exceptions by stack trace and tells you when a *new* kind of error appears after a deploy - the highest-signal alert there is. Rotate on-call fairly, keep the pager quiet by fixing root causes, and treat a page at 3 a.m. as a bug in the system that woke someone up.

## Incident response and postmortems
<!-- tags: incident-response, postmortem -->

During an incident: one person coordinates, one communicates, the rest investigate. **Mitigate first** - roll back, flip the flag, fail over - then understand. Write timestamps down as you go; memory of an incident is unreliable by the next morning.

Afterwards, a **blameless postmortem**: what happened, minute by minute; what the impact was; why the system allowed it (never "who"); what will change so it cannot recur. The output is action items with owners, not a document that gets filed.

## Security headers and hardening
<!-- tags: security-headers, hardening, cookies, csp, fingerprinting, security -->

A handful of response headers close whole categories of attack:

```
Strict-Transport-Security: max-age=31536000; includeSubDomains   force HTTPS
Content-Security-Policy: default-src 'self'; script-src 'self'   no inline/third-party scripts (XSS)
X-Content-Type-Options: nosniff                                   no MIME guessing
X-Frame-Options: DENY                                             no clickjacking
Referrer-Policy: strict-origin-when-cross-origin
```

Session cookies: `HttpOnly` (scripts cannot read them), `Secure` (HTTPS only), `SameSite=Lax` or `Strict` (CSRF). Remove **fingerprinting** headers like `X-Powered-By: Express` and default server banners - version numbers tell attackers which exploits to try. Keep dependencies patched; most breaches use a vulnerability that had a fix available.

## Performance budgets
<!-- tags: performance-budget, bundle-size -->

A **performance budget** is a number you agree not to exceed: 200 KB of JavaScript on the landing page, p95 API latency under 300 ms, Largest Contentful Paint under 2.5 s. Enforce it in CI - a bundle-size check that fails the build - so it does not erode one small dependency at a time.

The biggest wins are usually not clever: ship less JavaScript (code-split by route, drop the 300 KB date library for the built-in `Intl`), compress and cache static assets aggressively, and put a CDN in front of anything that does not change per user.

## Debugging production
<!-- tags: debugging -->

Reproduce with data, not guesses: pull the request id from the user report, find its logs and trace, and read what actually happened. Compare against the last deploy and the last config change - most incidents follow one of the two. Prefer turning something off (a flag, a canary) to changing code under pressure, and change one thing at a time so you know what fixed it.
