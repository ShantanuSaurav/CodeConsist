/**
 * Who sent a request - the one answer the access log, the per-address rate
 * limits and the OAuth state store all use.
 *
 * In production the chain is browser -> Vercel (vercel.json rewrite) ->
 * ngrok -> this server on loopback, so the socket address is always the
 * tunnel and the learner's address is in `X-Forwarded-For`. That header is
 * only as honest as the proxies that append to it: the leftmost entry is
 * whatever the client typed. So the address is decided by Express's
 * `trust proxy`, set to trust exactly the configured number of hops
 * (`access.network.trustProxyHops`), read per request so an admin change
 * applies to the next one:
 *
 *     X-Forwarded-For: client, vercelEgress   socket: 127.0.0.1
 *       hops 0 -> 127.0.0.1 (+ a forwarded header) -> null, "unknown"
 *       hops 1 -> vercelEgress
 *       hops 2 -> client
 *
 * Unknown is deliberate. A loopback or private socket address with a
 * forwarded header means the server sits behind a proxy it was not told to
 * trust; treating everyone as 127.0.0.1 would put every learner in one rate
 * limit bucket. Callers skip per-address checks for null (fail open) and the
 * admin page says why.
 */

/** `::ffff:203.0.113.9` -> `203.0.113.9`; anything that is not a string -> null. */
function normalizeAddress(address) {
  if (typeof address !== 'string' || !address) return null;
  const trimmed = address.trim();
  return trimmed.toLowerCase().startsWith('::ffff:') && trimmed.includes('.') ? trimmed.slice(7) : trimmed;
}

/** Loopback, RFC 1918, link-local and IPv6 unique-local/link-local addresses. */
export function isLoopbackOrPrivate(address) {
  const ip = normalizeAddress(address);
  if (!ip) return false;
  if (ip === '::1' || ip === '::' || ip === 'localhost') return true;
  const v4 = ip.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])];
    return a === 127 || a === 10 || a === 0 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 169 && b === 254);
  }
  const lower = ip.toLowerCase();
  return lower.startsWith('fc') || lower.startsWith('fd') || lower.startsWith('fe80');
}

/** How many hops to trust, from a live getter; anything odd means none. */
function readHops(getHops) {
  let hops;
  try {
    hops = Number(getHops());
  } catch {
    hops = 0;
  }
  return Number.isInteger(hops) && hops > 0 ? Math.min(hops, 10) : 0;
}

/**
 * For `app.set('trust proxy', ...)`. Express 5 calls it per request with each
 * address in the chain, nearest first (the socket is index 0), so trusting
 * index < hops means "the socket and the next hops-1 proxies".
 */
export function trustProxyFn(getHops) {
  return (_address, index) => index < readHops(getHops);
}

function forwardedFor(req) {
  const raw = req?.headers?.['x-forwarded-for'];
  const text = Array.isArray(raw) ? raw.join(',') : typeof raw === 'string' ? raw : '';
  return text
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
}

/** The client's address as the trusted proxies report it, or null when it cannot be known. */
export function clientIp(req) {
  const ip = normalizeAddress(req?.ip ?? req?.socket?.remoteAddress);
  if (!ip) return null;
  if (forwardedFor(req).length > 0 && isLoopbackOrPrivate(ip)) return null;
  return ip;
}

/**
 * What the admin's Limits & access page shows for their own request, so the
 * hop count can be checked against reality: the socket, the forwarded chain,
 * what Express derived with the current hops and whether it can be trusted.
 */
export function ipDiagnostics(req, hops) {
  const chain = forwardedFor(req);
  const socket = normalizeAddress(req?.socket?.remoteAddress);
  const derived = clientIp(req);
  const notes = [];
  if (chain.length > 0 && derived === null) {
    notes.push(
      'This request came through a proxy the server does not trust, so the address is unknown and per-address limits are skipped. Raise the trusted hops.'
    );
  }
  if (chain.length > 0 && hops > chain.length) {
    notes.push(
      `More hops are trusted (${hops}) than there are proxies in front of this request (${chain.length}), so the address shown could have been typed by the client. Lower the trusted hops.`
    );
  }
  if (chain.length === 0 && hops > 0) {
    notes.push('This request reached the server directly, with no proxy in front of it (a local request, or a request straight to the tunnel).');
  }
  return {
    socket,
    forwardedFor: chain,
    hops,
    derived,
    trustworthy: derived !== null && (chain.length === 0 || hops <= chain.length),
    notes
  };
}
