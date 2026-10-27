const DESKTOP_SEED_LIFETIME_MS = 30 * 60_000;

// Firebase can issue seven-day browser attestations. Use a shorter desktop cache
// lifetime so its custom provider renews promptly, never beyond the real JWT expiry.
// This parses expiry metadata only; Firebase validates the token cryptographically.
export function desktopAttestationExpiry(token: string, now = Date.now()): number {
  const payload = token.split('.')[1];
  if (!payload) throw new Error('App verification token is invalid.');
  const claims = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/'))) as { exp?: unknown };
  if (typeof claims.exp !== 'number' || !Number.isSafeInteger(claims.exp)) {
    throw new Error('App verification token expiry is invalid.');
  }
  const expiresAt = claims.exp * 1000;
  if (!Number.isSafeInteger(expiresAt) || expiresAt <= now) {
    throw new Error('App verification token has expired.');
  }
  return Math.min(expiresAt, now + DESKTOP_SEED_LIFETIME_MS);
}
