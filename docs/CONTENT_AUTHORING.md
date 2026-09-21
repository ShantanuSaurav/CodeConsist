# CodeConsist challenge authoring guide

Every challenge file lives at `src/modules/challenges/content/<topic>/<batch>.ts`
(one folder per topic, `a.ts`, `b.ts`, … inside it) and looks like:

```ts
import { Challenge } from '@/types';

export const challenges: Challenge[] = [ /* ... */ ];
```

There is no index to regenerate: every `.ts` file under `content/` is discovered
automatically (a new topic is a new folder). `src/types/index.ts` describes the
shape; `src/modules/challenges/schema.ts` is the zod schema that enforces it at
build time - a malformed challenge fails `npm run check` with the file path and
the field. Stage tests live in `content/stage-tests.ts`; stage metadata in
`content/stages.ts`; which stages form which language track is `content/tracks.ts`.

## Hard rules

1. **Ids are globally unique** and follow `<stageId>-<batch><n>`, e.g. `stage-3-b04`.
   Never reuse an id from another file.
2. **`stageId` must match the stage you were assigned.**
3. **Every factual claim must be true.** If you are not certain a snippet prints
   exactly what you claim, pick a simpler snippet you are certain about.
4. **Exactly one option is correct** for `quiz` / `output_prediction`.
   Distractors must be *plausible* — the mistake a real learner would make — never filler.
   Do not worry about *where* you put the correct answer: the UI shuffles options
   deterministically per challenge, so writing it first is fine. Do make the
   distractors a similar length — an answer that is visibly the longest is a
   giveaway regardless of position.
5. **`explanation` explains the mechanism**, not just "the answer is A". 1–3 sentences.
6. **`codeSnippet` is shown in full**, so multi-line is good. Use `\n` in a normal
   single-quoted TS string. Keep lines under ~72 characters so they do not wrap.
7. Only use characters that survive a `.ts` file: escape `\n`, `\t`, `\` and quotes.
   Prefer single-quoted strings; if the code contains a single quote, use double quotes.
8. `xpReward`: easy 40, medium 70, hard 110.
9. Add 1–2 `hints` that nudge without giving the answer away, and 2–4 `tags`.

## Type-specific requirements

| type | required fields |
| --- | --- |
| `quiz` | `options` (4), `correctIndex` |
| `output_prediction` | `codeSnippet` (multi-line), `options` (4), `correctIndex` |
| `multi_select` | `options` (4–6), `correctIndices` (2–3 entries) |
| `fill_blank` | `codeSnippet` containing one `___` per blank, `blanks[]` in the same order |
| `pseudocode_order` | `pseudocodeLines[]` **in the correct order** (5–8 lines); the UI shuffles them |
| `code_runner` | `starterCode`, `entryFunction`, `testCases` (3+), `solutionCode` |
| `debug` | `starterCode` (**contains the bug**), `entryFunction`, `testCases` (3+), `solutionCode` (fixed) |

### Test cases — this is where content usually breaks

The grader calls `entryFunction(...input)` and compares against `expected`.

- `input` is the **argument list without the outer brackets**: `[2, 7, 11, 15], 9`
- `expected` is a **JSON literal**: `[0, 1]`, `"world hello"`, `true`, `42`, `null`
- Comparison is JSON-normalised, so `[0, 1]` and `[0,1]` both match. Strings must
  be quoted in `expected`: `"hello"`, not `hello`.
- Only `javascript` and `python` are executable in the browser. **`code_runner` and
  `debug` challenges must use `javascript` or `python`** — nothing else.
- Python `starterCode` uses 4-space indentation. JavaScript uses 2.
- `solutionCode` must actually pass every test case you wrote. Trace it by hand.

### pseudocode_order

Write real, readable pseudocode — not code with the syntax filed off:

```
SET total TO 0
FOR EACH item IN cart
    SET total TO total + item.price
END FOR
RETURN total
```

Order must be unambiguous: there must be exactly one correct sequence.

### fill_blank

```ts
codeSnippet: 'const doubled = nums.___(n => n * 2);',
blanks: [{ answer: 'map', alternatives: ['flatMap'] }]
```

Use `choices` when free-typing would be cruel (many valid spellings).

## Beginner teaching (`concept`)

A lesson may carry a `concept`: a short guided sequence shown **once**, before
the question, to a learner in Learn mode (Practice mode never shows it). It is
for the first time a stage introduces an idea - put it on the first lesson
that asks about that idea, and let the lessons after it be the practice.

```ts
concept: {
  id: 'variables-let',          // stable, independent of the challenge id
  title: 'What is a variable?',
  summary: 'A named place to store a value, so your program can use it again later.',
  intro: 'One or two plain paragraphs. No jargon that has not been introduced.',
  example: { code: 'let age = 20;
console.log(age);', language: 'javascript',
             callouts: [{ line: 1, text: '`let` creates a variable named age.' }] },
  why: 'What the language is actually doing - the mechanism behind the example.',
  secondExample: { /* optional, slightly harder */ },
  tryIt: { instructions: 'Change the value and run it.', starterCode: '...', language: 'javascript' },
  explainDifferently: 'A plainer restatement, revealed only on "I don't understand".'
}
```

- `callouts[].line` is 1-based and must exist in the example (the schema checks).
- `tryIt` runs through the real execution path and is never graded. Use a
  language with an engine (JavaScript, Python); a C or C++ try-it will show the
  server's honest "needs a Judge0 endpoint" message unless one is configured.
- The challenge that carries the concept *is* its quick check. Its `explanation`
  must explain the mechanism - in Learn mode a wrong answer shows it immediately.

## Language tracks and stage tests without an engine

`content/tracks.ts` lists the tracks (the core ten-stage path, C, C++). Every
stage belongs to exactly one track and unlocking is evaluated per track, so a
new C stage goes after `stage-c1` in the C track, never after Stage 10.

A stage test is a `code_runner` with worked `examples` wherever the language
has an execution engine here (JavaScript, Python). C and C++ have none without
Judge0, so their stage tests are answer-graded (`fill_blank`, `quiz`, ...) and
verified by the server like every other lesson - never a `code_runner` that
would need a compiler nobody has configured.

## Style

- Prompts are direct and specific: "What does this print?" beats "Consider the following".
- No emoji in prompts, options or explanations.
- No trick questions about undefined behaviour or engine-specific quirks.
- Vary the types: aim for roughly 40% quiz/output_prediction, 20% fill_blank,
  15% pseudocode_order, 25% code_runner/debug per batch.
- Spread difficulty: roughly 40% easy, 40% medium, 20% hard.

## Edited in the admin console

An administrator can open any authored question in the console's wizard and
save a changed version - options, test cases, worked examples, all of it. That
does not touch the `.ts` file: the replacement is stored in `customChallenges`
in `server/data/db.json` under the **same id**, and `server/content.js` serves
it in the original's place (the list shows it as "Edited here"). `npm run check`
still validates the TypeScript original, not the replacement - the server
validated that one (same zod schema, solution executed) when it was saved. To
get the original back, revert it from the console; deleting the db.json entry
by hand does the same. If you later change the `.ts` file, the console's
replacement still wins until it is reverted.

## Checking your work

```bash
npm run check
```

That type-checks, enforces the module boundaries, proves the dev and build
content loaders agree (`content:parity`), runs `validate-content.mjs`
(correctness: the zod schema, plus really executing every JavaScript and Python
solution), `lint-content.mjs` (quality: hints that leak the answer, duplicate
options, near-duplicate challenges, thin explanations, answer-position bias),
`validate-extras.mjs` (articles and roadmaps) and the unit tests. A stage
without an article is reported as a warning (its card simply offers no "Read
first"); the C and C++ tracks are in that state today.

While `npm run dev` is running you get the same message two ways: the API
refuses to restart on a bad file (its terminal shows the path and the field),
and the browser prints it as a red uncaught error a moment after the page
renders. Production builds skip that check - they only exist because
`npm run check` passed - so the zod schemas never reach visitors.

One Windows quirk: Vite sometimes does not notice a *brand-new* file until the
glob's owner is touched. If a new batch does not show up in the library, save
`content/index.ts` (no change needed) or restart `npm run dev`.

Articles are Markdown under `src/modules/articles/content/` - see the header of
`src/modules/articles/parse.ts` for the format. Roadmaps are one TypeScript file
each under `src/modules/roadmaps/content/` exporting `roadmap`.

The validator fails the build. The lint only warns — each warning needs a human
to judge, and a false positive is a bug in the lint, not a reason to reword good
content.
