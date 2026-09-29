/**
 * The weekly league's learner route (Phase 6).
 *
 *   GET /api/leagues/current   (the global optionalAuth)
 *     -> LeagueView (src/types LeagueView): the week the viewer's today is
 *        in, its board, the viewer's own place and last week's result.
 *        A guest may pass `?tz=<IANA zone>` to have "today" (and the
 *        countdown) in their own zone; it must be a valid zone name, else
 *        400. A signed-in learner's zone is their own, so `tz` is ignored.
 *        Weeks past their final time are closed first (server/leagues.js).
 *
 * `learningDeps` is read per request: server/index.js fills it in at boot,
 * after this router is mounted.
 */
import express from 'express';

/**
 * @param {object} deps
 * @param {{ lib, leagues }} deps.learningDeps
 */
export function createLeaguesRouter({ learningDeps }) {
  const router = express.Router();

  router.get('/leagues/current', (req, res) => {
    const { lib, leagues } = learningDeps;
    if (!lib || !leagues) return res.status(503).json({ error: 'The league is starting up. Try again in a moment.' });
    const raw = req.query?.tz;
    let tz = null;
    if (raw !== undefined && raw !== '') {
      if (typeof raw !== 'string' || !lib.isValidTimeZone(raw)) {
        return res.status(400).json({ error: 'tz must be a time zone name such as Asia/Kolkata.' });
      }
      tz = raw;
    }
    res.json(leagues.view(req.user ?? null, { tz, now: new Date() }));
  });

  return router;
}
