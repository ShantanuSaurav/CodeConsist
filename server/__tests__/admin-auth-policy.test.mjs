/**
 * The admin console is reachable from the public internet through the tunnel,
 * so "admin" / "admin" must not work - not as a new password, and not as an
 * existing one that was set while the policy had an exception for it.
 *
 * The admin record lives in memory here; nothing touches server/data.
 */
import bcrypt from 'bcryptjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ admin: null }));

vi.mock('../db.js', () => ({
  getAdmin: () => state.admin,
  setAdmin: (record) => {
    state.admin = { ...record };
    return state.admin;
  },
  updateAdmin: (patch) => {
    state.admin = { ...state.admin, ...patch };
    return state.admin;
  }
}));

import { authenticateAdmin, bootstrapAdminAccount } from '../admin-auth.js';
import { validateAdminPassword } from '../auth.js';

const STRONG = 'k7#Qm2vR9!pLx4wT';
const OTHER_STRONG = 'Zt5&nB8@cW3yHq6e';

async function adminWithPassword(userId, password) {
  state.admin = {
    id: 'admin-1',
    userId,
    passwordHash: await bcrypt.hash(password, 4),
    createdAt: '2026-09-01T00:00:00.000Z',
    lastLoginAt: null,
    status: 'active',
    credentialsVersion: 3,
    failedAttempts: 0,
    lockedUntil: null
  };
}

beforeEach(() => {
  state.admin = null;
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'log').mockImplementation(() => {});
  delete process.env.ADMIN_USER_ID;
  delete process.env.ADMIN_PASSWORD;
});

afterEach(() => {
  vi.restoreAllMocks();
  delete process.env.ADMIN_USER_ID;
  delete process.env.ADMIN_PASSWORD;
});

describe('validateAdminPassword', () => {
  it('rejects "admin" - there is no local-setup exception any more', () => {
    expect(validateAdminPassword('admin', 'admin').ok).toBe(false);
  });

  it('requires at least 12 characters', () => {
    expect(validateAdminPassword('Qm2#vR9!pL', 'root-admin').ok).toBe(false);
    expect(validateAdminPassword(STRONG, 'root-admin').ok).toBe(true);
  });
});

describe('authenticateAdmin', () => {
  it('refuses a correct but weak stored password, and issues no session', async () => {
    await adminWithPassword('admin', 'admin');
    const result = await authenticateAdmin('admin', 'admin');
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/too weak/i);
    expect(result.admin).toBeUndefined();
    expect(state.admin.lastLoginAt).toBeNull();
  });

  it('still signs in with a strong password', async () => {
    await adminWithPassword('root-admin', STRONG);
    const result = await authenticateAdmin('root-admin', STRONG);
    expect(result.ok).toBe(true);
    expect(state.admin.lastLoginAt).not.toBeNull();
  });

  it('keeps the generic error for a wrong password', async () => {
    await adminWithPassword('root-admin', STRONG);
    const result = await authenticateAdmin('root-admin', 'admin');
    expect(result).toMatchObject({ ok: false, error: 'Invalid administrator credentials.' });
  });
});

describe('bootstrapAdminAccount with an existing admin', () => {
  it('signs out every session when .env still holds the weak password in use', async () => {
    await adminWithPassword('admin', 'admin');
    const hashBefore = state.admin.passwordHash;
    process.env.ADMIN_USER_ID = 'admin';
    process.env.ADMIN_PASSWORD = 'admin';

    await bootstrapAdminAccount();

    expect(state.admin.credentialsVersion).toBe(4);
    expect(state.admin.passwordHash).toBe(hashBefore);
  });

  it('never overwrites a strong password with a weak .env value', async () => {
    await adminWithPassword('root-admin', STRONG);
    process.env.ADMIN_USER_ID = 'admin';
    process.env.ADMIN_PASSWORD = 'admin';

    await bootstrapAdminAccount();

    expect(state.admin.userId).toBe('root-admin');
    expect(state.admin.credentialsVersion).toBe(3);
    expect((await authenticateAdmin('root-admin', STRONG)).ok).toBe(true);
  });

  it('applies a strong new .env password and signs out old sessions', async () => {
    await adminWithPassword('admin', 'admin');
    process.env.ADMIN_USER_ID = 'root-admin';
    process.env.ADMIN_PASSWORD = OTHER_STRONG;

    await bootstrapAdminAccount();

    expect(state.admin.userId).toBe('root-admin');
    expect(state.admin.credentialsVersion).toBe(4);
    expect((await authenticateAdmin('root-admin', OTHER_STRONG)).ok).toBe(true);
    expect((await authenticateAdmin('admin', 'admin')).ok).toBe(false);
  });
});
