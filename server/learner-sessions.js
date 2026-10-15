import crypto from 'node:crypto';
import { friendlyDeviceName } from './device-names.js';

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
  const deviceName=friendlyDeviceName(req);
  if (row && row.deviceName===deviceName && now - Date.parse(row.lastSeenAt) < 60_000) return false;
  if (!row) {
    row = { id, ...clientDescription(req), signedInAt: new Date((payload.iat || now / 1000) * 1000).toISOString(), expiresAt: new Date(payload.exp * 1000).toISOString(), tokenVersion: payload.tv ?? 0, signedOutAt: null };
    sessions.push(row);
  }
  row.deviceName=deviceName;
  row.lastSeenAt = new Date(now).toISOString();
  // Retain active sessions and a bounded recent history; never store bearer tokens.
  user.sessions = sessions.sort((a,b) => b.lastSeenAt.localeCompare(a.lastSeenAt)).filter((item,index) => Date.parse(item.expiresAt) > now || index < 100);
  return true;
}

export function sessionRows(user, now = Date.now(), currentId = null) {
  return (Array.isArray(user.sessions) ? user.sessions : []).map(({ id, deviceName, platform, browser, signedInAt, lastSeenAt, expiresAt, signedOutAt, tokenVersion }) => ({
    id, deviceName:deviceName||platform, platform, browser, signedInAt, lastSeenAt, expiresAt,
    current:id===currentId,
    active:!signedOutAt && tokenVersion===(user.tokenVersion??0) && Date.parse(expiresAt)>now,
    status: signedOutAt ? 'Signed out' : tokenVersion !== (user.tokenVersion ?? 0) ? 'Session reset' : Date.parse(expiresAt) <= now ? 'Expired' : now - Date.parse(lastSeenAt) < 120_000 ? 'Recently active' : 'Signed in',
  })).sort((a,b) => b.lastSeenAt.localeCompare(a.lastSeenAt));
}

export function revokeDeviceSession(user, id, now=Date.now()) {
  const row=user.sessions?.find(s=>s.id===id);
  if(!row)return null;
  row.signedOutAt ||= new Date(now).toISOString();
  return row;
}
/** Version invalidation also covers older tokens which have never reported a device. */
export function revokeAllDeviceSessions(user, now=Date.now()) {
  const rows=sessionRows(user,now).filter(s=>s.active);
  for(const s of user.sessions??[]) s.signedOutAt ||= new Date(now).toISOString();
  user.tokenVersion=(Number.isInteger(user.tokenVersion)?user.tokenVersion:0)+1;
  return rows.length;
}
