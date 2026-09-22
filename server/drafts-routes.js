/**
 * Saved coding sessions, mounted at /api by server/index.js:
 *
 *   GET    /api/drafts                 every draft this learner has
 *   PUT    /api/drafts/:challengeId    save (or replace) one
 *   DELETE /api/drafts/:challengeId    throw one away
 *
 * The point of this file: what a learner typed used to live only in React
 * state, so closing the lesson, refreshing the tab or opening the app on
 * another machine threw the work away. Now it belongs to the account, and one
 * GET on sign-in brings all of it back.
 *
 * A draft is scoped to `req.user.id` and nothing else. There is no route here
 * that takes a user id, so there is no request one learner can make that
 * reads or writes another learner's code.
 */
import express from 'express';
import * as store from './db.js';

/**
 * The one place a solved lesson's draft is dropped, called by
 * /api/progress/solve on its success path. A solved lesson should reopen at
 * its starter code, not at the last thing the learner typed on the way to
 * getting it right.
 */
export function clearDraftForSolve(userId, challengeId) {
  return store.deleteDraft(userId, challengeId);
}

/**
 * @param {object} deps
 *   requireAuth - server/index.js's learner auth middleware (req.user).
 *   getChallengeMerged(id) - the SAME lookup /api/progress/solve uses, so a
 *     draft can only exist for a lesson this server actually serves.
 *   getProgress(userId) - server/db.js's, so "already solved" is decided here
 *     too and not only on the solve path.
 */
export function createDraftsRouter({ requireAuth, getChallengeMerged, getProgress = store.getProgress }) {
  const router = express.Router();

  /** The whole set in one call - a returning learner gets everything back at sign-in. */
  router.get('/drafts', requireAuth, (req, res) => {
    res.json({ drafts: store.getDrafts(req.user.id) });
  });

  router.put('/drafts/:challengeId', requireAuth, (req, res) => {
    const challengeId = String(req.params.challengeId);
    if (!getChallengeMerged(challengeId)) return res.status(404).json({ error: 'Unknown challenge.' });

    const code = req.body?.code;
    if (typeof code !== 'string') return res.status(400).json({ error: 'A draft needs its code as text.' });
    if (code.length > store.DRAFT_CODE_MAX) {
      // Name the limit: "too large" with no number is impossible to act on.
      return res.status(400).json({ error: `A draft can be at most ${store.DRAFT_CODE_MAX} characters.` });
    }
    const language = typeof req.body?.language === 'string' ? req.body.language.slice(0, 40) : null;

    // A solved lesson keeps no draft. The debounced save the learner's last
    // keystroke queued can easily land AFTER the solve that deleted it, and
    // then a solved lesson reopens at a half-finished attempt on the next
    // device. Enforced on the write too, so the order on the wire stops
    // mattering.
    if ((getProgress(req.user.id)?.completedChallenges ?? []).includes(challengeId)) {
      return res.json({ draft: null });
    }

    res.json({ draft: store.putDraft(req.user.id, challengeId, { code, language }) });
  });

  /** Idempotent: "there is no draft for this lesson" is the outcome either way. */
  router.delete('/drafts/:challengeId', requireAuth, (req, res) => {
    store.deleteDraft(req.user.id, String(req.params.challengeId));
    res.json({ ok: true });
  });

  return router;
}
