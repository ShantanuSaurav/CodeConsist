import crypto from 'node:crypto';

export function sessionId(payload) {
  return payload.jti || `legacy-${crypto.createHash('sha256').update(`${payload.sub}:${payload.iat}:${payload.exp}:${payload.tv ?? 0}`).digest('hex').slice(0, 32)}`;
}

export function clientDescription(req) {
  const ua = String(req.get('user-agent') || '').slice(0, 300);
  const client = String(req.get('x-codeconsist-client') || '').toLowerCase();
  if (client === 'android') return { platform: 'Android app', browser: 'Native app' };
  if (client === 'ios') return { platform: 'iOS app', browser: 'Native app' };
  const platform = /Android|iPhone|iPad|Mobile/i.test(ua) ? 'Mobile web' : /Mozilla/i.test(ua) ? 'Desktop web' : 'Other client';
  const browser = /Edg\//.test(ua) ? 'Edge' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : 'Unknown browser';
  return { platform, browser };
}

/** Reported device labels are descriptive only; never an authorization signal. */
export function touchSession(user, payload, req, now = Date.now()) {
  const sessions = Array.isArray(user.sessions) ? user.sessions : [];
  const id = sessionId(payload);
  let row = sessions.find(item => item.id === id);
  if (row && now - Date.parse(row.lastSeenAt) < 60_000) return false;
  if (!row) {
    row = { id, ...clientDescription(req), signedInAt: new Date((payload.iat || now / 1000) * 1000).toISOString(), expiresAt: new Date(payload.exp * 1000).toISOString(), tokenVersion: payload.tv ?? 0, signedOutAt: null };
    sessions.push(row);
  }
  row.lastSeenAt = new Date(now).toISOString();
  // Retain active sessions and a bounded recent history; never store bearer tokens.
  user.sessions = sessions.sort((a,b) => b.lastSeenAt.localeCompare(a.lastSeenAt)).filter((item,index) => Date.parse(item.expiresAt) > now || index < 100);
  return true;
}

export function sessionRows(user, now = Date.now()) {
  return (Array.isArray(user.sessions) ? user.sessions : []).map(({ id, platform, browser, signedInAt, lastSeenAt, expiresAt, signedOutAt, tokenVersion }) => ({
    id, platform, browser, signedInAt, lastSeenAt, expiresAt,
    status: signedOutAt ? 'Signed out' : tokenVersion !== (user.tokenVersion ?? 0) ? 'Session reset' : Date.parse(expiresAt) <= now ? 'Expired' : now - Date.parse(lastSeenAt) < 120_000 ? 'Recently active' : 'Signed in',
  })).sort((a,b) => b.lastSeenAt.localeCompare(a.lastSeenAt));
}
