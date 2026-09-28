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

## Wrong-answer notes (`optionFeedback`, `wrongAnswers`)

A wrong answer should teach, not hand over the answer. Before a learner's
last try only their own pick is marked wrong; the right answer, and the
`explanation`, appear once their tries run out (settings section
`feedback`: two tries on a single-choice question in Practice mode, three on
the others, one in Learn mode). A note says why THAT answer is wrong:

```ts
options: ['var', 'let', 'const'],
correctIndex: 2,
// One per option, same order; '' for none.
optionFeedback: [
  'var can be redeclared and reassigned - nothing stops the value changing.',
  'let stops redeclaration, but the value can still be reassigned.',
  'A const binding cannot be reassigned once it is set.' // a correct option's note: shown only with the answer
],
```

```ts
codeSnippet: 'const n = items.___;',
blanks: [{
  answer: 'length',
  // Answers learners often give, matched like the answer (whitespace folded,
  // case ignored for a single plain word), each with why it is wrong.
  wrongAnswers: [{ answer: 'size', feedback: 'Arrays have no size property - Set and Map do.' }]
}]
```

- `optionFeedback` is for `quiz`, `output_prediction` and `multi_select`
  only, and has exactly one entry per option (the schema checks).
- A wrong answer to a blank must really be wrong - never accepted by the
  grader (`answer` or `alternatives`) - and, on a dropdown blank, one of its
  `choices`. At most 8 per blank; each note at most 600 characters.
- **Never name the right answer in a note for a wrong answer.** Describe the
  misconception ("that copies the reference, not the array"), not the fix
  ("use slice()"). A note that quotes a correct option (8+ characters) or
  names a blank's answer is held back until the answer is shown, and
  `npm run content:lint` reports it as `feedback-leak`. The lint also flags
  `feedback-thin` (under 20 characters) and `feedback-restates-option` (a
  note that mostly repeats its own option), and prints how many questions
  have notes at all.
- Notes never affect grading, XP or unlocking.

An administrator can write notes on any question in the console (the
question wizard, or Learning > Answer feedback, which can also draft them
with Gemini for review). On a built-in question they are stored beside it -
see "Edited in the admin console" below.

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
- Learn mode works on every lesson, not only those with a concept: the reading
  panel opens by default and a wrong answer is explained straight away. So
  every `explanation` should teach, not just restate the answer.

### Teaching cards written in the console

An administrator can do the same without touching the source, under
Learning > Teaching (`/admin/teaching`):

- **Edit a built-in card.** The edit is stored beside the bank under the
  concept's own id; the card stays on its lesson. Revert puts the shipped
  version back.
- **Write a new card** for a lesson that has none: before a lesson, at the
  start of a stage (its first lesson) or at the start of a unit (its first
  lesson, however the stage is grouped into units at the time). One concept
  per lesson - a lesson that already has one is edited instead.
- **Hide** a card (built in or written) to stop showing it; **Delete** one
  written in the console.
- **"Show it again to learners who already saw it"** gives the card a new id
  (`<key>-r<N>`), so everyone sees the new version once. Without it, only
  learners who have not seen the card yet get the edit.

Cards are checked against the same schema as a `concept` in a `.ts` file
(the line of every callout must exist in its example). A card whose lesson
is hidden, or whose lesson already has another card, is never shown - the
Teaching page lists it with the reason. Learners get changes the next time
their lessons load; the offline copy of the app has only the built-in cards.

## Practice sessions (review)

Practice sessions go back over what a learner solved: questions they got
wrong on an earlier day, questions due again on their review schedule, and
lessons solved with a low score or many hints. They use the answer-graded
kinds (settings section `review`, `itemTypes`) and never a stage test, so
every quiz, fill-in-the-blank and ordering question you write can come back
there - another reason for notes and explanations that teach. Nothing is
authored for sessions themselves.

## Language tracks and stage tests without an engine

`content/tracks.ts` lists the tracks (the core ten-stage path, C, C++). Every
stage belongs to exactly one track and unlocking is evaluated per track, so a
new C stage goes after `stage-c1` in the C track, never after Stage 10.

A stage test is a `code_runner` with worked `examples` wherever the language
has an execution engine here (JavaScript, Python). C and C++ have none without
Judge0, so their stage tests are answer-graded (`fill_blank`, `quiz`, ...) and
verified by the server like every other lesson - never a `code_runner` that
would need a compiler nobody has configured.

## Units

Learners meet a stage's lessons in short **units** of about five questions,
each a node on the path with its own end screen. Nothing in a challenge file
declares a unit: the default grouping is derived from the ids
(`src/platform/progress/units.ts`, settings section `units`):

- The lessons are split, in authored order, into runs by batch letter -
  `stage-3-a04` is in run `a`, `stage-3-b01` in run `b`. An id without a batch
  letter (a question written in the admin console) is in run `x`.
- Each run is cut into balanced chunks of about `targetSize` (5) and at most
  `maxSize` (8): 10 lessons give 5/5, 11 give 6/5, 17 give 6/6/5. A last chunk
  smaller than `minSize` (3) joins the unit before it when that stays within
  `maxSize`.
- Unit ids are `<stageId>:<letter><k>` (`stage-3:a1`, `stage-3:b2`); the stage
  test is never in a unit and unlocks when every unit is done.

So a **batch file is a unit boundary**: keep a batch at 5-7, 10-12 or 15-17
lessons and it splits cleanly (8, 9, 13 and 14 produce 4-question units:
4/4, 5/4, 5/4/4, 5/5/4), and put lessons that belong together in the same
batch. The
real bank gives 46 units - four per core stage, three for C and C++ - and
`src/modules/challenges/__tests__/units-bank.test.ts` fails if a content change
breaks that shape (a unit outside 5-8 questions, or a stage with a different
number of units). Update the test's expectations when the change is
deliberate.

An administrator can regroup and rename a stage's units in the console
(Stages > Units); that is stored in `contentOverrides.units` in
`server/data/db.json` and wins over the default. Every lesson of the stage,
hidden ones included, must be in exactly one unit. A lesson added to the `.ts`
files after a stage was regrouped appears in a trailing "More lessons" unit
until the admin places it. Whether a unit is *done* is always derived from the
solved lessons, so regrouping never loses anyone's progress.

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

Changing only a built-in question's wording, hints, tags, XP, difficulty or
wrong-answer notes does NOT freeze it like that: those are layered on top
(`contentOverrides.challenges`), so the question keeps following the `.ts`
file. Wrong-answer notes are stored with the options (or blanks) they were
written for; if you change those options in source, the notes stop showing
and the console marks them "out of date" to be written again, rather than
pointing at options that no longer exist.

## Checking your work

```bash
npm run check
```

That type-checks, enforces the module boundaries, proves the dev and build
content loaders agree (`content:parity`), runs `validate-content.mjs`
(correctness: the zod schema, plus really executing every JavaScript and Python
solution), `lint-content.mjs` (quality: hints that leak the answer, duplicate
options, near-duplicate challenges, thin explanations, answer-position bias),
`validate-extras.mjs` (articles and roadmaps), `content-stats.mjs --check`
(`content:stats`: the lesson, stage-test, stage and track counts written in
`README.md` and the `package.json` description still match the bank) and the
unit tests. A stage without an article is reported as a warning (its card
simply offers no "Read first"); the C and C++ tracks are in that state today.

Adding or removing a lesson, a stage or a track fails `content:stats` until the
written numbers catch up. Do not edit them by hand - run

```bash
node scripts/content-stats.mjs --write
```

and commit the `README.md` and `package.json` changes with your content. The
meta description in `index.html` needs nothing: the build fills it from the
bank.

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
