/**
 * The learning rules an administrator can change without a redeploy.
 *
 * Defaults live in code (src/platform/settings/defaults.ts); db.json holds
 * only the admin's sparse overrides and a revision number
 * (server/db.js `settings`). The effective settings are the layers
 *
 *     defaults  ->  environment (keys with an `envVar`)  ->  overrides
 *
 * resolved by the shared, pure code in src/platform/settings (handed in as
 * `lib`, the compiled server-lib bundle), so the server validates with the
 * exact bounds the admin form shows.
 *
 * A stored override that stops validating after a code change (a tighter
 * bound, say) makes THAT section fall back to its defaults and is listed in
 * `adminView().issues` - the server never crashes on bad stored settings.
 */

const TEXT_CAP = 120;
const AUDIT_PATHS = 50;

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

/** An audit-friendly copy of a value: long text cut short, big lists summarised. */
function auditValue(value) {
  if (typeof value === 'string') return value.length > TEXT_CAP ? `${value.slice(0, TEXT_CAP)}…` : value;
  if (value === undefined) return null;
  const json = JSON.stringify(value);
  if (json && json.length > TEXT_CAP * 4) return `${json.slice(0, TEXT_CAP)}…`;
  return value;
}

/**
 * @param {object} deps
 * @param {object} deps.store  server/db.js (getSettingsRecord / setSettingsRecord)
 * @param {object} deps.lib    the compiled src/platform/server-lib.ts
 * @param {object} [deps.env]  process.env by default
 */
export function createSettingsService({ store, lib, env = process.env }) {
  let memo = null;

  /** Resolved once per revision (and per stored object), not per request. */
  function resolved() {
    const record = store.getSettingsRecord();
    if (memo && memo.revision === record.revision && memo.overrides === record.overrides) return memo;
    const { settings, issues } = lib.resolveSettings(record.overrides, env);
    memo = { revision: record.revision, overrides: record.overrides, settings, issues };
    return memo;
  }

  function current() {
    return resolved().settings;
  }

  function revision() {
    return store.getSettingsRecord().revision;
  }

  function get(path) {
    return lib.getPath(current(), path);
  }

  /**
   * A piece of site copy for a server-side message (a 429, the premium lock,
   * a missing compiler), with its `{tokens}` filled - the same text a
   * learner's browser shows. `key` is relative to the copy section
   * (`limits.tooMany`); `copy.limits.tooMany` works too.
   */
  function copyText(key, vars = {}) {
    const path = String(key).startsWith('copy.') ? String(key) : `copy.${key}`;
    const template = get(path);
    return typeof template === 'string' ? lib.fillCopy(template, vars) : '';
  }

  /** What `GET /api/settings` sends: everything except the admin-only sections. */
  function publicView() {
    const { revision: rev, settings } = resolved();
    return { revision: rev, settings: lib.publicSettings(settings) };
  }

  /**
   * The `GET /api/settings` ETag: the revision plus a fingerprint of what is
   * served. The revision alone is not enough - a default changed in code, or
   * an environment value, changes the rules without bumping it, and a
   * browser revalidating with the old tag would get a 304 and keep the old
   * rules. Computed once per resolved revision.
   */
  function publicTag() {
    const state = resolved();
    if (state.tag === undefined) {
      state.tag = `"r${state.revision}-${lib.settingsFingerprint(lib.publicSettings(state.settings))}"`;
    }
    return state.tag;
  }

  function adminView() {
    const record = store.getSettingsRecord();
    const { settings, issues } = resolved();
    return {
      settings,
      overrides: record.overrides,
      defaults: lib.defaultsWithEnv(env),
      revision: record.revision,
      updatedAt: record.updatedAt,
      updatedBy: record.updatedBy,
      issues,
      env: lib.envValues(env)
    };
  }

  /**
   * Apply an admin's patch. `revision` must be the one they edited (409
   * otherwise, so two admins cannot silently overwrite each other); every key
   * must be a setting (400) - except that `null` may remove any stored key,
   * known or not; and every section the patch touches must validate (422,
   * with each problem tied to its path). A stored value the patch does not
   * touch never blocks it: after a rollback, a key only the newer build knows
   * stays stored (and listed in `issues`) until an admin removes it.
   */
  function update({ revision: expected, patch, adminId = null }) {
    if (!isPlainObject(patch)) return { ok: false, status: 400, error: 'The patch must be an object of settings.' };
    if (!Number.isInteger(expected)) return { ok: false, status: 400, error: 'Send the revision you edited.' };

    const record = store.getSettingsRecord();
    if (expected !== record.revision) {
      return {
        ok: false,
        status: 409,
        error: `The settings were changed elsewhere (now revision ${record.revision}). Reload to see them.`,
        revision: record.revision
      };
    }

    const { overrides, changedPaths, unknownPaths } = lib.applySettingsPatch(record.overrides, patch);
    if (unknownPaths.length) {
      return { ok: false, status: 400, error: `Unknown setting "${unknownPaths[0]}"`, unknownPaths };
    }

    const base = lib.defaultsWithEnv(env);
    const merged = lib.mergeSettings(base, overrides);
    const issues = lib.patchIssues(patch, overrides, merged);
    if (issues.length) return { ok: false, status: 422, error: 'Some settings are not valid.', issues };

    const before = current();
    const now = new Date().toISOString();
    store.setSettingsRecord({ overrides, revision: record.revision + 1, updatedAt: now, updatedBy: adminId });
    memo = null;
    const after = current();

    const changes = {};
    for (const path of changedPaths.slice(0, AUDIT_PATHS)) {
      changes[path] = { from: auditValue(lib.getPath(before, path)), to: auditValue(lib.getPath(after, path)) };
    }
    return { ok: true, status: 200, view: adminView(), changes, changedPaths };
  }

  return { current, revision, get, copyText, publicView, publicTag, adminView, update };
}
