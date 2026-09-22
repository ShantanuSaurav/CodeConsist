/**
 * server/billing.js on an in-memory store and a small two-track bank: the
 * catalog, prices, what a learner owns, every purchase refusal, and the
 * order/certificate life cycle - paid exactly once, revoked cleanly.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

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
    allCertificates: () => newest(Object.values(state.certificates), 'issuedAt')
  };
});

import * as store from '../db.js';
import {
  BillingError,
  DEFAULT_PRICES,
  canPurchase,
  catalog,
  certificateEligibility,
  createOrder,
  entitlementsFor,
  grant,
  markPaid,
  newCertificateId,
  newOrderId,
  parseProduct,
  priceFor,
  productKey,
  revenueSummary,
  revokeOrder,
  unlockedStageIds,
  verifyCertificate
} from '../billing.js';

/* ------------------------------------------------------------- fixtures */

const stage = (id, index, name, extra = {}) => ({ id, index, name, slug: id, language: 'javascript', description: '', ...extra });
const lesson = (id, stageId, extra = {}) => ({ id, stageId, type: 'quiz', title: id, prompt: '', explanation: '', xpReward: 10, ...extra });

/** Two tracks: core (s1 free, s2 + s3 premium) and c (c1 free). Every stage has two lessons and a test, except c1 (one lesson + test). */
const SNAPSHOT = {
  builtAt: '2026-01-01T00:00:00.000Z',
  stages: [
    stage('s1', '01', 'Basics'),
    stage('s2', '02', 'System Design', { isPremium: true }),
    stage('s3', '03', 'Real Projects', { isPremium: true }),
    stage('c1', '01', 'C Fundamentals', { language: 'c' })
  ],
  challenges: [
    lesson('s1-a', 's1'),
    lesson('s1-b', 's1'),
    lesson('s1-test', 's1', { isStageTest: true }),
    lesson('s2-a', 's2'),
    lesson('s2-b', 's2'),
    lesson('s2-test', 's2', { isStageTest: true }),
    lesson('s3-a', 's3'),
    lesson('s3-b', 's3'),
    lesson('s3-test', 's3', { isStageTest: true }),
    lesson('c1-a', 'c1'),
    lesson('c1-test', 'c1', { isStageTest: true })
  ],
  languageTracks: [
    { id: 'core', label: 'Developer path', icon: '', tagline: '', description: '', primaryLanguage: 'javascript', stageIds: ['s1', 's2', 's3'] },
    { id: 'c', label: 'C', icon: '', tagline: '', description: '', primaryLanguage: 'c', stageIds: ['c1'] }
  ]
};
const NO_OVERRIDES = { stages: {}, challenges: {}, languages: {} };
const ALL_CORE = SNAPSHOT.challenges.filter((c) => c.stageId.startsWith('s')).map((c) => c.id);

const testProvider = () => ({
  mode: 'test',
  keyId: '',
  configured: false,
  createOrder: vi.fn(async () => ({ providerOrderId: 'test_abc' })),
  verifyCheckout: () => false,
  verifyWebhook: () => false
});

const ctx = (extra = {}) => ({ snapshot: SNAPSHOT, overrides: NO_OVERRIDES, ...extra });
const user = (id = 'u1', extra = {}) => store.insertUser({ id, email: `${id}@example.com`, username: id, passwordHash: 'x', isPremium: false, ...extra });
const silence = () => vi.spyOn(console, 'log').mockImplementation(() => {});

beforeEach(() => {
  store.reset();
  vi.restoreAllMocks();
  silence();
});

/* ------------------------------------------------------------- products */

describe('parseProduct / productKey', () => {
  it('normalises the four product shapes and their key forms', () => {
    expect(parseProduct({ kind: 'lifetime', junk: 1 })).toEqual({ kind: 'lifetime' });
    expect(parseProduct({ kind: 'track', trackId: ' c ' })).toEqual({ kind: 'track', trackId: 'c' });
    expect(parseProduct({ kind: 'stage', stageId: 's2' })).toEqual({ kind: 'stage', stageId: 's2' });
    expect(parseProduct({ kind: 'certificate', trackId: 'core' })).toEqual({ kind: 'certificate', trackId: 'core' });
    expect(parseProduct('lifetime')).toEqual({ kind: 'lifetime' });
    expect(parseProduct('track:c')).toEqual({ kind: 'track', trackId: 'c' });
    expect(parseProduct('certificate:core')).toEqual({ kind: 'certificate', trackId: 'core' });
  });

  it('throws BillingError 400 "Unknown product." for anything else', () => {
    for (const bad of [null, undefined, 42, {}, { kind: 'pro' }, { kind: 'track' }, { kind: 'stage', stageId: '' }, { kind: 'stage', stageId: '../x' }, 'lifetime:x', 'subscription']) {
      const err = (() => {
        try {
          parseProduct(bad);
          return null;
        } catch (e) {
          return e;
        }
      })();
      expect(err, JSON.stringify(bad)).toBeInstanceOf(BillingError);
      expect(err.status).toBe(400);
      expect(err.message).toBe('Unknown product.');
    }
  });

  it('keys products the way prices and orders are stored', () => {
    expect(productKey({ kind: 'lifetime' })).toBe('lifetime');
    expect(productKey({ kind: 'track', trackId: 'c' })).toBe('track:c');
    expect(productKey({ kind: 'stage', stageId: 's3' })).toBe('stage:s3');
    expect(productKey({ kind: 'certificate', trackId: 'core' })).toBe('certificate:core');
    expect(() => productKey({ kind: 'x' })).toThrow(BillingError);
  });
});

/* ------------------------------------------------------------- pricing */

describe('priceFor', () => {
  it('falls back to the default for each kind', () => {
    expect(priceFor({ kind: 'lifetime' }, {})).toBe(DEFAULT_PRICES.lifetime);
    expect(priceFor({ kind: 'track', trackId: 'c' }, {})).toBe(DEFAULT_PRICES.track);
    expect(priceFor({ kind: 'stage', stageId: 's2' }, {})).toBe(DEFAULT_PRICES.stage);
    expect(priceFor({ kind: 'certificate', trackId: 'core' }, undefined)).toBe(DEFAULT_PRICES.certificate);
  });

  it('honours the admin pricing record, including a price of 0', () => {
    const pricing = { lifetime: 150000, tracks: { c: 0 }, stages: { s2: 12345 }, certificates: { core: 0 } };
    expect(priceFor({ kind: 'lifetime' }, pricing)).toBe(150000);
    expect(priceFor({ kind: 'track', trackId: 'c' }, pricing)).toBe(0);
    expect(priceFor({ kind: 'track', trackId: 'core' }, pricing)).toBe(DEFAULT_PRICES.track);
    expect(priceFor({ kind: 'stage', stageId: 's2' }, pricing)).toBe(12345);
    expect(priceFor({ kind: 'stage', stageId: 's3' }, pricing)).toBe(DEFAULT_PRICES.stage);
    expect(priceFor({ kind: 'certificate', trackId: 'core' }, pricing)).toBe(0);
  });

  it('ignores a stored value that is not a whole number in range, and prototype keys', () => {
    expect(priceFor({ kind: 'lifetime' }, { lifetime: '1999' })).toBe(DEFAULT_PRICES.lifetime);
    expect(priceFor({ kind: 'lifetime' }, { lifetime: -5 })).toBe(DEFAULT_PRICES.lifetime);
    expect(priceFor({ kind: 'lifetime' }, { lifetime: 10_000_001 })).toBe(DEFAULT_PRICES.lifetime);
    expect(priceFor({ kind: 'stage', stageId: 's2' }, { stages: { s2: 12.5 } })).toBe(DEFAULT_PRICES.stage);
    expect(priceFor({ kind: 'stage', stageId: 'constructor' }, { stages: {} })).toBe(DEFAULT_PRICES.stage);
  });
});

/* ------------------------------------------------------------- catalog */

describe('catalog', () => {
  it('lists only premium, visible stages, with the tracks and certificates priced', () => {
    const c = catalog(ctx({ pricing: { stages: { s3: 100 } } }));
    expect(c.currency).toBe('INR');
    expect(c.lifetime).toEqual({ key: 'lifetime', amount: DEFAULT_PRICES.lifetime, name: 'Lifetime licence', description: expect.stringContaining('no subscription') });
    expect(c.stages.map((s) => s.stageId)).toEqual(['s2', 's3']);
    expect(c.stages[1]).toEqual({ key: 'stage:s3', stageId: 's3', name: 'Real Projects', index: '03', trackId: 'core', amount: 100 });
    expect(c.tracks).toEqual([
      { key: 'track:core', trackId: 'core', label: 'Developer path', amount: DEFAULT_PRICES.track, stageIds: ['s1', 's2', 's3'], premiumStageIds: ['s2', 's3'] },
      { key: 'track:c', trackId: 'c', label: 'C', amount: DEFAULT_PRICES.track, stageIds: ['c1'], premiumStageIds: [] }
    ]);
    expect(c.certificates.map((x) => x.key)).toEqual(['certificate:core', 'certificate:c']);
  });

  it('applies admin overrides: a hidden stage disappears, a premium override appears, a hidden track goes', () => {
    const overrides = { stages: { s3: { hidden: true }, c1: { isPremium: true } }, challenges: {}, languages: {} };
    const c = catalog(ctx({ overrides }));
    expect(c.stages.map((s) => s.stageId)).toEqual(['s2', 'c1']);
    expect(c.tracks.find((t) => t.trackId === 'core').stageIds).toEqual(['s1', 's2']);
    expect(c.tracks.find((t) => t.trackId === 'c').premiumStageIds).toEqual(['c1']);

    const hiddenTrack = catalog(ctx({ overrides: { ...NO_OVERRIDES, languages: { c: { hidden: true } } } }));
    expect(hiddenTrack.tracks.map((t) => t.trackId)).toEqual(['core']);
    expect(hiddenTrack.certificates.map((t) => t.trackId)).toEqual(['core']);
  });
});

/* -------------------------------------------------------- entitlements */

const paidOrder = (userId, product, extra = {}) =>
  store.putOrder({
    id: newOrderId(),
    userId,
    product,
    productKey: productKey(product),
    amount: 0,
    currency: 'INR',
    provider: 'admin',
    status: 'paid',
    providerOrderId: null,
    providerPaymentId: null,
    note: null,
    certificateName: null,
    createdAt: new Date().toISOString(),
    paidAt: new Date().toISOString(),
    revokedAt: null,
    revokedBy: null,
    ...extra
  });

describe('entitlementsFor / unlockedStageIds', () => {
  it('treats the legacy isPremium flag as a lifetime licence', () => {
    const u = user('u1', { isPremium: true });
    expect(entitlementsFor(u.id, u)).toEqual({ lifetime: true, trackIds: [], stageIds: [], certificates: {} });
    expect(entitlementsFor('u1').lifetime).toBe(true);
    expect(entitlementsFor('nobody').lifetime).toBe(false);
  });

  it('collects paid stage, track and lifetime orders; unpaid and revoked ones count for nothing', () => {
    const u = user();
    paidOrder(u.id, { kind: 'stage', stageId: 's2' });
    paidOrder(u.id, { kind: 'track', trackId: 'c' });
    paidOrder(u.id, { kind: 'stage', stageId: 's3' }, { status: 'created' });
    paidOrder(u.id, { kind: 'lifetime' }, { status: 'revoked' });
    paidOrder('someone-else', { kind: 'lifetime' });
    const ent = entitlementsFor(u.id, u);
    expect(ent).toEqual({ lifetime: false, trackIds: ['c'], stageIds: ['s2'], certificates: {} });
    expect(unlockedStageIds(ent, SNAPSHOT.languageTracks)).toEqual(new Set(['s2', 'c1']));

    paidOrder(u.id, { kind: 'lifetime' });
    expect(entitlementsFor(u.id, u).lifetime).toBe(true);
  });

  it('expands a track purchase against the CURRENT track list, so a stage added later is covered', () => {
    const u = user();
    paidOrder(u.id, { kind: 'track', trackId: 'c' });
    const ent = entitlementsFor(u.id, u);
    expect(unlockedStageIds(ent, SNAPSHOT.languageTracks)).toEqual(new Set(['c1']));
    const grown = [{ id: 'c', stageIds: ['c1', 'c2'] }];
    expect(unlockedStageIds(ent, grown)).toEqual(new Set(['c1', 'c2']));
    // A track the content no longer knows expands to nothing, never throws.
    expect(unlockedStageIds(ent, [])).toEqual(new Set());
  });

  it('maps a valid certificate per track, ignoring revoked ones', () => {
    const u = user();
    store.putCertificate({ id: 'CC-2026-AAAAAAAA', userId: u.id, trackId: 'core', learnerName: 'U', issuedAt: '2026-01-02T00:00:00.000Z', orderId: 'o', revokedAt: '2026-01-03T00:00:00.000Z' });
    store.putCertificate({ id: 'CC-2026-BBBBBBBB', userId: u.id, trackId: 'core', learnerName: 'U', issuedAt: '2026-01-01T00:00:00.000Z', orderId: 'o2', revokedAt: null });
    expect(entitlementsFor(u.id, u).certificates).toEqual({ core: 'CC-2026-BBBBBBBB' });
  });
});

/* ----------------------------------------------------------- canPurchase */

describe('canPurchase', () => {
  const check = (product, u, extra = {}) => canPurchase(product, { user: u, entitlements: entitlementsFor(u.id, u), ...ctx(), ...extra });

  it('allows a fresh learner every premium thing', () => {
    const u = user();
    expect(check({ kind: 'lifetime' }, u)).toEqual({ ok: true });
    expect(check({ kind: 'stage', stageId: 's2' }, u)).toEqual({ ok: true });
    expect(check({ kind: 'track', trackId: 'core' }, u)).toEqual({ ok: true });
  });

  it('refuses a second lifetime licence', () => {
    const u = user('u1', { isPremium: true });
    expect(check({ kind: 'lifetime' }, u)).toEqual({ ok: false, reason: 'You already own everything.' });
  });

  it('refuses a stage or track the learner already has - by lifetime, by track or by stage', () => {
    const lifetime = user('l', { isPremium: true });
    expect(check({ kind: 'stage', stageId: 's2' }, lifetime)).toEqual({ ok: false, reason: 'You already have access to this.' });
    expect(check({ kind: 'track', trackId: 'core' }, lifetime)).toEqual({ ok: false, reason: 'You already have access to this.' });

    const byTrack = user('t');
    paidOrder(byTrack.id, { kind: 'track', trackId: 'core' });
    expect(check({ kind: 'stage', stageId: 's3' }, byTrack).reason).toBe('You already have access to this.');
    expect(check({ kind: 'track', trackId: 'core' }, byTrack).reason).toBe('You already have access to this.');

    const byStage = user('s');
    paidOrder(byStage.id, { kind: 'stage', stageId: 's2' });
    expect(check({ kind: 'stage', stageId: 's2' }, byStage).reason).toBe('You already have access to this.');
    // One of two premium stages owned: the track is still worth buying.
    expect(check({ kind: 'track', trackId: 'core' }, byStage)).toEqual({ ok: true });
    paidOrder(byStage.id, { kind: 'stage', stageId: 's3' });
    expect(check({ kind: 'track', trackId: 'core' }, byStage).reason).toBe('You already have access to this.');
  });

  it('refuses a free stage, a track with nothing premium in it, and ids it does not know', () => {
    const u = user();
    expect(check({ kind: 'stage', stageId: 's1' }, u)).toEqual({ ok: false, reason: 'This stage is free - nothing to unlock.' });
    expect(check({ kind: 'track', trackId: 'c' }, u)).toEqual({ ok: false, reason: 'Every stage in this track is free - nothing to unlock.' });
    expect(check({ kind: 'stage', stageId: 'nope' }, u)).toEqual({ ok: false, reason: 'Unknown product.' });
    expect(check({ kind: 'track', trackId: 'nope' }, u)).toEqual({ ok: false, reason: 'Unknown product.' });
    // Hidden by an admin = not for sale.
    const overrides = { stages: { s2: { hidden: true } }, challenges: {}, languages: {} };
    expect(check({ kind: 'stage', stageId: 's2' }, u, { overrides })).toEqual({ ok: false, reason: 'Unknown product.' });
  });

  it('refuses a certificate the learner is not eligible for, or already has', () => {
    const u = user();
    const eligibility = certificateEligibility(u.id, 'core', ctx({ progress: { completedChallenges: ['s1-a'] } }));
    expect(check({ kind: 'certificate', trackId: 'core' }, u, { eligibility })).toEqual({ ok: false, reason: 'Finish every stage in this track (0 of 3 cleared).' });

    const done = certificateEligibility(u.id, 'core', ctx({ progress: { completedChallenges: ALL_CORE } }));
    expect(check({ kind: 'certificate', trackId: 'core' }, u, { eligibility: done })).toEqual({ ok: true });

    store.putCertificate({ id: 'CC-2026-CCCCCCCC', userId: u.id, trackId: 'core', learnerName: 'U', issuedAt: new Date().toISOString(), orderId: 'o', revokedAt: null });
    expect(check({ kind: 'certificate', trackId: 'core' }, u, { eligibility: done })).toEqual({ ok: false, reason: 'Already issued.' });
  });
});

/* ------------------------------------------------- certificate eligibility */

describe('certificateEligibility', () => {
  it('needs every lesson AND the stage test of every visible stage', () => {
    const u = user();
    const lessonsOnly = ALL_CORE.filter((id) => !id.endsWith('-test'));
    expect(certificateEligibility(u.id, 'core', ctx({ progress: { completedChallenges: lessonsOnly } }))).toEqual({
      eligible: false,
      reason: 'Finish every stage in this track (0 of 3 cleared).',
      stagesTotal: 3,
      stagesCleared: 0
    });
    const twoStages = ALL_CORE.filter((id) => !id.startsWith('s3'));
    expect(certificateEligibility(u.id, 'core', ctx({ progress: { completedChallenges: twoStages } }))).toMatchObject({ eligible: false, stagesCleared: 2, stagesTotal: 3 });
    expect(certificateEligibility(u.id, 'core', ctx({ progress: { completedChallenges: ALL_CORE } }))).toMatchObject({ eligible: true, stagesCleared: 3, stagesTotal: 3 });
  });

  it('ignores a stage an admin hid, and a challenge an admin hid', () => {
    const u = user();
    const twoStages = ALL_CORE.filter((id) => !id.startsWith('s3'));
    const overrides = { stages: { s3: { hidden: true } }, challenges: {}, languages: {} };
    expect(certificateEligibility(u.id, 'core', ctx({ overrides, progress: { completedChallenges: twoStages } }))).toMatchObject({ eligible: true, stagesTotal: 2, stagesCleared: 2 });

    const hiddenLesson = { stages: {}, challenges: { 's3-b': { hidden: true } }, languages: {} };
    const without = ALL_CORE.filter((id) => id !== 's3-b');
    expect(certificateEligibility(u.id, 'core', ctx({ overrides: hiddenLesson, progress: { completedChallenges: without } })).eligible).toBe(true);
  });

  it('reports a track with no stages, an unknown track, and one already issued', () => {
    const u = user();
    const emptyTrack = { ...SNAPSHOT, languageTracks: [...SNAPSHOT.languageTracks, { id: 'go', label: 'Go', stageIds: [] }] };
    expect(certificateEligibility(u.id, 'go', { snapshot: emptyTrack, overrides: NO_OVERRIDES, progress: { completedChallenges: [] } })).toMatchObject({ eligible: false, reason: 'This track has no stages yet.' });
    expect(certificateEligibility(u.id, 'nope', ctx({ progress: { completedChallenges: [] } }))).toMatchObject({ eligible: false, reason: 'No such track.' });

    store.putCertificate({ id: 'CC-2026-DDDDDDDD', userId: u.id, trackId: 'core', learnerName: 'U', issuedAt: new Date().toISOString(), orderId: 'o', revokedAt: null });
    expect(certificateEligibility(u.id, 'core', ctx({ progress: { completedChallenges: ALL_CORE } }))).toMatchObject({ eligible: false, reason: 'Already issued.', stagesCleared: 3 });
  });

  it('reads progress from the store when none is handed in', () => {
    const u = user();
    store.setProgress(u.id, { completedChallenges: ALL_CORE });
    expect(certificateEligibility(u.id, 'core', ctx()).eligible).toBe(true);
  });
});

/* --------------------------------------------------------------- orders */

describe('createOrder', () => {
  it('prices from the server and ignores any amount the client sent', async () => {
    const u = user();
    const provider = testProvider();
    const order = await createOrder({ user: u, product: { kind: 'stage', stageId: 's2', amount: 1 }, pricing: { stages: { s2: 4200 } }, provider, ...ctx() });
    expect(order).toMatchObject({
      userId: u.id,
      product: { kind: 'stage', stageId: 's2' },
      productKey: 'stage:s2',
      amount: 4200,
      currency: 'INR',
      provider: 'test',
      status: 'created',
      providerOrderId: 'test_abc',
      providerPaymentId: null,
      paidAt: null,
      revokedAt: null
    });
    expect(order.id).toMatch(/^ord_[a-z2-7]{12}$/);
    expect(provider.createOrder).toHaveBeenCalledWith({ amount: 4200, currency: 'INR', receipt: order.id, notes: { userId: u.id, productKey: 'stage:s2' } });
    expect(store.getOrder(order.id)).toBe(order);
    // Not paid, so nothing is unlocked yet.
    expect(entitlementsFor(u.id, u).stageIds).toEqual([]);
  });

  it('pays a free product on the spot without the gateway', async () => {
    const u = user();
    const provider = testProvider();
    const order = await createOrder({ user: u, product: { kind: 'track', trackId: 'core' }, pricing: { tracks: { core: 0 } }, provider, ...ctx() });
    expect(order).toMatchObject({ amount: 0, provider: 'free', status: 'paid', providerOrderId: null });
    expect(order.paidAt).toBeTruthy();
    expect(provider.createOrder).not.toHaveBeenCalled();
    expect(unlockedStageIds(entitlementsFor(u.id, u), SNAPSHOT.languageTracks)).toEqual(new Set(['s1', 's2', 's3']));
  });

  it('refuses what canPurchase refuses with a 409, and an unknown product with a 400', async () => {
    const u = user('u1', { isPremium: true });
    const err = await createOrder({ user: u, product: { kind: 'lifetime' }, provider: testProvider(), ...ctx() }).catch((e) => e);
    expect(err).toBeInstanceOf(BillingError);
    expect(err.status).toBe(409);
    expect(err.message).toBe('You already own everything.');

    const unknown = await createOrder({ user: u, product: { kind: 'stage', stageId: 'nope' }, provider: testProvider(), ...ctx() }).catch((e) => e);
    expect(unknown.status).toBe(400);
    expect(unknown.message).toBe('Unknown product.');
    expect(store.allOrders()).toEqual([]);
  });

  it('stores nothing when the gateway fails', async () => {
    const u = user();
    const provider = { ...testProvider(), mode: 'razorpay', createOrder: vi.fn(async () => { throw new Error('gateway down'); }) };
    await expect(createOrder({ user: u, product: { kind: 'lifetime' }, provider, ...ctx() })).rejects.toThrow('gateway down');
    expect(store.allOrders()).toEqual([]);
  });

  it('keeps the certificate name only on a certificate order, and needs the track finished', async () => {
    const u = user();
    store.setProgress(u.id, { completedChallenges: ALL_CORE });
    const order = await createOrder({ user: u, product: { kind: 'certificate', trackId: 'core' }, certificateName: 'Ada Lovelace', provider: testProvider(), ...ctx() });
    expect(order).toMatchObject({ productKey: 'certificate:core', certificateName: 'Ada Lovelace', status: 'created' });
    expect(store.allCertificates()).toEqual([]);

    const other = user('u2');
    const err = await createOrder({ user: other, product: { kind: 'certificate', trackId: 'core' }, provider: testProvider(), ...ctx() }).catch((e) => e);
    expect(err.status).toBe(409);
    expect(err.message).toBe('Finish every stage in this track (0 of 3 cleared).');

    const plain = await createOrder({ user: other, product: { kind: 'stage', stageId: 's2' }, certificateName: 'Ada', provider: testProvider(), ...ctx() });
    expect(plain.certificateName).toBeNull();
  });

  it('hands back the caller’s own outstanding order instead of a second payable one', async () => {
    const u = user();
    const provider = testProvider();
    const first = await createOrder({ user: u, product: { kind: 'stage', stageId: 's2' }, provider, ...ctx() });
    const second = await createOrder({ user: u, product: { kind: 'stage', stageId: 's2' }, provider, ...ctx() });
    expect(second.id).toBe(first.id);
    expect(provider.createOrder).toHaveBeenCalledTimes(1);
    expect(store.allOrders()).toHaveLength(1);

    // Another learner's open order for the same product is none of this one's business.
    const other = user('u2');
    const mine = await createOrder({ user: other, product: { kind: 'stage', stageId: 's2' }, provider, ...ctx() });
    expect(mine.id).not.toBe(first.id);
    // A different product still gets its own order.
    const licence = await createOrder({ user: u, product: { kind: 'lifetime' }, provider, ...ctx() });
    expect(licence.id).not.toBe(first.id);
  });

  it('creates one order when two requests land at the same moment', async () => {
    const u = user();
    const provider = testProvider();
    // Two clicks in the same tick: the lookup for an open order and the write
    // of a new one straddle the gateway call, so without the in-flight guard
    // both would get past the lookup and the learner could pay twice.
    const [a, b] = await Promise.all([
      createOrder({ user: u, product: { kind: 'stage', stageId: 's2' }, provider, ...ctx() }),
      createOrder({ user: u, product: { kind: 'stage', stageId: 's2' }, provider, ...ctx() })
    ]);
    expect(b.id).toBe(a.id);
    expect(provider.createOrder).toHaveBeenCalledTimes(1);
    expect(store.allOrders()).toHaveLength(1);

    // The guard is released afterwards, so a later, genuine second product still works.
    const licence = await createOrder({ user: u, product: { kind: 'lifetime' }, provider, ...ctx() });
    expect(licence.id).not.toBe(a.id);
  });

  it('retires a stale open order when the price, the provider or the certificate name moved on', async () => {
    const u = user();
    const provider = testProvider();
    const cheap = await createOrder({ user: u, product: { kind: 'stage', stageId: 's2' }, pricing: { stages: { s2: 4200 } }, provider, ...ctx() });
    const dearer = await createOrder({ user: u, product: { kind: 'stage', stageId: 's2' }, pricing: { stages: { s2: 9900 } }, provider, ...ctx() });
    expect(dearer.id).not.toBe(cheap.id);
    expect(dearer.amount).toBe(9900);
    // The old one can never be the right order now, so it is not payable.
    expect(store.getOrder(cheap.id).status).toBe('failed');

    // A test order is not a Razorpay order: switching modes retires it too.
    const live = { ...testProvider(), mode: 'razorpay' };
    const relisted = await createOrder({ user: u, product: { kind: 'stage', stageId: 's2' }, pricing: { stages: { s2: 9900 } }, provider: live, ...ctx() });
    expect(relisted.id).not.toBe(dearer.id);
    expect(store.getOrder(dearer.id).status).toBe('failed');
  });

  it('reuses a pending certificate order only when the name on it is the same', async () => {
    const u = user();
    store.setProgress(u.id, { completedChallenges: ALL_CORE });
    const provider = testProvider();
    const cert = { kind: 'certificate', trackId: 'core' };
    const first = await createOrder({ user: u, product: cert, certificateName: 'Ada Lovelace', provider, ...ctx() });
    const again = await createOrder({ user: u, product: cert, certificateName: 'Ada Lovelace', provider, ...ctx() });
    expect(again.id).toBe(first.id);

    const renamed = await createOrder({ user: u, product: cert, certificateName: 'Ada B. Lovelace', provider, ...ctx() });
    expect(renamed.id).not.toBe(first.id);
    expect(renamed.certificateName).toBe('Ada B. Lovelace');
    expect(store.getOrder(first.id).status).toBe('failed');

    // Paying the survivor issues exactly one certificate for the track.
    markPaid(renamed.id, { via: 'test' });
    expect(store.allCertificates()).toHaveLength(1);
    expect(store.allCertificates()[0].learnerName).toBe('Ada B. Lovelace');
  });
});

describe('markPaid', () => {
  it('is idempotent: paid once, paidAt and the payment id kept from the first call', async () => {
    const u = user();
    const order = await createOrder({ user: u, product: { kind: 'stage', stageId: 's2' }, provider: testProvider(), ...ctx() });
    const first = markPaid(order.id, { providerPaymentId: 'pay_1', via: 'test' });
    expect(first.order).toMatchObject({ status: 'paid', providerPaymentId: 'pay_1' });
    expect(first.certificate).toBeUndefined();
    const paidAt = first.order.paidAt;

    const again = markPaid(order.id, { providerPaymentId: 'pay_2', via: 'webhook' });
    expect(again.order.paidAt).toBe(paidAt);
    expect(again.order.providerPaymentId).toBe('pay_1');
    expect(console.log).toHaveBeenCalledTimes(1);
    expect(console.log.mock.calls[0][0]).toBe(`[billing] paid ${order.id} stage:s2 user ${u.id} via test`);
    expect(entitlementsFor(u.id, u).stageIds).toEqual(['s2']);
  });

  it('lets a failed checkout be rescued by a later verified payment, but never un-revokes', async () => {
    const u = user();
    const order = await createOrder({ user: u, product: { kind: 'stage', stageId: 's2' }, provider: testProvider(), ...ctx() });
    order.status = 'failed';
    store.putOrder(order);
    expect(markPaid(order.id, { via: 'webhook' }).order.status).toBe('paid');

    revokeOrder(order.id, 'admin-1');
    expect(markPaid(order.id, { via: 'webhook', providerPaymentId: 'late' }).order).toMatchObject({ status: 'revoked', providerPaymentId: 'late' });
    expect(entitlementsFor(u.id, u).stageIds).toEqual([]);
  });

  it('issues exactly one certificate for a certificate order, named after the order or the learner', async () => {
    const u = user('ada');
    store.setProgress(u.id, { completedChallenges: ALL_CORE });
    const order = await createOrder({ user: u, product: { kind: 'certificate', trackId: 'core' }, certificateName: 'Ada Lovelace', provider: testProvider(), ...ctx() });

    const { certificate } = markPaid(order.id, { via: 'test' });
    expect(certificate).toMatchObject({ userId: u.id, trackId: 'core', learnerName: 'Ada Lovelace', orderId: order.id, revokedAt: null });
    expect(certificate.id).toMatch(/^CC-\d{4}-[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}$/);
    expect(store.getOrder(order.id).certificateId).toBe(certificate.id);

    const again = markPaid(order.id, { via: 'webhook' });
    expect(again.certificate.id).toBe(certificate.id);
    expect(store.allCertificates()).toHaveLength(1);
    expect(entitlementsFor(u.id, u).certificates).toEqual({ core: certificate.id });

    // No name given: the username goes on it.
    const bob = user('bob');
    store.setProgress(bob.id, { completedChallenges: ALL_CORE });
    const bobs = await createOrder({ user: bob, product: { kind: 'certificate', trackId: 'core' }, pricing: { certificates: { core: 0 } }, provider: testProvider(), ...ctx() });
    expect(store.getCertificate(bobs.certificateId).learnerName).toBe('bob');
  });

  it('throws 404 for an order it does not have', () => {
    expect(() => markPaid('ord_nope', { via: 'test' })).toThrow(BillingError);
  });
});

describe('revokeOrder', () => {
  it('ends the access the order gave and flags its certificate', async () => {
    const u = user();
    const stageOrder = await createOrder({ user: u, product: { kind: 'stage', stageId: 's2' }, pricing: { stages: { s2: 0 } }, provider: testProvider(), ...ctx() });
    expect(entitlementsFor(u.id, u).stageIds).toEqual(['s2']);

    const { order } = revokeOrder(stageOrder.id, 'admin-1');
    expect(order).toMatchObject({ status: 'revoked', revokedBy: 'admin-1' });
    expect(order.revokedAt).toBeTruthy();
    expect(entitlementsFor(u.id, u).stageIds).toEqual([]);
    expect(canPurchase({ kind: 'stage', stageId: 's2' }, { user: u, ...ctx() })).toEqual({ ok: true });

    store.setProgress(u.id, { completedChallenges: ALL_CORE });
    const certOrder = await createOrder({ user: u, product: { kind: 'certificate', trackId: 'core' }, pricing: { certificates: { core: 0 } }, provider: testProvider(), ...ctx() });
    const before = verifyCertificate(certOrder.certificateId, { snapshot: SNAPSHOT });
    expect(before.valid).toBe(true);

    const revoked = revokeOrder(certOrder.id, 'admin-1');
    expect(revoked.certificate.revokedAt).toBeTruthy();
    expect(verifyCertificate(certOrder.certificateId, { snapshot: SNAPSHOT })).toMatchObject({ valid: false, certificate: { revoked: true } });
    expect(entitlementsFor(u.id, u).certificates).toEqual({});
  });

  it('refuses a second revoke (409) and an unknown order (404)', async () => {
    const u = user();
    const order = await createOrder({ user: u, product: { kind: 'lifetime' }, provider: testProvider(), ...ctx() });
    revokeOrder(order.id, 'admin-1');
    const twice = (() => {
      try {
        revokeOrder(order.id, 'admin-1');
        return null;
      } catch (e) {
        return e;
      }
    })();
    expect(twice).toBeInstanceOf(BillingError);
    expect(twice.status).toBe(409);
    expect(() => revokeOrder('ord_nope', 'admin-1')).toThrow(BillingError);
  });
});

describe('grant', () => {
  it('creates a paid admin order of amount 0 that unlocks at once', () => {
    const u = user();
    const { order, certificate } = grant({ adminUserId: 'admin-1', userId: u.id, product: 'track:core', note: '  paid by UPI ref 42  ', ...ctx() });
    expect(order).toMatchObject({ provider: 'admin', amount: 0, status: 'paid', productKey: 'track:core', note: 'paid by UPI ref 42' });
    expect(certificate).toBeUndefined();
    expect(unlockedStageIds(entitlementsFor(u.id, u), SNAPSHOT.languageTracks)).toEqual(new Set(['s1', 's2', 's3']));
  });

  it('goes through the same checks as a purchase', () => {
    const u = user();
    grant({ adminUserId: 'admin-1', userId: u.id, product: { kind: 'lifetime' }, ...ctx() });
    const dup = (() => {
      try {
        grant({ adminUserId: 'admin-1', userId: u.id, product: { kind: 'stage', stageId: 's2' }, ...ctx() });
        return null;
      } catch (e) {
        return e;
      }
    })();
    expect(dup).toBeInstanceOf(BillingError);
    expect(dup.status).toBe(409);
    expect(dup.message).toBe('You already have access to this.');

    expect(() => grant({ adminUserId: 'admin-1', userId: 'ghost', product: { kind: 'lifetime' }, ...ctx() })).toThrow('No such user.');
    expect(() => grant({ adminUserId: 'admin-1', userId: u.id, product: { kind: 'certificate', trackId: 'core' }, ...ctx() })).toThrow('Finish every stage in this track (0 of 3 cleared).');
  });

  it('issues a certificate when the learner has finished the track', () => {
    const u = user();
    store.setProgress(u.id, { completedChallenges: ALL_CORE });
    const { order, certificate } = grant({ adminUserId: 'admin-1', userId: u.id, product: { kind: 'certificate', trackId: 'core' }, certificateName: 'Grace Hopper', ...ctx() });
    expect(order.status).toBe('paid');
    expect(certificate).toMatchObject({ learnerName: 'Grace Hopper', trackId: 'core' });
  });
});

/* --------------------------------------------------------- certificates */

describe('verifyCertificate', () => {
  it('answers with the public fields only - never the user id or an email', () => {
    const u = user();
    store.putCertificate({ id: 'CC-2026-EFGHJKLM', userId: u.id, trackId: 'core', learnerName: 'Ada', issuedAt: '2026-02-01T00:00:00.000Z', orderId: 'ord_x', revokedAt: null });
    const result = verifyCertificate(' cc-2026-efghjklm ', { snapshot: SNAPSHOT });
    expect(result).toEqual({
      valid: true,
      certificate: { id: 'CC-2026-EFGHJKLM', learnerName: 'Ada', trackId: 'core', trackLabel: 'Developer path', issuedAt: '2026-02-01T00:00:00.000Z', revoked: false }
    });
    expect(JSON.stringify(result)).not.toContain(u.id);
    expect(JSON.stringify(result)).not.toContain('ord_x');
    expect(verifyCertificate('CC-2026-NOPE0000')).toEqual({ valid: false });
    expect(verifyCertificate('constructor')).toEqual({ valid: false });
  });
});

describe('ids and revenue', () => {
  it('generates the documented id shapes', () => {
    expect(newOrderId()).toMatch(/^ord_[a-z2-7]{12}$/);
    expect(newCertificateId()).toMatch(/^CC-\d{4}-[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}$/);
    expect(new Set(Array.from({ length: 50 }, newOrderId)).size).toBe(50);
  });

  it('sums paid orders only, and the last 30 days separately', () => {
    const old = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000).toISOString();
    paidOrder('u1', { kind: 'lifetime' }, { amount: 100, paidAt: old, createdAt: old });
    paidOrder('u1', { kind: 'stage', stageId: 's2' }, { amount: 30 });
    paidOrder('u2', { kind: 'stage', stageId: 's3' }, { amount: 999, status: 'created' });
    paidOrder('u2', { kind: 'track', trackId: 'c' }, { amount: 999, status: 'revoked' });
    expect(revenueSummary()).toEqual({ paidOrders: 2, totalPaise: 130, last30DaysPaise: 30 });
  });
});
