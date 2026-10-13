import crypto from 'node:crypto';
import express from 'express';

const TTL_MS = 10 * 60_000;
const MAX_TICKETS = 1000;
const token = () => crypto.randomBytes(32).toString('base64url');
const pass = (_req, _res, next) => next();
const scriptJson = (value) => JSON.stringify(value).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');

/** Native adapters reuse existing pricing, ownership and signature verification. */
export function createMobileRouter({ requireAuth, writeLimit = pass, provider, getOrder, markPaid, achievementsFor, now = Date.now }) {
  const router = express.Router();
  const tickets = new Map();
  const clean = () => { for (const [key, row] of tickets) if (row.expiresAt <= now()) tickets.delete(key); };
  router.use(['/mobile/checkout', '/achievements'], (_req, res, next) => {
    res.set('Cache-Control', 'private, no-store');
    res.set('Referrer-Policy', 'no-referrer');
    res.set('X-Content-Type-Options', 'nosniff');
    next();
  });
  router.get('/achievements', requireAuth, (req, res) => res.json(achievementsFor(req.user)));

  router.post('/mobile/checkout', requireAuth, writeLimit, (req, res) => {
    if (provider.mode !== 'razorpay') return res.status(409).json({ error: 'Secure checkout is available only when payments are configured.' });
    const order = getOrder(String(req.body?.orderId ?? ''));
    if (!order || order.userId !== req.user.id) return res.status(404).json({ error: 'No such order.' });
    if (order.provider !== 'razorpay' || order.status !== 'created') return res.status(409).json({ error: 'This order is not awaiting payment.' });
    clean();
    for (const [key, row] of tickets) if (row.userId === req.user.id && row.phase === 'link') tickets.delete(key);
    if (tickets.size >= MAX_TICKETS) return res.status(503).json({ error: 'Checkout is busy. Try again shortly.' });
    const ticket = token();
    tickets.set(ticket, { orderId: order.id, userId: req.user.id, expiresAt: now() + TTL_MS, phase: 'link' });
    // Relative to the configured API: never trust Host/X-Forwarded-Host to
    // manufacture a link, and never put the learner's bearer token in a URL.
    res.json({ checkoutUrl: `/api/mobile/checkout?ticket=${ticket}`, expiresInSeconds: TTL_MS / 1000 });
  });

  router.get('/mobile/checkout', (req, res) => {
    clean();
    const ticket = typeof req.query.ticket === 'string' ? req.query.ticket : '';
    const row = tickets.get(ticket);
    if (!row || row.phase !== 'link') return res.status(410).type('text').send('This checkout link has expired or was already opened. Return to CodeConsist and open checkout again.');
    tickets.delete(ticket); // One-use URL exchanges for an order-scoped confirmation capability.
    const order = getOrder(row.orderId);
    if (!order || order.userId !== row.userId || order.status !== 'created' || order.provider !== 'razorpay' || provider.mode !== 'razorpay') return res.status(409).type('text').send('This order is no longer awaiting payment. Return to CodeConsist and refresh purchases.');
    const confirmation = token();
    tickets.set(confirmation, { ...row, phase: 'confirm' });
    const nonce = token();
    res.set('Content-Security-Policy', `default-src 'none'; script-src 'nonce-${nonce}' https://checkout.razorpay.com; style-src 'nonce-${nonce}'; frame-src https://*.razorpay.com; connect-src 'self' https://*.razorpay.com; img-src https://*.razorpay.com data:; base-uri 'none'; form-action 'self'; frame-ancestors 'none'`);
    res.set('X-Frame-Options', 'DENY');
    const config = scriptJson({ key: provider.keyId, order_id: order.providerOrderId, amount: order.amount, currency: order.currency, name: 'CodeConsist', description: 'Complete your learning purchase' });
    res.type('html').send(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>CodeConsist checkout</title><style nonce="${nonce}">body{margin:0;background:#f7f8f2;color:#192220;font:16px system-ui;padding:28px;display:grid;min-height:80vh;place-items:center}main{max-width:440px}small{letter-spacing:3px}h1{font-size:38px;line-height:1.1}button{background:#192220;color:white;border:0;border-radius:18px;padding:18px 24px;font:600 16px system-ui;width:100%}p{line-height:1.6}#status{min-height:60px}button:disabled{opacity:.5}</style></head><body><main><small>CODECONSIST</small><h1>Your next chapter.</h1><p>Pay securely with Razorpay. Your purchase becomes available after the server verifies payment.</p><button id="pay">Continue to payment</button><p id="status" role="status">After checkout, return to the app and tap Refresh purchases.</p></main><script nonce="${nonce}" src="https://checkout.razorpay.com/v1/checkout.js"></script><script nonce="${nonce}">history.replaceState(null,'','/api/mobile/checkout');const options=${config};const confirmation=${scriptJson(confirmation)};const button=document.getElementById('pay');const status=document.getElementById('status');options.theme={color:'#192220'};options.modal={ondismiss:()=>{button.disabled=false;status.textContent='Checkout closed. You can try again or return to the app.'}};options.handler=async(result)=>{button.disabled=true;status.textContent='Verifying your payment...';try{const response=await fetch('/api/mobile/checkout/confirm',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...result,ticket:confirmation})});const data=await response.json();if(!response.ok)throw new Error(data.error||'Verification is pending.');status.textContent='Payment verified. Return to CodeConsist and refresh purchases.';button.textContent='Payment complete';}catch(error){status.textContent=error.message+' Return to the app and refresh purchases before trying again.';}};button.addEventListener('click',()=>{if(!window.Razorpay){status.textContent='Could not load secure checkout. Check the internet connection, then open a new checkout from the app.';return;}button.disabled=true;new Razorpay(options).open();});</script></body></html>`);
  });

  router.post('/mobile/checkout/confirm', (req, res) => {
    clean();
    const ticket = String(req.body?.ticket ?? '');
    const row = tickets.get(ticket);
    if (!row || row.phase !== 'confirm') return res.status(410).json({ error: 'Checkout has expired. Refresh purchases in the app.' });
    const order = getOrder(row.orderId);
    if (!order || order.userId !== row.userId || order.provider !== 'razorpay' || provider.mode !== 'razorpay') return res.status(404).json({ error: 'No such order.' });
    if (!['created', 'paid'].includes(order.status)) return res.status(409).json({ error: 'This order was cancelled. Contact support if charged.' });
    const orderId = String(req.body?.razorpay_order_id ?? '');
    const paymentId = String(req.body?.razorpay_payment_id ?? '');
    const signature = String(req.body?.razorpay_signature ?? '');
    if (orderId !== order.providerOrderId || !provider.verifyCheckout({ orderId: order.providerOrderId, paymentId, signature })) return res.status(400).json({ error: 'Payment could not be verified.' });
    const result = markPaid(order.id, { providerPaymentId: paymentId, via: 'checkout' });
    if (result.order.status !== 'paid') return res.status(409).json({ error: 'This order was cancelled. Contact support if charged.' });
    tickets.delete(ticket);
    res.json({ ok: true });
  });
  return router;
}
