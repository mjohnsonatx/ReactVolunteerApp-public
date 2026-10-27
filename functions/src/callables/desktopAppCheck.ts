// functions/src/callables/desktopAppCheck.ts
import { HttpsError, onCall, onRequest } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions';
import { getAppCheck } from 'firebase-admin/app-check';
import type { DecodedIdToken } from 'firebase-admin/auth';
import { adminAuth } from '../lib/firebaseAdmin';
import { runtimeConfig } from '../generatedConfig';
import { runtimeIdentity } from '../lib/runtimeIdentity';
import { desktopAppId } from '../lib/environment';
import { callableOptions } from '../lib/options';
import { hasAdminMfaClaims, hasDirectTotpMfa, requireAuth } from '../lib/guards';

export const issueDesktopSignInToken = onCall(
  { ...callableOptions, serviceAccount: runtimeIdentity.appCheck },
  async request => {
    const { uid } = requireAuth(request);
    const token = request.rawRequest.headers.authorization?.replace(/^Bearer /, '');
    const decoded = await adminAuth.verifyIdToken(token || '', true);
    const directTotp = hasDirectTotpMfa(decoded);
    // The Auth emulator cannot mint a genuine TOTP sign-in token. Its explicit
    // marker keeps integration tests representative without relaxing production.
    const emulatorTotp = process.env.FUNCTIONS_EMULATOR === 'true'
      && decoded.desktop_admin_mfa === true;
    if (decoded.admin !== true
      || decoded.email_verified !== true
      || decoded.uid !== uid
      || (!directTotp && !emulatorTotp)) {
      throw new HttpsError('permission-denied', 'Two-step administrator verification is required.');
    }
    return {
      customToken: await adminAuth.createCustomToken(uid, { desktop_admin_mfa: true }),
    };
  },
);

// The desktop client reuses the existing web app registration. Only a signed-in
// administrator can mint a short-lived token for that app id.
const DESKTOP_APP_ID = desktopAppId;

const allowedOrigins = [
  'app://admin-desktop',
  /^http:\/\/localhost:\d+$/,
  /^http:\/\/127\.0\.0\.1:\d+$/,
];

function errorDetails(error: unknown): { code?: string; message: string } {
  if (error instanceof Error) {
    const code = 'code' in error && typeof error.code === 'string' ? error.code : undefined;
    return { code, message: error.message };
  }
  return { message: String(error) };
}

export const issueDesktopAppCheckToken = onRequest(
  { region: runtimeConfig.region, cors: allowedOrigins, serviceAccount: runtimeIdentity.appCheck },
  async (req, res) => {
    if (req.method !== 'POST') { res.status(405).end(); return; }

    const attestation = req.headers['x-firebase-appcheck'];
    if (typeof attestation !== 'string') { res.status(401).json({ error: 'missing-app-check' }); return; }
    try {
      const verified = await getAppCheck().verifyToken(attestation);
      if (verified.appId !== DESKTOP_APP_ID) { res.status(403).json({ error: 'wrong-app' }); return; }
    } catch {
      res.status(401).json({ error: 'invalid-app-check' }); return;
    }

    const header = String(req.headers.authorization || '');
    const idToken = header.startsWith('Bearer ') ? header.slice(7) : '';
    if (!idToken) { res.status(401).json({ error: 'missing-token' }); return; }

    let decoded: DecodedIdToken;
    try {
      decoded = await adminAuth.verifyIdToken(idToken, true); // checkRevoked
    } catch (error) {
      logger.warn('Desktop App Check ID token verification failed.', errorDetails(error));
      res.status(401).json({ error: 'invalid-token' });
      return;
    }

    if (decoded.admin !== true
      || decoded.email_verified !== true
      || !hasAdminMfaClaims(decoded)) {
      res.status(403).json({ error: 'admin-mfa-required' });
      return;
    }

    try {
      const result = await getAppCheck().createToken(DESKTOP_APP_ID, { ttlMillis: 30 * 60 * 1000 });
      res.json({ token: result.token, ttlMillis: result.ttlMillis });
    } catch (error) {
      logger.error('Desktop App Check token minting failed.', errorDetails(error));
      res.status(500).json({ error: 'token-mint-failed' });
    }
  },
);
