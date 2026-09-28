# 0011 - Feedback that teaches, requeue, Learn mode everywhere, and review

## Context

A wrong answer used to hand over the answer: a fill-in-the-blank lesson
printed "Expected:" on the first wrong check, an ordering lesson printed the
correct order, and in Practice mode the explanation (which is the answer)
arrived on the second try. There was no way to say why a particular wrong
answer is wrong. A missed lesson was either retried on the spot or skipped,
so a unit could end with questions never answered right. Learn mode existed
only on the eight lessons that carry a concept; everywhere else the header
said "Practice".

Nothing brought a learner back to what they got wrong once a unit was over,
and the eight teaching cards ("concepts") could only be changed in the
source.

This record covers all of Phase 4: feedback, requeue, Learn mode, notes on
built-in questions (decisions 1-6), and Practice sessions (review) and
admin teaching cards (decisions 7-11).

## Decision

1. **Notes are content, beside the question, never in grading.**
   - `Challenge.optionFeedback: string[]` runs parallel to `options` (the
     same index convention as `correctIndex`; '' is no note), for the three
     option kinds only. `Blank.wrongAnswers: { answer, feedback }[]` names
     common wrong answers to a blank, matched with the grader's own rule
     (`checkBlank`).
   - The zod schema holds them to their shape: one note per option; a wrong
     answer the grader would accept is refused; on a dropdown it must be one
     of the choices. `normalizeChallengeInput` gives the same checks in the
     console's words (`optionFeedback.<i>`, `blanks.<i>.wrongAnswers.<j>`).
   - Which notes to show is one pure module (`grading-engine/feedback.ts`),
     reached through the challenge-type registry (`feedbackNotes`). Before
     the reveal only the learner's own wrong picks get a note, and a note
     that would give the answer away (`feedbackLeaks`: it quotes a correct
     option of 8+ characters, or names a blank's answer as a word not already
     on screen - the `hint-leak` rule) waits for the reveal. A correct
     option's note ("why this is right") shows only with the answer.
2. **An attempt budget decides when the answer is shown.**
   `effectiveAttemptBudget` (`settings/budget.ts`, section `feedback`):
   Practice mode per kind (2 for single choice, 3 otherwise), Learn mode 1,
   never on a stage test or in a test context (`Infinity`), never for code
   (code keeps its failed-runs rule, now `feedback.solutionAfterFailedRuns`).
   A single-choice question never allows more than its options minus one, so
   the last option left is never a free answer; one dropdown blank likewise.
   Every wrong answer is recorded as a miss with `final` on the one that used
   the budget up.
3. **A revealed question comes back at the end of the unit.** A run is a
   list of slots (`challenges/session/queue.ts`); "Continue" after a reveal
   defers the slot and appends the question again, at most
   `feedback.requeue.maxRounds` times. Solving a question drops any slot for
   it still to come. The run's tries and hints add up across rounds, and the
   solve that lands reports `requeued` (it completes below the pass mark -
   the floored score says how it went) and `revealed` (its score, and so its
   XP, is capped at `feedback.requeue.maxScoreAfterReveal[learningMode]`).
   The server applies the same cap from the same settings; the browser's
   optimistic XP uses it too, so both show the same number. A guest's solve
   carries its cap (`attempts[id].scoreCap`) into the merge, which honours
   it only as a reduction. A right answer that took too much help on its
   first pass is requeued the same way instead of the dead-end "Retry
   lesson" (code lessons keep "Retry lesson").
   - The flags are client-reported, the same trust model as tries and hints:
     the server still decides whether the answer is right, pays first-solve
     XP once and floors the score. Sending `requeued` only skips a pass mark
     that "Retry lesson" could always reset.
   - Past `maxRounds` (or with requeue off) the question stays unsolved and
     the end screen says it will be waiting; the lesson-order rule is
     unchanged for everything else.
   - Only a solve made during the run drops a requeued slot
     (`solvedThisRun`): in a replay of a finished unit every question was
     solved long ago, and a missed one still comes back.
4. **Learn mode on every lesson.** `learnMode` is simply "not a test and the
   learner chose Learn". A concept is taught first where the lesson has one;
   the reading panel opens by default (`feedback.learnOpensReading`, via the
   app's `readingSlot(challenge, close, { defaultOpen })`); a wrong answer is
   explained straight away (budget 1).
5. **Notes on a built-in question are an override with a basis.** Editing
   only an explanation must not freeze a question's logic, so notes on an
   authored question go through `PATCH /api/admin/content/challenges/:id`
   into `contentOverrides.challenges[id]` as `optionFeedback` /
   `blankFeedback`, with `feedbackBasis` - the JSON of the options and which
   are right, or of each blank's accepted answers and choices, at save time.
   `applyChallengeOverride` applies them only while the question still has
   that basis; after a source change they are set aside and the admin row
   says `feedbackStale`. A created or modified question keeps its notes in
   its own stored record, re-checked by the schema. PUT (a full replacement)
   clears the notes override - the wizard sends the merged notes in its body.
   The wizard saves a built-in question through PATCH whenever only its
   wording, hints, tags, XP, difficulty or notes changed.
6. **Admin.** Section `feedback` of Rules & rewards holds every number. The
   Answer feedback page (`/admin/feedback`) shows coverage per stage, filters
   for missing, out-of-date and leaking notes (most missed first), drafts notes
   with Gemini (`POST /api/admin/ai/feedback`, 1-10 questions, nothing saved)
   for review, and saves the accepted ones in one call
   (`POST /api/admin/content/challenges/feedback`, at most 50). The content
   lint reports `feedback-leak`, `feedback-thin` and
   `feedback-restates-option`, and prints the notes coverage.
7. **A miss after which the answer was shown moves the question on the
   review schedule.** `POST /api/activity/misses` with `final: true` (the
   same flag the attempt budget sets) counts in the miss summary's
   `revealed` and sends the question to `review.wrongResetsToBox`, due again
   from today - in the same tick as the miss. The browser does the same to
   its own copy.
8. **A small Leitner schedule, stored only when it moves.**
   `progress.review[id] = { box, due, last?, paid? }` is written only for a
   question that was reviewed or revealed. Every other solved question has a
   derived state (`reviewStateOf`): a first-try solve starts in
   `initialBox.clean`, one that took help in `initialBox.assisted`, due
   `intervalsDays[box]` days after its solve day (in the learner's zone). No
   existing row is migrated; nothing grows for questions never reviewed. A
   review result moves the box up (clean), keeps it (assisted) or drops it
   (missed); the box is clamped whenever the admin shortens the list. A reset
   clears the schedule and the open session.
9. **Practice sessions: built from buckets, priced by the server.** The
   shared builder (`src/platform/review`, also in the server bundle) takes
   open mistakes from an earlier day inside `mistakeWindowDays` (most missed
   first, at most `mix.mistakes`), then due questions (longest overdue first,
   at most `mix.due`), then weak solves (never reviewed, low score or many
   hints) up to `sessionSize.max`; a session under `sessionSize.min` is
   topped up from what the mix left out. Only solved questions of the kinds
   in `itemTypes`, never a stage test, never a locked premium stage
   (`visibleBankFor`), never one missed or already practised today (its
   schedule entry answered or paid today - it is back tomorrow, so one
   question cannot be served session after session for the bonus). The
   order is shuffled with a seed. `POST /api/review/session` stores one
   session per learner (`db.reviewSessions`); `POST /api/review/answer`
   verifies the answer it is sent like a solve. A question's schedule
   outcome is its FIRST answer in the session; XP (`review.xp`) is paid
   once per question per day, never past `dailyCap`, and the session bonus
   once, when every question is answered right. A replay pays nothing; an
   expired session is a 404 with `reason: 'expired'`. A right answer counts
   for the streak and the daily goal through the habits engine, like a
   solve; a clean one closes the open mistake. Day rows gain `reviews` and
   `reviewXp` (inside `xp`, so the goal's XP metric counts it).
   - **The browser sends one answer per question, once it is right** (a
     deviation from the plan, which had every answer go to the route). It
     carries the question's total tries and hints in the session and
     whether its answer was shown (`revealed`), which is what the first
     answer's outcome (clean / assisted / missed) is worked out from. A
     wrong answer goes to `POST /api/activity/misses` like any miss; the
     one that uses up the tries goes with `final: true`, which resets the
     box (decision 7), so the schedule ends where the plan's flow would
     leave it. A question never answered right is recorded only as misses:
     it is never written into the server's session, so that session never
     completes and pays no bonus.
   - When the server's verdict is "wrong" (a bank changed since the
     session started, a code answer that fails the server's run), the
     browser shows the answer as wrong and the question stays open; an
     answer the server could not take (an error, a signed-out session) is
     not counted in the session either.
10. **Guests and offline learners practise too.** The browser builds a
   session with the same code (id `local-<ts>`), prices answers with the
   same rules and keeps each right answer in `stats.unsynced.reviewLog`.
   The next merge (`reviewLog` beside `progress`) prices them again on the
   server: only right answers to questions the account has solved, of a kind
   sessions use, inside `guestMergeWindowDays`, one per question per day,
   under the daily cap - never a session bonus - and never for a day on or
   before the question's last paid day (the schedule keeps only that day,
   so a log sent twice, or an older answer arriving after a live one, pays
   once). A clean answer in the log fixes an open mistake it came after, as
   it would have online. The answers it pays are the only Practice answers
   the merged days count: the browser's own `reviews` counter is never
   taken, the review step runs before the streak step, and a day it paid an
   answer on is replayed there for the streak and the goal, as a live
   answer counts. The schedule itself merges entry by entry, the newer
   `last` winning; `paid` is never taken from the browser. The UI says "Practice" and the code says review, so it
   never clashes with the Learn/Practice mode switch.
11. **Teaching cards are records beside the bank.** `db.conceptCards`,
   keyed by card key. A built-in concept edited in the console is stored
   under its own id with its lesson fixed; reverting deletes the record. A
   card written in the console (`concept-<slug>-<4 chars>`) goes before a
   lesson, at the start of a stage or at the start of a unit (its first
   lesson, as the units service groups it); a lesson carries at most one
   concept (409 otherwise). `hidden` stops a card being served; "show it
   again" bumps a revision and serves the id `<key>-r<N>`, so learners who
   already saw it see it again. `applyConceptCards` applies them inside
   `applyLearnerOverrides`, so `/api/content` and everything else learners
   get agree; a card whose lesson is hidden or taken is never served and the
   Teaching page (`/admin/teaching`) says why. Every card is checked
   against the same `ConceptSchema` an authored concept is.

## Consequences

- Review XP is small and capped per day, and review never pays first-solve
  XP (the pool is solved questions only), so Practice cannot become the
  fastest way to farm XP. Learners with many old solves find everything due
  at once; sessions stay short, so the pool simply stays full.
- A session is built from the rules as they are when it starts, and an
  answer is priced with the rules as they are then.
- Offline or guest Practice XP shown in the browser is a preview; the merge
  may pay less (the window, the cap, questions the account has not solved).
- An admin card anchored to a unit follows the unit's grouping: regrouping a
  stage can move where it shows.
- Asking Gemini for a teaching-card draft is not built (the plan made it
  optional); cards are written by hand.
- db.json schema version 5 (`conceptCards`, `reviewSessions`; progress
  `review` appears on first read). A copy of the file is kept before the
  upgrade; no progress row is rewritten.
- Stale notes need an admin to look at them again; that is the point - notes
  about options that no longer exist would mislead.
- The basis includes which options are right (and a blank's alternatives),
  not only the option texts: moving the correct answer changes what a
  "wrong option" note means.
- The built-in bank ships with no notes; they are written in the console.
- Like every other override, `null` (or clearing every note) puts a built-in
  question back to its source notes. If a `.ts` file later ships notes, the
  console can replace them but not blank them out.
