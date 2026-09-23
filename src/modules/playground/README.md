# modules/playground

**Owns:** the free-form scratchpad and its example snippets. One selector picks
the mode:

- **HTML / CSS / JS** — three files (`index.html`, `styles.css`, `script.js`)
  rendered in a sandboxed iframe with a console beside it. Runs entirely in this
  browser, needs no server and can never say "needs setup". `WebPlayground.tsx`
  owns its own draft (`STORAGE_KEYS.webPlayground`), separate from the
  single-language draft so the two modes cannot overwrite each other.
- **JavaScript** — the API server's Node sandbox, or a Web Worker when the
  server is down.
- **Python** — CPython compiled to WebAssembly, in the browser.
- **Java, C, C++** — compiled by the API server's Judge0 sandbox. Available only
  when the server reports one; labelled "needs setup" otherwise, and the warning
  points at `docs/RUNNING-JAVA-C-CPP.md`, which sets up a free self-hosted Judge0
  in Docker. These languages also get a collapsible **Input (stdin)** box, since
  a beginner's first Java or C program reads a number with `Scanner` or `scanf`.

Which languages actually run comes from the server, not from a guess here: the
session reads `runtimes` out of `/api/health` and the selector, the status dot
and the engine line all follow it. A server too old to send `runtimes` falls
back to the older `judge0.configured` flag, so nothing regresses against one.

Opens on the selected track's language when there is no saved draft; a saved
draft's mode wins, including `web`.

**Public API (`index.ts`):** `PlaygroundPage`, `Playground`, `WebPlayground`.

**Emits:** `practice:open` ("Open a challenge").

**Listens:** nothing.

**Does not own:** code execution (`platform/execution`), the health probe
(`platform/session`). `'web'` is a local mode in `Playground.tsx` and is
deliberately not a `SupportedLanguage` — that union is the content schema.

Same layout as every module: `content/` (data + `spec.ts` + glob `index.ts`),
`components/`, `pages/`, `services/`, `schema.ts`, `__tests__/`. Anything not
exported from `index.ts` is private; `npm run lint:boundaries` enforces it.
