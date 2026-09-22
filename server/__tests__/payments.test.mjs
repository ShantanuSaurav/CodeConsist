/**
 * The payment provider with a stubbed fetch: test mode never pretends to
 * be a real signature, the Razorpay order request carries the right auth
 * and body, every error is a plain message that never quotes the secret,
 * and the two HMAC checks accept exactly one signature each.
 */
import crypto from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { PaymentError, createPaymentProvider } from '../payments.js';

const KEY_ID = 'rzp_test_abc123';
const SECRET = 'super-secret-key';
const WEBHOOK_SECRET = 'hook-secret';

const reply = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
const live = (overrides = {}) =>
  createPaymentProvider({ keyId: KEY_ID, keySecret: SECRET, webhookSecret: WEBHOOK_SECRET, fetchImpl: vi.fn(), ...overrides });
const hmac = (secret, text) => crypto.createHmac('sha256', secret).update(text).digest('hex');

describe('test mode (no keys)', () => {
  it('reports mode test, an empty public key id and not configured', () => {
    const p = createPaymentProvider({ keyId: undefined, keySecret: undefined, webhookSecret: undefined });
    expect(p.mode).toBe('test');
    expect(p.keyId).toBe('');
    expect(p.configured).toBe(false);
  });

  it('needs BOTH halves of the key pair to count as configured', () => {
    expect(createPaymentProvider({ keyId: KEY_ID, keySecret: '' }).mode).toBe('test');
    expect(createPaymentProvider({ keyId: '', keySecret: SECRET }).mode).toBe('test');
    expect(createPaymentProvider({ keyId: '  ', keySecret: '  ' }).keyId).toBe('');
  });

  it('hands out test_ order ids without touching the network', async () => {
    const fetchImpl = vi.fn();
    const p = createPaymentProvider({ keyId: '', keySecret: '', fetchImpl });
    const a = await p.createOrder({ amount: 49900, currency: 'INR', receipt: 'ord_x', notes: {} });
    const b = await p.createOrder({ amount: 49900, currency: 'INR', receipt: 'ord_y', notes: {} });
    expect(a.providerOrderId).toMatch(/^test_[A-Za-z0-9_-]+$/);
    expect(b.providerOrderId).not.toBe(a.providerOrderId);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('never verifies a checkout or a webhook - even a "correct" HMAC is refused', () => {
    const p = createPaymentProvider({ keyId: '', keySecret: '', webhookSecret: WEBHOOK_SECRET });
    expect(p.verifyCheckout({ orderId: 'o', paymentId: 'p', signature: hmac('', 'o|p') })).toBe(false);
    expect(p.verifyCheckout({ orderId: 'o', paymentId: 'p', signature: hmac(SECRET, 'o|p') })).toBe(false);
    expect(p.verifyWebhook('{}', hmac(WEBHOOK_SECRET, '{}'))).toBe(false);
  });
});

describe('createOrder against Razorpay', () => {
  it('POSTs /v1/orders with Basic auth from id:secret and the amount, currency, receipt and notes', async () => {
    const fetchImpl = vi.fn(async () => reply(200, { id: 'order_R1', amount: 49900 }));
    const p = live({ fetchImpl });
    expect(p.mode).toBe('razorpay');
    expect(p.keyId).toBe(KEY_ID);

    const result = await p.createOrder({ amount: 49900, currency: 'INR', receipt: 'ord_abc', notes: { userId: 'u1', productKey: 'stage:stage-10' } });
    expect(result).toEqual({ providerOrderId: 'order_R1' });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe('https://api.razorpay.com/v1/orders');
    expect(init.method).toBe('POST');
    expect(init.headers.Authorization).toBe(`Basic ${Buffer.from(`${KEY_ID}:${SECRET}`).toString('base64')}`);
    expect(init.headers['Content-Type']).toBe('application/json');
    expect(init.signal).toBeInstanceOf(AbortSignal);
    expect(JSON.parse(init.body)).toEqual({
      amount: 49900,
      currency: 'INR',
      receipt: 'ord_abc',
      notes: { userId: 'u1', productKey: 'stage:stage-10' }
    });
  });

  it('truncates a receipt to 40 characters', async () => {
    const fetchImpl = vi.fn(async () => reply(200, { id: 'order_R2' }));
    await live({ fetchImpl }).createOrder({ amount: 1, currency: 'INR', receipt: 'r'.repeat(60), notes: {} });
    expect(JSON.parse(fetchImpl.mock.calls[0][1].body).receipt).toHaveLength(40);
  });

  it('maps a non-2xx answer to a PaymentError with their one-line description and never the secret', async () => {
    const fetchImpl = vi.fn(async () =>
      reply(401, { error: { code: 'BAD_REQUEST_ERROR', description: 'Authentication failed\nsecond line that is not repeated' } })
    );
    const err = await live({ fetchImpl }).createOrder({ amount: 1, currency: 'INR', receipt: 'r', notes: {} }).catch((e) => e);
    expect(err).toBeInstanceOf(PaymentError);
    expect(err.status).toBe(502);
    expect(err.message).toBe('Razorpay could not create the order (Authentication failed).');
    expect(err.message).not.toContain(SECRET);
    expect(err.message).not.toContain(Buffer.from(`${KEY_ID}:${SECRET}`).toString('base64'));
  });

  it('falls back to the HTTP status when the error body is not JSON', async () => {
    const fetchImpl = vi.fn(async () => ({ ok: false, status: 503, json: async () => { throw new Error('not json'); } }));
    const err = await live({ fetchImpl }).createOrder({ amount: 1, currency: 'INR', receipt: 'r', notes: {} }).catch((e) => e);
    expect(err).toBeInstanceOf(PaymentError);
    expect(err.message).toBe('Razorpay could not create the order (HTTP 503).');
    expect(err.message).not.toContain(SECRET);
  });

  it('turns a network failure into a short, secret-free reason', async () => {
    const boom = new Error(`connect failed: Authorization: Basic ${Buffer.from(`${KEY_ID}:${SECRET}`).toString('base64')}`);
    boom.cause = { code: 'ECONNREFUSED' };
    const fetchImpl = vi.fn(async () => { throw boom; });
    const err = await live({ fetchImpl }).createOrder({ amount: 1, currency: 'INR', receipt: 'r', notes: {} }).catch((e) => e);
    expect(err).toBeInstanceOf(PaymentError);
    expect(err.message).toBe('Razorpay could not create the order (ECONNREFUSED).');
    expect(err.message).not.toContain(SECRET);
    expect(err.message).not.toContain('Basic');

    const timeout = Object.assign(new Error('The operation was aborted'), { name: 'TimeoutError' });
    const slow = vi.fn(async () => { throw timeout; });
    const err2 = await live({ fetchImpl: slow }).createOrder({ amount: 1, currency: 'INR', receipt: 'r', notes: {} }).catch((e) => e);
    expect(err2.message).toBe('Razorpay could not create the order (timed out after 20 s).');
  });

  it('refuses a 2xx answer with no order id', async () => {
    const fetchImpl = vi.fn(async () => reply(200, {}));
    const err = await live({ fetchImpl }).createOrder({ amount: 1, currency: 'INR', receipt: 'r', notes: {} }).catch((e) => e);
    expect(err).toBeInstanceOf(PaymentError);
  });
});

describe('verifyCheckout', () => {
  it('accepts exactly the HMAC-SHA256 of "<order>|<payment>" with the key secret', () => {
    const p = live();
    const good = hmac(SECRET, 'order_R1|pay_P1');
    expect(p.verifyCheckout({ orderId: 'order_R1', paymentId: 'pay_P1', signature: good })).toBe(true);
    expect(p.verifyCheckout({ orderId: 'order_R1', paymentId: 'pay_P1', signature: good.toUpperCase() })).toBe(true);
  });

  it('rejects a wrong signature, a wrong length, a wrong secret and missing ids', () => {
    const p = live();
    const good = hmac(SECRET, 'order_R1|pay_P1');
    const flipped = (good[0] === 'a' ? 'b' : 'a') + good.slice(1);
    expect(p.verifyCheckout({ orderId: 'order_R1', paymentId: 'pay_P1', signature: flipped })).toBe(false);
    expect(p.verifyCheckout({ orderId: 'order_R1', paymentId: 'pay_P1', signature: good.slice(0, -2) })).toBe(false);
    expect(p.verifyCheckout({ orderId: 'order_R1', paymentId: 'pay_P1', signature: '' })).toBe(false);
    expect(p.verifyCheckout({ orderId: 'order_R1', paymentId: 'pay_P1', signature: undefined })).toBe(false);
    expect(p.verifyCheckout({ orderId: 'order_R1', paymentId: 'pay_P1', signature: hmac('other', 'order_R1|pay_P1') })).toBe(false);
    expect(p.verifyCheckout({ orderId: 'order_R2', paymentId: 'pay_P1', signature: good })).toBe(false);
    expect(p.verifyCheckout({ orderId: '', paymentId: 'pay_P1', signature: good })).toBe(false);
  });
});

describe('verifyWebhook', () => {
  it('checks the HMAC of the RAW body with the webhook secret, as a Buffer or a string', () => {
    const p = live();
    const raw = Buffer.from('{"event":"payment.captured","payload":{}}');
    const good = hmac(WEBHOOK_SECRET, raw);
    expect(p.verifyWebhook(raw, good)).toBe(true);
    expect(p.verifyWebhook(raw.toString('utf8'), good)).toBe(true);
    // The same JSON re-serialised differently is a different body.
    expect(p.verifyWebhook(Buffer.from('{"event": "payment.captured", "payload": {}}'), good)).toBe(false);
    expect(p.verifyWebhook(raw, hmac(SECRET, raw))).toBe(false);
    expect(p.verifyWebhook(raw, good.slice(1))).toBe(false);
    expect(p.verifyWebhook({}, good)).toBe(false);
  });

  it('is always false without a webhook secret', () => {
    const p = live({ webhookSecret: '' });
    const raw = Buffer.from('{}');
    expect(p.verifyWebhook(raw, hmac('', raw))).toBe(false);
    expect(p.verifyWebhook(raw, hmac(WEBHOOK_SECRET, raw))).toBe(false);
  });
});
