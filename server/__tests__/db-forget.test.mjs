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
import { forgetBillingIdentity, forgetLeagueIdentity } from '../db.js';

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

/**
 * The weekly league: a deleted learner's tier goes, and so does every trace
 * of them in a week's joins, baselines, exclusions and groups. A closed
 * week's results keep the row (the others were ranked with it) but not the
 * name or id.
 */
const leagueState = () => ({
  leagues: {
    members: { u1: { tierId: 'silver', since: '2026-09-14T00:00:00.000Z' }, u2: { tierId: 'bronze', since: '2026-09-14T00:00:00.000Z' } },
    weeks: {
      '2026-09-14': {
        id: '2026-09-14',
        status: 'closed',
        joinedAt: { u1: '2026-09-14T09:00:00.000Z', u2: '2026-09-15T09:00:00.000Z' },
        baseline: {},
        excluded: { u1: { by: 'admin-1', at: '2026-09-16T00:00:00.000Z', reason: 'test account' } },
        groups: { 'silver-1': { tierId: 'silver', memberIds: ['u1', 'u2'] } },
        results: [
          { userId: 'u2', username: 'grace', xp: 120, rank: 1, outcome: 'promoted' },
          { userId: 'u1', username: 'ada', xp: 80, rank: 2, outcome: 'stayed' }
        ]
      },
      '2026-09-21': { id: '2026-09-21', status: 'open', joinedAt: { u1: '2026-09-21T09:00:00.000Z' }, baseline: { u1: 30 }, excluded: {}, groups: {}, results: [] },
      '2026-09-28': { id: '2026-09-28', status: 'open', joinedAt: { u2: '2026-09-28T09:00:00.000Z' }, baseline: {}, excluded: {}, groups: {}, results: [] }
    }
  }
});

describe('forgetLeagueIdentity', () => {
  it('takes the tier and every join, baseline, exclusion and group place with it', () => {
    const db = leagueState();
    expect(forgetLeagueIdentity(db, 'u1')).toBe(2);
    expect(db.leagues.members).toEqual({ u2: { tierId: 'bronze', since: '2026-09-14T00:00:00.000Z' } });
    const closed = db.leagues.weeks['2026-09-14'];
    expect(closed.joinedAt).toEqual({ u2: '2026-09-15T09:00:00.000Z' });
    expect(closed.excluded).toEqual({});
    expect(closed.groups['silver-1'].memberIds).toEqual(['u2']);
    expect(db.leagues.weeks['2026-09-21']).toMatchObject({ joinedAt: {}, baseline: {} });
    // A week they were never in is untouched.
    expect(db.leagues.weeks['2026-09-28'].joinedAt).toEqual({ u2: '2026-09-28T09:00:00.000Z' });
  });

  it('keeps their row in a closed week’s results, without the name', () => {
    const db = leagueState();
    forgetLeagueIdentity(db, 'u1');
    expect(db.leagues.weeks['2026-09-14'].results).toEqual([
      { userId: 'u2', username: 'grace', xp: 120, rank: 1, outcome: 'promoted' },
      { userId: null, username: null, xp: 80, rank: 2, outcome: 'stayed' }
    ]);
  });

  it('is a no-op for a learner who never played, and for a store with no league', () => {
    const db = leagueState();
    const before = JSON.stringify(db);
    expect(forgetLeagueIdentity(db, 'u-nobody')).toBe(0);
    expect(JSON.stringify(db)).toBe(before);
    expect(forgetLeagueIdentity({}, 'u1')).toBe(0);
    expect(forgetLeagueIdentity({ leagues: { members: {}, weeks: { w: null } } }, 'u1')).toBe(0);
  });
});
