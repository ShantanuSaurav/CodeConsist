/**
 * The settings store over HTTP.
 *
 *   GET /api/settings        - public, no auth: every learner-facing section,
 *                              with `ETag: "r<revision>"`. Learners refetch
 *                              when `/api/health` (or a solve) reports a
 *                              different `settingsRevision`.
 *   GET /api/admin/settings  - the admin view: effective, overrides, defaults,
 *                              issues, environment values.
 *   PUT /api/admin/settings  - `{ revision, patch }`, sparse; `null` resets.
 *   GET /api/admin/settings/context - facts the admin page needs to judge a
 *                              change (content totals, runtimes, learner XP).
 *
 * The admin router is mounted INSIDE createAdminRouter (server/admin.js),
 * after its `requireAdminAuth`, so it is behind exactly the same gate as
 * every other admin route. It answers 503 when the service is not there yet
 * (before bootstrap, or in a test that does not provide it).
 */
import express from 'express';

/** @param {{ getService: () => ReturnType<import('./settings.js').createSettingsService> | null }} deps */
export function createSettingsRouter({ getService }) {
  const router = express.Router();

  router.get('/settings', (_req, res) => {
    const service = getService();
    if (!service) return res.status(503).json({ error: 'Settings are not available yet. Try again in a moment.' });
    const view = service.publicView();
    // Express answers a matching If-None-Match with a 304 on its own once the
    // ETag is set; no-cache makes browsers ask every time.
    res.set('ETag', `"r${view.revision}"`);
    res.set('Cache-Control', 'no-cache');
    res.json(view);
  });

  return router;
}

/**
 * @param {object} deps
 * @param {() => object | null} deps.getService  the settings service, read per request
 * @param {(req, action, target, details) => void} deps.audit  the admin router's audit writer
 * @param {() => object} [deps.getContext]  builds `GET /settings/context`
 */
export function createSettingsAdminRouter({ getService, audit, getContext }) {
  const router = express.Router();

  const withService = (handler) => (req, res) => {
    const service = getService();
    if (!service) return res.status(503).json({ error: 'The settings service is not available yet.' });
    return handler(service, req, res);
  };

  router.get(
    '/settings',
    withService((service, _req, res) => {
      res.json(service.adminView());
    })
  );

  router.put(
    '/settings',
    withService((service, req, res) => {
      const body = req.body ?? {};
      const result = service.update({ revision: body.revision, patch: body.patch, adminId: req.admin?.userId ?? null });
      if (!result.ok) {
        const payload = { error: result.error };
        if (result.issues) payload.issues = result.issues;
        if (result.revision !== undefined) payload.revision = result.revision;
        return res.status(result.status).json(payload);
      }
      // Only paths and values of rules - there is nothing secret in settings.
      audit(req, 'settings.update', 'settings', { revision: result.view.revision, changes: result.changes });
      res.json(result.view);
    })
  );

  router.get(
    '/settings/context',
    withService((_service, _req, res) => {
      res.json(getContext ? getContext() : { content: null, runtime: null, levels: { learnerXp: [] } });
    })
  );

  return router;
}
