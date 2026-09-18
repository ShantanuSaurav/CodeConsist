/**
 * Public API of the admin module.
 *
 * Owns: the administrator console under /admin - its own sign-in (Admin User
 * ID + password, a separate credential system from learner accounts), its own
 * token, and pages for users, languages, stages, challenges, analytics, the
 * audit log, the optional Excel mirror and credential changes.
 *
 * Talks only to /api/admin-auth/* and /api/admin/*, every route of which the
 * server re-checks against the live admin record (server/admin-auth.js).
 * Nothing here is a security boundary; it is the client of the one that is.
 *
 * Loaded as its own chunk only when someone opens /admin - the learner app
 * never pays for it.
 */
export { AdminApp } from './AdminApp';
