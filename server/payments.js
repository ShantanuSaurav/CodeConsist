/**
 * The payment gateway behind one-time purchases: Razorpay, or an explicit
 * test mode when no keys are configured.
 *
 * Server-side only. RAZORPAY_KEY_SECRET and RAZORPAY_WEBHOOK_SECRET come from
 * .env, are used for one Basic-auth header and two HMACs, and are never
 * logged, never returned to the browser and never part of a message. Only
 * the key id is public - the checkout script needs it.
 *
 * Test mode is never silent: `createOrder` hands out a `test_` id, but
 * `verifyCheckout` and `verifyWebhook` always answer false, so the only way
 * a test order becomes paid is the separate, clearly labelled
 * /api/billing/orders/:id/test-complete step (server/billing-routes.js).
 * Nothing in this file pretends to be a real signature.
 *
 * No SDK: one POST to /v1/orders and two HMAC checks are all the flow needs,
 * and a raw fetch keeps the dependency list unchanged.
 */
import crypto from 'node:crypto';

const ORDERS_URL = 'https://api.razorpay.com/v1/orders';
const TIMEOUT_MS = 20_000;
/** Razorpay rejects a receipt longer than this. Order ids are 16 chars, so this only guards a caller's mistake. */
const RECEIPT_MAX = 40;

/**
 * Anything that stops the gateway creating an order. `message` is written
 * for the learner (never a stack trace, never the secret) and `status` is
 * the HTTP status the route answers with - 502, the gateway failed.
 */
export class PaymentError extends Error {
  constructor(message, status = 502) {
    super(message);
    this.name = 'PaymentError';
    this.status = status;
  }
}

/**
 * @returns {{
 *   mode: 'razorpay' | 'test', keyId: string, configured: boolean,
 *   createOrder: Function, verifyCheckout: Function, verifyWebhook: Function
 * }}
 *   `createOrder({ amount, currency, receipt, notes })` -> { providerOrderId } or throws PaymentError.
 *   `verifyCheckout({ orderId, paymentId, signature })` -> boolean.
 *   `verifyWebhook(rawBody, signature)` -> boolean; the RAW request bytes, not a re-serialised body.
 */
export function createPaymentProvider({
  keyId = process.env.RAZORPAY_KEY_ID,
  keySecret = process.env.RAZORPAY_KEY_SECRET,
  webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET,
  fetchImpl = fetch
} = {}) {
  const id = String(keyId ?? '').trim();
  const secret = String(keySecret ?? '').trim();
  const whSecret = String(webhookSecret ?? '').trim();
  // Both halves or nothing: a key id without its secret cannot sign or
  // verify anything, so it would be a silent half-configuration.
  const configured = id.length > 0 && secret.length > 0;
  const mode = configured ? 'razorpay' : 'test';

  async function createOrder({ amount, currency, receipt, notes }) {
    if (!configured) return { providerOrderId: `test_${crypto.randomBytes(9).toString('base64url')}` };

    const body = {
      amount: Math.round(Number(amount)),
      currency: String(currency || 'INR'),
      receipt: String(receipt ?? '').slice(0, RECEIPT_MAX),
      notes: notes && typeof notes === 'object' ? notes : {}
    };

    let res;
    try {
      res = await fetchImpl(ORDERS_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString('base64')}`
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(TIMEOUT_MS)
      });
    } catch (err) {
      throw new PaymentError(`Razorpay could not create the order (${networkReason(err)}).`);
    }

    // Razorpay answers errors as JSON, but a proxy or outage may not.
    const json = await res.json().catch(() => null);
    if (!res.ok) {
      // Only their own one-line description, never the response verbatim -
      // an auth failure would otherwise echo the header we sent.
      const detail = String(json?.error?.description ?? '').split('\n')[0].trim().slice(0, 200);
      throw new PaymentError(`Razorpay could not create the order (${detail || `HTTP ${res.status}`}).`);
    }
    const providerOrderId = typeof json?.id === 'string' ? json.id : '';
    if (!providerOrderId) throw new PaymentError('Razorpay could not create the order (no order id in the reply).');
    return { providerOrderId };
  }

  /** Razorpay's checkout signature: HMAC-SHA256 of "<order_id>|<payment_id>" with the key secret. */
  function verifyCheckout({ orderId, paymentId, signature }) {
    if (!configured) return false;
    if (!orderId || !paymentId) return false;
    const expected = crypto.createHmac('sha256', secret).update(`${orderId}|${paymentId}`).digest('hex');
    return safeEqual(expected, signature);
  }

  /** Razorpay's webhook signature: HMAC-SHA256 of the raw body with the webhook secret. */
  function verifyWebhook(rawBody, signature) {
    if (!configured || !whSecret) return false;
    if (!Buffer.isBuffer(rawBody) && typeof rawBody !== 'string') return false;
    const expected = crypto.createHmac('sha256', whSecret).update(rawBody).digest('hex');
    return safeEqual(expected, signature);
  }

  return { mode, keyId: configured ? id : '', configured, createOrder, verifyCheckout, verifyWebhook };
}

/** Constant-time compare of two hex strings; a length mismatch is simply false, never a throw. */
function safeEqual(expectedHex, candidate) {
  if (typeof candidate !== 'string') return false;
  const a = Buffer.from(expectedHex, 'utf8');
  const b = Buffer.from(candidate.trim().toLowerCase(), 'utf8');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

/**
 * A short, secret-free reason for a failed connection. Only the timeout and
 * the OS error code are ever repeated: a raw fetch message can quote the
 * request headers, and one of those carries the key.
 */
function networkReason(err) {
  if (err?.name === 'TimeoutError' || err?.name === 'AbortError') return `timed out after ${TIMEOUT_MS / 1000} s`;
  const code = err?.cause?.code ?? err?.code;
  if (code) return String(code).slice(0, 40);
  return 'network error';
}
