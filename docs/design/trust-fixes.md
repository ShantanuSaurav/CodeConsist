# Trust and quality fixes: design (feature group (a) to (h))

Read-only design, checked against `C:\Users\KIIT0001\Desktop\Devlingo-dev` on branch `feature/learning-loop`. Line numbers match what I read.

## 1. Goal

Stop real visitors from seeing developer instructions, wrong marketing numbers or raw errors. Make the server enforce premium access and resist basic abuse: rate limits, a CORS allowlist and a safe way to work out the client IP. Let an admin issue a one-time password-reset link. Every new number, rule and piece of copy ships with a default in code and can be changed from the admin panel with no redeploy. Guest mode, server-side XP and existing progress stay as they are.

## 2. Data model

### 2.1 `server/db.js`: new and changed records

**New top-level `settings: {}`.** A sparse, flat map from a setting key to a value, for example `{ "rateLimit.login.ip.limit": 50, "cors.mode": "enforce", "copy.offline.banner": "…" }`.
- A missing key means "use the default". The resolution order is: stored value, then env var (where one is declared), then the code default.
- It works like the existing `pricing` record (sparse, `null` clears a key).
- Only `server/settings.js` knows which keys exist. db.js stores whatever validated patch it is given.
- New store functions:
  - `getSettings()`
  - `setSettings(patch)`: a value sets the key and `null` deletes it. Keys are written with the existing `defineEntry` helper.
- The map is generic on purpose, so other feature groups (daily goals, streak rules and so on) can add their own key namespaces instead of creating a second settings record.

**New top-level `passwordResets: {}`, keyed by reset id.** Record shape:
- `id`: `pr_` plus 12 random characters from the `ORDER_ALPHABET` style alphabet
- `userId`
- `tokenHash`: SHA-256 hex. The token itself is never stored.
- `createdAt`, `expiresAt` (ISO)
- `createdBy`: admin id
- `usedAt: null`, `revokedAt: null`

New store functions:
- `putPasswordReset(rec)`
- `findPasswordResetByTokenHash(hash)`
- `passwordResetsForUser(userId)`, newest first
- `updatePasswordReset(id, patch)`
- `prunePasswordResets(nowMs)`: drops used, revoked or expired records older than 30 days. Called on every issue.

`deleteUser(id)` also deletes that user's reset records.

**`users[]` rows gain `tokenVersion: number`, default 0.** It is bumped by a password reset, which invalidates every learner token issued before it.

**`migrate(loaded)` changes, all additive.** Nothing existing is rewritten.
- `next.settings = plainObject(loaded.settings)`
- `next.passwordResets = plainObject(loaded.passwordResets)`
- In the `users.map`: `tokenVersion: Number.isInteger(rest.tokenVersion) ? rest.tokenVersion : 0`
- Export `migrate` so it can be tested. It is pure over its input.

`progress`, `orders`, `contentOverrides` and `customChallenges` are untouched. No progress is removed or re-scored. Premium solves already recorded stay recorded.

### 2.2 In-memory state (not persisted: it would rewrite db.json on every request)

- Rate-limit counters and blocked counts per bucket (`server/rate-limit.js`).
- The execution slot semaphore (`server/rate-limit.js`).
- A ring buffer of the last 100 rejected or reported CORS origins (`server/cors-policy.js`).
- A counter of premium-gate blocks since boot (`server/billing.js` or index.js).

All of these reset on restart. That is acceptable and documented on the admin page.

### 2.3 Settings keys (defaults ship in `server/settings.js`)

| Key | Type | Default | Allowed |
|---|---|---|---|
| `rateLimit.mode` | enum | `enforce` | `off` / `log` / `enforce` |
| `rateLimit.login.ip.limit` / `.windowSeconds` | int | 30 / 900 | 5–1000 / 60–86400 |
| `rateLimit.login.account.limit` / `.windowSeconds` (failed attempts per email) | int | 10 / 900 | 3–100 / 60–86400 |
| `rateLimit.register.ip.limit` / `.windowSeconds` | int | 20 / 3600 | 1–500 |
| `rateLimit.register.global.limit` / `.windowSeconds` | int | 300 / 3600 | 10–10000 |
| `rateLimit.execute.account.limit` / `.windowSeconds` | int | 40 / 60 | 5–1000 |
| `rateLimit.execute.ip.limit` / `.windowSeconds` | int | 120 / 60 | 5–2000 |
| `rateLimit.solve.account.limit` / `.windowSeconds` | int | 60 / 60 | 10–1000 |
| `rateLimit.passwordChange.account.limit` / `.windowSeconds` | int | 10 / 900 | 3–100 |
| `rateLimit.passwordReset.ip.limit` / `.windowSeconds` | int | 10 / 900 | 3–200 |
| `execution.maxConcurrent` | int | 4 | 1–16 |
| `execution.maxQueued` | int | 20 | 0–200 |
| `execution.queueWaitMs` | int | 10000 | 0–30000 |
| `network.trustProxyHops` | int | env `TRUST_PROXY_HOPS`, else 2 | 0–5 |
| `cors.mode` | enum | `report` | `open` / `report` / `enforce` |
| `cors.extraOrigins` | origin list | `[]` (plus env `CORS_ORIGINS`) | ≤ 20 exact `http(s)://host[:port]` |
| `premium.enforcement` | enum | `enforce` | `log` / `enforce` |
| `passwordReset.ttlMinutes` | int | 1440 | 15–10080 |
| `copy.<key>` | text | from `src/platform/site-copy/spec.ts` | per-key `maxLength`, only the tokens that key allows |

The per-IP defaults are deliberately generous because students on one campus network share a public IP (see section 7).

### 2.4 TypeScript types

**`src/types/index.ts`**
- Add `locked?: boolean` to `Challenge`. It is true only on a stub the server sent for a stage this viewer cannot open.

**`src/platform/api-client/api.ts`**
- `ApiError` gains `reason?: string` and `retryAfterSeconds?: number`, filled from `payload.reason` and `payload.retryAfterSeconds` in `request()`.
- The `content()` return type gains `lockedStageIds?: string[]`.
- New response types: `SiteConfigResponse { copy: Record<string,string>; updatedAt: string | null }`, `PasswordResetInspect`, and a reset response that reuses `AuthResponse`.

**New `src/platform/site-copy/spec.ts`** (pure, no imports, so the server can compile it the way it compiles `leveling.ts`)
- `SITE_COPY_SPEC: Record<string, { label; group; default; tokens: string[]; maxLength }>`
- `renderCopy(template, vars)`

**`src/platform/storage/storage.ts`**
- New key `STORAGE_KEYS.siteConfig = 'cq-site-config-v1'` (cached overrides for offline use).

**`src/modules/admin/services/adminApi.ts`**
- New types: `SettingRow`, `SettingsResponse`, `SecurityStatus`, `PasswordResetIssued`, `PasswordResetRow`.
- `AdminUserRow` gains `activeResetLink: { expiresAt: string } | null`.

### 2.5 Compatibility

- Tokens issued before this change have no `tv` claim. They are read as `tv: 0` and match `tokenVersion: 0`, so no one is signed out.
- `/api/content` keeps every field it has today and only adds `lockedStageIds`. Older clients ignore it. Stubs carry `id`, `stageId`, `title` and `type`, so old code that counts lessons still works.
- The Judge0-not-configured `/api/execute` body keeps `status`, `engine`, `stderr` and `testResults`, and adds `reason` and `devHint`.

## 3. Server API and where the rules live

### 3.1 New or changed server modules

**`server/settings.js`** holds the settings table and all validation.
- `SECURITY_SETTINGS` is an array of `{ key, group, label, help, type: 'int'|'enum'|'bool'|'origins'|'text', min?, max?, values?, envVar?, default }`.
- `registerSettings(specs)`. At bootstrap it also registers `copy.*` specs from the compiled `site-copy/spec.ts`.
- `setting(key)` returns the effective value.
- `settingsView(group?)` returns rows of `{ key, group, label, help, type, min, max, values, default, envValue, stored, effective, source: 'custom'|'env'|'default' }`.
- `validateSettingsPatch(values)` returns `{ patch, issues: [{ key, message }] }`. It rejects unknown keys, ints outside the range, enum values not in the list, and origins that are not an exact `new URL(x).origin` (no path, no `*`, no trailing slash after normalising). For text it rejects empty strings, strings over `maxLength`, and `{token}` names the key does not allow.
- `copyText(key, vars)` renders a copy key for server-side messages (429s, premium-locked, runtime unavailable).

**`server/client-ip.js`**
- `trustProxyFn(getHops)` returns `(addr, i) => i < getHops()`. Express 5 `trust proxy` accepts a function and calls it per request, so an admin change applies at once.
- `clientIp(req)` returns `req.ip`. It returns `null` ("unknown") when `req.ip` is loopback or private but an `X-Forwarded-For` header is present. That combination means the server is behind a proxy it has not been told to trust, and treating everyone as `127.0.0.1` would put all learners in one bucket.
- `ipDiagnostics(req)` returns `{ socket, forwardedFor: string[], hops, derived, trustworthy }`.

**`server/rate-limit.js`**
- `createLimiter({ now = Date.now, maxKeys = 50_000 })` returns `{ hit(bucket, key, rule), peek(bucket, key, rule), reset(bucket, key?), stats() }`. It uses fixed-window counters in a `Map`, with a sweep every minute and oldest-first eviction above `maxKeys`.
- `rateLimit({ limiter, bucket, rule: () => ({ limit, windowSeconds }), key: (req) => string|null })` is Express middleware.
  - A `null` key skips the check (fails open).
  - `rateLimit.mode` `off` skips; `log` counts and logs only; `enforce` answers 429.
- `createExecutionSlots({ max, maxQueued, waitMs })` returns `{ run(fn), stats() }`, and throws `BusyError` when the queue is full or the wait times out.

**`server/cors-policy.js`**
- `allowedOrigins()` returns a `Set` built from `APP_ORIGIN`, env `CORS_ORIGINS` (comma-separated), `setting('cors.extraOrigins')`, `http://localhost:3000` and `http://127.0.0.1:3000`.
- `corsMiddleware()` wraps `cors({ origin: (o, cb) => cb(null, mode === 'open' || !o || allowed.has(o)), allowedHeaders: ['Content-Type','Authorization','ngrok-skip-browser-warning'], maxAge: 600 })`.
- `foreignOriginGuard()` applies to non-GET/HEAD/OPTIONS `/api/*` requests with an `Origin` header that is not allowed. It records the origin in the ring buffer. In `enforce` mode it answers 403 `{ error, reason: 'origin-not-allowed' }`.

**`server/billing.js`**: new premium-gate helpers built on the existing `entitlementsFor`, `unlockedStageIds` and `applyStageOverride`.
- `premiumStageIds({ snapshot, overrides })` returns a `Set` of stages that are premium after admin overrides, hidden stages included.
- `stageAccessFor(user, { snapshot, overrides })` returns `{ all: boolean, allows(stageId): boolean, lockedStageIds: string[] }`.
  - A stage that is not premium is always allowed.
  - A guest (null user) gets no premium stages.
  - `entitlementsFor(user.id, user).lifetime` allows everything.
  - Otherwise access comes from `unlockedStageIds(ent, snapshot.languageTracks)`, the same expansion `publicUser` uses.
- `premiumGate(user, challenge, ctx)` returns `{ ok: true }` or `{ ok: false, stageId }`.

**`server/content.js`**
- `lockedStub(challenge)` keeps `id, stageId, type, title, difficulty, xpReward, language, isStageTest, tags` and adds `locked: true`. It drops everything else: prompt, options, `correctIndex(es)`, blanks, `pseudocodeLines`, `starterCode`, `testCases`, `solutionCode`, hints, explanation and concept.

**`server/password-reset.js`**
- `hashResetToken(token)`
- `issuePasswordReset({ userId, adminId, ttlMinutes, now })` returns `{ record, token }`. The token is 32 random bytes, base64url (43 characters). Issuing revokes that user's other open links.
- `inspectPasswordReset(token, now)` returns `{ ok, record?, reason: 'unknown'|'expired'|'used'|'revoked' }`.
- `claimPasswordReset(token, now)` is synchronous: it re-inspects and sets `usedAt` before any `await`, so two concurrent posts cannot both succeed.
- `createPasswordResetRouter({ store, publicUser, signLearnerToken, limiter })`

**`server/auth.js`**
- `signLearnerToken(user)` adds `tv: user.tokenVersion ?? 0`.
- New `learnerTokenIsCurrent(payload, user)` is `(payload.tv ?? 0) === (user.tokenVersion ?? 0)`. It is used by `optionalAuth` in index.js and by `learnerFor` in `server/oauth-routes.js`.

**`package.json` `dev:api`**
- Add `--watch-path` entries for the five new server files.

### 3.2 (d) Server-side premium entitlement (no payment-provider changes)

`ctx = { snapshot: contentSnapshot(), overrides: store.getContentOverrides() }` is built once per request.

**`GET /api/content`** (public, uses `optionalAuth`)
- `access = stageAccessFor(req.user, ctx)`, then `challenges: merged.challenges.map(c => access.allows(c.stageId) ? c : lockedStub(c))`.
- The response adds `lockedStageIds`.
- Headers `Cache-Control: private, no-store` and `Vary: Authorization`, because the response now depends on who is asking.
- `stages` is unchanged, so locked stages still render as locked.

**`POST /api/progress/solve`** (`requireAuth`)
- Right after the 404 check and before `verifySubmission`, so no code runs for a locked item:
  - `gate = premiumGate(req.user, challenge, ctx)`
  - If `!gate.ok`, return 403 `{ error: copyText('premium.lockedSolve'), reason: 'premium-locked', stageId }`.
  - In `premium.enforcement = log` mode it logs `[premium] would block`, increments the counter and continues.

**`POST /api/progress/merge`**
- `newIds` is additionally filtered by `access.allows(challenge.stageId)`.
- The response adds `skippedLocked: string[]`.
- Already-completed ids stay as they are.

**`POST /api/grade`** (public)
- The same gate. It answers 403 with the same shape.

**`createDraftsRouter`** (optional)
- Pass a `getChallengeMerged` wrapper that returns `null` for locked items, so the route answers 404.

**Not changed:** `/api/execute`, which is not tied to a challenge; `certificateEligibility`, which now needs entitlement in practice because solves are gated; and `publicUser`.

### 3.3 (e) Client IP, rate limits, capacity and CORS

**Client IP.** The chain is browser → Vercel (`vercel.json` rewrite) → ngrok → loopback.
- In `server/index.js`, call `app.set('trust proxy', trustProxyFn(() => setting('network.trustProxyHops')))` right after `const app = express()`.
- The expected `X-Forwarded-For` at the server is `client, vercelEgress` with a loopback socket. With 2 hops, `req.ip` is the client. Verify this with the admin diagnostic (section 7).
- Replace both ad-hoc readers of `cf-connecting-ip` / `x-forwarded-for` with `clientIp(req) ?? req.socket.remoteAddress`: the access logger (index.js:150) and `sourceKey` in oauth-routes.js (lines ~255-258).

**Where the limits apply** (all buckets read their rule live from settings):

| Route | Buckets and keys |
|---|---|
| `POST /api/auth/register` | `register.ip` (key `clientIp`) and `register.global` (key `'all'`) |
| `POST /api/auth/login` | `login.ip` middleware. In the handler, before bcrypt: `limiter.peek('login.account', email)`; 429 if at the limit. On failure, `hit('login.account', email)`; on success, `reset('login.account', email)`. The key is the normalised email whether or not the account exists, so a 429 does not reveal which emails have accounts. |
| `POST /api/execute` | `execute.account` (key `req.user?.id`) and `execute.ip` (key `clientIp`). `runJsInChild` and `runJudge0Submission` run inside `slots.run(...)`. `BusyError` answers 503 `{ status:'error', engine:'none', reason:'busy', stderr: copyText('limits.busy'), testResults: [] }`. |
| `POST /api/progress/solve` | `solve.account`. `verifySubmission` also runs through `slots.run`, covering the JS child process and `runPythonLocally`. |
| `POST /api/auth/password` | `passwordChange.account` |
| Password-reset learner routes | `passwordReset.ip` |

Every 429 answers `{ error: copyText('limits.tooMany', { minutes }), reason: 'rate-limited', retryAfterSeconds }` with a `Retry-After` header. The admin login already has its own lockout in `admin-auth.js` and is not changed.

**CORS.**
- Replace `app.use(cors())` (index.js:144) with `app.use(corsMiddleware())`. Mount `foreignOriginGuard()` just before `createWebhookRouter`. Razorpay webhooks send no `Origin`, so they pass.
- The browser app always calls `/api` on its own origin: through the Vercel rewrite in production and the Vite proxy in development. Restricting the CORS headers therefore cannot break the real app.
- The part that could break things is rejecting a foreign `Origin` on writes. It ships in `report` mode, and the admin switches it to `enforce` after checking the rejected-origins list (section 7).

### 3.4 (f) Password reset

**Learner routes** (from `createPasswordResetRouter`, mounted with `app.use('/api', …)`; no auth):
- `POST /api/auth/password-reset/inspect`, body `{ token }`
  - A token that does not match `/^[A-Za-z0-9_-]{43}$/` answers `{ valid:false, reason:'unknown' }`.
  - Otherwise it answers 200 `{ valid:true, username, expiresAt }` or 200 `{ valid:false, reason }`.
- `POST /api/auth/password-reset`, body `{ token, newPassword }`
  - 400 if `newPassword.length < 8`, the same rule as register.
  - `claimPasswordReset` failure answers 410 `{ error, reason }`.
  - On success: `bcrypt.hash(newPassword, 10)`, then `store.updateUser(id, { passwordHash, tokenVersion: +1 })`, `store.recordLogin`, and `limiter.reset('login.account', email)`.
  - It appends an audit row `user.password-reset.used` with `adminId: null` and `{ userId, resetId }`.
  - It answers 200 `{ token: signLearnerToken(updated), user: publicUser(updated), progress }`, the same shape as login.
- The token is carried only in request bodies, never in a URL the server sees. The link uses a URL fragment.

**Admin routes** (in `createAdminRouter`, so behind `requireAdminAuth`):
- `POST /api/admin/users/:id/password-reset`
  - 404 if there is no such user.
  - Otherwise 201 `{ reset: { id, createdAt, expiresAt }, token, path: '/reset-password#token=<t>', url: APP_ORIGIN ? APP_ORIGIN + path : null }`.
  - The token is returned once and is never stored or audited. Audit row: `user.password-reset.issue` with `{ userId, resetId, expiresAt }`.
- `GET /api/admin/users/:id/password-resets` returns `{ resets: [{ id, createdAt, expiresAt, usedAt, status: 'active'|'used'|'expired'|'revoked' }] }`.
- `POST /api/admin/password-resets/:id/revoke`, audited as `user.password-reset.revoke`.
- `adminUserRow` gains `activeResetLink`.

This also works for Google/GitHub-only accounts: it gives them a password, and `hasPassword` becomes true.

### 3.5 (a)/(b) Public config and runtime-unavailable responses

- `GET /api/site-config` (public, `Cache-Control: public, max-age=60`) returns `{ copy: { [key]: overrideText }, updatedAt }`, overrides only.
- Judge0-not-configured 501 from `/api/execute` (index.js:1053-1064) now answers `{ status:'error', engine:'none', reason:'runtime-unavailable', stderr: copyText('runtime.unavailable', { language }), devHint: judge0SetupHint(language), testResults: [] }`.

### 3.6 Admin settings routes (all in admin.js, behind `requireAdminAuth`)

- `GET /api/admin/settings?group=security|premium|passwordReset|copy` returns `{ settings: SettingRow[], tokensPreview? }`. For the `copy` group, `tokensPreview` holds live counts `{ lessons, tests, stages, tracks, freeStages, premiumStages }` from `learnerView`.
- `PATCH /api/admin/settings`, body `{ values: { [key]: value | null } }`.
  - It follows the existing `PUT /billing/pricing` style: 400 `{ error: issues[0].message, issues }`.
  - On success it calls `store.setSettings(patch)` and appends one audit row per key: `settings.update` with `{ key, from, to }`. Values are never secrets.
  - It returns the new view.
- `GET /api/admin/security/status` returns:
  - `ipDiagnostics(req)`
  - `limiter.stats()`: per bucket, `{ blocked, lastBlockedAt, top: [{ key, count, username? }] }`
  - `slots.stats()`
  - `cors: { mode, allowed: [{ origin, source }], recent: [{ origin, count, lastAt, path }] }`
  - `premium: { enforcement, blockedSinceBoot }`
- `POST /api/admin/security/rate-limits/reset`, body `{ bucket, key? }`, audited as `security.rate-limit.reset`.

## 4. Client

### 4.1 (a) Developer text only in development

**New `src/ui/primitives/DevHint.tsx`**, exported from `src/ui/index.ts`. It renders its children only when `ENV.isDev` (`src/config/env.ts`). The ui layer may import config (`check-boundaries.mjs` ALLOWED).

**New `src/platform/site-copy/`**
- `spec.ts` (defaults)
- `store.ts`: a module-level store with `getCopy(key, vars)`, `setCopyOverrides(map)` and `subscribe`. It reads and writes `STORAGE_KEYS.siteConfig` inside try/catch.
- `useSiteCopy.ts`: the `useSiteCopy()` hook
- `index.ts`

Session wiring: in the health `probe` recovery branch of `SessionProvider.tsx` (~836), next to `loadFromApi`, call `api.siteConfig()` and pass the result to `setCopyOverrides`.

Replacement at each location (friendly copy, plus a `DevHint` with the old developer text):
- **`AuthModal.tsx:156`**: `copy.offline.auth` ("Accounts are temporarily unavailable. Keep practising as a guest - your progress is saved on this device."), followed by `<DevHint>` holding the `npm run dev:api` text.
- **`Leaderboard.tsx:22-27`**: `EmptyState` title from `copy.offline.leaderboard`; the `npm run dev:api` line moves into `DevHint`.
- **`Playground.tsx:398-400`**: shown only when `ENV.isDev`, otherwise `copy.runtime.unavailable`.
- **`Playground.tsx:486`**: `copy.offline.playgroundJs`.
- **`Playground.tsx:493`**: `copy.offline.playgroundCompiled` with `{language}`.
- **`compilerService.ts:569-571`**: `ENV.isDev ? <current text> : getCopy('offline.playgroundCompiled', { language })`.
  - When a result has `reason === 'runtime-unavailable'`, show `stderr` (now friendly), plus `devHint` in development only.
- **`SettingsPage.tsx:233-241`**: rename the row "API server" to "Sync", with `copy.sync.online` / `copy.sync.offline` / `copy.sync.guest`. Show the raw "API server: offline" label only in `DevHint`.
- **`Sidebar.tsx:180`**: tooltip from `copy.sync.online` / `copy.sync.offline`.
- **`DashboardLayout.tsx:80`**: `copy.offline.banner`, defaulting to "Sync is temporarily unavailable - your progress is saved on this device."
- **Same copy family, same fix:**
  - `SubscriptionModal.tsx:117`: `copy.offline.checkout`
  - `CertificatePage.tsx:48`: `copy.offline.generic`
  - `VerifyPage.tsx:38`: `copy.offline.verify`
  - `PlaygroundPage.tsx:10` description: `copy.playground.description`, without "API" or "Judge0" wording
- `DevHint` hides these strings from visitors, but they may stay in the JS bundle. Removing them from the bundle is not required. If the owner wants that, write `{import.meta.env.DEV && …}` at the call sites so Vite replaces it with `false` and the minifier drops it.

### 4.2 (b) Correct numbers and editable marketing copy

**Numbers at runtime.**
- New `useContentStats()` in `src/platform/session` returns `{ lessons, tests, stages, tracks, freeStages, premiumStages }`. It is computed from `allChallenges` and `stages`, which already reflect API overrides and hidden stages.
- `Hero.tsx:96` already derives its counts this way. `SocialProof.tsx` does too.

**Copy templates** (admin-editable, each allowing only its listed tokens):
- `Hero.tsx:118`: `copy.landing.heroFootnote`, default "Free to start · {freeStages} free stages, {premiumStages} premium · Every stage ends in a coding test".
- `Footer.tsx:41`: `copy.landing.footerBlurb`, default "The developer training environment."
- `HowItWorks.tsx:10,41`: `copy.landing.howLessons` ("Bite-sized lessons in every stage…") and `copy.landing.howPath` ("{stages} stages, in order…").
- `FinalCTA.tsx:14`: `copy.landing.finalCta`.
- `copy.meta.description` is applied at runtime to `document.querySelector('meta[name=description]')` on landing mount.

**Numbers at build time.**
- New `scripts/content-stats.mjs` (plain JS, like `loader.build.mjs`) exports `computeContentStats()`, using `loadContent('challenges')` and `loadSpecs()` from `src/platform/content-registry/loader.build.mjs`.
- Its CLI takes `--check` (exit 1 when out of date) or `--write`.
- It updates README.md between `<!-- content-stats:start -->` and `<!-- content-stats:end -->` (lines 3 and 62 today say 232) and the `package.json` `description`.
- Add `"content:stats": "node scripts/content-stats.mjs --check"` to the `npm run check` chain.
- **`vite.config.ts`**: a small `transformIndexHtml` plugin (in `scripts/vite-content-stats.mjs`, result cached per process) replaces `%CC_LESSONS%`, `%CC_TESTS%`, `%CC_STAGES%` and `%CC_TRACKS%` in `index.html`.
  - New meta description: "CodeConsist - learn to code with %CC_LESSONS% bite-sized lessons and %CC_TESTS% stage tests across %CC_STAGES% stages, with real code execution. Free to start."
  - Lessons are rounded down to the nearest 10 with a "+" suffix, so questions added later in the admin console never make the text wrong.
  - Optionally add `og:title` / `og:description` in the same plugin.

### 4.3 (c) Small bugs

- **`src/platform/xp-leveling/insights.ts:134`**: change `/^stage-d+$/` to `/^stage-\d+$/`. Badge ids (`stage-${id}`) do not change, so seen-badge state carries over. Only the title changes, to "Stage 03 cleared".
- **404 page.** New `src/app/routes/NotFoundRoute.tsx`, imported statically (it is tiny).
  - Title and body come from `copy.notFound.title` / `copy.notFound.body`.
  - It links to `ROUTES.landing` and `ROUTES.learn`.
  - `App.tsx:150`: `<Route path="*" element={<NotFoundRoute/>} />`.
  - Also add `<Route path="*" element={<NotFoundRoute inFrame/>} />` inside the dashboard route, so `/dashboard/typo` keeps the sidebar.
  - The short-URL `Navigate`s (`/learn`, `/practice` and so on) and admin's own `*` → `/admin` stay.
- **`src/ui/primitives/ErrorBoundary.tsx`**
  - Production: a friendly title and body, plus a short reference code (`E-` + 6 random characters) logged to the console together with the error.
  - Development: also show `error.message` and `componentStack` in a `<pre>`.
  - New optional prop `messages?: () => { title: string; body: string }`. `App.tsx` passes `() => ({ title: getCopy('error.title'), body: getCopy('error.body') })`, because ui cannot import platform.
  - Add a plain `<a href="/">Go to home</a>`. The boundary sits outside `BrowserRouter`, so it cannot use `<Link>`.
  - Log prefix changes from `[CodeQuest]` to `[CodeConsist]`.

### 4.4 (d) Session and content

**`src/platform/session/content.ts` `loadFromApi`**
- Carry `lockedStageIds` on `ContentBundle`.

**`SessionProvider.tsx`**
- Add an internal `reloadContent()`, which calls `loadFromApi` then `setBundle` when online.
- Call it after:
  - `loginWithEmail`, `signupWithEmail`, `adoptToken` and `logout`
  - `refreshAccount`, after a purchase: refetch content first, then set the entitlements
- `completeChallenge` catch block (~1003): on `ApiError` 403 with `reason === 'premium-locked'`, revert with `setStats(stats)` (like the 422 branch), notify `copy.premium.lockedSolve`, and call `refreshAccount()`.
- After a merge with `skippedLocked.length > 0`, show one info toast.

**`src/modules/challenges/session/PracticeSessionProvider.tsx`** (~84, 125)
- If the target challenge has `locked`, treat it like `isPremiumLocked`: show the unlock prompt and trigger a content reload. This covers entitlement changes racing the content refetch.
- `ChallengeLibrary.tsx` shows "Unlock to view" for rows with `locked` wherever it would show a prompt.

### 4.5 (e) Friendly limits

`ApiError` now carries `reason` and `retryAfterSeconds`:
- AuthModal already shows `err.message`, which is the server's friendly 429 text.
- compilerService maps 429 and 503 `busy` to an error result with the server's `stderr` or message.
- The practice solve path treats 429 like "saved locally, will sync" rather than "rejected".

### 4.6 (f) Reset page

- **`src/config/routes.ts`**: add `resetPassword: '/reset-password'` and include it in `STATIC_ROUTES`.
- **New `src/modules/account/pages/ResetPasswordPage.tsx`**, exported from the account barrel and routed in `App.tsx` outside the dashboard, like `authCallback`:
  - It reads `#token=` from `location.hash` and immediately calls `history.replaceState` to remove it.
  - It calls `api.inspectPasswordReset(token)`: "Set a new password for <username>".
  - The form has password and confirm fields, minimum 8.
  - It calls `api.resetPassword(token, pw)`, then `adoptToken(result.token)` (the existing path, which also merges guest progress), then navigates to `ROUTES.dashboard`.
  - States: invalid, expired or used ("Ask the person who sent it for a new link"); offline (`copy.offline.generic`, with the token kept in memory for a retry); signed in as someone else (a warning that the page will switch accounts).
- **New api.ts methods:** `siteConfig()`, `inspectPasswordReset(token)`, `resetPassword(token, newPassword)`.

### 4.7 (g) Sourcemaps

- **`vite.config.ts`**: `build.sourcemap: mode === 'development' || env.SOURCEMAP === 'true'`.
- New `scripts/check-dist.mjs` fails if `dist/**/*.map` exists. Run it in CI after `npm run build` (`.github/workflows/ci.yml`).

### 4.8 Behaviour by state

| | Guest | Signed in | Offline |
|---|---|---|---|
| Developer text | hidden in production | hidden in production | friendly copy from cached overrides or defaults |
| Premium content | stubs from the API; UI locked as today | full if entitled, stubs if not | bundled content; UI lock from cached entitlements; an entitled learner's offline solve merges later |
| Rate limits | per IP | per account and per IP | none (no server) |
| Reset page | normal case | warns before switching account | "temporarily unavailable", retry |
| Site copy | overrides | overrides | cached overrides, else defaults |

## 5. Admin panel

**New "Limits & access"** at `/admin/settings/limits`: `src/modules/admin/pages/AdminLimits.tsx`, in the AdminLayout `GROUPS` under Operations.
- Rate limits: the mode, plus each rule's limit and window (`NumberField` with the min and max shown).
- Code runner capacity: `execution.*`.
- Network: `trustProxyHops`, with a live diagnostic card for the admin's own request (socket, `X-Forwarded-For` chain, derived IP). It warns when the IP is unknown and per-IP limits are therefore not applied.
- CORS: the mode (`SelectField`); `extraOrigins` (`TagsField`); the effective allowlist with each origin's source (env, `APP_ORIGIN`, admin, dev); and a table of recent rejected or reported origins.
- Premium access: `premium.enforcement`, and blocked attempts since boot.
- Password reset: `ttlMinutes`.
- Live limiter status per bucket: blocked count and top keys, with usernames resolved. Each key has an Unblock button that calls the reset route.
- Each row shows a default / env / custom badge and has "Reset to default", which sends `null`.
- Built on a new generic `src/modules/admin/components/SettingsForm.tsx` that renders `SettingRow[]` by type. Other feature groups can reuse it.

**New "Site copy"** at `/admin/content/copy`: `AdminSiteCopy.tsx`, under Content.
- Keys are grouped: Offline and errors, Sync status, Landing, Limits, Premium, Not found, Meta.
- Each key shows the read-only default, a `TextArea` for the custom value, chips for the allowed tokens, a live preview rendered with `renderCopy(value, tokensPreview)`, and "Reset to default".

**Users** (`AdminUsers.tsx`)
- New "Reset link" row action that opens `src/modules/admin/components/PasswordResetDialog.tsx`.
- The dialog issues a link and shows the full URL once, with Copy. It uses `url`, or else `window.location.origin + path`, and warns when that origin is localhost.
- It shows the expiry and the text "Send this privately; anyone with it can set this learner's password".
- It lists earlier links with their status and a Revoke button.
- The table shows an "Active reset link" badge.

**Billing** (`AdminBilling.tsx`)
- A read-only line: "Server-side premium lock: Enforced / Logging only". It links to Limits & access.

**New `adminApi.ts` methods:** `settings(group)`, `updateSettings(values)`, `securityStatus()`, `resetRateLimit({ bucket, key })`, `issuePasswordReset(userId)`, `passwordResets(userId)`, `revokePasswordReset(id)`.

**Checklist: everything new in this design and where it is edited**
- Every rate-limit number and the mode, capacity numbers, trusted proxy hops, CORS mode and origins, premium enforcement mode, and reset link lifetime: Limits & access.
- All offline, error, 404, limit and premium messages, and the landing, footer, how-it-works and meta copy: Site copy.
- Reset links: Users.

The build-time HTML meta and README numbers are derived from content, not stored settings. The runtime meta description is editable. Developer hints are developer-only by definition.

## 6. Tests to add

### Server (vitest; follow the `billing-routes.test.mjs` and `drafts.test.mjs` patterns)

- **`server/__tests__/rate-limit.test.mjs`**
  - Counts per window with an injected clock and resets after the window.
  - Buckets and keys are isolated.
  - `Retry-After` and `retryAfterSeconds`.
  - `log` mode never blocks; `off` skips.
  - A `null` key skips.
  - A changed rule callback applies on the next hit.
  - Eviction above `maxKeys`.
  - Execution slots: the queue, `BusyError` on overflow and on timeout.
- **`server/__tests__/client-ip.test.mjs`**: a real Express app with `trustProxyFn`.
  - With chain `client, vercel` on loopback: hops 0 gives `null` (unknown), 1 gives `vercel`, 2 gives `client`.
  - A request with no `X-Forwarded-For` gives the socket address.
- **`server/__tests__/settings.test.mjs`**
  - Range, enum and bool validation.
  - Origin normalisation and rejection (path, `*`, `ftp:`, more than 20).
  - Copy with unknown tokens or over `maxLength` is rejected.
  - `null` clears a key.
  - Precedence: stored over env over default.
- **`server/__tests__/admin-settings.test.mjs`**: `createAdminRouter` with `admin-auth.js` and `db.js` mocked as in the billing test.
  - GET groups.
  - PATCH 400 with `issues`.
  - PATCH success writes audit rows.
  - The security status shape.
  - Rate-limit reset.
- **`server/__tests__/password-reset.test.mjs`**: the real `db.js` with `node:fs/promises` mocked, as in `drafts.test.mjs`.
  - An issued token is 43 characters and only its hash is stored.
  - Issuing a second link revokes the first.
  - Inspect covers valid, unknown, expired, used and revoked.
  - Reset sets a hash that bcrypt accepts, bumps `tokenVersion` and sets `usedAt`.
  - A second use answers 410.
  - Concurrent double-submit: exactly one 200.
  - `deleteUser` removes the user's resets.
  - The per-IP limit.
  - Admin routes: 201 shape, list statuses, revoke, and the audit row contains no token.
- **`server/__tests__/auth-token-version.test.mjs`**
  - A legacy token without `tv` passes for `tokenVersion` 0 or undefined.
  - A token with a mismatched `tv` is rejected by `learnerTokenIsCurrent`.
- **`server/__tests__/premium-gate.test.mjs`** (billing.js unit, with the in-memory store mock from `billing.test.mjs`)
  - A free stage is always allowed; a guest is denied premium.
  - Lifetime; a track purchase that covers a stage added later; a single stage purchase.
  - A revoked order is denied.
  - An admin override turns a stage premium, or free.
  - `lockedStub` drops every answer and solution field.
- **`server/__tests__/cors-policy.test.mjs`**
  - An allowed origin gets `Access-Control-Allow-Origin`; a disallowed one does not; preflight works.
  - With no `Origin`, the request passes.
  - `report` records and passes; `enforce` answers 403 on POST and lets GET through.
- **`server/__tests__/db-migrate.test.mjs`**: an old db shape gains `settings: {}`, `passwordResets: {}` and user `tokenVersion: 0`. Existing progress, orders and overrides are deep-equal to before.
- **Extend `server/__tests__/index-guards.test.mjs`** (source assertions, since index.js binds a port):
  - `premiumGate(` appears in the solve, merge and grade handlers.
  - `lockedStub` is used in `/api/content`, with `no-store`.
  - There is no bare `cors()`.
  - `trust proxy` is set.
  - The logger no longer reads `cf-connecting-ip`.
  - Login calls `limiter.peek('login.account'` before `bcrypt.compare`.
- **`server/__tests__/vite-config.test.mjs`**: calling the exported config function with `{ mode: 'production', command: 'build' }` gives `build.sourcemap === false`; `mode: 'development'` gives `true`.

### Client (`src/**/__tests__`, node environment)

- **`src/platform/xp-leveling/__tests__/insights.test.ts`**: `stage-3` is titled "Stage 03 cleared"; `stage-c1` uses its name.
- **`src/platform/site-copy/__tests__/siteCopy.test.ts`**: `renderCopy` with known and missing tokens; overrides merge over defaults; the localStorage cache survives a throwing `localStorage`.
- **Extend `src/platform/execution/__tests__/compilerService.test.ts`** with `vi.mock('@/config/env', …)`: in production the offline error text has no `npm run`, `.env` or `Docker`; in development it keeps the hint.
- **Extend `src/platform/api-client/__tests__/offline.test.ts`**: `ApiError` carries `reason` and `retryAfterSeconds` from 429 and 403 bodies.
- **New `src/platform/session/__tests__/content.test.ts`**: `loadFromApi` keeps `locked` stubs and `lockedStageIds`, and `groupIntoStages` still groups the stubs.
- **`scripts/content-stats.mjs --check`** runs in `npm run check`. **`scripts/check-dist.mjs`** runs in CI after the build.

## 7. Risks, edge cases and manual checks

**Proxy chain and IP spoofing.**
- The ngrok URL is public, and its hostname is in `vercel.json`. A request sent straight to ngrok with a forged `X-Forwarded-For` controls the second-from-right entry, so with 2 hops per-IP limits can be bypassed.
- Mitigations in this design: per-account limits, per-email login failures, the global register cap and execution slots cannot be spoofed.
- Optional hardening for the owner: restrict ngrok ingress to Vercel, or have a Vercel edge middleware add a shared-secret header.
- **Manual check:** open Limits & access through the Vercel URL and confirm the derived IP is your real public IP. Then run `curl` straight at the ngrok URL and compare.

**Shared campus IPs.** Many students may share one public IP. That is why the per-IP defaults are generous and accounts carry the tighter limits. Watch the blocked counts in the first week.

**Hop count set too low behind the tunnel.** `clientIp` returns `null`, so per-IP limits are skipped (fail open) and the admin page shows a warning. Everyone never ends up in one bucket.

**CORS `enforce`.** It could 403 real writes if some legitimate origin (a Vercel preview URL, a custom domain) is not listed.
- Ship in `report` mode.
- **Manual check:** use the site normally for a few days, check the rejected-origins table, add any missing origins, then switch to `enforce`.
- `docs/COMMANDS.md` §10 notes that `APP_ORIGIN` is still `localhost` in production. Fix it; it also shapes reset links.

**Per-user `/api/content`.**
- The response must never be cached by a CDN; that is why it sends `no-store` and `Vary`. **Manual check:** look at the response headers through Vercel.
- If entitlements change but content has not been refetched, an entitled learner would see stubs. The `locked` guard triggers a reload. **Manual check:** buy a stage in test mode, then open it.

**The premium gate is only as strong as entitlements.**
- With no Razorpay keys, the server runs in test mode and any learner can self-grant through `test-complete`. That is outside this design (no payment work), but the owner must know the gate means little until live keys are set.
- The bundled content still contains premium questions until the (h) decision is made, so the `/api/content` redaction protects the API only.
- Premium articles stay readable. That is a separate product call.

**Admin toggles premium on a stage people have already solved.** Their completions stay; only new solves are gated. A stage made free opens immediately.

**`premium.enforcement = log`** is the emergency switch if the gate wrongly blocks paying users. **Manual check:** as a guest and as a signed-in non-buyer, POST a solve for a `stage-9` item and expect 403; as a buyer expect 200; merge a guest pool containing a `stage-9` id and expect `skippedLocked`.

**Password reset.**
- The link is effectively a password: it is shown once and issuing a new one revokes the old.
- The token travels in the URL fragment, so it never reaches server logs or referrers.
- A reset signs out other sessions via `tokenVersion`.
- An admin who pastes the link in the wrong chat gives someone the account. The dialog warns about this.
- **Manual check:** issue a link, open it in a private window, set a password, confirm the old session on another browser is signed out, and confirm the link cannot be used twice.

**Rate-limit state is in memory.** A restart clears it, and `node --watch` in development resets it on every edit. That is acceptable.

**Settings typos.** Minimum values keep the admin from locking everyone out with a setting such as login limit 0. The `mode` setting also offers `log` and `off`.

**Numbers.** Build-time meta counts only authored content, so the "+" rounding covers questions added in the admin console. The meta description on Vercel is static HTML until the next deploy; the runtime copy covers renders after the page loads.

**404s.** They are soft: the SPA answers 200. Acceptable for now.

**Answer key.** Until the owner decides (h), answers remain readable in the bundle. This design does not change that.

## 8. Ordered implementation steps (each small and testable on its own)

1. **(g)** Turn sourcemaps off in `vite.config.ts`. Add `server/__tests__/vite-config.test.mjs` and `scripts/check-dist.mjs`, plus the CI step. *Verify:* `npm run build` produces no `.map` files.
2. **(c)** Fix the badge regex in `insights.ts:134`. Add `insights.test.ts`.
3. **(c)** Add `NotFoundRoute` and the two `*` routes in `App.tsx`. *Verify:* `/nope` and `/dashboard/nope` by hand.
4. **(c)** ErrorBoundary: production and development text, reference code, home link and log prefix. Static copy for now; editable in step 8.
5. **Settings foundation.** In `db.js`: `settings`, the migrate additions (including `passwordResets` and `tokenVersion`, which cost nothing), and an exported `migrate`. Add `server/settings.js`, the admin `GET`/`PATCH /settings` routes and the audit rows. Add the settings, admin-settings and db-migrate tests. No behaviour changes yet.
6. **Admin `SettingsForm`**, the empty "Limits & access" page and the `adminApi` methods, showing the defaults.
7. **(a)** Add `DevHint`, `site-copy/spec.ts` defaults and `getCopy`, and replace the text at all the listed locations. Server execute 501 gets `reason` and `devHint`. Extend the compilerService test.
8. **(a)(b)** Server compiles the site-copy spec, adds `copyText` and the public `GET /api/site-config`. Client caches overrides. Add the "Site copy" admin page. Wire the ErrorBoundary `messages` prop and the landing templates with `useContentStats` tokens. Add the siteCopy test.
9. **(b)** `scripts/content-stats.mjs` with `--write`/`--check`, the README markers and the `package.json` description. Add it to `npm run check`. Add the Vite `transformIndexHtml` plugin and the new `index.html` meta.
10. **(e)** `server/client-ip.js`, `trust proxy` wired to the live setting, the logger and oauth `sourceKey` switched over, and the admin diagnostic card. Add the client-ip test. Do the manual proxy check now and set the hops.
11. **(e)** `server/rate-limit.js`, applied to register, login, execute, solve and password change. Execution slots. 429 and 503 client handling (`ApiError.reason`). Admin limiter status and unblock. Add the rate-limit tests and index-guards assertions.
12. **(e)** `server/cors-policy.js` in `report` mode, plus the admin CORS section. Add the cors-policy test. Switch to `enforce` later, after the rejected-origins review.
13. **(d)** billing.js `premiumStageIds`, `stageAccessFor` and `premiumGate`. Gate solve, merge and grade. `premium.enforcement` setting. Client 403 handling and the merge toast. Add the premium-gate test and index-guards assertions.
14. **(d)** `/api/content` stubs and `lockedStageIds` with no-store headers. Session `reloadContent` on auth and entitlement changes. The `locked` guard in PracticeSessionProvider and ChallengeLibrary. Add the content test.
15. **(f)** `tokenVersion` in tokens and `learnerTokenIsCurrent` at both verification sites. Add the auth-token-version test. No behaviour change for existing sessions.
16. **(f)** `server/password-reset.js`, the store functions and the `deleteUser` cascade. Mount the learner routes, add the admin routes and the audit rows. Add the password-reset test.
17. **(f)** Admin `PasswordResetDialog` in AdminUsers, then the learner route, `ResetPasswordPage` and the api.ts methods. Do the manual end-to-end check.
18. Add the new server files to the `dev:api` watch paths in `package.json`, in the same commit that creates each file.

## 9. Owner decision: the answer key (h)

This is not a required step. Today `correctIndex(es)`, blank answers, `pseudocodeLines` order, hidden test expectations and 68 `solutionCode` strings ship in `challenges-content-*.js` and in `/api/content`. "Show me the solution" (`PracticeModal.tsx:891`) and in-browser grading depend on them.

**Option A: keep free answers on the client and move premium content off it.**
- Premium stages' questions leave the public bundle. They would be served only by `/api/content` to entitled users; step 14 already does this for the API.
- Free questions keep instant, offline grading.
- Pros: guest offline practice and instant feedback stay; paid content is actually protected; a moderate change.
- Cons:
  - Premium content needs to be online.
  - An admin premium toggle after a build causes drift until the next deploy: a stage newly made free is not in the bundle for offline guests, and a stage newly made premium is still in the bundle.
  - The glob and parity rules in `content/index.ts` and `check-content-parity.mjs` need an exclusion for premium folders.
  - Free answers can still be read in devtools, but the only thing at stake there is leaderboard XP.

**Option B: remove only solutions and hidden-test expectations from the client.**
- `solutionCode` moves to separate `*.solutions.ts` files that only the server and scripts load.
- A new `POST /api/challenges/:id/solution` releases a solution after 2 attempts recorded on the server, and forfeits XP for that item.
- Hidden tests run on the server during a solve.
- Pros: protects the most valuable content (worked solutions) and makes code XP harder to game.
- Cons: offline guests lose "Show solution" and hidden-test feedback; the authoring format, validators and parity check all change; more load on the laptop.

**Option C: grade everything on the server.**
- Strip every answer key. Every Check calls `/api/grade`, which already exists, and code runs on the server.
- Pros: real secrecy and full leaderboard integrity.
- Cons:
  - Breaks offline guest practice, a core promise.
  - Adds a network round trip per answer through ngrok, and no lessons work when the laptop is off.
  - Needs server-shuffled line ids for `pseudocode_order`.
  - Requires a large refactor of PracticeModal and grading.

Hashing answers on the client is rejected: multiple-choice answers can be brute-forced in at most 4 tries.

**Recommendation:** Option A now, together with the (d) gate. Revisit Option B once the backend moves off the laptop and has uptime and capacity to spare. Leaderboard integrity for free content relies on the server re-grading answers (already in place) and on the new per-account solve limits.