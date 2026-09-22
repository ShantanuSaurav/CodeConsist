/**
 * The learner billing routes at the HTTP boundary: a real express app, the
 * real router, an in-memory store, a small bank, and one provider per mode
 * - so the rules that keep money honest are proven where the client talks
 * to them: nothing unlocks without a verified signature, the explicit
 * test-mode step, or a free price; and every completion is idempotent.
 */
import crypto from 'node:crypto';
import express from 'express';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../db.js', () => {
  const EMPTY = () => ({ users: [], progress: {}, contentOverrides: { stages: {}, challenges: {}, languages: {} }, customChallenges: {}, orders: {}, certificates: {}, pricing: {} });
  let state = EMPTY();
  const newest = (rows, field) => [...rows].sort((a, b) => String(b[field] ?? '').localeCompare(String(a[field] ?? '')));
  return {
    reset: () => {
      state = EMPTY();
    },
    db: () => state,
    persist: () => {},
    findUserById: (id) => state.users.find((u) => u.id === id) ?? null,
    insertUser: (u) => {
      state.users.push(u);
      return u;
    },
    allUsers: () => state.users,
    // The admin user list reports HOW an account signs in (provider ids and a
    // boolean), never anything password-derived - see server/db.js.
    identityProviders: (user) => Object.keys(user?.identities ?? {}),
    getProgress: (id) => state.progress[id] ?? { completedChallenges: [], completedStages: [], attempts: {} },
    setProgress: (id, p) => (state.progress[id] = p),
    getContentOverrides: () => state.contentOverrides,
    allCustomChallenges: () => Object.values(state.customChallenges),
    getCustomChallenge: () => null,
    getPricing: () => state.pricing,
    setPricing: (patch) => Object.assign(state.pricing, patch),
    getOrder: (id) => (typeof id === 'string' && Object.hasOwn(state.orders, id) ? state.orders[id] : null),
    putOrder: (o) => (state.orders[o.id] = o),
    ordersForUser: (userId) => newest(Object.values(state.orders), 'createdAt').filter((o) => o.userId === userId),
    allOrders: () => newest(Object.values(state.orders), 'createdAt'),
    getCertificate: (id) => (typeof id === 'string' && Object.hasOwn(state.certificates, id) ? state.certificates[id] : null),
    putCertificate: (c) => (state.certificates[c.id] = c),
    certificatesForUser: (userId) => newest(Object.values(state.certificates), 'issuedAt').filter((c) => c.userId === userId),
    allCertificates: () => newest(Object.values(state.certificates), 'issuedAt'),
    // Only what the admin router touches on its billing routes.
    auditLog: () => state.auditLog ?? (state.auditLog = []),
    appendAudit: (entry) => {
      state.auditLog ??= [];
      state.auditLog.push(entry);
      return entry;
    },
    allProgress: () => state.progress
  };
});

vi.mock('../admin-auth.js', () => ({
  requireAdminAuth: (req, _res, next) => {
    req.admin = { id: 'admin-1', userId: 'admin' };
    next();
  },
  publicAdmin: (a) => a,
  updateAdminCredentials: async () => ({ ok: false, error: 'stub' })
}));

vi.mock('../excel.js', () => ({
  excelSettingsSummary: () => ({ configured: false }),
  testConnection: async () => ({ ok: false }),
  syncAllUsers: async () => ({ synced: 0, failed: 0 }),
  retryFailed: async () => ({ retried: 0, stillFailing: 0 })
}));

const stage = (id, index, name, extra = {}) => ({ id, index, name, slug: id, language: 'javascript', description: '', ...extra });
const lesson = (id, stageId, extra = {}) => ({ id, stageId, type: 'quiz', title: id, prompt: '', explanation: '', xpReward: 10, ...extra });
const SNAPSHOT = {
  builtAt: '2026-01-01T00:00:00.000Z',
  stages: [stage('s1', '01', 'Basics'), stage('s2', '02', 'System Design', { isPremium: true }), stage('c1', '01', 'C Fundamentals', { language: 'c' })],
  challenges: [
    lesson('s1-a', 's1'),
    lesson('s1-test', 's1', { isStageTest: true }),
    lesson('s2-a', 's2'),
    lesson('s2-test', 's2', { isStageTest: true }),
    lesson('c1-a', 'c1'),
    lesson('c1-test', 'c1', { isStageTest: true })
  ],
  languageTracks: [
    { id: 'core', label: 'Developer path', icon: '', tagline: '', description: '', primaryLanguage: 'javascript', stageIds: ['s1', 's2'] },
    { id: 'c', label: 'C', icon: '', tagline: '', description: '', primaryLanguage: 'c', stageIds: ['c1'] }
  ]
};
const ALL_CORE = ['s1-a', 's1-test', 's2-a', 's2-test'];

vi.mock('../content.js', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, contentSnapshot: () => SNAPSHOT };
});

import * as store from '../db.js';
import { createBillingRouter, createWebhookRouter } from '../billing-routes.js';
import { createAdminRouter } from '../admin.js';
import { createPaymentProvider } from '../payments.js';
import { DEFAULT_PRICES, entitlementsFor, unlockedStageIds } from '../billing.js';

const KEY_ID = 'rzp_test_key';
const SECRET = 'rzp-secret';
const WEBHOOK_SECRET = 'hook-secret';
const hmac = (secret, text) => crypto.createHmac('sha256', secret).update(text).digest('hex');

/* -------------------------------------------------------------- harness */

// The same shape server/index.js keeps: derived from paid orders every call.
const publicUser = (u) => {
  const ent = entitlementsFor(u.id, u);
  return { id: u.id, username: u.username, isPremium: ent.lifetime, unlockedStages: [...unlockedStageIds(ent, SNAPSHOT.languageTracks)] };
};
// Learner auth stand-in: the `x-user` header names the account.
const optionalAuth = (req, _res, next) => {
  const id = req.headers['x-user'];
  req.user = typeof id === 'string' && id ? store.findUserById(id) : null;
  next();
};
const requireAuth = (req, res, next) => (req.user ? next() : res.status(401).json({ error: 'Sign in to continue.' }));

async function startApp(provider) {
  const app = express();
  app.use('/api', createWebhookRouter({ provider }));
  app.use(express.json());
  app.use(optionalAuth);
  app.use('/api', createBillingRouter({ provider, requireAuth, optionalAuth, publicUser }));
  // The same provider instance, as server/index.js hands it over.
  app.use('/api/admin', createAdminRouter({ billing: { provider } }));
  app.use((err, _req, res, _next) => res.status(500).json({ error: err.message }));
  const server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const call = async (method, path, { body, user, headers = {}, raw } = {}) => {
    const res = await fetch(base + path, {
      method,
      headers: {
        ...(body !== undefined || raw !== undefined ? { 'content-type': 'application/json' } : {}),
        ...(user ? { 'x-user': user } : {}),
        ...headers
      },
      body: raw !== undefined ? raw : body !== undefined ? JSON.stringify(body) : undefined
    });
    return { status: res.status, json: await res.json() };
  };
  return { call, close: () => new Promise((resolve) => server.close(resolve)) };
}

let testMode;
let liveMode;
let razorpayFetch;

beforeAll(async () => {
  testMode = await startApp(createPaymentProvider({ keyId: '', keySecret: '', webhookSecret: '' }));
  razorpayFetch = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ id: 'order_R1' }) }));
  liveMode = await startApp(createPaymentProvider({ keyId: KEY_ID, keySecret: SECRET, webhookSecret: WEBHOOK_SECRET, fetchImpl: razorpayFetch }));
});

afterAll(async () => {
  await testMode?.close();
  await liveMode?.close();
});

const user = (id = 'u1', extra = {}) => store.insertUser({ id, email: `${id}@example.com`, username: id, passwordHash: 'x', isPremium: false, ...extra });

beforeEach(() => {
  store.reset();
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

/* -------------------------------------------------------------- catalog */

describe('GET /billing/catalog', () => {
  it('is public: mode, key id and the priced catalog, with owned/eligibility null for a guest', async () => {
    const { status, json } = await testMode.call('GET', '/billing/catalog');
    expect(status).toBe(200);
    expect(json.mode).toBe('test');
    expect(json.keyId).toBe('');
    expect(json.currency).toBe('INR');
    expect(json.catalog.stages.map((s) => s.stageId)).toEqual(['s2']);
    expect(json.owned).toBeNull();
    expect(json.eligibility).toBeNull();

    const live = await liveMode.call('GET', '/billing/catalog');
    expect(live.json.mode).toBe('razorpay');
    expect(live.json.keyId).toBe(KEY_ID);
    expect(JSON.stringify(live.json)).not.toContain(SECRET);
  });

  it('adds what a signed-in learner owns and whether each track can be certified', async () => {
    const u = user();
    store.setProgress(u.id, { completedChallenges: ['s1-a'] });
    const { json } = await testMode.call('GET', '/billing/catalog', { user: u.id });
    expect(json.owned).toEqual({ lifetime: false, unlockedStages: [], certificates: {} });
    expect(json.eligibility.core).toEqual({ eligible: false, reason: 'Finish every stage in this track (0 of 2 cleared).', stagesTotal: 2, stagesCleared: 0 });
    expect(json.eligibility.c.eligible).toBe(false);
  });
});

/* --------------------------------------------------------------- orders */

describe('POST /billing/orders', () => {
  it('needs a session', async () => {
    expect((await testMode.call('POST', '/billing/orders', { body: { product: { kind: 'lifetime' } } })).status).toBe(401);
  });

  it('starts a test-mode order with the server price and checkout details', async () => {
    const u = user();
    const { status, json } = await testMode.call('POST', '/billing/orders', { user: u.id, body: { product: { kind: 'stage', stageId: 's2' }, amount: 1 } });
    expect(status).toBe(201);
    expect(json.mode).toBe('test');
    expect(json.keyId).toBe('');
    expect(json.order).toMatchObject({ status: 'created', provider: 'test', amount: 49900, productKey: 'stage:s2' });
    expect(json.checkout).toEqual({
      amount: 49900,
      currency: 'INR',
      providerOrderId: json.order.providerOrderId,
      name: 'CodeConsist',
      description: 'Stage 02: System Design',
      prefill: { name: 'u1', email: 'u1@example.com' }
    });
    expect(json.checkout.providerOrderId).toMatch(/^test_/);
  });

  it('pays a free product immediately: checkout null, access granted', async () => {
    const u = user();
    store.setPricing({ stages: { s2: 0 } });
    const { status, json } = await testMode.call('POST', '/billing/orders', { user: u.id, body: { product: { kind: 'stage', stageId: 's2' } } });
    expect(status).toBe(201);
    expect(json.order).toMatchObject({ status: 'paid', provider: 'free', amount: 0 });
    expect(json.checkout).toBeNull();
    expect((await testMode.call('GET', '/billing/catalog', { user: u.id })).json.owned.unlockedStages).toEqual(['s2']);
  });

  it('answers 400 for an unknown product or a bad certificate name, 409 when the purchase is not allowed', async () => {
    const u = user('u1', { isPremium: true });
    expect(await testMode.call('POST', '/billing/orders', { user: u.id, body: { product: { kind: 'pro' } } })).toEqual({ status: 400, json: { error: 'Unknown product.' } });
    expect(await testMode.call('POST', '/billing/orders', { user: u.id, body: { product: { kind: 'stage', stageId: 'nope' } } })).toEqual({ status: 400, json: { error: 'Unknown product.' } });
    expect(await testMode.call('POST', '/billing/orders', { user: u.id, body: { product: { kind: 'lifetime' } } })).toEqual({ status: 409, json: { error: 'You already own everything.' } });
    expect(await testMode.call('POST', '/billing/orders', { user: u.id, body: { product: { kind: 'stage', stageId: 's2' } } })).toEqual({ status: 409, json: { error: 'You already have access to this.' } });

    const learner = user('u2');
    store.setProgress(learner.id, { completedChallenges: ALL_CORE });
    const badName = await testMode.call('POST', '/billing/orders', { user: learner.id, body: { product: { kind: 'certificate', trackId: 'core' }, certificateName: 'X' } });
    expect(badName.status).toBe(400);
    expect(badName.json.error).toContain('2-80 characters');
    const digits = await testMode.call('POST', '/billing/orders', { user: learner.id, body: { product: { kind: 'certificate', trackId: 'core' }, certificateName: 'R2 D2' } });
    expect(digits.status).toBe(400);
  });

  it('only sells a certificate once the track is finished', async () => {
    const u = user();
    const notYet = await testMode.call('POST', '/billing/orders', { user: u.id, body: { product: { kind: 'certificate', trackId: 'core' }, certificateName: 'Ada Lovelace' } });
    expect(notYet).toEqual({ status: 409, json: { error: 'Finish every stage in this track (0 of 2 cleared).' } });

    store.setProgress(u.id, { completedChallenges: ALL_CORE });
    const { status, json } = await testMode.call('POST', '/billing/orders', { user: u.id, body: { product: { kind: 'certificate', trackId: 'core' }, certificateName: '  Ada   Lovelace ' } });
    expect(status).toBe(201);
    expect(json.order).toMatchObject({ productKey: 'certificate:core', certificateName: 'Ada Lovelace', status: 'created', amount: 29900 });
    expect(json.checkout.description).toBe('Certificate of Completion - Developer path');
    expect(store.allCertificates()).toEqual([]);
  });

  it('creates the Razorpay order in live mode and hands the browser only the public key id', async () => {
    const u = user();
    const { status, json } = await liveMode.call('POST', '/billing/orders', { user: u.id, body: { product: { kind: 'lifetime' } } });
    expect(status).toBe(201);
    expect(json.mode).toBe('razorpay');
    expect(json.keyId).toBe(KEY_ID);
    expect(json.order).toMatchObject({ provider: 'razorpay', providerOrderId: 'order_R1', amount: 199900 });
    expect(razorpayFetch).toHaveBeenCalled();
    expect(JSON.stringify(json)).not.toContain(SECRET);
  });

  it('turns a gateway failure into a plain 502 with no order left behind', async () => {
    const u = user();
    razorpayFetch.mockImplementationOnce(async () => ({ ok: false, status: 500, json: async () => ({ error: { description: 'Server error' } }) }));
    const { status, json } = await liveMode.call('POST', '/billing/orders', { user: u.id, body: { product: { kind: 'lifetime' } } });
    expect(status).toBe(502);
    expect(json.error).toBe('Razorpay could not create the order (Server error).');
    expect(store.allOrders()).toEqual([]);
  });
});

/* -------------------------------------------------------------- confirm */

describe('POST /billing/orders/:id/confirm', () => {
  const liveOrder = async (u, product = { kind: 'stage', stageId: 's2' }) => (await liveMode.call('POST', '/billing/orders', { user: u.id, body: { product } })).json.order;
  const signed = (order, paymentId = 'pay_1') => ({
    razorpay_order_id: order.providerOrderId,
    razorpay_payment_id: paymentId,
    razorpay_signature: hmac(SECRET, `${order.providerOrderId}|${paymentId}`)
  });

  it('rejects a bad signature with 400, marks a fresh order failed and unlocks nothing', async () => {
    const u = user();
    const order = await liveOrder(u);
    const bad = { ...signed(order), razorpay_signature: hmac('wrong', `${order.providerOrderId}|pay_1`) };
    const { status, json } = await liveMode.call('POST', `/billing/orders/${order.id}/confirm`, { user: u.id, body: bad });
    expect(status).toBe(400);
    expect(json.error).toBe('Payment could not be verified.');
    expect(store.getOrder(order.id).status).toBe('failed');
    expect(entitlementsFor(u.id, u).stageIds).toEqual([]);

    // A mismatched order id is not verified either.
    const other = await liveOrder(u);
    const mixed = { ...signed(other), razorpay_order_id: 'order_other' };
    expect((await liveMode.call('POST', `/billing/orders/${other.id}/confirm`, { user: u.id, body: mixed })).status).toBe(400);
    expect((await liveMode.call('POST', `/billing/orders/${other.id}/confirm`, { user: u.id, body: {} })).status).toBe(400);
  });

  it('marks the order paid on a verified signature and returns the refreshed user', async () => {
    const u = user();
    const order = await liveOrder(u);
    const { status, json } = await liveMode.call('POST', `/billing/orders/${order.id}/confirm`, { user: u.id, body: signed(order) });
    expect(status).toBe(200);
    expect(json.order).toMatchObject({ status: 'paid', providerPaymentId: 'pay_1' });
    expect(json.user).toEqual({ id: u.id, username: 'u1', isPremium: false, unlockedStages: ['s2'] });
    expect(json.certificate).toBeUndefined();

    // Confirming again is harmless.
    const again = await liveMode.call('POST', `/billing/orders/${order.id}/confirm`, { user: u.id, body: signed(order) });
    expect(again.status).toBe(200);
    expect(again.json.order.paidAt).toBe(json.order.paidAt);
    // And a bad signature later never touches a paid order.
    const late = await liveMode.call('POST', `/billing/orders/${order.id}/confirm`, { user: u.id, body: { ...signed(order), razorpay_signature: 'nope' } });
    expect(late.status).toBe(400);
    expect(store.getOrder(order.id).status).toBe('paid');
  });

  it('issues the certificate for a paid certificate order', async () => {
    const u = user();
    store.setProgress(u.id, { completedChallenges: ALL_CORE });
    const order = (await liveMode.call('POST', '/billing/orders', { user: u.id, body: { product: { kind: 'certificate', trackId: 'core' }, certificateName: 'Ada Lovelace' } })).json.order;
    const { status, json } = await liveMode.call('POST', `/billing/orders/${order.id}/confirm`, { user: u.id, body: signed(order, 'pay_c') });
    expect(status).toBe(200);
    expect(json.certificate).toMatchObject({ trackId: 'core', trackLabel: 'Developer path', learnerName: 'Ada Lovelace', revoked: false });
    expect(json.certificate.userId).toBeUndefined();
    expect(json.order.certificateId).toBe(json.certificate.id);
  });

  it('refuses an order an admin revoked, even with a good signature, and says so', async () => {
    const u = user();
    const order = await liveOrder(u);
    expect((await liveMode.call('POST', `/admin/billing/orders/${order.id}/revoke`)).status).toBe(200);

    const { status, json } = await liveMode.call('POST', `/billing/orders/${order.id}/confirm`, { user: u.id, body: signed(order, 'pay_late') });
    expect(status).toBe(409);
    expect(json.error).toContain('cancelled');
    expect(store.getOrder(order.id).status).toBe('revoked');
    expect(entitlementsFor(u.id, u).stageIds).toEqual([]);
  });

  it("answers 404 for another learner's order and for an unknown id", async () => {
    const owner = user('owner');
    const other = user('other');
    const order = await liveOrder(owner);
    expect((await liveMode.call('POST', `/billing/orders/${order.id}/confirm`, { user: other.id, body: signed(order) })).status).toBe(404);
    expect((await liveMode.call('POST', '/billing/orders/ord_nope/confirm', { user: owner.id, body: {} })).status).toBe(404);
    expect(store.getOrder(order.id).status).toBe('created');
  });

  it('is refused in test mode (409) - test orders complete through test-complete only', async () => {
    const u = user();
    const order = (await testMode.call('POST', '/billing/orders', { user: u.id, body: { product: { kind: 'stage', stageId: 's2' } } })).json.order;
    const { status } = await testMode.call('POST', `/billing/orders/${order.id}/confirm`, { user: u.id, body: signed(order) });
    expect(status).toBe(409);
    expect(store.getOrder(order.id).status).toBe('created');
  });
});

/* -------------------------------------------------------- test-complete */

describe('POST /billing/orders/:id/test-complete', () => {
  it('pays a test-mode order and returns the refreshed user; a second call is a no-op', async () => {
    const u = user();
    const order = (await testMode.call('POST', '/billing/orders', { user: u.id, body: { product: { kind: 'track', trackId: 'core' } } })).json.order;
    const { status, json } = await testMode.call('POST', `/billing/orders/${order.id}/test-complete`, { user: u.id });
    expect(status).toBe(200);
    expect(json.order.status).toBe('paid');
    expect(json.user.unlockedStages).toEqual(['s1', 's2']);

    const again = await testMode.call('POST', `/billing/orders/${order.id}/test-complete`, { user: u.id });
    expect(again.status).toBe(200);
    expect(again.json.order.paidAt).toBe(json.order.paidAt);
  });

  it('is refused in razorpay mode, even for an order created in test mode', async () => {
    const u = user();
    const order = (await testMode.call('POST', '/billing/orders', { user: u.id, body: { product: { kind: 'stage', stageId: 's2' } } })).json.order;
    expect(order.provider).toBe('test');
    const { status, json } = await liveMode.call('POST', `/billing/orders/${order.id}/test-complete`, { user: u.id });
    expect(status).toBe(409);
    expect(json.error).toContain('Razorpay');
    expect(store.getOrder(order.id).status).toBe('created');

    // And a real order can never be completed through the test step, whatever the mode.
    const real = (await liveMode.call('POST', '/billing/orders', { user: u.id, body: { product: { kind: 'lifetime' } } })).json.order;
    expect((await testMode.call('POST', `/billing/orders/${real.id}/test-complete`, { user: u.id })).status).toBe(409);
    expect(store.getOrder(real.id).status).toBe('created');
  });

  it('refuses an order an admin revoked before it was completed', async () => {
    const u = user();
    const order = (await testMode.call('POST', '/billing/orders', { user: u.id, body: { product: { kind: 'stage', stageId: 's2' } } })).json.order;
    expect((await testMode.call('POST', `/admin/billing/orders/${order.id}/revoke`)).status).toBe(200);

    const { status, json } = await testMode.call('POST', `/billing/orders/${order.id}/test-complete`, { user: u.id });
    expect(status).toBe(409);
    expect(json.error).toContain('cancelled');
    expect(store.getOrder(order.id).status).toBe('revoked');
    expect(entitlementsFor(u.id, u).stageIds).toEqual([]);
  });

  it("answers 404 for another learner's order", async () => {
    const owner = user('owner');
    const other = user('other');
    const order = (await testMode.call('POST', '/billing/orders', { user: owner.id, body: { product: { kind: 'stage', stageId: 's2' } } })).json.order;
    expect((await testMode.call('POST', `/billing/orders/${order.id}/test-complete`, { user: other.id })).status).toBe(404);
  });
});

/* -------------------------------------------------------------- webhook */

describe('POST /billing/webhook', () => {
  const captured = (orderId, paymentId = 'pay_w') =>
    JSON.stringify({ event: 'payment.captured', payload: { payment: { entity: { id: paymentId, order_id: orderId, status: 'captured' } } } });

  it('answers 401 without a valid signature - and always in test mode', async () => {
    const body = captured('order_R1');
    expect((await liveMode.call('POST', '/billing/webhook', { raw: body })).status).toBe(401);
    expect((await liveMode.call('POST', '/billing/webhook', { raw: body, headers: { 'x-razorpay-signature': hmac('wrong', body) } })).status).toBe(401);
    expect((await testMode.call('POST', '/billing/webhook', { raw: body, headers: { 'x-razorpay-signature': hmac(WEBHOOK_SECRET, body) } })).status).toBe(401);
  });

  it('marks the matching order paid once, and answers 200 to the same event twice', async () => {
    const u = user();
    const order = (await liveMode.call('POST', '/billing/orders', { user: u.id, body: { product: { kind: 'stage', stageId: 's2' } } })).json.order;
    const body = captured(order.providerOrderId);
    const headers = { 'x-razorpay-signature': hmac(WEBHOOK_SECRET, body) };

    const first = await liveMode.call('POST', '/billing/webhook', { raw: body, headers });
    expect(first).toEqual({ status: 200, json: { ok: true } });
    const paid = store.getOrder(order.id);
    expect(paid).toMatchObject({ status: 'paid', providerPaymentId: 'pay_w' });
    expect(entitlementsFor(u.id, u).stageIds).toEqual(['s2']);

    const second = await liveMode.call('POST', '/billing/webhook', { raw: body, headers });
    expect(second).toEqual({ status: 200, json: { ok: true } });
    expect(store.getOrder(order.id).paidAt).toBe(paid.paidAt);
    expect(console.log).toHaveBeenCalledTimes(1);
  });

  it('accepts order.paid too, ignores other events, and answers 200 for an order it does not know', async () => {
    const u = user();
    const order = (await liveMode.call('POST', '/billing/orders', { user: u.id, body: { product: { kind: 'lifetime' } } })).json.order;
    const other = JSON.stringify({ event: 'payment.authorized', payload: { payment: { entity: { id: 'pay_a', order_id: order.providerOrderId } } } });
    expect((await liveMode.call('POST', '/billing/webhook', { raw: other, headers: { 'x-razorpay-signature': hmac(WEBHOOK_SECRET, other) } })).status).toBe(200);
    expect(store.getOrder(order.id).status).toBe('created');

    const unknown = captured('order_unknown');
    expect((await liveMode.call('POST', '/billing/webhook', { raw: unknown, headers: { 'x-razorpay-signature': hmac(WEBHOOK_SECRET, unknown) } })).status).toBe(200);

    const paid = JSON.stringify({ event: 'order.paid', payload: { payment: { entity: { id: 'pay_o', order_id: order.providerOrderId } }, order: { entity: { id: order.providerOrderId } } } });
    expect((await liveMode.call('POST', '/billing/webhook', { raw: paid, headers: { 'x-razorpay-signature': hmac(WEBHOOK_SECRET, paid) } })).status).toBe(200);
    expect(store.getOrder(order.id)).toMatchObject({ status: 'paid', providerPaymentId: 'pay_o' });
    expect(entitlementsFor(u.id, u).lifetime).toBe(true);
  });

  it('rejects a signed body that is not JSON with 400', async () => {
    const raw = 'not json';
    expect((await liveMode.call('POST', '/billing/webhook', { raw, headers: { 'x-razorpay-signature': hmac(WEBHOOK_SECRET, raw) } })).status).toBe(400);
  });
});

/* ------------------------------------------------- orders & certificates */

describe('GET /billing/orders, /certificates, /certificates/:id, /verify/:code', () => {
  it("lists only the caller's orders, newest first", async () => {
    const a = user('a');
    const b = user('b');
    await testMode.call('POST', '/billing/orders', { user: a.id, body: { product: { kind: 'stage', stageId: 's2' } } });
    await testMode.call('POST', '/billing/orders', { user: b.id, body: { product: { kind: 'lifetime' } } });
    const { status, json } = await testMode.call('GET', '/billing/orders', { user: a.id });
    expect(status).toBe(200);
    expect(json.orders.map((o) => o.productKey)).toEqual(['stage:s2']);
    expect((await testMode.call('GET', '/billing/orders')).status).toBe(401);
  });

  it('shows the owner their certificate and lets anyone verify the code', async () => {
    const u = user('ada');
    const other = user('bob');
    store.setProgress(u.id, { completedChallenges: ALL_CORE });
    store.setPricing({ certificates: { core: 0 } });
    const { json: created } = await testMode.call('POST', '/billing/orders', { user: u.id, body: { product: { kind: 'certificate', trackId: 'core' } } });
    const id = created.order.certificateId;
    expect(id).toMatch(/^CC-/);

    const list = await testMode.call('GET', '/certificates', { user: u.id });
    expect(list.json.certificates).toEqual([{ id, trackId: 'core', trackLabel: 'Developer path', learnerName: 'ada', issuedAt: expect.any(String), revoked: false }]);

    const detail = await testMode.call('GET', `/certificates/${id}`, { user: u.id });
    expect(detail.status).toBe(200);
    expect(detail.json.certificate).toMatchObject({ id, username: 'ada', stagesTotal: 2, learnerName: 'ada' });
    expect((await testMode.call('GET', `/certificates/${id}`, { user: other.id })).status).toBe(404);
    expect((await testMode.call('GET', `/certificates/${id}`)).status).toBe(401);

    const verify = await testMode.call('GET', `/verify/${id.toLowerCase()}`);
    expect(verify.status).toBe(200);
    expect(verify.json).toEqual({ valid: true, certificate: { id, learnerName: 'ada', trackId: 'core', trackLabel: 'Developer path', issuedAt: expect.any(String), revoked: false } });
    expect(JSON.stringify(verify.json)).not.toContain('ada@example.com');
    expect(await testMode.call('GET', '/verify/CC-2026-NOPE')).toEqual({ status: 200, json: { valid: false } });
  });
});

/* ---------------------------------------------------------------- admin */

describe('admin /billing/*', () => {
  const admin = (method, path, body) => testMode.call(method, `/admin${path}`, body !== undefined ? { body } : {});

  it('GET /billing/pricing resolves every key to its effective price and lists what can be priced', async () => {
    store.setPricing({ stages: { s2: 100 } });
    const { status, json } = await admin('GET', '/billing/pricing');
    expect(status).toBe(200);
    expect(json.pricing).toEqual({
      lifetime: DEFAULT_PRICES.lifetime,
      tracks: { core: DEFAULT_PRICES.track, c: DEFAULT_PRICES.track },
      stages: { s2: 100 },
      certificates: { core: DEFAULT_PRICES.certificate, c: DEFAULT_PRICES.certificate }
    });
    expect(json.defaults).toEqual(DEFAULT_PRICES);
    expect(json.currency).toBe('INR');
    expect(json.mode).toBe('test');
    expect(json.catalogKeys).toEqual({
      tracks: [
        { id: 'core', label: 'Developer path', hidden: false },
        { id: 'c', label: 'C', hidden: false }
      ],
      premiumStages: [{ id: 's2', name: 'System Design', index: '02', hidden: false }]
    });
    expect((await liveMode.call('GET', '/admin/billing/pricing')).json.mode).toBe('razorpay');
  });

  it('flags a hidden track or stage so the console can price it but not offer it as a grant', async () => {
    const overrides = store.getContentOverrides();
    overrides.languages.c = { hidden: true };
    overrides.stages.s2 = { hidden: true };

    const { json } = await admin('GET', '/billing/pricing');
    expect(json.catalogKeys.tracks).toEqual([
      { id: 'core', label: 'Developer path', hidden: false },
      { id: 'c', label: 'C', hidden: true }
    ]);
    expect(json.catalogKeys.premiumStages).toEqual([{ id: 's2', name: 'System Design', index: '02', hidden: true }]);
    // Still priceable - a price can be set before learners ever see it.
    expect(json.pricing.tracks.c).toBe(DEFAULT_PRICES.track);
    expect(json.pricing.stages.s2).toBe(DEFAULT_PRICES.stage);

    // And this is what the flag is warning about: granting one is refused.
    const u = user();
    const refused = await admin('POST', '/billing/grant', { userId: u.id, product: { kind: 'stage', stageId: 's2' }, note: 'paid in cash' });
    expect(refused.status).toBe(400);
    expect(refused.json.error).toBe('Unknown product.');
  });

  it('PUT /billing/pricing sets whole paise in range, resets with null, refuses unknown ids and audits', async () => {
    const ok = await admin('PUT', '/billing/pricing', { lifetime: 150000, stages: { s2: 0 }, certificates: { core: 500 } });
    expect(ok.status).toBe(200);
    expect(ok.json.pricing).toMatchObject({ lifetime: 150000, stages: { s2: 0 }, certificates: { core: 500 } });
    expect(store.auditLog().at(-1)).toMatchObject({
      action: 'billing.pricing.update',
      details: { lifetime: 150000, stages: { s2: 0 }, certificates: { core: 500 } }
    });

    const reset = await admin('PUT', '/billing/pricing', { lifetime: null, stages: { s2: null } });
    expect(reset.json.pricing.lifetime).toBe(DEFAULT_PRICES.lifetime);
    expect(reset.json.pricing.stages.s2).toBe(DEFAULT_PRICES.stage);
    expect(reset.json.pricing.certificates.core).toBe(500);

    const bads = [{ lifetime: 12.5 }, { lifetime: -1 }, { lifetime: 10_000_001 }, { lifetime: '1999' }, { tracks: { nope: 100 } }, { stages: { nope: 100 } }, { stages: [] }];
    for (const bad of bads) {
      const res = await admin('PUT', '/billing/pricing', bad);
      expect(res.status, JSON.stringify(bad)).toBe(400);
      expect(typeof res.json.error).toBe('string');
    }
    // Nothing from a refused patch is applied.
    expect((await admin('GET', '/billing/pricing')).json.pricing.lifetime).toBe(DEFAULT_PRICES.lifetime);
  });

  it('POST /billing/grant gives access at once, needs a real user, and refuses a duplicate with the reason', async () => {
    const u = user();
    const { status, json } = await admin('POST', '/billing/grant', { userId: u.id, product: { kind: 'track', trackId: 'core' }, note: 'paid in cash' });
    expect(status).toBe(201);
    expect(json.order).toMatchObject({ userId: u.id, provider: 'admin', amount: 0, status: 'paid', productKey: 'track:core', note: 'paid in cash' });
    expect(json.certificate).toBeUndefined();
    expect(store.auditLog().at(-1)).toMatchObject({ action: 'billing.grant', details: { userId: u.id, productKey: 'track:core' } });
    expect((await testMode.call('GET', '/billing/catalog', { user: u.id })).json.owned.unlockedStages).toEqual(['s1', 's2']);

    expect((await admin('POST', '/billing/grant', { userId: 'ghost', product: { kind: 'lifetime' } })).status).toBe(404);
    expect(await admin('POST', '/billing/grant', { userId: u.id, product: { kind: 'stage', stageId: 's2' } })).toEqual({
      status: 409,
      json: { error: 'You already have access to this.' }
    });
    expect((await admin('POST', '/billing/grant', { userId: u.id, product: { kind: 'nope' } })).status).toBe(400);
    expect(await admin('POST', '/billing/grant', { userId: u.id, product: { kind: 'certificate', trackId: 'core' } })).toEqual({
      status: 409,
      json: { error: 'Finish every stage in this track (0 of 2 cleared).' }
    });
  });

  it('POST /billing/grant issues a certificate for a finished track, in the name given', async () => {
    const u = user();
    store.setProgress(u.id, { completedChallenges: ALL_CORE });
    const { status, json } = await admin('POST', '/billing/grant', { userId: u.id, product: 'certificate:core', certificateName: 'Grace Hopper' });
    expect(status).toBe(201);
    expect(json.certificate).toMatchObject({ trackId: 'core', learnerName: 'Grace Hopper', revokedAt: null });
    expect(json.order.certificateId).toBe(json.certificate.id);
    expect((await admin('POST', '/billing/grant', { userId: u.id, product: 'certificate:core', certificateName: '1' })).status).toBe(400);
  });

  it('GET /billing/orders lists everything newest first with the learner attached, filtered by status, user and q', async () => {
    const a = user('a');
    const b = user('b');
    await admin('POST', '/billing/grant', { userId: a.id, product: { kind: 'lifetime' } });
    await testMode.call('POST', '/billing/orders', { user: b.id, body: { product: { kind: 'stage', stageId: 's2' } } });

    const all = await admin('GET', '/billing/orders');
    expect(all.status).toBe(200);
    expect(all.json.orders).toHaveLength(2);
    expect(all.json.orders.map((o) => o.username)).toContain('a');
    expect(all.json.orders.find((o) => o.username === 'b')).toMatchObject({ email: 'b@example.com', status: 'created' });

    expect((await admin('GET', '/billing/orders?status=paid')).json.orders.map((o) => o.username)).toEqual(['a']);
    expect((await admin('GET', `/billing/orders?userId=${b.id}`)).json.orders.map((o) => o.productKey)).toEqual(['stage:s2']);
    expect((await admin('GET', '/billing/orders?q=lifetime')).json.orders).toHaveLength(1);
    expect((await admin('GET', '/billing/orders?q=b@example')).json.orders.map((o) => o.username)).toEqual(['b']);
  });

  it('POST /billing/orders/:id/revoke ends access, flags the certificate, audits, and refuses a repeat', async () => {
    const u = user();
    store.setProgress(u.id, { completedChallenges: ALL_CORE });
    const granted = (await admin('POST', '/billing/grant', { userId: u.id, product: 'certificate:core' })).json;

    const { status, json } = await admin('POST', `/billing/orders/${granted.order.id}/revoke`);
    expect(status).toBe(200);
    expect(json.order).toMatchObject({ status: 'revoked', revokedBy: 'admin-1' });
    expect(store.auditLog().at(-1)).toMatchObject({ action: 'billing.revoke', target: granted.order.id });
    expect((await testMode.call('GET', `/verify/${granted.certificate.id}`)).json).toMatchObject({ valid: false, certificate: { revoked: true } });
    expect((await testMode.call('GET', '/billing/catalog', { user: u.id })).json.owned.certificates).toEqual({});

    expect((await admin('POST', `/billing/orders/${granted.order.id}/revoke`)).status).toBe(409);
    expect((await admin('POST', '/billing/orders/ord_nope/revoke')).status).toBe(404);
  });

  it('GET /billing/certificates lists every certificate with the learner and its track label', async () => {
    const u = user('ada');
    store.setProgress(u.id, { completedChallenges: ALL_CORE });
    const granted = (await admin('POST', '/billing/grant', { userId: u.id, product: 'certificate:core' })).json;
    const { status, json } = await admin('GET', '/billing/certificates');
    expect(status).toBe(200);
    expect(json.certificates).toEqual([
      expect.objectContaining({ id: granted.certificate.id, userId: u.id, username: 'ada', trackLabel: 'Developer path', revoked: false })
    ]);
  });

  it('GET /dashboard carries the revenue summary and the gateway mode', async () => {
    const u = user();
    store.setPricing({ stages: { s2: 0 } });
    await testMode.call('POST', '/billing/orders', { user: u.id, body: { product: { kind: 'stage', stageId: 's2' } } });
    const { json } = await admin('GET', '/dashboard');
    expect(json.revenue).toEqual({ paidOrders: 1, totalPaise: 0, last30DaysPaise: 0 });
    expect(json.razorpayMode).toBe('test');
    expect((await liveMode.call('GET', '/admin/dashboard')).json.razorpayMode).toBe('razorpay');
  });
});

/**
 * The Users page says how each account signs in. A password exists in this
 * database only as a bcrypt hash, which nothing returns - not even to an
 * administrator - so the row carries a boolean and a list of provider ids.
 */
describe('admin /users', () => {
  const admin = (method, path) => testMode.call(method, `/admin${path}`);

  it('reports identities, hasPassword and lastLoginAt - and never the hash', async () => {
    user('ada', { createdAt: '2026-01-02T00:00:00.000Z', lastLoginAt: '2026-02-01T09:00:00.000Z' });
    store.insertUser({
      id: 'grace',
      email: 'grace@example.com',
      username: 'grace',
      // An account created through Google has no password at all.
      passwordHash: null,
      isPremium: false,
      createdAt: '2026-01-01T00:00:00.000Z',
      identities: { google: { providerUserId: 'g-1', email: 'grace@example.com', linkedAt: '2026-01-01T00:00:00.000Z' } }
    });

    const { status, json } = await admin('GET', '/users');
    expect(status).toBe(200);

    const rows = Object.fromEntries(json.users.map((row) => [row.username, row]));
    expect(rows.ada).toMatchObject({ identities: [], hasPassword: true, lastLoginAt: '2026-02-01T09:00:00.000Z' });
    expect(rows.grace).toMatchObject({ identities: ['google'], hasPassword: false, lastLoginAt: null });

    // Not the hash, and not the identity record that holds the provider's
    // own ids either.
    expect(JSON.stringify(json)).not.toContain('passwordHash');
    expect(JSON.stringify(json)).not.toContain('$2a$');
    expect(JSON.stringify(json)).not.toContain('providerUserId');
  });
});
