# 0004 - Dependency rules are enforced, not described

**Status:** accepted (2026-09)

## Context

Folder conventions decay. "Modules should not import each other" holds until
the first deadline. The plan called for `eslint-plugin-boundaries` or
`dependency-cruiser`.

## Decision

`scripts/check-boundaries.mjs`, run as `npm run lint:boundaries` inside
`npm run check`. It parses every file under `src/` and `server/` with the
TypeScript compiler (already a dependency) - static, dynamic and type-only
imports - resolves `@/` and relative specifiers to areas, and enforces:

1. `app → modules → platform → ui / types / config`; never upward.
2. `modules/<a>` never imports `modules/<b>`.
3. Outside a module, only `@/modules/<name>` (the barrel) or
   `@/modules/<name>/content/spec` (the pure content spec) may be imported.
4. `server/**` imports only `platform/**` from `src`.

A dependency-free script was chosen over an ESLint plugin because the repo has
no ESLint setup to maintain, the rule set is tiny, and the TypeScript parser
gives exact results without a second module-resolution implementation. If
ESLint is adopted later the same rules port directly to
`eslint-plugin-boundaries`.

## Consequences

- A cross-module import fails `npm run check` with the file and the specifier,
  and a one-line explanation of the allowed route (events or app composition).
- The public surface of a module is whatever its `index.ts` exports; everything
  else is private by construction.
