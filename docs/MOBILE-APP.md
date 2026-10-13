# Native app and PC server

The Kotlin app in `../CodeConsistApplication/CodeConsist` uses this existing API and learner accounts. Keep the PC server running; the phone does not need its own backend. Native requests use the same Bearer token, premium gates, verified submissions and execution limits as the website.

## Connect a phone

1. Keep the existing server and ngrok tunnel running with `powershell -ExecutionPolicy Bypass -File ops/up.ps1`.
2. Install the native APK. It connects automatically to `https://botany-subtext-chevron.ngrok-free.dev`, the domain in `ops/tunnel.config.json` and the website's Vercel API rewrite. No address entry is required.
3. Sign in with the website account or choose Create account on the welcome screen. Google/GitHub use the same configured providers. Exploring downloaded lessons without an account is optional.
4. Wi-Fi or mobile data works; the PC and phone do not need to share a network. Keep the PC awake and connected to the internet.
5. For diagnostics, run `powershell -ExecutionPolicy Bypass -File ops/mobile.ps1 -TestCompilers`. It checks the public tunnel and submits real compiler samples without creating accounts or changing progress.

Native requests send `ngrok-skip-browser-warning: true`, matching the website API client. No firewall or router changes are needed. Only the PC API talks to Judge0. The app rechecks the connection when brought to the foreground and every 30 seconds while open, reconnecting and refreshing account data after an outage. Updates from the original LAN build migrate its known default addresses to the tunnel, retain device drafts/bookmarks, and request a fresh sign-in rather than forwarding an old host's session.

The public address is in the app's `platform/ServerConfig.kt`. If the ngrok domain changes, update that constant and rebuild (the website's Vercel rewrite needs the corresponding change). `.env` credentials remain on the PC; none are copied into the APK.

## Code execution

Prefer the app's available on-device engines. JavaScript can run locally; the PC provides a fallback. SQL can use the PC SQLite sandbox. Python, C, C++, Java and Go can use the PC's isolated Judge0 installation. Compiler availability depends on the chosen app platform and its local engines.

The PC setup remains [RUNNING-JAVA-C-CPP.md](RUNNING-JAVA-C-CPP.md). Set `JUDGE0_API_URL=http://localhost:2358` in the existing `.env`; keep any Judge0 credentials on the PC. Python uses Judge0 CE language 71 ([official language list](https://ce.judge0.com/languages/)), not the host's Python executable. Its fallback disables network access and sets explicit time and memory limits. The website continues using its local Pyodide engine.

Run `powershell -ExecutionPolicy Bypass -File ops/mobile.ps1 -TestCompilers` to submit a small real program for every server language. This does not create accounts or award progress. A configured compiler is not proof that its container is running; the actual run is the check.

Self-hosted Go uses the existing Judge0 multi-file sandbox with a 1 MiB native compiler stack, bounded compiler concurrency and pure Go output. This avoids the PC's `pthread_create` failures while preserving network isolation and execution limits. Its compiler path matches the pinned Judge0 1.13.1 image.

## Client API contract

All paths start with `/api`; JSON request bodies use `Content-Type: application/json`. Authenticated calls include `Authorization: Bearer <token>`. The optional `X-Time-Zone` header uses an IANA zone for the learner's day boundaries.

| Method and path | Request / response |
| --- | --- |
| `GET /health` | `ok`, legacy website `runtimes`, and `serverRuntimes` (each language has `available`, `engine`, `label`). A compiler marked configured may still be offline. |
| `POST /auth/register` | `{email,username,password}` -> `{token,user,progress}` |
| `POST /auth/login` | `{email,password}` -> `{token,user,progress,habits}` |
| `GET /auth/me` | Bearer -> `{user,progress,habits}` |
| `GET /content` | `{stages,challenges,languageTracks,hiddenLanguages,lockedStageIds,builtAt}`; optional Bearer. Locked premium lessons are stubs. |
| `GET /progress` | Bearer -> `{progress,habits}` |
| `POST /grade` | `{challengeId,answer}` -> `{correct,explanation}`; stage tests are accepted only through a solve. |
| `POST /progress/solve` | Bearer, `{challengeId,answer or code,attempts,hintsUsed,context:"lesson",learningMode:"learn"}` -> authoritative `{progress,awardedXp,verified,score,bonusXp,habits,...}`. Never manufacture XP in the app. |
| `POST /execute` | `{language,code,stdin?,workflow:"playground",profile:"standard"}` -> `{status,engine,stdout?,stderr?,time?,testResults}` |

`401` means sign in again, `403` means access denied, `422` means a lesson answer did not pass, `429` means rate limited, and `503` means the execution queue is busy. Preserve learner work when retrying. A run's HTTP 200 does not mean its code passed: inspect `status` and show `stderr` when present.

Python's server fallback runs complete programs and stdin. When `entryFunction` and `testCases` are supplied, it runs a function-testing harness inside Judge0 and returns per-test verdicts. Use the lesson submission route for verified progress: it selects the authoritative tests on the server. Configured Judge0 also verifies Python lesson, review and assessment submissions. TypeScript syntax is converted before entering the same JavaScript sandbox for both playground runs and verified submissions. `serverRuntimes` describes actual server engines; the legacy `runtimes.python` and `runtimes.sql` describe browser WebAssembly and must not be used as proof of native availability.

## Community and purchases

The app reuses `/leagues/current`, `/leaderboard`, `/review/session`, `/review/answer`, `/billing/catalog`, `/billing/orders`, `/certificates` and `/verify/:code`. `/achievements` computes badges from the same live server rules and verified progress used by the website. Sign-in is required for private achievements, reviews, orders and certificates.

Real Razorpay checkout starts with authenticated `POST /mobile/checkout` and an owned pending `orderId`. Its returned relative `checkoutUrl` uses a short-lived, one-use ticket; no account token appears in the browser URL. The page verifies the payment's order and signature on the server before granting access. Return to the app and refresh purchases afterward. In the existing explicit test payment mode, no money moves and the app calls the existing test-complete endpoint. Real payment credentials remain on the PC.

Google and GitHub availability comes from `/auth/oauth/providers`. Android Google
uses `POST /auth/mobile/google/native/start` (`{link:true}` with the current Bearer
for linking), returning `{id,nonce,clientId}`. Credential Manager requests a Google
ID token for that web client ID and nonce. POST `/auth/mobile/google/native/complete`
with `{id,idToken}` verifies it and returns `{status:"complete",token,user,progress}`
once. `/native/cancel` consumes cancelled requests. Native Google requires the
Android package/signing certificate to be registered in the same Google Cloud project.

Android GitHub starts with `POST /auth/mobile/:provider/start`, passing
`{returnToApp:true,link:false}`. It receives `authorizationUrl`, `id`, `verifier`
and a ten-minute expiry. Open the URL in a Custom Tab. The server protects its
GitHub exchange with S256 PKCE. After verification it redirects to the fixed
`codeconsist://auth/callback?attempt=...&proof=...`. Redeem with POST
`/auth/mobile/poll`, `{id,verifier,proof}`. Both the browser proof and private device
verifier are required; session tokens never enter browser URLs. `/auth/mobile/cancel`
requires `{id,verifier}`. Pending Android attempts are encrypted and bound to the
account/server, so the callback survives process death. Legacy clients that omit
`returnToApp` retain the previous six-digit code flow. Password resets invalidate
linked attempts and completed sessions. The app fetches `/auth/me` afterward.

The bundled app catalog should be exported from an anonymous `GET /content`, so unpublished content and premium answers cannot leak into the APK. Fetch fresh authorized content after sign-in; do not reuse one account's private content under another account.

## Shared library, admin policy and sign-in devices (Android 1.2)

Native Code Studio uses the existing `/playground/snippets` account library:
GET with `?language=...`, PUT a new `/id` with `{title,program}`, PATCH `/id`
with `{title}`, and DELETE `/id`. Web files and stdin are preserved. Website
and app sign-ins to the same account see the same saved programs. The website
picker also exposes TypeScript and Go so saves in those languages can be opened.

The native client refreshes `/settings` and `/content` every 30 seconds while
foregrounded. Hidden tracks and questions, premium access and coding switches
come from the existing admin controls. Server actions remain visible but disabled
when offline. Device runtimes obey the last downloaded coding policy.

Admin Users → Learning details → Devices & sign-ins reads the admin-only
`GET /admin/users/:id/sessions`. Each sign-in has its own JWT ID. Requests update
last activity at most once per minute; `X-CodeConsist-Client: android` identifies
the native client, while browser user agents distinguish mobile/desktop web.
Labels are descriptive, not an authorization signal or geolocation. Existing
sessions appear after their next authenticated request. POST `/auth/logout`
revokes only the current token; password resets still revoke every older token.
No bearer tokens are stored in the session history or returned to administrators.

Keep the existing Google web redirect
`https://devlingo-sand.vercel.app/api/auth/oauth/google/callback` and GitHub callback
`https://devlingo-sand.vercel.app/api/auth/oauth/github/callback`. The current mobile
GitHub browser handoff reuses the existing web OAuth app. Native Google additionally
needs an Android OAuth client for the package/signing SHA-1; its token audience is
still the existing Google web client ID. See the native project's
`docs/NATIVE-SIGN-IN.md` for this PC's debug registration values.
