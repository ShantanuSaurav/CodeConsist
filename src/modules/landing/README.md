# modules/landing

**Owns:** the marketing page and its sections (hero, numbers, how it works, a live challenge, gamification, final CTA, footer, navbar). Every figure is read from the session, none is invented.

**Public API (`index.ts`):** `Landing`, `Navbar`, `Footer`.

**Emits:** `practice:open`, `account:openAuth`.

**Listens:** nothing.

**Does not own:** the app shell inside the dashboard (`app/layout`).

Same layout as every module: `content/` (data + `spec.ts` + glob `index.ts`),
`components/`, `pages/`, `services/`, `schema.ts`, `__tests__/`. Anything not
exported from `index.ts` is private; `npm run lint:boundaries` enforces it.
