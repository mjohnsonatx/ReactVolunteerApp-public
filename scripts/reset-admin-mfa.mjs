import { applicationDefault, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

const email = process.argv[2];
const apply = process.argv.includes('--apply');
if (!email) {
  console.error('Usage: node scripts/reset-admin-mfa.mjs you@example.com [--apply]');
  process.exit(1);
}

// Use Application Default Credentials or GOOGLE_APPLICATION_CREDENTIALS
// pointing to a file outside this checkout. Never load a repository-local key.
initializeApp({ credential: applicationDefault() });

try {
  const auth = getAuth();
  const user = await auth.getUserByEmail(email);
  if (user.customClaims?.admin !== true) {
    throw new Error('Refusing to reset MFA because this account is not an administrator.');
  }

  const factors = user.multiFactor?.enrolledFactors || [];
  console.log(`Administrator: ${email}`);
  console.log(`Enrolled second factors: ${factors.length}`);
  if (!apply) {
    console.log('Dry run only. Add --apply to remove all enrolled factors and revoke every session.');
    process.exit(0);
  }

  if (factors.length === 0) {
    console.log('No enrolled factors were present; revoking sessions only.');
  } else {
    await auth.updateUser(user.uid, { multiFactor: { enrolledFactors: null } });
  }
  await auth.revokeRefreshTokens(user.uid);
  console.log('MFA enrollment was reset and all sessions were revoked. The administrator must enroll again at next sign-in.');
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
