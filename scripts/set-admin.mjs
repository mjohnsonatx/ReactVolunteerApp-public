import { applicationDefault, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

const email = process.argv[2];
if (!email) {
  console.error('Usage: node scripts/set-admin.mjs you@example.com');
  process.exit(1);
}

// Use Application Default Credentials or GOOGLE_APPLICATION_CREDENTIALS
// pointing to a file outside this checkout. Never load a repository-local key.
initializeApp({ credential: applicationDefault() });

try {
  const auth = getAuth();
  const user = await auth.getUserByEmail(email);
  if (!user.emailVerified) {
    throw new Error('Refusing to grant administrator access until the account email is verified.');
  }
  const durableClaims = { ...(user.customClaims || {}) };
  delete durableClaims.desktop_admin_mfa;
  await auth.setCustomUserClaims(user.uid, { ...durableClaims, admin: true });
  await auth.revokeRefreshTokens(user.uid);
  console.log(`Administrator enrollment enabled for ${email}.`);
  console.log('The user must sign in, enroll an authenticator, sign out, and complete a fresh two-step sign-in before admin tools unlock.');
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
