/**
 * A learner's own preferences: `PATCH /api/me/preferences`.
 *
 * Stored on the user row (`users[].preferences`, server/db.js), so they
 * survive a progress reset. Every field is nullable - null means "use the
 * default" - and the fields this route accepts grow by phase:
 *
 *   P2  soundOn     (true | false | null)
 *   P3  dailyGoalId (an enabled goal option's id | null)
 *       timeZone    (an IANA zone; a change inside
 *                    `streak.timeZoneChangeCooldownHours` of the last one is
 *                    not applied - and not an error: `applied.timeZone: false`)
 *
 * Validated in the style of the rest of the server: an early 400 `{ error }`
 * that names the field. A guest's choice travels in the merge body instead
 * and is adopted only where the account has none yet (`adoptGuestPreferences`).
 */
import express from 'express';

const passThrough = (_req, _res, next) => next();

/** The fields this build lets a learner set, in the order they are checked. */
export const PREFERENCE_FIELDS = ['soundOn', 'dailyGoalId', 'timeZone'];

const MINUTE = 60_000;

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
 * `{ error }` naming the first bad field. `rules` says which goal options
 * exist and what a valid zone is; without them (an older caller) only
 * `soundOn` can be checked, and the other fields are refused.
 *
 * @param {unknown} body
 * @param {{ isGoalAvailable?: (id: string) => boolean, isValidTimeZone?: (zone: unknown) => boolean }} [rules]
 */
export function parsePreferencesPatch(body, rules = {}) {
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
  if ('dailyGoalId' in body) {
    if (body.dailyGoalId === null) patch.dailyGoalId = null;
    else {
      const id = typeof body.dailyGoalId === 'string' ? body.dailyGoalId : '';
      if (!id || !rules.isGoalAvailable?.(id)) return { error: 'That goal is not available.' };
      patch.dailyGoalId = id;
    }
  }
  if ('timeZone' in body) {
    const zone = typeof body.timeZone === 'string' ? body.timeZone : '';
    if (!zone || !rules.isValidTimeZone?.(zone)) return { error: 'timeZone must be a time zone name such as "Asia/Kolkata".' };
    patch.timeZone = zone;
  }
  return { patch };
}

/**
 * A guest's preferences, carried in a merge body: only valid values, and
 * only where the account has none yet. Returns the fields to set, or null.
 * `rules.goals` (the effective `goals` settings) decides which goal ids are
 * valid; without it a guest's goal is not adopted.
 */
export function adoptGuestPreferences(accountPrefs, incoming, rules = {}) {
  const account = plainObject(accountPrefs);
  const guest = plainObject(incoming);
  const patch = {};
  if (typeof guest.soundOn === 'boolean' && (account.soundOn === null || account.soundOn === undefined)) patch.soundOn = guest.soundOn;
  if (
    typeof guest.dailyGoalId === 'string' &&
    (account.dailyGoalId === null || account.dailyGoalId === undefined) &&
    rules.goals &&
    rules.isGoalOptionAvailable?.(guest.dailyGoalId, rules.goals)
  ) {
    patch.dailyGoalId = guest.dailyGoalId;
  }
  return Object.keys(patch).length ? patch : null;
}

/**
 * Apply a zone change unless the last one was too recent (the same rule as
 * the `X-Time-Zone` capture in server/activity.js): a zone is taken on first
 * sight, and a different one only once the cooldown has passed. Returns the
 * preferences to store and whether the zone is now the one asked for.
 */
export function applyTimeZone(prefs, zone, { cooldownHours, now = new Date(), isValidTimeZone }) {
  if (prefs.timeZone === zone) return { prefs, applied: true };
  if (isValidTimeZone(prefs.timeZone)) {
    const setAt = Date.parse(prefs.timeZoneSetAt ?? '');
    if (Number.isFinite(setAt) && now.getTime() - setAt < cooldownHours * 60 * MINUTE) return { prefs, applied: false };
  }
  return { prefs: { ...prefs, timeZone: zone, timeZoneSetAt: now.toISOString() }, applied: true };
}

/**
 * @param {object} deps
 * @param {Function} deps.requireAuth
 * @param {(user) => object} deps.publicUser
 * @param {object} deps.store  server/db.js (findUserById, updateUser, normalizePreferences)
 * @param {Function} [deps.writeLimit]  the `write.account` rate limit
 * @param {{ lib, settings }} [deps.learningDeps]  read per request: the goal options, the zone cooldown
 */
export function createPreferencesRouter({ requireAuth, publicUser, store, writeLimit = passThrough, learningDeps = null }) {
  const router = express.Router();

  router.patch('/me/preferences', requireAuth, writeLimit, (req, res) => {
    const lib = learningDeps?.lib ?? null;
    const settings = learningDeps?.settings?.current() ?? null;
    const { patch, error } = parsePreferencesPatch(req.body, {
      isGoalAvailable: lib && settings ? (id) => lib.isGoalOptionAvailable(id, settings.goals) : undefined,
      isValidTimeZone: lib ? (zone) => lib.isValidTimeZone(zone) : undefined
    });
    if (error) return res.status(400).json({ error });
    const now = new Date();
    let next = { ...store.normalizePreferences(req.user.preferences) };
    let zoneApplied = false;
    const { timeZone, ...rest } = patch;
    next = { ...next, ...rest };
    if (timeZone !== undefined) {
      const result = applyTimeZone(next, timeZone, {
        cooldownHours: settings?.streak.timeZoneChangeCooldownHours ?? 20,
        now,
        isValidTimeZone: (zone) => Boolean(lib?.isValidTimeZone(zone))
      });
      next = result.prefs;
      zoneApplied = result.applied;
    }
    const updated = store.updateUser(req.user.id, { preferences: { ...next, updatedAt: now.toISOString() } });
    // A zone change inside its cooldown is not an error - the browser sends
    // its zone by itself and should not show one - it is just not applied.
    // `applied.timeZone` answers only a request that sent a zone.
    const applied = timeZone !== undefined ? { timeZone: zoneApplied } : {};
    res.json({ user: publicUser(updated ?? req.user), applied });
  });

  return router;
}
