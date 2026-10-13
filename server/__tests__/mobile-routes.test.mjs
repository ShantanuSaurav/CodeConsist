import express from 'express';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createMobileRouter } from '../mobile-routes.js';

let server, base, now = 0, orders, paidCalls = 0;
const provider = { mode: 'razorpay', keyId: 'public-key', verifyCheckout: ({ orderId, paymentId, signature }) => orderId === 'provider-1' && paymentId === 'payment-1' && signature === 'valid-signature' };
beforeAll(async () => {
  const app = express(); app.use(express.json());
  const auth = (req, res, next) => { if (!req.headers['x-user']) return res.sendStatus(401); req.user = { id: req.headers['x-user'] }; next(); };
  app.use('/api', createMobileRouter({ requireAuth: auth, provider, getOrder: id => orders[id], now: () => now,
    markPaid: id => { paidCalls++; orders[id].status = 'paid'; return { order: orders[id] }; },
    achievementsFor: user => ({ achievements: [{ id: 'first', title: user.id }] }) }));
  server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  base = `http://127.0.0.1:${server.address().port}`;
});
afterAll(async () => { await new Promise(resolve => server.close(resolve)); });
beforeEach(() => { now += 1000000; paidCalls = 0; provider.mode = 'razorpay'; orders = { own: { id: 'own', userId: 'one', status: 'created', provider: 'razorpay', providerOrderId: 'provider-1', amount: 1200, currency: 'INR' } }; });
async function post(path, body, user = 'one') {
  return fetch(base + path, { method: 'POST', headers: { 'content-type': 'application/json', ...(user ? { 'x-user': user } : {}) }, body: JSON.stringify(body) });
}
async function link() { return (await post('/api/mobile/checkout', { orderId: 'own' })).json(); }
async function opened() { const linkData = await link(); const response = await fetch(base + linkData.checkoutUrl); const html = await response.text(); const confirmation = JSON.parse(html.match(/const confirmation=("[^"]+")/)[1]); return { ...linkData, response, html, confirmation }; }
const proof = ticket => ({ ticket, razorpay_order_id: 'provider-1', razorpay_payment_id: 'payment-1', razorpay_signature: 'valid-signature' });

describe('mobile checkout capabilities', () => {
  it('requires auth, ownership and an unpaid real-provider order', async () => {
    expect((await post('/api/mobile/checkout', { orderId: 'own' }, null)).status).toBe(401);
    expect((await post('/api/mobile/checkout', { orderId: 'own' }, 'two')).status).toBe(404);
    provider.mode = 'test'; expect((await post('/api/mobile/checkout', { orderId: 'own' })).status).toBe(409);
    provider.mode = 'razorpay'; orders.own.status = 'paid'; expect((await post('/api/mobile/checkout', { orderId: 'own' })).status).toBe(409);
  });
  it('exchanges a one-use link and uses a separate confirmation token', async () => {
    const o = await opened();
    expect(o.response.status).toBe(200);
    expect(o.checkoutUrl).toMatch(/^\/api\/mobile\/checkout\?ticket=[A-Za-z0-9_-]{43}$/);
    expect(o.checkoutUrl).not.toContain(o.confirmation);
    expect((await fetch(base + o.checkoutUrl)).status).toBe(410);
    expect(o.response.headers.get('cache-control')).toContain('no-store');
    expect(o.response.headers.get('referrer-policy')).toBe('no-referrer');
    expect(o.response.headers.get('content-security-policy')).toContain("frame-ancestors 'none'");
    expect(o.html).toContain('history.replaceState');
    expect(o.html).not.toContain('Bearer');
  });
  it('does not unlock without the exact order and valid payment signature', async () => {
    const { confirmation } = await opened();
    expect((await post('/api/mobile/checkout/confirm', { ...proof(confirmation), razorpay_signature: 'forged' }, null)).status).toBe(400);
    expect((await post('/api/mobile/checkout/confirm', { ...proof(confirmation), razorpay_order_id: 'different' }, null)).status).toBe(400);
    expect(paidCalls).toBe(0);
    expect((await post('/api/mobile/checkout/confirm', proof(confirmation), null)).status).toBe(200);
    expect(paidCalls).toBe(1);
    expect((await post('/api/mobile/checkout/confirm', proof(confirmation), null)).status).toBe(410);
  });
  it('expires links and confirmation tokens and refuses revoked orders', async () => {
    const first = await link(); now += 600001;
    expect((await fetch(base + first.checkoutUrl)).status).toBe(410);
    const { confirmation } = await opened(); now += 600001;
    expect((await post('/api/mobile/checkout/confirm', proof(confirmation), null)).status).toBe(410);
    const next = await opened(); orders.own.status = 'revoked';
    expect((await post('/api/mobile/checkout/confirm', proof(next.confirmation), null)).status).toBe(409);
    expect(paidCalls).toBe(0);
  });
  it('can confirm after a verified webhook already paid the same order', async () => {
    const { confirmation } = await opened(); orders.own.status = 'paid';
    expect((await post('/api/mobile/checkout/confirm', proof(confirmation), null)).status).toBe(200);
  });
  it('requires auth for private achievement facts', async () => {
    expect((await fetch(base + '/api/achievements')).status).toBe(401);
    const response = await fetch(base + '/api/achievements', { headers: { 'x-user': 'two' } });
    expect((await response.json()).achievements[0].title).toBe('two');
    expect(response.headers.get('cache-control')).toContain('no-store');
  });
});
