import { describe, expect, it } from 'vitest';
import type { IdTokenResult } from 'firebase/auth';
import { adminMfaSessionFromToken } from '../../src/auth/adminMfa';

function token(overrides: Partial<IdTokenResult>): IdTokenResult {
  return {
    authTime: '',
    expirationTime: '',
    issuedAtTime: '',
    signInProvider: 'password',
    signInSecondFactor: null,
    token: 'test-token',
    claims: {},
    ...overrides,
  };
}

describe('admin MFA session recognition', () => {
  it('accepts a direct TOTP sign-in', () => {
    expect(adminMfaSessionFromToken(token({ signInSecondFactor: 'totp' }))).toBe(true);
  });

  it('accepts the short-lived desktop handoff marker', () => {
    expect(adminMfaSessionFromToken(token({ claims: { desktop_admin_mfa: true } }))).toBe(true);
  });

  it('rejects a password-only token even when the admin claim exists', () => {
    expect(adminMfaSessionFromToken(token({ claims: { admin: true } }))).toBe(false);
  });
});
