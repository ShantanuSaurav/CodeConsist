/**
 * The learner-facing billing routes, mounted at /api by server/index.js:
 * the catalog, starting and completing an order, the learner's own orders
 * and certificates, and the public certificate check.
 *
 * Money rules, all enforced here or in server/billing.js: the server
 * prices every order; a Razorpay order is only marked paid after its
 * checkout signature or webhook signature verifies; a test-mode order is
 * only marked paid by the explicit test-complete step, and only while the
 * server really is in test mode; every "mark paid" is idempotent.
 *
 * The webhook is a separate router because Razorpay signs the RAW body:
 * it must see the bytes before the app-level JSON parser, so index.js
 * mounts createWebhookRouter() ahead of express.json().
 */
import express from 'express';
import * as store from './db.js';
import { contentSnapshot } from './content.js';
import {
  BillingError,
  catalog,
  certificateEligibility,
  certificateNameFrom,
  createOrder,
  describeProduct,
  entitlementsFor,
  learnerView,
  markPaid,
  parseProduct,
  publicCertificate,
  unlockedStageIds,
  verifyCertificate
} from './billing.js';
import { PaymentError } from './payments.js';

const asyncRoute = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

/**
 * @param {object} deps
 *   provider - server/payments.js createPaymentProvider(); its mode decides which completion step is allowed.
 *   requireAuth / optionalAuth - server/index.js's learner auth middleware (req.user).
 *   publicUser(user) - the account shape the client keeps, returned after a payment so it can refresh in one go.
 */
export function createBillingRouter({ provider, requireAuth, optionalAuth, publicUser }) {
  const router = express.Router();
  const snapshotOf = () => contentSnapshot();
  const overridesOf = () => store.getContentOverrides();

  /** BillingError / PaymentError carry their own status and a plain message; anything else is a real 500. */
  const billingRoute = (fn) =>
    asyncRoute(async (req, res) => {
      try {
        await fn(req, res);
      } catch (err) {
        if (err instanceof BillingError || err instanceof PaymentError) return res.status(err.status ?? 400).json({ error: err.message });
        throw err;
      }
    });

  const ownOrder = (req) => {
    const order = store.getOrder(req.params.id);
    return order && order.userId === req.user.id ? order : null;
  };

  /** The response every "now paid" path answers with - the client refreshes its account from `user`. */
  const paidResponse = (req, { order, certificate }) => ({
    order,
    ...(certificate ? { certificate: publicCertificate(certificate, snapshotOf()) } : {}),
    user: publicUser(req.user)
  });

  /* --------------------------------------------------------------- catalog */

  router.get(
    '/billing/catalog',
    optionalAuth,
    billingRoute(async (req, res) => {
      const snapshot = snapshotOf();
      const overrides = overridesOf();
      const items = catalog({ snapshot, overrides });

      let owned = null;
      let eligibility = null;
      if (req.user) {
        const ent = entitlementsFor(req.user.id, req.user);
        owned = {
          lifetime: ent.lifetime,
          unlockedStages: [...unlockedStageIds(ent, snapshot?.languageTracks ?? [])],
          certificates: ent.certificates
        };
        const progress = store.getProgress(req.user.id);
        eligibility = {};
        for (const track of items.certificates) {
          eligibility[track.trackId] = certificateEligibility(req.user.id, track.trackId, { snapshot, overrides, progress });
        }
      }

      res.json({ mode: provider.mode, keyId: provider.keyId, currency: items.currency, catalog: items, owned, eligibility });
    })
  );

  /* ---------------------------------------------------------------- orders */

  router.post(
    '/billing/orders',
    requireAuth,
    billingRoute(async (req, res) => {
      const product = parseProduct(req.body?.product);

      // Only a certificate carries a name; on anything else the field is ignored.
      let certificateName = null;
      if (product.kind === 'certificate') {
        const checked = certificateNameFrom(req.body?.certificateName);
        if (checked.error) return res.status(400).json({ error: checked.error });
        certificateName = checked.name;
      }

      const snapshot = snapshotOf();
      const order = await createOrder({
        user: req.user,
        product,
        provider,
        certificateName,
        snapshot,
        overrides: overridesOf(),
        progress: store.getProgress(req.user.id)
      });

      // A free product is already paid - there is nothing to check out.
      const checkout =
        order.status === 'paid'
          ? null
          : {
              amount: order.amount,
              currency: order.currency,
              providerOrderId: order.providerOrderId,
              name: 'CodeConsist',
              description: describeProduct(order.product, snapshot),
              prefill: { name: req.user.username, email: req.user.email }
            };
      res.status(201).json({ order, mode: provider.mode, keyId: provider.keyId, checkout });
    })
  );

  /**
   * Razorpay's checkout handed the browser a payment id and a signature;
   * the signature is an HMAC over "<order_id>|<payment_id>" with the key
   * secret, which only this server has. Nothing is unlocked unless it
   * verifies. A failed check marks a fresh order 'failed' so the learner
   * starts over; it never touches a paid one.
   */
  router.post(
    '/billing/orders/:id/confirm',
    requireAuth,
    billingRoute(async (req, res) => {
      const order = ownOrder(req);
      if (!order) return res.status(404).json({ error: 'No such order.' });
      if (provider.mode !== 'razorpay' || order.provider !== 'razorpay') {
        return res.status(409).json({ error: 'This order was not created through Razorpay.' });
      }

      const orderId = String(req.body?.razorpay_order_id ?? '');
      const paymentId = String(req.body?.razorpay_payment_id ?? '');
      const signature = String(req.body?.razorpay_signature ?? '');
      const verified =
        orderId === order.providerOrderId && provider.verifyCheckout({ orderId: order.providerOrderId, paymentId, signature });
      if (!verified) {
        if (order.status === 'created') {
          order.status = 'failed';
          store.putOrder(order);
        }
        return res.status(400).json({ error: 'Payment could not be verified.' });
      }

      // markPaid leaves a revoked order revoked. Answering 200 here would tell the
      // learner the payment unlocked something it did not, so say what happened.
      const result = markPaid(order.id, { providerPaymentId: paymentId, via: 'checkout' });
      if (result.order.status !== 'paid') {
        console.warn(`[billing] payment ${paymentId} captured for ${result.order.status} order ${order.id}`);
        return res.status(409).json({ error: 'This order was cancelled. Contact support with your order id if you were charged.' });
      }
      res.json(paidResponse(req, result));
    })
  );

  /**
   * Test mode only - no money moves. Refused outright when the server has
   * Razorpay keys, and for any order that was not created in test mode, so
   * flipping keys on later cannot turn a test order into a real unlock.
   */
  router.post(
    '/billing/orders/:id/test-complete',
    requireAuth,
    billingRoute(async (req, res) => {
      const order = ownOrder(req);
      if (!order) return res.status(404).json({ error: 'No such order.' });
      if (provider.mode !== 'test' || order.provider !== 'test') {
        return res.status(409).json({ error: 'Test payments are only available while the server runs without Razorpay keys.' });
      }
      // Same as confirm: a revoked order stays revoked, so it never answers "paid".
      const result = markPaid(order.id, { via: 'test' });
      if (result.order.status !== 'paid') return res.status(409).json({ error: 'This order was cancelled, so it cannot be completed.' });
      res.json(paidResponse(req, result));
    })
  );

  router.get('/billing/orders', requireAuth, (req, res) => {
    res.json({ orders: store.ordersForUser(req.user.id) });
  });

  /* ---------------------------------------------------------- certificates */

  router.get('/certificates', requireAuth, (req, res) => {
    const snapshot = snapshotOf();
    res.json({ certificates: store.certificatesForUser(req.user.id).map((c) => publicCertificate(c, snapshot)) });
  });

  /** The owner's full view, for the printable page. Anyone else gets the same 404 as a missing id. */
  router.get('/certificates/:id', requireAuth, (req, res) => {
    const certificate = store.getCertificate(String(req.params.id).trim().toUpperCase());
    if (!certificate || certificate.userId !== req.user.id) return res.status(404).json({ error: 'No such certificate.' });
    const snapshot = snapshotOf();
    // "completed all N stages" - N is the track's visible stage count today.
    const view = learnerView(snapshot, overridesOf());
    const track = view.snapshotTracks.find((t) => t.id === certificate.trackId);
    const stagesTotal = view.stages.filter((s) => track?.stageIds.includes(s.id)).length;
    res.json({
      certificate: {
        ...publicCertificate(certificate, snapshot),
        username: req.user.username,
        stagesTotal,
        orderId: certificate.orderId
      }
    });
  });

  /** Public: the verification code printed on a certificate. Never the owner's account details. */
  router.get('/verify/:code', (req, res) => {
    res.json(verifyCertificate(req.params.code, { snapshot: snapshotOf() }));
  });

  return router;
}

/**
 * POST /api/billing/webhook - Razorpay tells us a payment was captured.
 * Verified against the RAW body with the webhook secret, so this router
 * parses the body itself and must be mounted before express.json().
 * Every verified event is answered 200 (Razorpay retries anything else),
 * marking the matching order paid at most once.
 */
export function createWebhookRouter({ provider }) {
  const router = express.Router();
  // Logged once per unknown provider order id, not once per retry.
  const unknownLogged = new Set();

  router.post('/billing/webhook', express.raw({ type: '*/*', limit: '256kb' }), (req, res) => {
    const signature = req.headers['x-razorpay-signature'];
    const raw = Buffer.isBuffer(req.body) ? req.body : null;
    if (!raw || !provider.verifyWebhook(raw, typeof signature === 'string' ? signature : '')) {
      return res.status(401).json({ error: 'Webhook signature could not be verified.' });
    }

    let event;
    try {
      event = JSON.parse(raw.toString('utf8'));
    } catch {
      return res.status(400).json({ error: 'Webhook body is not JSON.' });
    }

    if (event?.event === 'payment.captured' || event?.event === 'order.paid') {
      const payment = event.payload?.payment?.entity ?? {};
      const providerOrderId = typeof payment.order_id === 'string' ? payment.order_id : '';
      const order = providerOrderId ? store.allOrders().find((o) => o.providerOrderId === providerOrderId) : null;
      if (order) {
        markPaid(order.id, { providerPaymentId: typeof payment.id === 'string' ? payment.id : null, via: 'webhook' });
      } else if (!unknownLogged.has(providerOrderId)) {
        unknownLogged.add(providerOrderId);
        console.warn(`[billing] webhook ${event.event} for unknown order ${providerOrderId || '(no order id)'}`);
      }
    }
    res.json({ ok: true });
  });

  return router;
}
