import { readFile } from 'node:fs/promises';
import { createSign } from 'node:crypto';

/** HTTP v1 only. Credentials live on the PC; never in the Android application. */
export function createPushTransport({ env = process.env, fetcher = fetch, now = Date.now } = {}) {
  let cached = null;
  const configured = () => Boolean(env.GOOGLE_APPLICATION_CREDENTIALS);
  async function credentials() {
    if (cached && cached.until > now()) return cached;
    const key = JSON.parse(await readFile(env.GOOGLE_APPLICATION_CREDENTIALS, 'utf8'));
    if (!key.project_id || !key.client_email || !key.private_key) throw new Error('Invalid Firebase service account.');
    const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
    const issued = Math.floor(now() / 1000);
    const unsigned = `${encode({ alg: 'RS256', typ: 'JWT' })}.${encode({ iss: key.client_email, scope: 'https://www.googleapis.com/auth/firebase.messaging', aud: 'https://oauth2.googleapis.com/token', iat: issued, exp: issued + 3600 })}`;
    const signature = createSign('RSA-SHA256').update(unsigned).sign(key.private_key, 'base64url');
    const response = await fetcher('https://oauth2.googleapis.com/token', { method: 'POST', signal: AbortSignal.timeout(15_000), headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${unsigned}.${signature}` }) });
    const result = await response.json();
    if (!response.ok || !result.access_token) throw new Error('Firebase authorization failed. Check the PC service account.');
    cached = { project: key.project_id, token: result.access_token, until: now() + 50 * 60_000 };
    return cached;
  }
  return {
    configured,
    async send(device, message) {
      if (!configured()) return { status: 'unconfigured' };
      try {
        const auth = await credentials();
        // Data-only allows the app to verify the recipient before showing private text.
        const response = await fetcher(`https://fcm.googleapis.com/v1/projects/${encodeURIComponent(auth.project)}/messages:send`, {
          method: 'POST', signal: AbortSignal.timeout(15_000), headers: { Authorization: `Bearer ${auth.token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: { token: device.token, data: { id: message.id, userId: message.userId, title: message.title, body: message.body, destination: message.destination }, android: { priority: 'HIGH', ttl: '86400s' } } })
        });
        if (response.ok) return { status: 'accepted' };
        const result = await response.json().catch(() => ({}));
        const code = result.error?.details?.find(item => item.errorCode)?.errorCode;
        if (code === 'UNREGISTERED') return { status: 'invalid' };
        if (response.status === 401) cached = null;
        return { status: response.status === 429 || response.status >= 500 || response.status === 401 || response.status === 403 ? 'retry' : 'failed', error: `FCM ${response.status}${code ? ` (${code})` : ''}` };
      } catch { return { status: 'retry', error: 'Push service unavailable or credentials invalid.' }; }
    }
  };
}
