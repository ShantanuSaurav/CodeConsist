/**
 * A learner's own preferences: `PATCH /api/me/preferences`.
 *
 * Stored on the user row (`users[].preferences`, server/db.js), so they
 * survive a progress reset. Every field is nullable - null means "use the
 * default" - and the fields this route accepts grow by phase:
 *
 *   P2  soundOn (true | false | null)
 *
 * Validated in the style of the rest of the server: an early 400 `{ error }`
 * that names the field. A guest's choice travels in the merge body instead
 * and is adopted only where the account has none yet (`adoptGuestPreferences`).
 */
import express from 'express';

const passThrough = (_req, _res, next) => next();

/** The fields this build lets a learner set, in the order they are checked. */
export const PREFERENCE_FIELDS = ['soundOn'];

function plainObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

/** What `publicUser` sends: every preference except when the zone was set, which stays on the server. */
export function publicPreferences(prefs) {
  const p = plainObject(prefs);
  return {
    timeZone: p.timeZone ?? null,
    dailyGoalId: p.dailyGoalId ?? null,
    soundOn: typeof p.soundOn === 'boolean' ? p.soundOn : null,
    trackId: p.trackId ?? null,
    learningMode: p.learningMode ?? null,
    motivation: p.motivation ?? null,
    experience: p.experience ?? null,
    updatedAt: p.updatedAt ?? null
  };
}

/**
 * Check a patch. Returns `{ patch }` (only the fields sent, cleaned) or
 * `{ error }` naming the first bad field.
 */
export function parsePreferencesPatch(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { error: 'Send the preferences to change as an object.' };
  const keys = Object.keys(body);
  const unknown = keys.find((key) => !PREFERENCE_FIELDS.includes(key));
  if (unknown !== undefined) return { error: `"${unknown}" is not a preference that can be changed here.` };
  if (keys.length === 0) return { error: 'Send at least one preference to change.' };
  const patch = {};
  if ('soundOn' in body) {
    if (body.soundOn !== null && typeof body.soundOn !== 'boolean') return { error: 'soundOn must be true, false or null.' };
    patch.soundOn = body.soundOn;
  }
  return { patch };
}

/**
 * A guest's preferences, carried in a merge body: only valid values, and
 * only where the account has none yet. Returns the fields to set, or null.
 */
export function adoptGuestPreferences(accountPrefs, incoming) {
  const account = plainObject(accountPrefs);
  const guest = plainObject(incoming);
  const patch = {};
  if (typeof guest.soundOn === 'boolean' && (account.soundOn === null || account.soundOn === undefined)) patch.soundOn = guest.soundOn;
  return Object.keys(patch).length ? patch : null;
}

/**
 * @param {object} deps
 * @param {Function} deps.requireAuth
 * @param {(user) => object} deps.publicUser
 * @param {object} deps.store  server/db.js (findUserById, updateUser, normalizePreferences)
 * @param {Function} [deps.writeLimit]  the `write.account` rate limit
 */
export function createPreferencesRouter({ requireAuth, publicUser, store, writeLimit = passThrough }) {
  const router = express.Router();

  router.patch('/me/preferences', requireAuth, writeLimit, (req, res) => {
    const { patch, error } = parsePreferencesPatch(req.body);
    if (error) return res.status(400).json({ error });
    const current = store.normalizePreferences(req.user.preferences);
    const updated = store.updateUser(req.user.id, {
      preferences: { ...current, ...patch, updatedAt: new Date().toISOString() }
    });
    // A time-zone change inside its cooldown is not an error (a later phase
    // accepts `timeZone` here); nothing in this phase applies one.
    res.json({ user: publicUser(updated ?? req.user), applied: { timeZone: false } });
  });

  return router;
}
