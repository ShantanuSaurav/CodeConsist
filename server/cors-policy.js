/**
 * Which other web sites may call this API from a browser.
 *
 * The app itself never needs CORS: it calls `/api` on its own origin, through
 * the Vercel rewrite in production and the Vite proxy in development. What
 * CORS decides is whether a page on ANOTHER site may read our answers, and -
 * through `foreignOriginGuard` - whether a write from another site is
 * accepted at all. `app.use(cors())` used to say yes to every site.
 *
 * The allow-list is the union of
 *   APP_ORIGIN (source 'APP_ORIGIN'), CORS_ORIGINS, comma-separated ('env'),
 *   the admin's `access.cors.extraOrigins` ('admin') and the Vite dev server
 *   on localhost:3000 / 127.0.0.1:3000 ('dev'),
 * plus the request's own host (a same-origin write, as `npm start` serves).
 *
 * `access.cors.mode`:
 *   open    - every origin, as before
 *   report  - (the default) foreign writes are recorded and let through, so
 *             the admin can see what would break before enforcing
 *   enforce - foreign writes are refused with 403
 * Recorded origins live in a ring of the last 100, in memory only.
 */
import cors from 'cors';

export const ALLOWED_HEADERS = ['Content-Type', 'Authorization', 'ngrok-skip-browser-warning', 'X-Time-Zone'];
const DEV_ORIGINS = ['http://localhost:3000', 'http://127.0.0.1:3000'];
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const RING_SIZE = 100;

/** `https://Example.com/` -> `https://example.com`; null for anything that is not one exact http(s) origin. */
export function toOrigin(raw) {
  if (typeof raw !== 'string') return null;
  const text = raw.trim().replace(/\/+$/, '');
  if (!/^https?:\/\/[^/?#*@]+$/i.test(text)) return null;
  try {
    const url = new URL(text);
    return url.pathname === '/' && !url.search && !url.hash ? url.origin : null;
  } catch {
    return null;
  }
}

/**
 * @param {object} deps
 * @param {() => 'open' | 'report' | 'enforce'} deps.getMode          read per request
 * @param {() => string[]} deps.getExtraOrigins                        read per request
 * @param {Record<string, string | undefined>} [deps.env]              APP_ORIGIN, CORS_ORIGINS
 * @param {() => number} [deps.now]
 */
export function createCorsPolicy({ getMode, getExtraOrigins = () => [], env = process.env, now = Date.now }) {
  const recent = new Map();

  const mode = () => {
    try {
      const value = getMode();
      return value === 'open' || value === 'enforce' ? value : 'report';
    } catch {
      return 'report';
    }
  };

  /** Every allowed origin with where it comes from, first source wins. */
  function allowedOrigins() {
    const out = new Map();
    const add = (raw, source) => {
      const origin = toOrigin(raw);
      if (origin && !out.has(origin)) out.set(origin, source);
    };
    add(env.APP_ORIGIN, 'APP_ORIGIN');
    for (const part of String(env.CORS_ORIGINS ?? '').split(',')) add(part, 'env');
    let extra = [];
    try {
      extra = getExtraOrigins() ?? [];
    } catch {
      extra = [];
    }
    for (const origin of Array.isArray(extra) ? extra : []) add(origin, 'admin');
    for (const origin of DEV_ORIGINS) add(origin, 'dev');
    return out;
  }

  /** Same host as this request: a page served by this very server (`npm start`). */
  function sameHost(origin, req) {
    try {
      return Boolean(req.headers.host) && new URL(origin).host === String(req.headers.host).toLowerCase();
    } catch {
      return false;
    }
  }

  function isAllowed(origin, req) {
    if (!origin) return true;
    if (mode() === 'open') return true;
    return allowedOrigins().has(toOrigin(origin) ?? origin) || sameHost(origin, req);
  }

  function record(origin, req, refused) {
    const key = String(origin).slice(0, 200);
    const entry = recent.get(key) ?? { origin: key, count: 0, firstAt: new Date(now()).toISOString() };
    entry.count += 1;
    entry.lastAt = new Date(now()).toISOString();
    entry.method = req.method;
    entry.path = String(req.path ?? req.originalUrl ?? '').slice(0, 120);
    entry.refused = refused;
    // Most recent last, so the oldest is the first to go.
    recent.delete(key);
    recent.set(key, entry);
    while (recent.size > RING_SIZE) recent.delete(recent.keys().next().value);
  }

  return {
    allowedOrigins,

    /** The CORS response headers: only for allowed origins (every origin in 'open'). */
    corsMiddleware() {
      return cors((req, callback) => {
        callback(null, {
          origin: isAllowed(req.headers.origin, req),
          allowedHeaders: ALLOWED_HEADERS,
          maxAge: 600
        });
      });
    },

    /**
     * Writes from a page on another site. A browser always sends `Origin` on
     * a cross-site POST, and a simple one (a form, text/plain) is sent even
     * without a preflight - so this, not the CORS headers, is what keeps
     * another site from acting as a signed-in learner's browser. Webhooks
     * and scripts send no `Origin` and pass.
     */
    foreignOriginGuard() {
      return (req, res, next) => {
        const origin = req.headers.origin;
        if (!origin || SAFE_METHODS.has(req.method) || !String(req.path ?? '').startsWith('/api/')) return next();
        const current = mode();
        if (current === 'open' || isAllowed(origin, req)) return next();
        const refuse = current === 'enforce';
        record(origin, req, refuse);
        if (!refuse) return next();
        return res.status(403).json({ error: 'Requests from that site are not allowed.', reason: 'origin-not-allowed' });
      };
    },

    /** For the admin's Limits & access page. */
    status() {
      return {
        mode: mode(),
        allowed: [...allowedOrigins()].map(([origin, source]) => ({ origin, source })),
        recent: [...recent.values()].reverse()
      };
    }
  };
}
