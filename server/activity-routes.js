/**
 * A learner's days and wrong answers over HTTP.
 *
 *   GET  /api/activity?from=YYYY-MM-DD  -> { timeZone, today, from, days, misses, lastDay }
 *                                          (from defaults to 97 days back, at most 400)
 *   POST /api/activity/misses           -> record 1-50 wrong answers
 *
 * A miss is only ever a WRONG answer: every non-code answer is graded here
 * with the server's own grader, and a correct one is refused - it belongs in
 * /progress/solve, which is where XP comes from. A miss never touches
 * `progress.attempts` (the badges read that). Code is never stored: a code
 * miss is a pass count, and the learner's code lives in the drafts store.
 *
 * `learningDeps` ({ lib, settings, activity }) is read per request - it is
 * filled in by server/index.js's bootstrap, after this router is mounted.
 */
import express from 'express';

const MINUTE = 60_000;
const DAY = 86_400_000;
const MAX_ITEMS = 50;

function plainObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

/**
 * @param {object} deps
 * @param {Function} deps.requireAuth
 * @param {{ lib, settings, activity }} deps.learningDeps
 * @param {(challenge, answer) => boolean} deps.gradeAnswer  the authoritative non-code grader
 * @param {(id: string) => object | null} deps.getChallengeMerged
 */
export function createActivityRouter({ requireAuth, learningDeps, gradeAnswer, getChallengeMerged }) {
  const router = express.Router();

  router.get('/activity', requireAuth, (req, res) => {
    const from = typeof req.query.from === 'string' ? req.query.from : undefined;
    if (from !== undefined && !learningDeps.lib.isDayKey(from)) {
      return res.status(400).json({ error: '`from` must be a day like 2026-09-25.' });
    }
    res.json(learningDeps.activity.view(req.user, { from }));
  });

  router.post('/activity/misses', requireAuth, (req, res) => {
    const { lib, settings, activity } = learningDeps;
    const list = req.body?.misses;
    if (!Array.isArray(list) || list.length < 1 || list.length > MAX_ITEMS) {
      return res.status(400).json({ error: `Send between 1 and ${MAX_ITEMS} misses.` });
    }

    const maxChars = settings.current().retention.answerMaxChars;
    const nowMs = Date.now();
    const now = new Date(nowMs);
    const single = list.length === 1;
    const items = [];
    let dropped = 0;

    for (const raw of list) {
      const item = plainObject(raw);
      const challengeId = typeof item.challengeId === 'string' ? item.challengeId : '';
      const challenge = challengeId ? getChallengeMerged(challengeId) : null;
      if (!challenge) {
        if (single) return res.status(404).json({ error: 'Unknown challenge.' });
        dropped += 1;
        continue;
      }

      let answer;
      if (lib.isCodeChallengeType(challenge.type)) {
        const code = plainObject(item.code);
        answer = lib.normalizeMissAnswer(challenge, { kind: 'code', passed: code.passed, total: code.total }, maxChars);
      } else {
        answer = item.answer === undefined ? null : lib.normalizeMissAnswer(challenge, item.answer, maxChars);
        // Graded as sent AND as it would be stored: an answer can arrive
        // already reduced (`{ kind: 'choice', index }`), which the grader
        // does not read - and a correct answer is never recorded as a miss.
        const correct =
          item.answer !== undefined &&
          (gradeAnswer(challenge, item.answer) || (answer !== null && gradeAnswer(challenge, lib.rawAnswerFromMiss(challenge, answer))));
        if (correct) {
          return res.status(400).json({ error: 'That answer is correct - record it through /progress/solve.' });
        }
      }
      if (!answer) {
        dropped += 1;
        continue;
      }

      // Queued offline misses carry their own time; it is believed for up to
      // a week back, and a few minutes of clock skew forward.
      const claimed = typeof item.at === 'string' ? Date.parse(item.at) : NaN;
      const at = Number.isFinite(claimed) ? Math.min(nowMs + 5 * MINUTE, Math.max(nowMs - 7 * DAY, claimed)) : nowMs;

      items.push({
        challengeId,
        answer,
        keys: lib.wrongAnswerKeys(challenge, answer),
        context: lib.ACTIVITY_CONTEXTS.includes(item.context) ? item.context : 'lesson',
        final: item.final === true,
        at: new Date(at).toISOString()
      });
    }

    activity.captureZone(req, req.user, now);
    const result = items.length
      ? activity.recordMisses(req.user, items, now)
      : { accepted: 0, dropped: 0, today: learningDeps.lib.dayRow(activity.load(req.user, now), activity.todayFor(req.user, undefined, now)), misses: {} };

    res.json({ accepted: result.accepted, dropped: dropped + result.dropped, today: result.today, misses: result.misses });
  });

  return router;
}
