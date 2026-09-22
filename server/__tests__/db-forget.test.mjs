/**
 * What a deleted learner leaves behind in the billing records.
 *
 * The certificate code is public: anyone holding it can ask /api/verify/:code
 * who it belongs to. So a deleted account's certificates must go with it,
 * while the orders - the money record - stay, minus the name that was to be
 * printed on the certificate.
 *
 * `forgetBillingIdentity` is pure over the state object on purpose: db.js
 * writes to server/data/db.json, and a test must never touch the real file.
 */
import { describe, expect, it } from 'vitest';
import { forgetBillingIdentity } from '../db.js';

const state = () => ({
  certificates: {
    'CC-2026-AAAAAAAA': { id: 'CC-2026-AAAAAAAA', userId: 'u1', learnerName: 'Ada Lovelace', trackId: 'c' },
    'CC-2026-BBBBBBBB': { id: 'CC-2026-BBBBBBBB', userId: 'u2', learnerName: 'Grace Hopper', trackId: 'core' }
  },
  orders: {
    ord_1: { id: 'ord_1', userId: 'u1', productKey: 'certificate:c', amount: 29900, status: 'paid', certificateName: 'Ada Lovelace', certificateId: 'CC-2026-AAAAAAAA' },
    ord_2: { id: 'ord_2', userId: 'u1', productKey: 'lifetime', amount: 199900, status: 'paid', certificateName: null, certificateId: null },
    ord_3: { id: 'ord_3', userId: 'u2', productKey: 'certificate:core', amount: 29900, status: 'paid', certificateName: 'Grace Hopper', certificateId: 'CC-2026-BBBBBBBB' }
  }
});

describe('forgetBillingIdentity', () => {
  it('takes the deleted account’s certificates with it', () => {
    const db = state();
    const removed = forgetBillingIdentity(db, 'u1');
    expect(removed).toEqual(['CC-2026-AAAAAAAA']);
    expect(db.certificates['CC-2026-AAAAAAAA']).toBeUndefined();
    // Nobody else's certificate is touched.
    expect(db.certificates['CC-2026-BBBBBBBB']).toMatchObject({ learnerName: 'Grace Hopper' });
  });

  it('keeps the money but not the name that was to be printed', () => {
    const db = state();
    forgetBillingIdentity(db, 'u1');
    expect(Object.keys(db.orders)).toEqual(['ord_1', 'ord_2', 'ord_3']);
    expect(db.orders.ord_1).toMatchObject({ amount: 29900, status: 'paid', certificateName: null, certificateId: null });
    expect(db.orders.ord_2).toMatchObject({ amount: 199900, status: 'paid' });
    // The other learner's order keeps its name - they are still here.
    expect(db.orders.ord_3).toMatchObject({ certificateName: 'Grace Hopper', certificateId: 'CC-2026-BBBBBBBB' });
  });

  it('is a no-op for an account with nothing bought, and for an empty store', () => {
    const db = state();
    expect(forgetBillingIdentity(db, 'u-nobody')).toEqual([]);
    expect(Object.keys(db.certificates)).toHaveLength(2);
    expect(forgetBillingIdentity({}, 'u1')).toEqual([]);
  });
});
