# 0002 - One content registry

**Status:** accepted (2026-09); amended by [0006](0006-code-splitting-and-async-content.md) - the schema is loaded lazily and production skips validation

## Context

Challenges were found by a generator that wrote `src/data/index.ts`; roadmaps
and articles had hand-written indexes; the server compiled its own copy. Three
discovery mechanisms, no schema - a typo in a field became a runtime crash in
the modal, and a duplicate id silently overwrote another challenge in
`CHALLENGE_BY_ID`.

## Decision

`platform/content-registry` is a generic engine. A module declares a
`ContentSpec` - directory, file extensions, exclusions, how a file yields items,
a **zod schema** (as a lazy loader, `() => import('../schema')`), an id function and a comparator - and gets discovery,
validation (schema + duplicate ids, with file paths in every message) and
canonical ordering for free.

Two loaders consume the same specs and the same `validate.ts`:

- `loader.dev.ts` - the browser. Each module's `content/index.ts` calls
  `import.meta.glob` (the pattern must be a literal for Vite) and hands the
  result to `loadFromGlob(spec, modules)`.
- `loader.build.mjs` - Node. Walks the spec's directory, bundles the files with
  esbuild, validates. Used by the API server and every content script.

`scripts/check-content-parity.mjs` reads the glob literal out of each
`content/index.ts`, expands it against the real tree and asserts the file set
equals what the spec selects. That is the check that closes the "two loaders
drift apart" loophole permanently.

Specs are registered once, in `app/content-specs.ts`, which imports only
`modules/<name>/content/spec` files (pure: schema + paths) - never a module
barrel, because barrels reach `import.meta.glob` and React.

## Consequences

- Adding a topic: a folder. Adding a roadmap: a file. Adding an article: a
  Markdown file with a stage marker. No registration, no index to regenerate.
- Adding a *kind* of content (video lessons, interview decks): a schema, a spec,
  a `content/index.ts` with a glob, one line in `content-specs.ts`.
- A bad file fails `npm run check` (and in dev, the console and the API's
  start-up) with
  `src/modules/challenges/content/algorithms/a.ts: #7 invalid: correctIndex: out of range`.
  Production bundles are not re-validated in the browser - they only exist
  because that check passed - so zod is not shipped to visitors (0006).
- The server validates the same way, so it can never serve a bank the browser
  would reject.
