/**
 * One-time purchases: the catalog, admin-set prices, what a learner owns,
 * orders and certificates.
 *
 * Everything is derived from PAID orders in server/db.js on every request -
 * nothing is cached on the user record, so revoking an order takes effect
 * immediately and a track purchase covers stages added to that track later.
 * The legacy `user.isPremium` flag still counts as a lifetime licence so no
 * account loses access it had before this existed.
 *
 * Prices come from here (DEFAULT_PRICES) or the admin's pricing record,
 * never from a request. An order becomes paid in exactly four ways, all in
 * markPaid(): a verified Razorpay checkout signature, a verified webhook,
 * the explicit test-mode step, or an admin grant - plus a price of 0, which
 * skips the gateway and is recorded as provider 'free'.
 *
 * No I/O apart from the store and the injected payment provider
 * (server/payments.js); content is handed in as `snapshot` + `overrides` so
 * the tests can run on a small bank.
 */
import crypto from 'node:crypto';
import * as store from './db.js';
import { applyLearnerOverrides } from './content.js';

export const CURRENCY = 'INR';
/** Paise. ₹1,999 / ₹999 / ₹499 / ₹299. */
export const DEFAULT_PRICES = { lifetime: 199900, track: 99900, stage: 49900, certificate: 29900 };
export const MIN_PRICE = 0;
/** ₹1,00,000 - a typo with an extra zero should be refused, not charged. */
export const MAX_PRICE = 10_000_000;
export const KINDS = ['lifetime', 'track', 'stage', 'certificate'];
/** What may go on a printed certificate: letters (any script), spaces, dots, apostrophes and dashes. */
export const CERTIFICATE_NAME_RE = /^[\p{L}\p{M} .'-]{2,80}$/u;
export const CERTIFICATE_NAME_HINT = 'The name on the certificate must be 2-80 characters: letters, spaces, dots, apostrophes and dashes.';

/** Tidy a name for a certificate; null when none was given, or `{ error }` when it will not do. */
export function certificateNameFrom(raw) {
  if (raw === undefined || raw === null || String(raw).trim() === '') return { name: null };
  const name = String(raw).trim().replace(/\s+/g, ' ');
  return CERTIFICATE_NAME_RE.test(name) ? { name } : { name: null, error: CERTIFICATE_NAME_HINT };
}

/**
 * Anything that stops a billing action. `message` is written for the person
 * on the other end and `status` is the HTTP status the route answers with:
 * 400 for a malformed product, 404 for a missing record, 409 when the
 * purchase is not allowed (already owned, not eligible, ...).
 */
export class BillingError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.name = 'BillingError';
    this.status = status;
  }
}

const now = () => new Date().toISOString();

/* ------------------------------------------------------------- products */

const ID_RE = /^[a-z0-9][a-z0-9_-]{0,63}$/i;

/**
 * Normalise a product from a request body: `{ kind, trackId?, stageId? }`
 * or its key form ('track:c'). Only the shape is checked here - whether the
 * track or stage exists (and is visible) is checked against the content by
 * the caller, which has the snapshot.
 */
export function parseProduct(raw) {
  if (typeof raw === 'string') return parseProduct(fromKey(raw));
  const kind = raw && typeof raw === 'object' ? raw.kind : undefined;
  const id = (field) => {
    const value = raw[field];
    return typeof value === 'string' && ID_RE.test(value.trim()) ? value.trim() : null;
  };
  switch (kind) {
    case 'lifetime':
      return { kind: 'lifetime' };
    case 'track': {
      const trackId = id('trackId');
      if (!trackId) throw new BillingError('Unknown product.');
      return { kind: 'track', trackId };
    }
    case 'stage': {
      const stageId = id('stageId');
      if (!stageId) throw new BillingError('Unknown product.');
      return { kind: 'stage', stageId };
    }
    case 'certificate': {
      const trackId = id('trackId');
      if (!trackId) throw new BillingError('Unknown product.');
      return { kind: 'certificate', trackId };
    }
    default:
      throw new BillingError('Unknown product.');
  }
}

function fromKey(key) {
  const [kind, ...rest] = String(key).split(':');
  const id = rest.join(':');
  if (kind === 'lifetime' && !id) return { kind };
  if (kind === 'track') return { kind, trackId: id };
  if (kind === 'stage') return { kind, stageId: id };
  if (kind === 'certificate') return { kind, trackId: id };
  return null;
}

/** The string id a product is priced and ordered under. */
export function productKey(product) {
  switch (product?.kind) {
    case 'lifetime':
      return 'lifetime';
    case 'track':
      return `track:${product.trackId}`;
    case 'stage':
      return `stage:${product.stageId}`;
    case 'certificate':
      return `certificate:${product.trackId}`;
    default:
      throw new BillingError('Unknown product.');
  }
}

/* -------------------------------------------------------------- pricing */

/** A stored price is only honoured when it is an integer within range; anything else falls back to the default. */
function validPrice(value) {
  return Number.isInteger(value) && value >= MIN_PRICE && value <= MAX_PRICE ? value : null;
}

/** The price of a product in paise: the admin's entry for that key, else the default for its kind. */
export function priceFor(product, pricing = store.getPricing()) {
  const p = pricing && typeof pricing === 'object' ? pricing : {};
  const own = (bucket, id) => (bucket && typeof bucket === 'object' && Object.hasOwn(bucket, id) ? validPrice(bucket[id]) : null);
  switch (product?.kind) {
    case 'lifetime':
      return validPrice(p.lifetime) ?? DEFAULT_PRICES.lifetime;
    case 'track':
      return own(p.tracks, product.trackId) ?? DEFAULT_PRICES.track;
    case 'stage':
      return own(p.stages, product.stageId) ?? DEFAULT_PRICES.stage;
    case 'certificate':
      return own(p.certificates, product.trackId) ?? DEFAULT_PRICES.certificate;
    default:
      throw new BillingError('Unknown product.');
  }
}

/* -------------------------------------------------------------- content */

const EMPTY_SNAPSHOT = { stages: [], challenges: [], languageTracks: [] };

/**
 * The learner-facing view of the content, the same one /api/content serves:
 * visible stages with admin overrides applied (so `isPremium` is the live
 * value), visible challenges, and the tracks that are not hidden with only
 * their visible stage ids, in the order learners see them. `snapshotTracks`
 * is the untouched track list, for expanding a track purchase.
 */
export function learnerView(snapshot, overrides) {
  const snap = snapshot ?? EMPTY_SNAPSHOT;
  const merged = applyLearnerOverrides(snap, overrides ?? {});
  const hiddenLanguages = overrides?.languages ?? {};
  const snapshotTracks = snap.languageTracks ?? [];
  const tracks = snapshotTracks
    .filter((t) => !hiddenLanguages[t.id]?.hidden)
    .map((t) => ({
      id: t.id,
      label: t.label,
      stageIds: merged.stages.filter((s) => t.stageIds.includes(s.id)).map((s) => s.id)
    }));
  return { stages: merged.stages, challenges: merged.challenges, tracks, snapshotTracks };
}

/** Throws unless the product names a visible stage or a visible track. */
function assertKnown(product, view) {
  if (product.kind === 'stage' && !view.stages.some((s) => s.id === product.stageId)) throw new BillingError('Unknown product.');
  if ((product.kind === 'track' || product.kind === 'certificate') && !view.tracks.some((t) => t.id === product.trackId)) {
    throw new BillingError('Unknown product.');
  }
}

export function trackLabel(trackId, snapshot) {
  return (snapshot?.languageTracks ?? []).find((t) => t.id === trackId)?.label ?? trackId;
}

/** Plain words for a checkout screen or an order row. */
export function describeProduct(product, snapshot) {
  switch (product?.kind) {
    case 'lifetime':
      return 'Lifetime licence - every premium stage';
    case 'track':
      return `${trackLabel(product.trackId, snapshot)} track - every premium stage in it`;
    case 'stage': {
      const stage = (snapshot?.stages ?? []).find((s) => s.id === product.stageId);
      return stage ? `Stage ${stage.index}: ${stage.name}` : `Stage ${product.stageId}`;
    }
    case 'certificate':
      return `Certificate of Completion - ${trackLabel(product.trackId, snapshot)}`;
    default:
      return 'CodeConsist purchase';
  }
}

/**
 * Everything that can be bought right now, priced. Only stages that are
 * premium AFTER admin overrides are listed, hidden stages and tracks are
 * left out, and a track lists both its stages and which of them are premium
 * so the client can say exactly what a track purchase opens.
 */
export function catalog({ snapshot, overrides, pricing = store.getPricing() }) {
  const view = learnerView(snapshot, overrides);
  const trackOf = new Map();
  for (const track of view.snapshotTracks) for (const id of track.stageIds) trackOf.set(id, track.id);
  const premium = new Set(view.stages.filter((s) => s.isPremium).map((s) => s.id));
  const price = (product) => priceFor(product, pricing);

  return {
    currency: CURRENCY,
    lifetime: {
      key: 'lifetime',
      amount: price({ kind: 'lifetime' }),
      name: 'Lifetime licence',
      description: 'Every premium stage, now and in future - one payment, no subscription.'
    },
    tracks: view.tracks.map((t) => ({
      key: productKey({ kind: 'track', trackId: t.id }),
      trackId: t.id,
      label: t.label,
      amount: price({ kind: 'track', trackId: t.id }),
      stageIds: t.stageIds,
      premiumStageIds: t.stageIds.filter((id) => premium.has(id))
    })),
    stages: view.stages
      .filter((s) => premium.has(s.id))
      .map((s) => ({
        key: productKey({ kind: 'stage', stageId: s.id }),
        stageId: s.id,
        name: s.name,
        index: s.index,
        trackId: trackOf.get(s.id) ?? null,
        amount: price({ kind: 'stage', stageId: s.id })
      })),
    certificates: view.tracks.map((t) => ({
      key: productKey({ kind: 'certificate', trackId: t.id }),
      trackId: t.id,
      label: t.label,
      amount: price({ kind: 'certificate', trackId: t.id })
    }))
  };
}

/* --------------------------------------------------------- entitlements */

/**
 * What a learner owns, from their PAID orders plus the legacy Pro flag.
 * `certificates` maps a track id to the id of its valid (unrevoked)
 * certificate.
 */
export function entitlementsFor(userId, user = store.findUserById(userId)) {
  let lifetime = Boolean(user?.isPremium);
  const trackIds = new Set();
  const stageIds = new Set();
  for (const order of store.ordersForUser(userId)) {
    if (order.status !== 'paid') continue;
    const product = order.product ?? {};
    if (product.kind === 'lifetime') lifetime = true;
    else if (product.kind === 'track' && product.trackId) trackIds.add(product.trackId);
    else if (product.kind === 'stage' && product.stageId) stageIds.add(product.stageId);
  }
  const certificates = {};
  for (const c of store.certificatesForUser(userId)) {
    if (!c.revokedAt && !certificates[c.trackId]) certificates[c.trackId] = c.id;
  }
  return { lifetime, trackIds: [...trackIds], stageIds: [...stageIds], certificates };
}

/**
 * The stage ids a learner has unlocked one by one or through a track. A
 * track is expanded against the CURRENT track list, so a stage added to a
 * bought track later is covered too. A lifetime licence is not expanded
 * here - callers check `entitlements.lifetime` first.
 */
export function unlockedStageIds(entitlements, tracks = []) {
  const ids = new Set(entitlements?.stageIds ?? []);
  for (const trackId of entitlements?.trackIds ?? []) {
    const track = tracks.find((t) => t.id === trackId);
    for (const id of track?.stageIds ?? []) ids.add(id);
  }
  return ids;
}

/* --------------------------------------------------------- certificates */

/**
 * May this learner get a certificate for this track? Only when every
 * visible stage in it is cleared: all of its lessons and its stage test
 * (the test is a challenge in the same list, so "every challenge solved"
 * covers both). A stage with no challenges yet cannot be cleared - the same
 * rule the progress model uses for `completedStages`.
 */
export function certificateEligibility(userId, trackId, { snapshot, overrides, progress = store.getProgress(userId) } = {}) {
  const issued = store.certificatesForUser(userId).find((c) => c.trackId === trackId && !c.revokedAt);
  const view = learnerView(snapshot, overrides);
  const track = view.snapshotTracks.find((t) => t.id === trackId);
  const stages = view.stages.filter((s) => track?.stageIds.includes(s.id));
  const solved = new Set(progress?.completedChallenges ?? []);

  let stagesCleared = 0;
  for (const stage of stages) {
    const inStage = view.challenges.filter((c) => c.stageId === stage.id);
    if (inStage.length > 0 && inStage.every((c) => solved.has(c.id))) stagesCleared += 1;
  }
  const counts = { stagesTotal: stages.length, stagesCleared };

  if (issued) return { eligible: false, reason: 'Already issued.', ...counts };
  if (!track) return { eligible: false, reason: 'No such track.', ...counts };
  if (!stages.length) return { eligible: false, reason: 'This track has no stages yet.', ...counts };
  if (stagesCleared < stages.length) {
    return { eligible: false, reason: `Finish every stage in this track (${stagesCleared} of ${stages.length} cleared).`, ...counts };
  }
  return { eligible: true, reason: 'Every stage cleared.', ...counts };
}

const ORDER_ALPHABET = 'abcdefghijklmnopqrstuvwxyz234567';
/** No 0/1/O/I: the code is read aloud and typed into the verify page. */
const CERT_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

// Both alphabets have 32 symbols, so a byte modulo 32 is unbiased.
function randomString(alphabet, length) {
  const bytes = crypto.randomBytes(length);
  let out = '';
  for (const b of bytes) out += alphabet[b % alphabet.length];
  return out;
}

export function newOrderId() {
  return `ord_${randomString(ORDER_ALPHABET, 12)}`;
}

export function newCertificateId() {
  return `CC-${new Date().getUTCFullYear()}-${randomString(CERT_ALPHABET, 8)}`;
}

/** Write a certificate for a paid certificate order. The id is checked against the store so it is never reused. */
export function issueCertificate({ order, user }) {
  let id = newCertificateId();
  while (store.getCertificate(id)) id = newCertificateId();
  const certificate = {
    id,
    userId: order.userId,
    trackId: order.product.trackId,
    learnerName: order.certificateName || user?.username || 'Learner',
    issuedAt: now(),
    orderId: order.id,
    revokedAt: null
  };
  store.putCertificate(certificate);
  return certificate;
}

/** The learner's and the public view of a certificate - never the userId. */
export function publicCertificate(certificate, snapshot) {
  return {
    id: certificate.id,
    trackId: certificate.trackId,
    trackLabel: trackLabel(certificate.trackId, snapshot),
    learnerName: certificate.learnerName,
    issuedAt: certificate.issuedAt,
    revoked: Boolean(certificate.revokedAt)
  };
}

/** The public verification answer for a code. A revoked certificate is reported, but not valid. */
export function verifyCertificate(code, { snapshot } = {}) {
  const id = String(code ?? '').trim().toUpperCase();
  const certificate = store.getCertificate(id);
  if (!certificate) return { valid: false };
  const view = publicCertificate(certificate, snapshot);
  return { valid: !view.revoked, certificate: view };
}

/* --------------------------------------------------------------- orders */

/**
 * Is this purchase allowed for this learner right now? `{ ok: true }` or
 * `{ ok: false, reason }` in plain words. `eligibility` is the
 * certificateEligibility() result and only matters for certificate
 * products; `snapshot`/`overrides` tell a free stage from a premium one.
 */
export function canPurchase(product, { user, entitlements, eligibility, snapshot, overrides } = {}) {
  const ent = entitlements ?? entitlementsFor(user?.id, user);
  const view = learnerView(snapshot, overrides);
  const unlocked = unlockedStageIds(ent, view.snapshotTracks);
  const no = (reason) => ({ ok: false, reason });

  switch (product?.kind) {
    case 'lifetime':
      return ent.lifetime ? no('You already own everything.') : { ok: true };
    case 'stage': {
      const stage = view.stages.find((s) => s.id === product.stageId);
      if (!stage) return no('Unknown product.');
      if (!stage.isPremium) return no('This stage is free - nothing to unlock.');
      if (ent.lifetime || unlocked.has(stage.id)) return no('You already have access to this.');
      return { ok: true };
    }
    case 'track': {
      const track = view.tracks.find((t) => t.id === product.trackId);
      if (!track) return no('Unknown product.');
      if (ent.lifetime || ent.trackIds.includes(track.id)) return no('You already have access to this.');
      const premium = track.stageIds.filter((id) => view.stages.find((s) => s.id === id)?.isPremium);
      if (!premium.length) return no('Every stage in this track is free - nothing to unlock.');
      if (premium.every((id) => unlocked.has(id))) return no('You already have access to this.');
      return { ok: true };
    }
    case 'certificate': {
      if (ent.certificates?.[product.trackId]) return no('Already issued.');
      if (!eligibility?.eligible) return no(eligibility?.reason || 'Finish every stage in this track first.');
      return { ok: true };
    }
    default:
      return no('Unknown product.');
  }
}

/** A fresh order record. Never exposed until it has been priced by priceFor(). */
function newOrder({ user, product, amount, provider, certificateName, note }) {
  return {
    id: newOrderId(),
    userId: user.id,
    product,
    productKey: productKey(product),
    amount,
    currency: CURRENCY,
    provider,
    status: 'created',
    providerOrderId: null,
    providerPaymentId: null,
    note: note ? String(note).trim().slice(0, 300) || null : null,
    certificateName: product.kind === 'certificate' && certificateName ? String(certificateName) : null,
    createdAt: now(),
    paidAt: null,
    revokedAt: null,
    revokedBy: null
  };
}

/**
 * Start a purchase. The amount is the SERVER's price for the product - a
 * request never carries one. A price of 0 skips the gateway: the order is
 * paid on the spot as provider 'free'. Otherwise the provider order is
 * created first and the order is only stored once the gateway has
 * answered, so a gateway failure leaves nothing behind.
 *
 * Throws BillingError 400 (malformed/unknown product), 409 (not allowed -
 * see canPurchase) or the provider's PaymentError.
 */
/**
 * One in-flight createOrder per learner and product. The lookup for an
 * existing open order and the write of a new one straddle the gateway call,
 * so two requests landing in the same tick would both get past the lookup and
 * both create a payable order. Node is single-threaded, so sharing the first
 * promise is all the mutual exclusion this needs.
 */
const inFlightOrders = new Map();

export async function createOrder(args) {
  const user = args?.user;
  const lockKey = user?.id ? `${user.id}|${safeProductKey(args?.product)}` : null;
  if (lockKey && inFlightOrders.has(lockKey)) return inFlightOrders.get(lockKey);

  const running = createOrderOnce(args);
  if (!lockKey) return running;
  inFlightOrders.set(lockKey, running);
  try {
    return await running;
  } finally {
    inFlightOrders.delete(lockKey);
  }
}

/** The product key for the lock, before validation - a malformed product still gets a stable key. */
function safeProductKey(raw) {
  try {
    return productKey(parseProduct(raw));
  } catch {
    return 'invalid';
  }
}

async function createOrderOnce({ user, product: rawProduct, pricing = store.getPricing(), provider, certificateName = null, snapshot, overrides, progress }) {
  const product = parseProduct(rawProduct);
  const view = learnerView(snapshot, overrides);
  assertKnown(product, view);

  const entitlements = entitlementsFor(user.id, user);
  const eligibility =
    product.kind === 'certificate' ? certificateEligibility(user.id, product.trackId, { snapshot, overrides, progress }) : null;
  const check = canPurchase(product, { user, entitlements, eligibility, snapshot, overrides });
  if (!check.ok) throw new BillingError(check.reason, 409);

  const amount = priceFor(product, pricing);

  // One unlock, one order. Two tabs (or an impatient second click) would
  // otherwise leave two payable orders for the same product and the learner
  // could pay both - and a certificate product would issue two valid ids for
  // one track. So the caller's own outstanding order for this product is
  // handed back instead, unless the price, the provider mode or the name on
  // the certificate has moved on since - then it can never be the right
  // order any more and it is retired.
  const key = productKey(product);
  const wantedName = product.kind === 'certificate' && certificateName ? String(certificateName) : null;
  const open = store.ordersForUser(user.id).find((o) => o.status === 'created' && o.productKey === key);
  if (open) {
    const stale = open.amount !== amount || open.provider !== provider?.mode || (open.certificateName ?? null) !== wantedName;
    if (!stale) return open;
    open.status = 'failed';
    store.putOrder(open);
  }

  if (amount === 0) {
    const order = store.putOrder(newOrder({ user, product, amount, provider: 'free', certificateName }));
    return markPaid(order.id, { via: 'free' }).order;
  }

  if (!provider) throw new BillingError('Payments are not available right now.', 503);
  const order = newOrder({ user, product, amount, provider: provider.mode, certificateName });
  const { providerOrderId } = await provider.createOrder({
    amount,
    currency: CURRENCY,
    receipt: order.id,
    notes: { userId: user.id, productKey: order.productKey }
  });
  order.providerOrderId = providerOrderId;
  return store.putOrder(order);
}

/**
 * The one place an order becomes paid. Idempotent: a paid order stays paid
 * and is returned as is; a revoked order stays revoked (an admin decided
 * that - a late webhook does not undo it). A certificate order issues its
 * certificate exactly once. Callers have already verified the payment.
 *
 * @param via 'checkout' | 'webhook' | 'test' | 'admin' | 'free' - only for the log line.
 */
export function markPaid(orderId, { providerPaymentId = null, via = 'checkout' } = {}) {
  const order = store.getOrder(orderId);
  if (!order) throw new BillingError('No such order.', 404);

  if (providerPaymentId && !order.providerPaymentId) order.providerPaymentId = String(providerPaymentId);
  if (order.status === 'revoked') {
    store.putOrder(order);
    return { order };
  }

  const alreadyPaid = order.status === 'paid';
  if (!alreadyPaid) {
    order.status = 'paid';
    order.paidAt = now();
  }

  let certificate;
  if (order.product?.kind === 'certificate') {
    certificate = order.certificateId ? store.getCertificate(order.certificateId) : null;
    if (!certificate) {
      certificate = issueCertificate({ order, user: store.findUserById(order.userId) });
      order.certificateId = certificate.id;
    }
  }

  store.putOrder(order);
  // One line per paid order, never a secret.
  if (!alreadyPaid) console.log(`[billing] paid ${order.id} ${order.productKey} user ${order.userId} via ${via}`);
  return certificate ? { order, certificate } : { order };
}

/** Take an order back. Access derived from it ends now; a certificate it issued is marked revoked. */
export function revokeOrder(orderId, adminUserId = null) {
  const order = store.getOrder(orderId);
  if (!order) throw new BillingError('No such order.', 404);
  if (order.status === 'revoked') throw new BillingError('This order is already revoked.', 409);

  order.status = 'revoked';
  order.revokedAt = now();
  order.revokedBy = adminUserId;
  store.putOrder(order);

  let certificate;
  if (order.certificateId) {
    certificate = store.getCertificate(order.certificateId);
    if (certificate && !certificate.revokedAt) {
      certificate.revokedAt = order.revokedAt;
      store.putCertificate(certificate);
    }
  }
  return certificate ? { order, certificate } : { order };
}

/**
 * An admin gives a product away (paid offline, goodwill, ...): an order of
 * amount 0 with provider 'admin', paid at once. It goes through the same
 * canPurchase() as a real purchase, so the admin sees "You already have
 * access to this." rather than creating a duplicate, and a certificate
 * still needs the track finished.
 */
export function grant({ adminUserId, userId, product: rawProduct, note = null, certificateName = null, snapshot, overrides }) {
  const user = store.findUserById(userId);
  if (!user) throw new BillingError('No such user.', 404);
  const product = parseProduct(rawProduct);
  const view = learnerView(snapshot, overrides);
  assertKnown(product, view);

  const entitlements = entitlementsFor(user.id, user);
  const eligibility = product.kind === 'certificate' ? certificateEligibility(user.id, product.trackId, { snapshot, overrides }) : null;
  const check = canPurchase(product, { user, entitlements, eligibility, snapshot, overrides });
  if (!check.ok) throw new BillingError(check.reason, 409);

  const order = store.putOrder(newOrder({ user, product, amount: 0, provider: 'admin', certificateName, note }));
  return markPaid(order.id, { via: 'admin' });
}

/** For the admin dashboard: paid orders, all-time and last-30-day takings in paise. */
export function revenueSummary(orders = store.allOrders()) {
  const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
  let paidOrders = 0;
  let totalPaise = 0;
  let last30DaysPaise = 0;
  for (const order of orders) {
    if (order.status !== 'paid') continue;
    paidOrders += 1;
    totalPaise += order.amount ?? 0;
    const paidAt = new Date(order.paidAt ?? order.createdAt ?? 0).getTime();
    if (!Number.isNaN(paidAt) && paidAt >= cutoff) last30DaysPaise += order.amount ?? 0;
  }
  return { paidOrders, totalPaise, last30DaysPaise };
}
