# modules/account

**Owns:** sign-in / sign-up and the Pro modal (hosted by `AccountModals`), and the settings page (account, Pro, theme, server status, reset).

**Public API (`index.ts`):** `AccountModals`, `SettingsPage`.

**Emits:** nothing directly - the session emits `auth:signedIn` / `auth:signedOut` when these succeed.

**Listens:** `account:openAuth`, `account:openPro`, `auth:signedIn` (closes the modal).

**Does not own:** authentication itself (`platform/session` + `platform/api-client`).

Same layout as every module: `content/` (data + `spec.ts` + glob `index.ts`),
`components/`, `pages/`, `services/`, `schema.ts`, `__tests__/`. Anything not
exported from `index.ts` is private; `npm run lint:boundaries` enforces it.
