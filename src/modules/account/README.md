# modules/account

The sign-in and unlock modals are lazy inside `AccountModals`: the listener is mounted on every visit, the modal code downloads the first time one opens.

**Owns:** sign-in / sign-up and the unlock modal (hosted by `AccountModals`), the OAuth landing page (`/auth/callback`), the settings page (account, sign-in methods, plan, purchases, certificates, theme, server status, reset), the printable certificate page (`/certificates/:id`) and the public verification page (`/verify/:code`).

**Public API (`index.ts`):** `AccountModals`, `SettingsPage`, `OAuthCallbackPage`, `CertificatePage`, `VerifyPage`.

**Emits:** nothing directly - the session emits `auth:signedIn` / `auth:signedOut` when these succeed.

**Listens:** `account:openAuth`, `account:openPro` (`{ stageId?, trackId?, tab? }` - which stage was locked, or which tab to open), `auth:signedIn` (closes the modal).

**Does not own:** authentication itself (`platform/session` + `platform/api-client`), or any decision about what a learner owns.

## Three ways in

Google, GitHub and email+password, all landing on the same account.

The provider buttons in `AuthModal` are drawn only when `GET /api/auth/oauth/providers` says the API server has credentials for them - it answers with two booleans and nothing else, so no client id is ever shipped to the browser. With neither configured the modal is exactly the email-and-password form it always was. Clicking one is a **full page navigation** to `/api/auth/oauth/<id>/start`, not a fetch: the server answers with a redirect to the provider, and the browser could not follow that from `fetch` anyway.

Everything that matters happens on the server (`server/oauth.js`, `server/oauth-routes.js`): it exchanges the code, verifies Google's `id_token` signature against Google's JWKS, insists the email is verified, and decides which account this is. An identity already linked always wins; otherwise the provider identity is merged onto an existing address **only when that account has no password**. Registering never confirms an address, so a row carrying your email is not proof that it is yours - merging into one somebody can already sign into with a password would hand them your session. When there is a password, the learner is asked to sign in with it once and connect the provider from Settings. The learner comes back to `/auth/callback#token=…` - a **fragment**, which browsers never send to a server, so the token stays out of access logs and `Referer` headers. `OAuthCallbackPage` reads it on the first render, wipes it from the address bar with `history.replaceState`, and hands it to `adoptToken()`; a failure redirects to `/?auth_error=<short reason>` instead, which `App.tsx` notices and shows inside the sign-in modal.

A password is only ever a bcrypt hash. No route returns one, nothing here ever displays anything derived from one, and the whole of `src/` is checked for the name of that field on every pass - it appears nowhere in the client, by design.

### Settings → Sign-in methods

- **Connect Google / GitHub** asks `POST /api/auth/oauth/:provider/link-ticket` with the session's own `Authorization` header, then navigates to `/start?link=1&ticket=…`, which attaches the provider to the signed-in account rather than starting a new session. The **ticket**, not the token, makes that trip: it is minted from the learner's own session, lives 60 seconds and is spent once, so a start URL written by somebody else carries nothing. A session token in a query string would let any page anywhere begin a link flow as another account - and would land in history and in every proxy log on the way.
- **Disconnect** calls `DELETE /api/auth/oauth/:provider`. The server refuses with a 409 when it would leave the account with no way back in, and the button is disabled with that explanation before it gets that far.
- **Set a password / Change password** calls `POST /api/auth/password`. `currentPassword` is required only when there already is one - that is how a Google-only account gains a password.

## Saved coding sessions

A learner's unfinished code lives on their account, not in a React state that dies with the modal. `SessionProvider` holds `drafts` and loads them in the same breath as the profile and progress (sign-in, session restore, `refreshAccount`, `adoptToken`), so coming back - to another tab, another day, another machine - puts the editor exactly where it was.

A draft's life:

| | |
| --- | --- |
| **save** | every keystroke calls `saveDraft(id, code, language)`, which writes at most once per 1500 ms per challenge (trailing edge). Code still identical to the starter with nothing saved yet is not worth a draft, and a save identical to the last one is skipped. |
| **flush** | `flushDraft(id)` writes a queued save immediately when the challenge changes or the modal closes; `pagehide` / `visibilitychange` flush everything with `keepalive: true`, so the last seconds of typing survive a closing tab. Signing out flushes first, too. |
| **restore** | the editor opens on `draftFor(id) ?? starterCode`, with "Your saved code was restored." above it and a **Start from scratch** action. A draft that arrives late (a slow restore) is adopted only while the editor is still untouched. |
| **clear** | solving the challenge (a cleared lesson reopens at its starter code - the server drops its copy on the same solve), **Reset code**, or **Start from scratch**. |

A quiet `role="status"` line under the editor says `Saving…` / `Draft saved`, or admits `Saved on this device - the server could not be reached.` rather than claim a save that did not happen. That line is literally true: a refused save is written to `${STORAGE_KEYS.drafts}:<userId>`, an **account-scoped** key, and the next successful save or the next sign-in sends it on and clears it.

Guests keep drafts in `localStorage` (`STORAGE_KEYS.drafts`). On sign-in the pushes are awaited before that key is cleared, and only what the server actually took is dropped from this browser. Losing a session - signing out, or a token that expired mid-session - clears the drafts from memory and from the guest key, so one person's code is never left behind for the next person on a shared machine.

## What is sold

One-time purchases only, in INR through Razorpay. There is no subscription.

| Product | Key | Unlocks |
| --- | --- | --- |
| Lifetime licence | `lifetime` | every premium stage, now and in future |
| A track | `track:<trackId>` | every premium stage listed in that track, including ones added later |
| One stage | `stage:<stageId>` | that premium stage only |
| Certificate | `certificate:<trackId>` | a verified Certificate of Completion for a finished track |

Prices are set by the admin at `/admin/billing` (defaults live in `server/billing.js`). ₹0 means free: an order is still recorded, marked paid with provider `free`, no gateway involved.

## How the client decides "locked"

It does not, really. The server's `publicUser` carries `isPremium` (a lifetime licence, or the legacy Pro flag) and `unlockedStages` (stage ids bought outright or through a track, expanded server-side against the current track list). The session copies both into `stats`, and every screen asks one function, `isPremiumLocked(stage, stats)` in `platform/progress/stages.ts`:

```
locked = stage.isPremium && !stats.isPremium && !stats.unlockedStages.includes(stage.id)
```

Nothing in the browser can flip either field except a fresh `api.me()` (`refreshAccount()` in the session), which the unlock modal calls after the server has confirmed a payment. Guests have no entitlements.

## The unlock modal (`components/SubscriptionModal.tsx`)

Opens on `account:openPro`, loads `GET /api/billing/catalog` (prices, what the caller already owns, certificate eligibility per track) and shows up to three cards - lifetime, the highlighted stage's track (or the active track), and the stage itself - plus a Certificates tab.

Buying, step by step:

1. `POST /api/billing/orders { product, certificateName? }` - the server prices it, refuses anything already owned (409, shown inline) and creates the Razorpay order.
2. If `checkout` comes back `null` the price was ₹0 and the order is already paid: skip to 5.
3. **Razorpay mode:** load `checkout.razorpay.com/v1/checkout.js` once, open the Razorpay sheet with the public key id, amount and `order_id`. Its `handler` hands `razorpay_order_id / payment_id / signature` to `POST /api/billing/orders/:id/confirm`. The server recomputes the HMAC and only then marks the order paid. A dismissed sheet just re-enables the button; `payment.failed` shows Razorpay's description.
4. **Test mode** (no Razorpay keys on the server): a `notice-warn` says "Test mode - no money moves" and the learner must press **Complete test payment**, which calls `POST /api/billing/orders/:id/test-complete`. The server refuses that route when real keys are configured, and nothing pretends to be a signature.
5. On the server's success response: `refreshAccount()` re-reads `publicUser`, confetti, a toast, and the modal closes (a certificate purchase stays on its tab so the "View certificate" link is right there).

The focus trap steps aside while Razorpay's sheet is open and the modal refuses to close mid-payment, so the confirm step always has an owner.

A Razorpay webhook (`POST /api/billing/webhook`, `payment.captured` / `order.paid`) marks the same order paid if the tab closed before step 3 finished; the next session restore picks it up.

## Certificates

Free to learn, pay to certify. A track is eligible once every visible stage in it has all its lessons and its stage test solved (the server checks against the account's progress - `certificateEligibility`). The learner types the name to print (2-80 characters, letters, spaces, `. ' -`), buys through the same flow, and the server issues `CC-<year>-<8 chars>`; that id doubles as the verification code.

- `/certificates/:id` (`pages/CertificatePage.tsx`) - owner only (`GET /api/certificates/:id` answers 404 to anyone else). A full-page sheet with the wordmark, learner name, track, stage count, issue date, id and verification URL, and a **Print / Save as PDF** button; `styles/certificate.css` hides the chrome under `@media print` and forces a light sheet.
- `/verify/:code` (`pages/VerifyPage.tsx`) - public, no sign-in: **Valid certificate** (name, track, date, id), **Revoked**, or **Not found**. The server never returns the owner's account details here.

An admin can grant any product (offline/UPI payments) and revoke any order from `/admin/billing`; a revoked certificate order flips its certificate to revoked at the verification link.
