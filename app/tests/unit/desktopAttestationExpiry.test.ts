import { describe, expect, it } from 'vitest';
import { desktopAttestationExpiry } from '../../src/libs/desktopAttestationExpiry';

const now = 1_800_000_000_000;
const token = (claims: object) => `header.${btoa(JSON.stringify(claims)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')}.signature`;

describe('desktop attestation cache expiry', () => {
  it('uses a seven-day Firebase token for at most thirty minutes before desktop renewal', () => {
    expect(desktopAttestationExpiry(token({ exp: now / 1000 + 7 * 24 * 3600 }), now)).toBe(now + 30 * 60_000);
  });
  it('never extends an attestation that expires sooner', () => {
    expect(desktopAttestationExpiry(token({ exp: now / 1000 + 60 }), now)).toBe(now + 60_000);
  });
  it.each([
    { exp: now / 1000 },
    { exp: now / 1000 - 1 },
    { exp: '604800' },
    {},
    { exp: Number.MAX_SAFE_INTEGER },
  ])('rejects expired or invalid expiry metadata: %j', claims => {
    expect(() => desktopAttestationExpiry(token(claims), now)).toThrow();
  });
  it('rejects a malformed token', () => {
    expect(() => desktopAttestationExpiry('not-a-token', now)).toThrow();
  });
});
