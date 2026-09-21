/**
 * Optional Microsoft Excel sync, via the Microsoft Graph API.
 *
 *   CodeConsist's own database (server/db.js) --> Microsoft Graph --> an Excel
 *   table, in a workbook that already lives in OneDrive/SharePoint.
 *
 * CodeConsist's local JSON database is ALWAYS the source of truth. Excel is a
 * downstream, best-effort mirror an admin can look at - never something the
 * app reads from, and never a replacement for signing in or for progress.
 * Every function here is written to make that true even when Microsoft is
 * unreachable, misconfigured, or simply not set up:
 *
 *   - Nothing in this file is imported by the auth or progress routes
 *     directly; they call `syncUser(...)`, which NEVER throws and NEVER
 *     blocks - it is always fire-and-forget from the caller's perspective.
 *   - A failure is caught, recorded to db.json (server/db.js's `excelSync`
 *     state) with a human-readable reason, and left for the admin to retry
 *     from /admin/excel - it never surfaces to the person signing up.
 *   - `EXCEL_CONFIGURED` is false unless every required credential is
 *     present, exactly like the existing Judge0 integration
 *     (server/index.js) - the same "degrade honestly, never fake it"
 *     pattern used everywhere else in this app.
 *   - Every call site that calls `syncUser` (server/index.js's signup/login/
 *     progress routes, and the admin sync-all/retry routes below) only ever
 *     passes a LEARNER user object from `store.allUsers()`/`store.findUserById`.
 *     The administrator record lives entirely outside `users` (see
 *     server/db.js's separate `admin` field) and is never passed to any
 *     function in this file - there is no code path that could sync it,
 *     not just a column filtered out below.
 *
 * Setup (see .env.example): an admin creates an Azure AD app registration
 * with an application (client-credentials) permission of
 * `Files.ReadWrite.All`, grants admin consent, and creates a plain Excel
 * table (Insert > Table) in a worksheet of a workbook stored in OneDrive or
 * a SharePoint document library, with a header row matching COLUMNS below.
 * This module fills that table in; it does not create the workbook, the
 * worksheet or the table for you - provisioning the destination is a
 * one-time, human step, and guessing at ranges to auto-create a table is a
 * good way to silently corrupt a workbook someone is also looking at.
 */

const TENANT_ID = process.env.MICROSOFT_TENANT_ID;
const CLIENT_ID = process.env.MICROSOFT_CLIENT_ID;
const CLIENT_SECRET = process.env.MICROSOFT_CLIENT_SECRET;
const DRIVE_ID = process.env.MICROSOFT_EXCEL_DRIVE_ID;
const WORKBOOK_ITEM_ID = process.env.MICROSOFT_EXCEL_WORKBOOK_ID;
const WORKSHEET_NAME = process.env.MICROSOFT_EXCEL_WORKSHEET_NAME || 'Users';
const TABLE_NAME = process.env.MICROSOFT_EXCEL_TABLE_NAME || 'Users';

const PLACEHOLDER_RE = /^(your[-_]|replace[-_]|xxx)/i;
const looksReal = (v) => Boolean(v) && !PLACEHOLDER_RE.test(v);

export const EXCEL_CONFIGURED = Boolean(
  looksReal(TENANT_ID) &&
    looksReal(CLIENT_ID) &&
    looksReal(CLIENT_SECRET) &&
    looksReal(DRIVE_ID) &&
    looksReal(WORKBOOK_ITEM_ID)
);

export function excelSettingsSummary() {
  // Never the secret. Just enough for an admin to tell what is/isn't wired up.
  return {
    configured: EXCEL_CONFIGURED,
    tenantConfigured: looksReal(TENANT_ID),
    clientConfigured: looksReal(CLIENT_ID) && looksReal(CLIENT_SECRET),
    workbookConfigured: looksReal(DRIVE_ID) && looksReal(WORKBOOK_ITEM_ID),
    worksheetName: WORKSHEET_NAME,
    tableName: TABLE_NAME
  };
}

/* ------------------------------------------------------------------ token */

let cachedToken = null; // { accessToken, expiresAt }

async function getAccessToken() {
  if (cachedToken && cachedToken.expiresAt - Date.now() > 60_000) return cachedToken.accessToken;

  const url = `https://login.microsoftonline.com/${encodeURIComponent(TENANT_ID)}/oauth2/v2.0/token`;
  const body = new URLSearchParams({
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    scope: 'https://graph.microsoft.com/.default',
    grant_type: 'client_credentials'
  });

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`Microsoft sign-in failed (${res.status}): ${data.error_description || data.error || 'unknown error'}`);
  }
  cachedToken = { accessToken: data.access_token, expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000 };
  return cachedToken.accessToken;
}

/* -------------------------------------------------------------- graph api */

const GRAPH = 'https://graph.microsoft.com/v1.0';
const workbookBase = () => `${GRAPH}/drives/${encodeURIComponent(DRIVE_ID)}/items/${encodeURIComponent(WORKBOOK_ITEM_ID)}/workbook`;
const tablePath = (suffix = '') =>
  `${workbookBase()}/worksheets('${encodeURIComponent(WORKSHEET_NAME)}')/tables('${encodeURIComponent(TABLE_NAME)}')${suffix}`;

async function graphFetch(path, options = {}) {
  const token = await getAccessToken();
  const res = await fetch(path, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(options.headers ?? {})
    }
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const message = data?.error?.message || `Graph request failed (${res.status})`;
    throw new Error(message);
  }
  return data;
}

/**
 * The row shape, in column order. Deliberately excludes anything secret or
 * sensitive: no password, no password hash, no JWT, no auth token, no raw
 * per-challenge history - just the same summary an admin could already see
 * on the Users page. There is also no "Role"/administrator column: this
 * table mirrors learner accounts only, and this function is never called
 * with anything but one (see the module doc comment above).
 */
const COLUMNS = [
  'User ID',
  'Username',
  'Email',
  'Signup Date',
  'Last Active',
  'XP',
  'Level',
  'Streak',
  'Stages Completed',
  'Challenges Completed',
  'Is Premium'
];

function rowValues(user, progress) {
  return [
    [
      user.id,
      user.username,
      user.email,
      user.createdAt ?? '',
      progress?.lastActiveDay ?? '',
      progress?.xp ?? 0,
      progress?.level ?? 1,
      progress?.streak ?? 0,
      (progress?.completedStages ?? []).length,
      (progress?.completedChallenges ?? []).length,
      Boolean(user.isPremium)
    ]
  ];
}

/** Read-only: confirms the app can reach Graph and the table actually exists. */
export async function testConnection() {
  if (!EXCEL_CONFIGURED) {
    return { ok: false, message: 'Microsoft Excel sync is not configured. Set the MICROSOFT_* variables in .env to enable it.' };
  }
  try {
    const table = await graphFetch(tablePath());
    return {
      ok: true,
      message: `Connected. Found table "${table.name}" in worksheet "${WORKSHEET_NAME}".`
    };
  } catch (err) {
    return { ok: false, message: err.message };
  }
}

async function findRowIndex(userId, store) {
  const cached = store.getExcelSync().rowIndexByUserId[userId];
  if (typeof cached === 'number') return cached;

  // Not cached (first sync, or the server restarted): read the User ID
  // column once and search it, rather than guessing.
  const idColumn = await graphFetch(`${tablePath(`/columns('${encodeURIComponent(COLUMNS[0])}')/range`)}`);
  const values = idColumn?.values ?? [];
  for (let i = 1; i < values.length; i++) {
    if (String(values[i]?.[0]) === userId) return i - 1; // row index excludes the header
  }
  return -1;
}

/**
 * Upsert one user's row. Never throws - every failure is caught, recorded via
 * `store.recordExcelFailure`, and swallowed, because nothing in the signup,
 * login or progress path may ever fail because Excel is unavailable.
 */
export async function syncUser(store, user, progress, reason = 'update') {
  if (!EXCEL_CONFIGURED) return { ok: false, skipped: true };

  try {
    const index = await findRowIndex(user.id, store);
    if (index >= 0) {
      await graphFetch(tablePath(`/rows/itemAt(index=${index})`), {
        method: 'PATCH',
        body: JSON.stringify({ values: rowValues(user, progress) })
      });
      store.setExcelRowIndex(user.id, index);
    } else {
      await graphFetch(tablePath('/rows/add'), {
        method: 'POST',
        body: JSON.stringify({ values: rowValues(user, progress) })
      });
      // The row we just appended is the new last row of the table.
      const rows = await graphFetch(tablePath('/rows?$select=index'));
      const newIndex = Math.max(0, (rows?.value?.length ?? 1) - 1);
      store.setExcelRowIndex(user.id, newIndex);
    }
    store.markExcelSynced(user.id);
    return { ok: true };
  } catch (err) {
    store.recordExcelFailure({ userId: user.id, username: user.username, reason, error: err.message });
    console.error(`[excel] sync failed for ${user.username} (${reason}):`, err.message);
    return { ok: false, error: err.message };
  }
}

/** Throttle: skip a login-triggered sync if this user synced very recently. */
export function shouldThrottle(store, userId, minGapMs = 5 * 60_000) {
  const last = store.getExcelSync().lastSyncedAtByUser[userId];
  if (!last) return false;
  return Date.now() - new Date(last).getTime() < minGapMs;
}

/** Admin action: resync every user, sequentially (small local user bases only). */
export async function syncAllUsers(store) {
  if (!EXCEL_CONFIGURED) return { ok: false, message: 'Not configured.', synced: 0, failed: 0 };
  const users = store.allUsers();
  let synced = 0;
  let failed = 0;
  for (const user of users) {
    const progress = store.getProgress(user.id);
    const result = await syncUser(store, user, progress, 'manual-sync-all');
    if (result.ok) synced++;
    else if (!result.skipped) failed++;
  }
  store.setExcelFullSyncAt(new Date().toISOString());
  return { ok: true, synced, failed, total: users.length };
}

/** Admin action: retry only the users that failed last time. */
export async function retryFailed(store) {
  if (!EXCEL_CONFIGURED) return { ok: false, message: 'Not configured.', retried: 0, stillFailing: 0 };
  const failures = [...store.getExcelSync().failures];
  let retried = 0;
  let stillFailing = 0;
  for (const failure of failures) {
    const user = store.findUserById(failure.userId);
    if (!user) continue; // deleted since the failure was recorded
    const progress = store.getProgress(user.id);
    const result = await syncUser(store, user, progress, 'retry');
    if (result.ok) retried++;
    else stillFailing++;
  }
  return { ok: true, retried, stillFailing };
}
