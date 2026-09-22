/**
 * The Excel mirror's row shape. The interesting column is "Is Premium": it
 * has to be the same derived answer the app itself gives (server/index.js's
 * publicUser and the admin user list), not the legacy `user.isPremium` flag,
 * which stopped being the source of truth when a lifetime licence became a
 * paid order.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../db.js', () => {
  const EMPTY = () => ({ users: [], orders: {}, certificates: {}, pricing: {} });
  let state = EMPTY();
  return {
    reset: () => {
      state = EMPTY();
    },
    findUserById: (id) => state.users.find((u) => u.id === id) ?? null,
    insertUser: (u) => {
      state.users.push(u);
      return u;
    },
    allUsers: () => state.users,
    getPricing: () => state.pricing,
    getOrder: (id) => (typeof id === 'string' && Object.hasOwn(state.orders, id) ? state.orders[id] : null),
    putOrder: (o) => (state.orders[o.id] = o),
    ordersForUser: (userId) => Object.values(state.orders).filter((o) => o.userId === userId),
    allOrders: () => Object.values(state.orders),
    getCertificate: () => null,
    putCertificate: (c) => (state.certificates[c.id] = c),
    certificatesForUser: () => [],
    allCertificates: () => Object.values(state.certificates)
  };
});

import * as store from '../db.js';
import { rowValues } from '../excel.js';

const COLUMN_IS_PREMIUM = 10;
const learner = (id, extra = {}) => store.insertUser({ id, email: `${id}@example.com`, username: id, passwordHash: 'x', isPremium: false, ...extra });
const paidOrder = (id, userId, product, productKey) =>
  store.putOrder({ id, userId, product, productKey, amount: 199900, currency: 'INR', provider: 'razorpay', status: 'paid', paidAt: '2026-02-01T00:00:00.000Z' });

beforeEach(() => {
  store.reset();
});

describe('rowValues', () => {
  it('mirrors a bought lifetime licence as premium, not just the legacy flag', () => {
    const u = learner('ada');
    expect(rowValues(u, null)[0][COLUMN_IS_PREMIUM]).toBe(false);

    paidOrder('ord_1', u.id, { kind: 'lifetime' }, 'lifetime');
    expect(rowValues(u, null)[0][COLUMN_IS_PREMIUM]).toBe(true);
  });

  it('keeps honouring the legacy flag, and does not call a stage unlock premium', () => {
    const legacy = learner('bob', { isPremium: true });
    expect(rowValues(legacy, null)[0][COLUMN_IS_PREMIUM]).toBe(true);

    // A single stage is not a lifetime licence - the column means "owns everything".
    const partial = learner('cleo');
    paidOrder('ord_2', partial.id, { kind: 'stage', stageId: 's2' }, 'stage:s2');
    expect(rowValues(partial, null)[0][COLUMN_IS_PREMIUM]).toBe(false);
  });

  it('drops back to not premium once the licence order is revoked', () => {
    const u = learner('dev');
    const order = paidOrder('ord_3', u.id, { kind: 'lifetime' }, 'lifetime');
    expect(rowValues(u, null)[0][COLUMN_IS_PREMIUM]).toBe(true);

    order.status = 'revoked';
    store.putOrder(order);
    expect(rowValues(u, null)[0][COLUMN_IS_PREMIUM]).toBe(false);
  });

  it('still carries the plain account and progress columns', () => {
    const u = learner('ada', { createdAt: '2026-01-01T00:00:00.000Z' });
    const row = rowValues(u, { lastActiveDay: '2026-02-02', xp: 120, level: 3, streak: 4, completedStages: ['s1'], completedChallenges: ['s1-a', 's1-test'] })[0];
    expect(row).toEqual(['ada', 'ada', 'ada@example.com', '2026-01-01T00:00:00.000Z', '2026-02-02', 120, 3, 4, 1, 2, false]);
    expect(row).not.toContain('x');
  });
});
