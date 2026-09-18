# modules/playground

**Owns:** the free-form editor and console (JavaScript in the sandbox, Python via Pyodide; Java, C and C++ through the API server's Judge0 proxy when one is configured, labelled "needs setup" otherwise) and its example snippets. Opens on the selected track's language when there is no saved draft.

**Public API (`index.ts`):** `PlaygroundPage`, `Playground`.

**Emits:** `practice:open` ("Open a challenge").

**Listens:** nothing.

**Does not own:** code execution (`platform/execution`).

Same layout as every module: `content/` (data + `spec.ts` + glob `index.ts`),
`components/`, `pages/`, `services/`, `schema.ts`, `__tests__/`. Anything not
exported from `index.ts` is private; `npm run lint:boundaries` enforces it.
