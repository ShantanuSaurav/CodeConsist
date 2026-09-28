# Design: feedback that teaches, Learn mode on every lesson, and Practice/review

Repo checked: `C:\Users\KIIT0001\Desktop\Devlingo-dev`, branch `feature/learning-loop`, clean tree. Line numbers below are from that branch.

This design depends on three pieces the foundations design owns. It uses them if they exist. If they do not, it defines the minimum it needs, in sections 2.3, 2.4 and 3.2:
- **Admin settings store.** If foundations adds a generic store, `learningSettings` below becomes its `learning` namespace.
- **Failed-attempt store.** Defined here as `progress.mistakes`. If foundations stores failed attempts elsewhere, keep one store and carry over the fields in 2.4.
- **Daily activity log.** Review XP reaches the daily goal through it. A fallback is described in 4.4.

---

## 1. Goal

A wrong answer should teach, not hand over the answer. On attempts before the last one, only the learner's choice is marked wrong, with an optional note saying why that choice is wrong. The correct answer appears only when the attempt budget runs out. The missed item then comes back at the end of the session, so every unit ends with every item answered correctly.

Learn mode should work on every lesson, not only the 8 that carry a concept. A short "Practice" session should rebuild weak spots from recorded mistakes and a spaced-repetition schedule, paying a small XP amount that the server caps.

Every number, rule, per-option explanation and concept card can be edited in the admin panel. Defaults ship in code. Guest mode keeps working, and the server stays the authority on XP.

---

## 2. Data model

### 2.1 Content schema: per-option and per-blank feedback

**`src/types/index.ts`**
- `Challenge.optionFeedback?: string[]`
  - Applies to `quiz`, `output_prediction` and `multi_select` only.
  - It runs parallel to `options`, so entry *i* is about option *i*, the same index convention as `correctIndex`. An empty string means no note.
  - For a wrong option, the note describes the misconception and must not name the right answer.
  - For a correct option, the note is an optional "why this is right", shown only when the answer is revealed.
- `Blank.wrongAnswers?: WrongAnswer[]`, with `interface WrongAnswer { answer: string; feedback: string }`.
  - A learner's answer is matched with the same rules as `checkBlank` (whitespace collapsed, case-insensitive only for a single word).
  - If the blank has `choices`, the answer must be one of them.
- New types: `FeedbackNote { position: number; text: string; kind: 'wrong' | 'right'; leaks: boolean }`.

**`src/modules/challenges/schema.ts`**
- `Base` gains `optionFeedback: z.array(z.string().max(600)).optional()`.
- `BlankSchema` gains `wrongAnswers: z.array(z.object({ answer: z.string().min(1), feedback: z.string().min(1).max(600) }).strict()).max(8).optional()`.
- New checks in `ChallengeSchema.superRefine`:
  - The length of `optionFeedback` must equal `options.length`.
  - `optionFeedback` is not allowed on any other type.
  - A `wrongAnswers[].answer` must not be accepted by `checkBlank(answer, blank.answer, blank.alternatives)`. The check is imported from `@/platform/grading-engine/grading`, which the module boundaries allow.
  - If `choices` is set, every `wrongAnswers[].answer` must be one of the choices.
- `validate-content.mjs`, the Node loader and `adminDeps.validateChallenge` all pick these rules up with no other change.

**`server/custom-challenges.js` `normalizeChallengeInput`**
- For option types:
  - `optionFeedback` = `list(b.optionFeedback).map(trimmed)`, padded or truncated to `options.length`.
  - The field is omitted when every entry is empty.
  - The issue path is `optionFeedback.<i>`.
- For `fill_blank`:
  - Each blank carries `wrongAnswers`, keeping only rows where both fields are filled.
  - Issues use `blanks.<i>.wrongAnswers.<j>`, with friendly messages such as "Blank 2: "let" is an accepted answer, so it cannot be a wrong answer."
  - `blankMatches`, already in the file, is reused.

### 2.2 How an admin edits feedback on a built-in question

Today there are two ways to change a built-in question:

| Path | Code | What it does |
|---|---|---|
| PATCH | `server/admin.js:552-585` | Writes presentational overrides (`title`, `prompt`, `explanation`, `hints`, `tags`, `xpReward`, `difficulty`, `hidden`) into `contentOverrides.challenges[id]`, which `applyChallengeOverride` (`server/content.js:228-241`) applies. The only UI caller today is `hidden` (`AdminChallenges.tsx:134-139`). |
| PUT | `server/admin.js:497-514` | Used by the QuestionWizard. It stores a full "modified" copy in `customChallenges`, which freezes the whole question against future source updates, and clears the PATCH overrides (line 510). |

Editing only an explanation should not freeze a built-in question's logic, so feedback follows the PATCH path, with a guard against stale data.

**New fields on `contentOverrides.challenges[id]`**
- `optionFeedback?: string[]`
- `blankFeedback?: { wrongAnswers: WrongAnswer[] }[]`
- `feedbackBasis?: string`, which is `JSON.stringify(feedbackBasisOf(challenge))` taken when the override is saved.

**New function `feedbackBasisOf(c)` in `server/content.js`**
- Option types: returns `c.options`.
- `fill_blank`: returns `c.blanks.map(b => [b.answer, b.choices ?? []])`.

**`applyChallengeOverride`**
- Applies `optionFeedback`, or merges `blankFeedback[i].wrongAnswers` into `blanks[i]`, only when the stored basis equals the current basis.
- If someone later edits the authored options in source, the override is ignored instead of pointing at the wrong options.
- Grading ignores both fields, so `getChallengeMerged`, used for grading, is unaffected.

**Created and modified questions** keep their feedback in their own stored record, validated by the full schema through POST/PUT. This matches how every other field works for those questions.

**PUT** (`admin.js:510`) must also clear `optionFeedback`, `blankFeedback` and `feedbackBasis`. The wizard body already carries the merged values, so nothing is lost.

### 2.3 Learning settings (admin-editable rules and numbers)

**Code**
- New platform module `src/platform/learning-config/`, with `defaults.ts`, `resolve.ts` and `index.ts`. It is pure TypeScript with no React, so the server compiles it the same way it compiles `leveling.ts`.
- Exports:
  - `DEFAULT_LEARNING_CONFIG`
  - `LEARNING_LIMITS` (min, max and allowed values for each field)
  - `resolveLearningConfig(stored: unknown): LearningConfig`, which deep-merges the stored values over the defaults. Any stored value that is invalid or out of range falls back to its default and never throws.
  - `validateLearningPatch(patch): { patch, issues: { path, message }[] }`
  - `effectiveAttemptBudget(challenge, mode, config): number`
- The `LearningConfig` type lives in `src/types`.

**Storage**
- New `db.learningSettings: {}` in `server/db.js`, sparse like `pricing`: only keys the admin changed are stored.
- `setLearningSettings(patch)` deep-merges. `null` deletes a key, and emptied objects are pruned.

| Key | Default | Limits and meaning |
|---|---|---|
| `feedback.attemptsBeforeReveal.practice` | `{quiz:2, output_prediction:2, multi_select:3, fill_blank:3, pseudocode_order:3}` | 1-5 per type. |
| `feedback.attemptsBeforeReveal.learn` | `1` | 1-5. Learn mode explains straight away. |
| `feedback.showWrongAnswerNotes` | `{learn:true, practice:true, review:true}` | Booleans. |
| `feedback.stageTestWrongAnswerNotes` | `false` | Answer-graded C/C++ stage tests never reveal answers; this only adds notes. |
| `feedback.solutionAfterFailedRuns` | `2` | 0-10, where 0 means never. Never offered on stage tests. |
| `feedback.learnOpensReading` | `true` | Learn mode opens the ReadingPanel by default. |
| `requeue.enabled` | `true` | |
| `requeue.maxRounds` | `2` | 0-3. |
| `requeue.maxScoreAfterReveal` | `{learn:80, practice:60}` | 50-100. Caps the score, and so the XP, of an item solved after its answer was shown. |
| `review.enabled` | `true` | Hides the Practice entry when false. |
| `review.intervalsDays` | `[1,3,7,21]` | 2-8 integers, strictly increasing, each 1-365. |
| `review.wrongResetsToBox` | `0` | Must be less than the number of intervals. |
| `review.initialBox` | `{clean:1, assisted:0}` | The box assumed for a lesson solved first try (score 100) or with help. |
| `review.sessionSize` | `{min:5, max:8}` | 1-20, with min no larger than max. |
| `review.mix` | `{mistakes:3, due:4}` | The most slots each bucket may take. Weak items fill the rest. |
| `review.weak` | `{scoreBelow:80, hintsAtLeast:2}` | |
| `review.mistakeWindowDays` | `30` | 1-365. |
| `review.itemTypes` | the 5 answer-graded types | A non-empty subset of `CHALLENGE_TYPES`. Code types can be turned on. |
| `review.attemptsBeforeReveal` | `1` | 1-5. |
| `review.requeueMissed` | `true` | Missed items come back once within the review session. |
| `review.xp` | `{correctFirstTry:5, correctAfterMiss:2, sessionBonus:5, dailyCap:60}` | 0-50, 0-50, 0-100 and 0-500. |
| `review.sessionTtlHours` | `12` | 1-72. |
| `review.guestMergeWindowDays` | `2` | 0-7. |
| `analytics.mostMissedMinLearners` | `3` | 1-100. Replaces the hard-coded 3 at `admin.js:267`. |

**`effectiveAttemptBudget(challenge, mode, config)`**
- `test`: no limit (`Infinity`).
- `quiz` and `output_prediction`: `min(budget, options.length - 1)`, so the last remaining option is never a free answer.
- Any blank that is the only blank and is a dropdown: `min(budget, choices.length - 1)`.
- Always at least 1.

### 2.4 Failed-attempt store (`progress.mistakes`)

Stored per learner inside the existing progress record: `progress.mistakes[challengeId] = MistakeRecord`.

| Field | Meaning |
|---|---|
| `n` | Misses counted, capped at 500. |
| `last` | ISO time of the last miss. |
| `lastDay`, `lastDayCount` | Limits how many misses one item can count per day (20). |
| `open` | True after any miss. Set back to false only by a clean correct answer in a review session. |
| `rev` | Times the answer was revealed (a miss on the final attempt). |
| `keys` | `Record<string, number>`: signatures of the wrong answers, top 5 by count, each key at most 60 characters. |
| `code?` | True for unverified, client-reported failed code runs. |

**Wrong-answer keys** come from `wrongAnswerKeys(challenge, answer)` in `src/platform/grading-engine/feedback.ts`, which the server compiles:
- single choice: `o<index>`
- multi_select: `o<i>.<j>` (sorted)
- fill_blank: `b<i>:<normalizeBlank(value)>`, one per wrong blank
- pseudocode_order: `order`

The store is bounded by the size of the bank. `deleteUser` already deletes `progress[id]`.

### 2.5 Review schedule (`progress.review`, `progress.reviewXp`)

- `progress.review[challengeId] = ReviewItemState { box, due /*yyyy-mm-dd*/, last?, paid? /*day XP was last paid*/ }`.
- An entry is written only when an item is reviewed or revealed.
- Items with no entry get a derived state from `reviewStateOf(progress, id, config)` in `src/platform/review/schedule.ts`:
  - `box = attempts[id].score === 100 ? initialBox.clean : initialBox.assisted`
  - `due = dayOf(solvedAt) + intervalsDays[box]`
  - This means existing learners need no data migration, and `db.json` does not grow for items that are never reviewed.
- `progress.reviewXp: Record<day, number>` holds review XP paid per day, pruned to the last 14 days. It enforces the daily cap and feeds the dashboard.
- `applyReviewResult(state, outcome, config, today)`, where `outcome` is one of:
  - `clean` (first try, no hints, not revealed): `box + 1`, clamped to the last box.
  - `assisted` (correct after misses or hints): box unchanged.
  - `missed` (final wrong or revealed): `box = wrongResetsToBox`.
  - In every case `due = today + intervals[box]`. The box is clamped whenever the admin shortens the interval list.

### 2.6 Review sessions (`db.reviewSessions`)

- `db.reviewSessions[userId] = { id, createdAt, stageId?, items: { challengeId, reason: 'mistake' | 'due' | 'weak' }[], answered: Record<challengeId, { outcome, resolved: boolean, xp: number }>, bonusPaid: boolean }`.
- There is one active session per learner, and a new session overwrites the old one.
- Keys use the `defineEntry`/`ownEntry` helpers, the same as drafts.
- Deleted in `deleteUser`.

### 2.7 Concept cards (`db.conceptCards`)

- `db.conceptCards[key] = { key, concept: Concept, anchor, hidden?: boolean, createdAt, updatedAt }`.
- `anchor` is `{ kind: 'lesson', challengeId }` or `{ kind: 'unit', unitId }`. The `unit` kind is accepted only once the bite-sized-units design ships; until then the admin UI offers "start of stage" as a lesson anchor on the stage's first lesson.
- **Built-in concepts** (the 8 attached to challenges): editing one stores a record whose `key` is the authored `concept.id`, with its anchor fixed to that lesson. This is the same "stored record wins for the same id" rule `getChallenge` uses. Reverting deletes the record. `hidden: true` stops the concept being served.
- **Admin-created cards**: `key` is `concept-<slug>-<4 random chars>`, and a lesson can have at most one concept.
- Validated with the existing `ConceptSchema` from `schema.ts`, which is already exported.

### 2.8 Client-side state

`UserStats` gains optional fields:
- `mistakes?`, `review?` and `reviewXp?`, mirroring the server fields.
- `unsynced?: { mistakeIds: string[]; reviewLog: ReviewEvent[] }`, where `ReviewEvent = { challengeId, day, outcome, sessionId }`.

`hydrateStats` (`SessionProvider.tsx:190-208`) cleans these fields the same way it cleans `attempts`. `ServerProgress` in `src/platform/api-client/api.ts` gains the same optional fields.

Session state (`Slot[]`, the deferred set, per-item history) is kept in memory only.

### 2.9 Migration and backwards compatibility

- **`db.js`**
  - `EMPTY` gains `learningSettings: {}`, `conceptCards: {}` and `reviewSessions: {}`.
  - `migrate()` gains `plainObject(...)` lines for all three.
  - `EMPTY_PROGRESS` gains `mistakes: {}`, `review: {}` and `reviewXp: {}`.
  - `getProgress` already spreads `EMPTY_PROGRESS` first, so old rows pick up the defaults without being rewritten.
- **Content:** all new fields are optional. The 246 existing items validate unchanged.
- **Client:** old localStorage stats hydrate with the new fields empty.
- **XP:** leveling functions gain an optional `cap` argument that defaults to 100, so existing callers and existing XP maths do not change (4.2).
- Nothing already stored is recomputed or rewritten.

---

## 3. Server API

### 3.1 Where the rules live

- **Shared pure TypeScript, compiled by `server/index.js` `bootstrap()`** with `compileTsModule`, the same way `grading.ts` and `leveling.ts` are compiled today:
  - `src/platform/learning-config/index.ts` becomes `learning-config.mjs`
  - `src/platform/grading-engine/feedback.ts` becomes `feedback.mjs`
  - `src/platform/review/index.ts` (schedule, session builder, XP) becomes `review.mjs`
  - These are handed to routers as `learningDeps = { config, feedback, review, leveling, grading }`, the same pattern as `adminDeps`.
- **`src/platform/xp-leveling/leveling.ts`**
  - `scoreSolve(attempts, hintsUsed, cap = 100)` returns `min(cap, <existing formula>)`.
  - `xpForSolve(xpReward, attempts, hintsUsed, cap = 100)`.
- **New `server/progress-rules.js`** (pure, so it can be tested without binding a port):
  - `applySolve(progress, input, deps)`, extracted from `index.js:641-711`
  - `recordMiss(progress, input, deps)`
  - `mergeLearningExtras(current, incoming, deps)`
- **New `server/learning-routes.js`**: `createLearningRouter({ requireAuth, getChallengeMerged, verifySubmission, visibleBankFor, getLearningConfig, learningDeps })`. It follows the `drafts-routes.js` pattern and is mounted at `/api` in `index.js`.
- **New `server/learning-settings.js`**: `getLearningConfig()`, which returns `resolve(store.getLearningSettings())`.
- **New `server/concept-cards.js`** (pure): `normalizeConceptInput(body, { anchorIds, key })` with friendly field paths, and `generateConceptKey(title, existing)`.
- Add every new server file to the `dev:api` `--watch-path` list in `package.json`.

### 3.2 Learner routes

All learner routes use the existing learner-token guard (`optionalAuth` is app-wide at `index.js:262`, plus `requireAuth`). Guests never call them; they work locally (4.5).

**Changed: `POST /api/progress/solve`**
- New optional body fields: `revealed?: boolean`, `requeued?: boolean`, `mode?: 'learn' | 'practice'` (default `practice`).
- Rules, applied in `applySolve`:
  - The pass-mark 422 (`index.js:658`) applies only when `!requeued`.
  - `cap = revealed ? config.requeue.maxScoreAfterReveal[mode] : 100`.
  - `score = scoreSolve(attempts, hintsUsed, cap)` and `awarded = firstSolve ? xpForSolve(xpReward, attempts, hintsUsed, cap) : 0`.
  - The progress response now includes `mistakes`, `review` and `reviewXp`.
- Validation: both booleans are coerced with `=== true`, and `mode` is checked against its allowed values.

**New: `POST /api/progress/attempt`** (the failed-attempt store)
- Body: `{ challengeId: string (at most 120 chars), answer?: unknown, codeFailed?: boolean, final: boolean, mode: 'learn' | 'practice' | 'review' | 'test' }`.
- Handling:
  - 404 for an unknown challenge (`getChallengeMerged`).
  - Answer types: grade with the existing `gradeAnswer`. A correct answer returns `{ recorded: false, reason: 'correct' }`.
  - Code types: record only `codeFailed: true`, flagged `code: true` (unverified).
  - `recordMiss` increments `n`, which is capped by the per-day count, adds the wrong-answer keys, and sets `open`.
  - When `final` is true: `rev += 1`, and `review[id]` is reset to `{ box: wrongResetsToBox, due: today + intervals[box] }`.
- Response: `{ recorded: boolean, mistake: MistakeRecord | null }`.

**New: `POST /api/review/session`**
- Body: `{ stageId?: string }`. A stage id must be visible; otherwise 400.
- The server calls `buildReviewSession({ progress, bank: visibleBankFor(req.user), config, today, seed })`.
- `visibleBankFor(user)` is `applyLearnerOverrides(...).challenges` minus premium stages the learner has not unlocked (`entitlementsFor` and `unlockedStageIds`), minus stage tests and types outside `itemTypes`.
- The pool is solved challenges only (`completedChallenges`), so review never pays first-solve XP and never gets around lesson order. Buckets, in priority order:
  1. **mistakes**: `open`, with the last miss before today and inside `mistakeWindowDays`, most misses first. At most `mix.mistakes`.
  2. **due**: `due <= today`, oldest first. At most `mix.due`.
  3. **weak**: no stored review entry, and `score < weak.scoreBelow` or `hintsUsed >= weak.hintsAtLeast`, lowest score first.
- The session is filled up to `sessionSize.max`, then shuffled with a seed.
- Response: `{ sessionId, items: [{ challengeId, reason }], xp: { remainingToday } }`, or `{ sessionId: null, items: [], nextDueDay }` when there is nothing to practise.
- The session is stored in `db.reviewSessions[user.id]`.

**New: `POST /api/review/answer`**
- Body: `{ sessionId, challengeId, answer?, code?, attempts: 1-10, hintsUsed: 0-10, revealed?: boolean }`.
- Errors:
  - 404 when the session is missing, has a different id, or is older than `sessionTtlHours`.
  - 400 when the challenge is not one of the session's items.
- The answer is checked by the existing `verifySubmission`, passed in as a dependency.
- The outcome for scheduling is decided on the item's first answer in the session: `clean`, `assisted` or `missed`. Later answers only resolve the item.
- XP is paid only when the answer is correct and the item is not yet `resolved`:
  - amount: `correctFirstTry` if the first answer was clean, otherwise `correctAfterMiss`
  - zero if `review[id].paid === today`
  - clipped to `dailyCap - reviewXp[today]`
  - The session bonus is paid once, when every item is resolved, under the same cap.
- A correct answer also:
  - updates `streak`/`lastActiveDay` through `leveling.nextStreak`, the same as a solve
  - sets `mistakes[id].open = false` when the outcome was clean
  - calls foundations' daily-activity hook (`{ xp, reviews: 1 }`) if it exists
- A replayed answer for a resolved item returns the stored result with `awardedXp: 0`.
- Response: `{ correct, outcome, awardedXp, bonusXp, xpRemainingToday, progress }`.

**Changed: `POST /api/progress/merge`** (`index.js:738-793`)
- `incoming` may now carry `mistakes`, `review` and `reviewLog`, handled by `mergeLearningExtras`:
  - Only ids that `getChallenge` knows.
  - `mistakes`: numbers take the larger value and are clamped; keys are merged and cut to the top 5; `open` is kept if either side is open.
  - `review`: the entry with the newer `last` wins, with the box and day validated.
  - `reviewLog`: at most 200 events. Only correct events whose day is within `guestMergeWindowDays` of the server's today and whose challenge is in the merged `completedChallenges` count, with one event per id per day. XP is recomputed with the server's `review.xp` and `dailyCap`, and the session bonus is never merged.
- The response adds `awardedReviewXp`.

**Changed: `GET /api/content`** (`index.js:500-516`)
- Adds `learningConfig: getLearningConfig()` to the response.
- `applyLearnerOverrides` also applies concept cards through a new `applyConceptCards(challenges)` in `content.js`, which reads `store.allConceptCards()` the same way `mergeBank` reads custom challenges:
  - a card anchored to a lesson sets `challenge.concept`
  - an authored-concept override replaces the authored concept
  - `hidden` removes it

### 3.3 Admin routes

Every route is in `server/admin.js` behind `router.use(requireAdminAuth)` and is audited through `audit()`. Audit details carry ids and counts only.

| Route | Request | Response and validation |
|---|---|---|
| `GET /settings/learning` | | `{ effective, custom, defaults, limits }`, following the `pricingView` pattern. |
| `PUT /settings/learning` | A sparse patch; `null` resets a key. | Runs `validateLearningPatch`. Any problem returns 400 `{ error, issues }` and saves nothing. On success it calls `store.setLearningSettings` and audits `settings.learning.update` with the changed paths. |
| `PATCH /content/challenges/:id` (extended) | Adds `optionFeedback: string[] \| null` and `blankFeedback: { wrongAnswers }[] \| null`. | Returns 400 if the challenge type does not match, the lengths differ from its options or blanks, a note is over 600 characters, or a wrong answer is actually accepted. Stores `feedbackBasis` from the challenge with overrides removed. Returns `{ override, warnings }`, where `warnings` comes from `feedbackLeaks`. |
| `POST /content/challenges/feedback` (new, bulk) | `{ items: [{ id, optionFeedback?, blankFeedback? }] }`, at most 50. | Authored and unmodified: `setChallengeOverride`. Created or modified: the stored record is updated and re-checked with `deps.validateChallenge` (no solution run is needed, since feedback does not affect grading). Returns `{ rows, issues }`. |
| `POST /ai/feedback` (new) | `{ ids: string[] }`, 1-10, option or blank types only. | `draftFeedback({ ai, challenges, leaks })` in `ai-questions.js`, 5 challenges per Gemini call. Returns `{ drafts: [{ id, optionFeedback?, blankFeedback?, leaks }] }`. Nothing is saved. 503 when Gemini is not configured, through the existing `aiRoute`. |
| `GET /content/concepts?stageId=` (new) | | Rows: `{ key, anchor, concept, source: 'authored' \| 'modified' \| 'created', hidden, lessonTitle, orphaned }`, plus per-stage coverage `{ stageId, lessons, withConcept }`. |
| `POST /content/concepts/validate` | `{ anchor, concept }` | Runs `normalizeConceptInput`, then `ConceptSchema`. |
| `POST /content/concepts` | `{ anchor, concept, showAgain? }` | 201. Returns 409 if the lesson already has a concept, with a pointer to edit that one instead. |
| `PUT /content/concepts/:key` | `{ concept, anchor?, showAgain? }` | For an authored key the anchor stays fixed. `showAgain` changes `concept.id` to a `-r<N>` version so learners who have already seen it see it again. |
| `POST /content/concepts/:key/revert` | | Authored keys only; returns 409 otherwise. |
| `PATCH /content/concepts/:key` | `{ hidden }` | |
| `DELETE /content/concepts/:key` | | Created cards only; authored ones return 409. |
| `POST /ai/concept` (optional) | `{ challengeId }` | `draftConcept` returns a concept draft coerced to fit `ConceptSchema`. Nothing is saved. |
| `GET /analytics` (changed) | | See below. |

Other admin changes:
- `toRow` adds `optionFeedback`, `blanks[].wrongAnswers`, `feedbackStale: boolean` and `conceptKey`.
- `adminDeps` gains `validateConcept` (from `ConceptSchema`), `feedback` and `learning`.

**Changed `mostMissed`** (`admin.js:229-272`). It is empty today because `attempts[id]` is only written on a solve.
- For each learner, "attempted" means `attempts[id]` or `mistakes[id]` exists, and "missed" means `mistakes[id].n > 0`.
- Row: `{ id, title, stageId, learners, missedBy, missRate, totalMisses, revealed, topWrong: [{ key, label, count }] }`.
- `label` is worked out from the challenge: option text, or blank number plus value.
- Rows are filtered by `learners >= analytics.mostMissedMinLearners` and sorted by `missRate`, then `missedBy`.
- Also returns `practice: { learners7d, xp7d }`, computed from `reviewXp`.

---

## 4. Client

### 4.1 Wrong-answer feedback and attempt budget (a, b)

**`src/platform/grading-engine/feedback.ts`** (new, pure). Exports:
- `optionNotes(c, selected: number[], reveal: boolean): FeedbackNote[]`
- `blankNotes(c, values: string[], reveal): FeedbackNote[]`
- `wrongAnswerKeys(c, answer)`
- `feedbackLeaks(c): Set<string>`. It flags a note that contains a correct option verbatim (normalised, 8 characters or more) or names a blank's answer as a word. This is the same rule as `hint-leak` in `lint-content.mjs`.

On attempts before the last one, a note flagged as leaking is held back until the reveal, so a mistake by an author never gives the answer away early.

**Challenge-type registry**
- `src/modules/challenges/challenge-types/types.ts`:
  - `AnswerRendererProps` gains `reveal: boolean`, `notes: FeedbackNote[]` and `ruledOut?: number[]`.
  - `AnswerTypeDefinition` gains `feedback(c, answer, reveal): FeedbackNote[]`.
- `options.ts`, `fillBlank.ts` and `pseudocodeOrder.ts` implement `feedback` by calling the platform helpers.
- `registry.ts` gains `feedbackNotes(c, answer, reveal)`.

**Renderers**
- **`OptionsChallenge.tsx`** (lines 63-67, 83):
  - When `checked && !reveal`: only the learner's wrong picks get `incorrect`. The correct option is never flagged, and the "correct" label renders only when `reveal`.
  - Options in `ruledOut` render struck through and `aria-disabled`, with their note underneath.
  - multi_select shows a line "Some correct answers are missing" when the learner picked too few, without saying which.
  - A note renders under its option (`option-note`), linked with `aria-describedby`.
- **`FillBlankChallenge.tsx`** (lines 88-97): the `Expected:` block renders only when `reveal`. Before that, wrong blanks are marked and matching `wrongAnswers` notes are listed as "Blank 2: …".
- **`PseudocodeOrderChallenge.tsx`** (line 132): "The correct order" renders only when `reveal`. Rows are still marked right or wrong on every check.

**`PracticeModal.tsx`**. To keep the file manageable, extract `components/lesson/useAttemptFlow.ts` (budget, reveal, ruled-out options, history) and `components/lesson/FeedbackBanner.tsx`, which replaces lines 822-888.
- `budget = effectiveAttemptBudget(challenge, sessionMode, learningConfig)`, where `sessionMode` is `learn`, `practice`, `review` or `test`.
- `handleCheck` (line 276):
  - **Correct:** `award(..., { requeued: slot.round > 0, revealed: history.revealed, mode })`.
  - **Wrong:** calls `recordMiss(challenge, answer, { final, mode })`. If `attemptsThisRound >= budget`, it sets `revealed`. For single choice it also adds the pick to `ruledOut`.
- Footer (lines 925-953):
  - wrong, not final: "Try again · N left"
  - revealed: "Continue", which calls `deferCurrent()` and then `advance()`
  - Enter follows the same rules (line 428).
  - Number keys (line 408) skip ruled-out options.
- `award` (lines 240-274):
  - For answer types, a correct answer below the pass mark (only possible with hints) on the first pass is treated as a miss and requeued, instead of the dead-end "Retry lesson". Code types keep the existing `failedPass` flow.
  - The inline score maths at lines 255-256 is replaced by `scoreSolve(..., cap)`.
- The solution button (line 891) becomes `isCodeType && !isCorrect && !challenge.isStageTest && solutionAfterFailedRuns > 0 && attempts >= solutionAfterFailedRuns`. This fixes the known hole where a stage test could be passed by revealing the solution.
- A failed code run records at most one code miss per item per session.

### 4.2 Requeue at the end of the session (d)

**`src/modules/challenges/session/queue.ts`** (new, pure). Functions:
- `type Slot = { challengeId: string; round: number }`
- `initialSlots(challenges)`
- `requeue(slots, id, maxRounds): Slot[] | null`
- `dropSolved(slots, fromIndex, completed)`
- `reachableSlotIndex(slots, completed, deferred)`: the first unsolved slot, skipping round-0 slots that are deferred.

**`PracticeSessionProvider.tsx`**
- Holds `activeSession: { kind: 'lessons' | 'test' | 'review'; stage: Stage | null; title: string; reviewSessionId?: string }`.
- Also holds `slots`, `deferred: Set<string>` and `history: Record<id, { attempts, hints, revealed, rounds }>`.
- `activeChallenges` becomes the list expanded from the slots; duplicates are allowed.
- `reachableIndex` uses `reachableSlotIndex`, so the learner can move past an item they missed, and the lesson-order rule for everything else stays as it is.
- New methods: `deferCurrent()` and `requeue(id)`.
- When a challenge is solved, any requeued slots for it that are still pending are dropped.
- Opening a stage resets all session state.

**Unit size.** The session is the whole stage today, and becomes the unit once the units design lands. Nothing here depends on how the stage is split.

**`PracticeModal.tsx`**
- The per-challenge reset effect (lines 164-169) is keyed on `${activeChallengeIndex}:${challenge.id}`, so a requeued slot directly after its original still resets.
- Dots for requeued slots render after a divider with the class `is-retry`.
- The end screen (lines 580-669) adds "N first try · M fixed on retry".
- If an item hits `maxRounds`, the end screen says it will appear in Practice. The lesson stays unsolved and is still the first thing the learner returns to next time, exactly as today.

**`SessionProvider.completeChallenge`**
- Takes `requeued`, `revealed` and `mode`, and sends them in `api.solve`.
- The optimistic XP uses `xpForSolve(..., cap)` so it matches the server.

### 4.3 Learn mode on every lesson (c)

**`PracticeModal.tsx`**
- Line 66 becomes `learnMode = !isTestMode && learningMode === 'learn'`, and `hasLearnContent` is removed.
- The mode switch (line 537) shows on every lesson, and the "Practice only" pill (lines 538-542) is removed.

What Learn mode now does on any lesson:
1. **Concept card.** If the lesson has a concept (authored or an admin card, both delivered as `challenge.concept`) that the learner has not seen, `ConceptTeaching` runs first, as it does today.
2. **Reading open by default.** `readingSlot` becomes `(challenge, close, { defaultOpen })`. `App.tsx:164` passes `defaultOpen` through to a new `ReadingPanel` prop, set when `learnMode && config.feedback.learnOpensReading`.
3. **Immediate explanation.** A wrong answer uses the learn budget (default 1), so the explanation comes straight away:
   - the note for the learner's pick
   - the correct answer, revealed
   - the full `challenge.explanation`
   - "Review the concept" if an earlier concept in this session applies
   - the item is then requeued
4. **Code items.** Keep today's Learn branch: the explanation appears after the first failed run.

The "Practice - applying X" marker (lines 473-484) now works for admin cards too, with no code change, because cards arrive as `challenge.concept`.

Offline, the app uses the bundled content, so only authored concepts and feedback appear. `ContentBundle.hiddenTracks` already documents the same limitation.

### 4.4 Practice and review (e)

**`src/platform/review/`** (new, pure, shared with the server). Exports:
- `reviewStateOf`
- `applyReviewResult`
- `buildReviewSession`
- `reviewXpFor(event, dayTotal, paidToday, config)`
- `reviewSummary(stats, bank, config, today)`, which returns `{ mistakes, due, weak, total, nextDueDay }`

**Events** (`src/platform/events`)
- New intent `'review:open': { stageId?: string }` and `intents.openReview(scope?)`.
- New facts `'challenge:missed'` and `'review:completed'` (`{ correct, total, xp }`), so foundations' goal code can react.

**`SessionProvider.tsx`**. New context members:
- `learningConfig`: from `bundle.learningConfig`, with `DEFAULT_LEARNING_CONFIG` for the bundled or offline source.
- `reviewSummary`: memoised.
- `recordMiss(challenge, answer, opts)`: online and signed in, calls `api.recordAttempt`, fire and forget. Otherwise it applies `recordMiss` locally and pushes the id to `unsynced.mistakeIds`.
- `startReview(scope)`: online and signed in, calls `api.reviewSession`. Otherwise it runs the local `buildReviewSession` with the id `local-<ts>`.
- `completeReview(challenge, { sessionId, attempts, hintsUsed, answer | code, revealed, correct })`:
  - online: calls `api.reviewAnswer` and adopts the server's `progress`. A 404 means the session expired, and the learner is offered a new one.
  - offline or guest: applies `applyReviewResult` and `reviewXpFor` locally, adds the XP, and appends the event to `unsynced.reviewLog`.
- `restoreSession` (lines 739-762): `localIsAhead` also becomes true when `unsynced` is not empty. The merge sends `mistakes`, `review` and `reviewLog`, and `unsynced` is cleared once the merge succeeds.
- `mergeableGuestProgress` (lines 1077-1080): no longer returns null when the guest has mistakes or a review log but no solves.

**`api.ts`**: new `recordAttempt`, `reviewSession` and `reviewAnswer`; the `solve` submission gains `revealed`, `requeued` and `mode`; `content()` gains `learningConfig`.

**`PracticeSessionProvider.tsx` and `PracticeModal.tsx`**
- `review:open` calls `startReview`. An empty result shows a toast: "Nothing to practise now. Next review {relativeDay(nextDueDay)}."
- In review mode:
  - title "Practice"
  - no stage badge, no lesson-order gating, no concept teaching
  - reading panel collapsed
  - budget `review.attemptsBeforeReveal`
  - requeue once if `review.requeueMissed`
- Answers go through `completeReview` instead of `completeChallenge`.
- A new `components/lesson/ReviewComplete.tsx` shows review XP (or "daily practice XP limit reached"), accuracy and streak, with "Practice again" (if more are due) and "Back to path".

**Entry points**
- `DashboardHome.tsx`: a "Practice" card, for example "6 to practise: 2 mistakes, 4 due". When there is nothing to do it says "All caught up".
- `LearningPath.tsx`: a "Practice" row above the stage list, plus "Practice this stage" on completed stages, which calls `intents.openReview({ stageId })`.
- Both read `useSession().reviewSummary`, so the dashboard never imports the challenges module.
- The UI says "Practice" while the code says `review`, so it does not clash with the Learn/Practice mode switch.

**Goal and streak**
- A correct review answer advances the streak on the server and locally.
- For the daily XP goal: until foundations' daily log exists, `DashboardHome`'s `todayXp` (using `xpEarnedOn` in `insights.ts:39`) adds `stats.reviewXp?.[today] ?? 0`.

### 4.5 Guest, signed-in and offline

| | Guest (no account) | Signed in, online | Signed in, offline |
|---|---|---|---|
| Budget, reveal, requeue | Local, using the config from `/api/content` or code defaults | Same | Same, using defaults if content came from the bundle |
| Feedback notes and concepts | Bundled, plus admin edits when the API is reachable | API content | Bundled plus the last API copy |
| Failed attempts | `stats.mistakes` in localStorage | `/api/progress/attempt` | Local, with the id in `unsynced.mistakeIds`, merged on reconnect |
| Solve after requeue | Local XP with the reveal cap; merged on sign-in (the server recomputes) | Server decides XP (`requeued`/`revealed`) | Existing offline-solve path |
| Practice sessions | Built locally; local XP with the same caps | Server session, with XP and caps decided by the server | Local session; `reviewLog` merged later, capped by the server within `guestMergeWindowDays` |

---

## 5. Admin panel

**Navigation.** `src/modules/admin/layout/AdminLayout.tsx` `GROUPS` gains a "Learning" group with three routes, added to `AdminApp.tsx`:
- Learning rules: `/admin/learning-rules`
- Teaching: `/admin/teaching`
- Answer feedback: `/admin/feedback`

**`adminApi.ts`** gains:
- `learningSettings()` and `updateLearningSettings(patch)`
- an extended `updateChallenge` patch type
- `saveFeedbackBulk(items)` and `aiFeedback(ids)`
- `concepts(stageId?)`, `validateConcept`, `createConcept`, `replaceConcept`, `revertConcept`, `updateConcept`, `deleteConcept` and `aiConcept`
- `AnalyticsSummary` with the new `mostMissed` shape
- `optionFeedback` and `wrongAnswers` on `AdminChallengeRow` and `QuestionInput`

**1. `pages/AdminLearningRules.tsx`**
- One card per section: Feedback, Requeue, Practice schedule, Practice XP and limits, Analytics.
- Every key in 2.3 is editable with the existing `NumberField`, `Toggle` and `SelectField`:
  - per-type budgets in a small grid
  - intervals as an editable chip list with up and down buttons
  - item types as checkboxes
- Each field shows its default, a "custom" badge and a "Reset" link that sends `null`.
- Validation runs in the browser with the shared `validateLearningPatch`, and the server's `issues` are shown next to their fields.
- The page notes that changes reach learners on their next content load, with no redeploy.

**2. QuestionWizard** (`components/QuestionWizard.tsx`)
- **`OptionsEditor`** (lines 749-840): each option gets a collapsible text box. The label is "Why a learner might pick this, and why it's wrong" for a wrong option, or "Why this is right (optional)" for a correct one. `setCount` and `remove` keep `optionFeedback` lined up with `options`.
- **`BlanksEditor`** (lines 842-902): each blank gets a "Common wrong answers" list of `{ answer, feedback }` rows. For dropdowns, one row is prefilled per wrong choice, with the answer locked.
- **Plumbing:** `blank()` and `fromRow()` (lines 219-274) carry the new fields. `validateLocally` (line 1290) checks lengths and alignment, and `KNOWN_PATHS` (line 1280) gains `optionFeedback.<i>` and `blanks.<i>.wrongAnswers`. Leaks show as a non-blocking warning.
- **Save path.** For a built-in question where only presentational fields changed (title, prompt, explanation, hints, tags, XP, difficulty, option feedback, blank wrong answers), `save()` (lines 386-410) calls `adminApi.updateChallenge` (PATCH) instead of `replaceQuestion`. The built-in logic stays live. The notice at lines 466-475 says which path will be used.
- An "Edit teaching card" link opens the ConceptEditor for this lesson.
- A stale-feedback badge appears when `feedbackStale` is true.

**3. `pages/AdminFeedback.tsx`**
- Coverage per stage: eligible items, items with feedback, stale overrides, notes that leak.
- Filters: missing, stale, leaking, and "most missed first" (joined from `/admin/analytics`).
- Select rows, then "Draft with Gemini" (10 per click, with progress), which calls `aiFeedback`.
- A review table shows the question, each option (correct ones marked), an editable draft note and a leak flag, with Accept, Edit and Reject per row.
- "Save accepted" calls `saveFeedbackBulk`.

**4. `pages/AdminTeaching.tsx`**
- Stage picker, a coverage bar ("2 of 20 lessons have teaching"), and one row per lesson showing: none, authored, edited, admin card, or hidden.
- Row actions: Add, Edit, Hide or Unhide, Revert (authored only), Delete (created only), and Draft with Gemini (optional).
- New `components/ConceptEditor.tsx` is a `Drawer` with a field for every `ConceptSchema` field:
  - title, summary, intro, why, explainDifferently
  - example and second example: code in `CodeArea`, a language, and callouts as `{ line, text }` rows with a line-range check
  - tryIt: instructions, starter code, language, ui
  - a "show again to learners who already saw it" checkbox
- Anchor choices: a lesson, "start of stage", and "start of unit" once units exist.
- A warning appears when the tryIt language cannot run without Judge0.

**5. `pages/AdminAnalytics.tsx`**
- New Most-missed columns: Learners, Missed by, Miss rate, Revealed, Most common wrong answer (label and share).
- An "Edit feedback" action opens the wizard for the question.
- A small "Practice (7 days)" card.

**6. `QuestionWizard` (single AI draft)**
- `ai-questions.js` `DRAFT_SCHEMA` (lines 181-228) gains `optionFeedback` and `blanks[].wrongAnswers`, and `KIND_CONVENTIONS` (lines 144-171) gains the feedback authoring rule.
- `coerceDraft` (lines 300-368) keeps the notes lined up with the options, and `emptyDraft` gains `optionFeedback: []`.
- New AI drafts therefore arrive with feedback already filled in.

---

## 6. Tests to add

**Pure tests under `src`** (vitest, `environment: 'node'`)
- **`src/platform/learning-config/__tests__/config.test.ts`**
  - defaults resolve
  - a sparse override deep-merges
  - an invalid stored value falls back to its default
  - `validateLearningPatch` reports: intervals not increasing, budget 0 or 6, min larger than max, empty `itemTypes`, `wrongResetsToBox` out of range
  - `effectiveAttemptBudget`: capped at options minus 1, a 2-option quiz gets 1, a test is unlimited, learn and review budgets are used
- **`src/platform/grading-engine/__tests__/feedback.test.ts`**
  - notes for quiz, multi and fill (including matching free text in a different case or with extra spaces)
  - a leaking note is held back before the reveal and shown after
  - `wrongAnswerKeys` output
- **`src/platform/review/__tests__/schedule.test.ts`**
  - derived state from legacy `attempts` (clean vs assisted)
  - `clean`, `assisted` and `missed` transitions
  - the box is clamped when intervals shrink
  - `buildReviewSession`: bucket priority and mix, size limits, the same seed gives the same result, unsolved items, stage tests, hidden items and excluded types are left out, same-day mistakes are left out
  - `reviewXpFor`: paid once per item per day, daily cap, the bonus fits under the cap
- **`src/modules/challenges/__tests__/queue.test.ts`**: requeue appends a slot, `maxRounds` is respected, solving drops pending slots, `reachableSlotIndex` skips deferred items, the same id can have two slots.
- **`src/modules/challenges/__tests__/registry.test.ts`** (extended)
  - `feedbackNotes` for each type
  - schema: rejects a feedback length that does not match, `optionFeedback` on `code_runner`, a wrong answer that is actually accepted, a wrong answer that is not among the choices
  - accepts content that uses neither field
- **`src/platform/xp-leveling/__tests__/leveling.test.ts`**: `scoreSolve` and `xpForSolve` return the same values as before when no cap is given; the cap is applied; the floor of 50 still holds.

**Server tests** (`server/__tests__`, HTTP through express as in `drafts.test.mjs` and `admin-questions.test.mjs`)
- **`progress-rules.test.mjs`**
  - `applySolve`: a legacy body without flags gives the same XP as today; `requeued` skips the pass mark; `revealed` caps the score by mode; a re-solve pays 0
  - `mergeLearningExtras`: numbers are clamped, unknown ids are dropped, `reviewLog` window and daily cap, events for items not yet solved are ignored, the bonus is never merged
- **`learning-routes.test.mjs`**, using the real `db.js` with `node:fs/promises` stubbed:
  - `/progress/attempt`: 401 for a guest, 404 for an unknown challenge, a correct answer is not recorded, a wrong one is recorded with keys, the per-day cap, `final` resets review
  - `/review/session`: empty pool returns `nextDueDay`; mix and priorities; invalid `stageId` returns 400
  - `/review/answer`: XP paid once, idempotent replay, daily cap, bonus once, expired session 404, challenge not in the session 400, a wrong answer reopens the mistake and resets the box, a correct answer updates the streak
- **`admin-learning-settings.test.mjs`**: GET shape, PUT sparse merge, `null` reset, invalid returns 400 and nothing is saved, an audit row is written.
- **`admin-questions.test.mjs`** (extended; add the new store functions to its `vi.mock('../db.js')`)
  - PATCH `optionFeedback` on an authored question stores the basis and `applyChallengeOverride` applies it
  - a changed basis means the override is ignored and `feedbackStale` is true
  - a wrong length returns 400
  - PUT clears the feedback overrides
  - the bulk route handles both authored and custom questions
- **`admin-concepts.test.mjs`**: create, replace, revert, hide and delete; one concept per lesson (409); schema issues; an authored override is served by `applyLearnerOverrides`; orphaned anchors are flagged.
- **`admin-analytics.test.mjs`**: most missed is filled from `mistakes`, the minimum-learners setting applies, top wrong labels are correct.
- **`custom-challenges.test.mjs`** (extended): `optionFeedback` is padded or truncated; `wrongAnswers` issue paths.
- **`ai-questions.test.mjs`** (extended): `coerceDraft` lines feedback up with options; `draftFeedback` flags leaks; the `emptyDraft` literal is updated.
- **`db-learning.test.mjs`**: `migrate` adds the three maps; `setLearningSettings` null and prune behaviour; `deleteUser` drops `reviewSessions`; `getProgress` fills in the new fields on an old row.

**Scripts**
- `scripts/lint-content.mjs` gains the warnings `feedback-leak`, `feedback-restates-option` and `feedback-thin` (under 20 characters), plus a coverage line. It imports `feedbackLeaks` through `bundleAndImport`, as it already does for `optionOrder`.
- Run `npm run check`.

---

## 7. Risks, edge cases, and manual checks

**Risks**
- **Client-reported fields.** Attempts, `revealed` and `requeued` come from the client, the same trust model as today's attempts and hints. The server still decides whether an answer is right, pays first-solve XP once, floors the score at 50, and caps review XP per item per day and per day overall.
- **Pass mark.** A client could send `requeued: true` to skip the pass mark. The existing "Retry lesson" already lets anyone reset, so no protection is lost.
- **Answer key.** The whole answer key is already shipped to the browser, and the notes add explanations, not correct answers.
- **Stale overrides.** When built-in options change in source, admin feedback overrides stop applying. The admin table flags them and they need re-saving.
- **`db.json` size.** Mistakes and review entries are written only for items actually missed or reviewed, and the keys and `reviewXp` are bounded. Watch file size once there are many users.
- **Server day vs local day.** `dayKey` uses the server's clock, which is an existing streak issue. Review due dates and the daily cap inherit it. The foundations timezone fix should cover both.
- **Server-built sessions.** A session reflects the config at build time, while XP uses the config at answer time. Say so in the admin help text.
- **Legacy learners.** For learners with many old solves, everything is due at once. Sessions stay 5-8 items, so the pool just stays full. XP is bounded by `dailyCap`.
- **Premium revoked.** Items in premium stages are excluded from review after a revoke through `visibleBankFor`.
- **Units.** Anchoring a concept to a unit, and requeueing at the end of a unit, depend on the units design. Both work per stage until it lands.
- **Name clash.** "Practice" (review) vs "Practice mode". Keep the UI wording consistent.

**Edge cases**
- 2-option and single-dropdown items get a budget of 1.
- multi_select where every option is correct.
- The same challenge twice in a row (the slot-keyed reset handles it).
- The learner goes Back and solves the original slot, which drops the requeued one.
- A double click on Check (the answered map makes it idempotent).
- A hidden or deleted question in an open session, or with an open mistake (skipped by the builder).
- The admin shortens the intervals list (box clamped).
- A concept anchored to a hidden lesson (orphaned, never served).
- A concept edited after learners saw it (the "show again" option).
- Hints plus a budget pushing a first-pass answer below the pass mark (requeue).
- C/C++ stage tests that are fill_blank (no reveal, no limit).
- A guest who has only mistakes and no solves signs in (merge still runs).

**Check manually**
1. Quiz in Practice mode:
   - the first wrong answer shows only a red pick, a struck-through option and a note
   - the second wrong answer reveals the answer and explanation, and "Continue" requeues the item
   - the item comes back at the end, and a correct answer gives capped XP
   - the server's XP matches the optimistic XP
2. Learn mode on a lesson without a concept: the reading panel is open, and the first wrong answer explains immediately and requeues.
3. fill_blank and pseudocode_order show no "Expected" or correct order before the last attempt.
4. The "Show me the solution" button is gone on stage tests.
5. Admin, on a built-in question:
   - change only feedback, confirm it saves via PATCH, the question is not marked "modified", and learners see it after refreshing content
   - change an option in source and confirm the feedback is flagged stale
6. Practice as a signed-in learner:
   - the session builds, XP is paid, the cap is reached, streak and dashboard update
   - the same flow as a guest, then sign in and confirm the capped XP merges
   - offline, then reconnect and confirm the sync
7. Most missed fills after three accounts miss an item.
8. The Learning rules page:
   - changing a budget takes effect for learners after a reload
   - "Reset" returns to the default
9. Keyboard and screen reader:
   - the banner is announced
   - number keys skip ruled-out options
   - Enter on "Continue"
10. Phone width: option notes and the review summary do not overflow.

---

## 8. Ordered implementation steps

Each step ships and can be tested on its own.

1. **Learning config base.** Add `src/types` `LearningConfig`, `src/platform/learning-config/*` with its tests, `db.learningSettings` with migrate and store functions, `server/learning-settings.js`, the compile step in `bootstrap`, `learningConfig` in `/api/content` and `ContentBundle`, the admin `GET`/`PUT /settings/learning`, and the `AdminLearningRules` page and nav entry. Learners see no change yet.
2. **Leveling cap.** Add the optional cap argument to `leveling.ts`, with tests. No behaviour change.
3. **Feedback fields.** Types, zod rules, `normalizeChallengeInput`, and the QuestionWizard editors for option feedback and blank wrong answers, with tests. Authoring only.
4. **Feedback logic.** `feedback.ts`, the registry `feedback` method, the renderers gated on reveal, and the attempt budget and reveal in `PracticeModal` (through `useAttemptFlow` and `FeedbackBanner`). As a temporary step, after a reveal the learner retries in place with a fresh budget. Also fix the stage-test solution button and use `solutionAfterFailedRuns`.
5. **Requeue.** `queue.ts` with tests, the slots, deferred set and history in `PracticeSessionProvider`, and the slot-keyed reset. Add `server/progress-rules.js` `applySolve`, and give `/api/progress/solve` the `revealed`, `requeued` and `mode` flags, with tests. This replaces the in-place retry from step 4.
6. **Learn mode everywhere.** Remove `hasLearnContent`, show the mode switch everywhere, and add the `defaultOpen` reading panel with the `readingSlot` signature change in `App.tsx` and `ReadingPanel.tsx`.
7. **Feedback overrides for built-ins.** Extend PATCH, add `feedbackBasisOf` and basis-gated `applyChallengeOverride`, clear the fields on PUT, add `feedbackStale` to `toRow`, and use PATCH in the wizard for built-in questions with text-only changes. Extend the tests.
8. **Lint and AI drafts.** New lint warnings and coverage in `lint-content.mjs`, and the single-draft feedback fields in `ai-questions.js`, with tests.
9. **Bulk feedback.** `draftFeedback`, `POST /ai/feedback`, `POST /content/challenges/feedback`, and the `AdminFeedback` page, with tests.
10. **Failed-attempt store.** If foundations has not shipped it: the `EMPTY_PROGRESS` fields, `recordMiss`, `POST /api/progress/attempt` in `server/learning-routes.js`, the client `recordMiss` for online, guest and offline, the `unsynced` handling, and `mistakes` in the merge. With tests.
11. **Most missed.** Rewrite `/admin/analytics` and update `AdminAnalytics.tsx`, with tests.
12. **Review core.** `src/platform/review/*` with tests. No UI yet.
13. **Review routes.** `db.reviewSessions`, `POST /review/session`, `POST /review/answer`, and review data in `mergeLearningExtras`, with tests.
14. **Review client.** The `review:open` intent, the `SessionProvider` review methods, the provider and modal review mode, `ReviewComplete`, the Practice entries on the dashboard and path, and the fallback that adds review XP to today's XP. Test manually as a guest, signed in, and offline.
15. **Concept cards on the server.** `db.conceptCards`, `server/concept-cards.js`, `applyConceptCards` in `applyLearnerOverrides`, and the admin concept routes, with tests.
16. **Teaching admin.** The `AdminTeaching` page, `ConceptEditor`, the wizard link, and optionally `POST /ai/concept` with `draftConcept`.
17. **Docs and housekeeping.**
    - `docs/CONTENT_AUTHORING.md`: `optionFeedback`, `wrongAnswers`, the rule against naming the answer, concept cards.
    - ADR 0007: Learn mode applies on every lesson.
    - `dev:api` watch paths for the new server files.
    - Run `npm run check` end to end.