import { HttpsError, type CallableRequest } from 'firebase-functions/v2/https';
import { trustedClientIp } from '../shared';

type AuthClaims = Record<string, unknown>;

export function hasDirectTotpMfa(token: AuthClaims): boolean {
  const firebase = token.firebase;
  return Boolean(
    firebase
      && typeof firebase === 'object'
      && 'sign_in_second_factor' in firebase
      && firebase.sign_in_second_factor === 'totp',
  );
}

export function hasAdminMfaClaims(token: AuthClaims): boolean {
  return hasDirectTotpMfa(token) || token.desktop_admin_mfa === true;
}

export function isMfaAdmin(request: { auth?: { token: AuthClaims } | undefined }): boolean {
  return request.auth?.token.admin === true
    && request.auth.token.email_verified === true
    && hasAdminMfaClaims(request.auth.token);
}

export function requireAuth(request: CallableRequest) {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'You must be signed in.');
  }
  return { uid: request.auth.uid, token: request.auth.token };
}

export function requireVerifiedEmail(request: CallableRequest) {
  const auth = requireAuth(request);
  if (auth.token.email_verified !== true) {
    throw new HttpsError('permission-denied', 'Verify your email address before participating.');
  }
  return auth;
}

export function requireAdmin(request: CallableRequest) {
  const auth = requireAuth(request);
  if (auth.token.admin !== true || auth.token.email_verified !== true) {
    throw new HttpsError('permission-denied', 'Admin access is required.');
  }
  if (!hasAdminMfaClaims(auth.token)) {
    throw new HttpsError('permission-denied', 'Two-step verification is required for administrator access.');
  }
  return auth;
}

export function clientIp(request: CallableRequest): string {
  const fwd = request.rawRequest.headers['x-forwarded-for'];
  return trustedClientIp(fwd, request.rawRequest.ip);
}

// App Check is enforced by `callableOptions` in deployed environments; the
// emulator relaxes it so local/CI runs work. This helper lets individual
// callables (guest poll voting, in particular) state the requirement
// explicitly and fail closed if the platform ever stops enforcing it.
export function requireAppCheck(request: CallableRequest): void {
  if (process.env.FUNCTIONS_EMULATOR === 'true') return;
  if (!request.app) {
    throw new HttpsError('failed-precondition', 'App Check verification is required.');
  }
}
