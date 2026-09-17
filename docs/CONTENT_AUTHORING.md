# CodeQuest challenge authoring guide

Every challenge file lives at `src/data/challenges/<stage-slug>-<batch>.ts` and looks like:

```ts
import { Challenge } from '../../types';

export const challenges: Challenge[] = [ /* ... */ ];
```

`src/types.ts` is the single source of truth for the shape. Read it before writing.

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

## Style

- Prompts are direct and specific: "What does this print?" beats "Consider the following".
- No emoji in prompts, options or explanations.
- No trick questions about undefined behaviour or engine-specific quirks.
- Vary the types: aim for roughly 40% quiz/output_prediction, 20% fill_blank,
  15% pseudocode_order, 25% code_runner/debug per batch.
- Spread difficulty: roughly 40% easy, 40% medium, 20% hard.

## Checking your work

```bash
npm run check
```

That regenerates the index, type-checks, runs `validate-content.mjs` (correctness:
structure, plus really executing every JavaScript and Python solution) and then
`lint-content.mjs` (quality: hints that leak the answer, duplicate options,
near-duplicate challenges, thin explanations, answer-position bias).

The validator fails the build. The lint only warns — each warning needs a human
to judge, and a false positive is a bug in the lint, not a reason to reword good
content.
