import {
  EmailAuthProvider,
  reauthenticateWithCredential,
  sendPasswordResetEmail,
  verifyBeforeUpdateEmail,
  updatePassword,
  signOut,
} from 'firebase/auth';
import { doc, getDocFromServer } from 'firebase/firestore';
import { auth, db } from '@runtime/firebase';
import { logError } from '../utils/logError';
import { sanitizeEmail, sanitizeUserName } from '../utils/sanitize';
import { deleteOwnAccountDataFn, initializeAccountProfileFn, syncUserEmailFn, updateAccountProfileFn } from '../libs/callables';
import {
  AccountNotSignedInError,
  ReauthFailedError,
  ReauthRequiredError,
  EmailAlreadyInUseError,
  InvalidEmailError,
  UserNotFoundError,
  TooManyRequestsError,
  PasswordTooWeakError,
  AccountError,
} from './accountErrors';
import { passwordLengthError } from '../auth/passwordPolicy';

function mapAuthCode(code: string): AccountError {
  switch (code) {
    case 'auth/wrong-password':
    case 'auth/invalid-credential':     return new ReauthFailedError();
    case 'auth/requires-recent-login':  return new ReauthRequiredError();
    case 'auth/email-already-in-use':   return new EmailAlreadyInUseError();
    case 'auth/invalid-email':          return new InvalidEmailError();
    case 'auth/user-not-found':         return new UserNotFoundError();
    case 'auth/too-many-requests':      return new TooManyRequestsError();
    case 'auth/weak-password':
    case 'auth/password-does-not-meet-requirements':
      return new PasswordTooWeakError();
    default:                            return new AccountError(`account/${code}`, 'An unexpected error occurred.');
  }
}

/** Re-authenticate the current user with their password. */
async function reauthenticate(password: string): Promise<void> {
  const user = auth.currentUser;
  if (!user || !user.email) throw new AccountNotSignedInError();
  const credential = EmailAuthProvider.credential(user.email, password);
  try {
    await reauthenticateWithCredential(user, credential);
  } catch (err: any) {
    throw mapAuthCode(err?.code || '');
  }
}

/** Send a password reset email. Works for self-service and admin. */
export async function requestPasswordReset(email: string): Promise<void> {
  const clean = sanitizeEmail(email);
  if (!clean) throw new InvalidEmailError();
  try {
    await sendPasswordResetEmail(auth, clean);
  } catch (err: any) {
    throw mapAuthCode(err?.code || '');
  }
}

/**
 * Request an email change. Sends a verification link to the NEW email.
 * The auth email updates only after the user clicks the link.
 */
export async function requestEmailChange(newEmail: string, currentPassword: string): Promise<void> {
  const user = auth.currentUser;
  if (!user) throw new AccountNotSignedInError();

  const clean = sanitizeEmail(newEmail);
  if (!clean) throw new InvalidEmailError();
  if (clean === user.email) throw new AccountError('account/same-email', 'New email is the same as your current email.');

  await reauthenticate(currentPassword);

  try {
    await verifyBeforeUpdateEmail(user, clean);
  } catch (err: any) {
    throw mapAuthCode(err?.code || '');
  }
}

export function sanitizeAccountProfile(input: { userName?: string }) {
  const userName = sanitizeUserName(input.userName || '');

  if (!userName) {
    throw new AccountError(
      'account/invalid-username',
      'Please enter a user name using 3-30 letters, numbers, dashes, underscores, or periods.'
    );
  }

  // Existing backends/consumers still accept `name`; it is an alias, not a
  // separately collected identity. The username remains the source of truth.
  return { name: userName, userName };
}

/** Update the user's public profile in Auth and Firestore. */
export async function updateAccountProfile(profile: { userName?: string }): Promise<{ name: string; userName: string }> {
  const user = auth.currentUser;
  if (!user) throw new AccountNotSignedInError();

  const clean = sanitizeAccountProfile(profile);

  const res = await updateAccountProfileFn(clean);
  return res.data as { name: string; userName: string };
}

/** Explicit, verified-user setup; never silently creates a profile during posting. */
export async function completeAccountProfile(profile?: { userName?: string }): Promise<void> {
  const user = auth.currentUser;
  if (!user) throw new AccountNotSignedInError();
  if (!user.emailVerified) throw new AccountError('account/unverified', 'Verify your email before completing your profile.');
  const clean = profile ? sanitizeAccountProfile(profile) : undefined;
  const snap = await getDocFromServer(doc(db, 'users', user.uid));
  if (auth.currentUser?.uid !== user.uid) throw new AccountNotSignedInError();
  if (snap.data()?.accountStatus === 'deleting') {
    throw new AccountError('account/deleting', 'This account is being deleted. Contact an administrator for help.');
  }
  if (!clean) await initializeAccountProfileFn({});
  else if (snap.exists()) await updateAccountProfileFn(clean);
  else await initializeAccountProfileFn(clean);
}

/** Change the user's password directly (requires re-auth). */
export async function changePassword(currentPassword: string, newPassword: string): Promise<void> {
  const user = auth.currentUser;
  if (!user) throw new AccountNotSignedInError();
  const lengthError = passwordLengthError(newPassword);
  if (lengthError) throw new PasswordTooWeakError(lengthError);

  await reauthenticate(currentPassword);

  try {
    await updatePassword(user, newPassword);
  } catch (err: any) {
    throw mapAuthCode(err?.code || '');
  }
}

/**
 * Permanently delete the current user's account.
 * 1. Re-authenticates
 * 2. Cleans up Firestore data and Storage files
 * 3. Deletes the Firebase Auth account
 */
export async function deleteOwnAccount(password: string): Promise<void> {
  const user = auth.currentUser;
  if (!user || !user.email) throw new AccountNotSignedInError();
  await reauthenticate(password); // must be client-side, produces the recent-login the callable requires
  try {
    await deleteOwnAccountDataFn({});
  } catch (err: any) {
    logError(err, 'deleteOwnAccount-callable', { uid: user.uid });
    throw new AccountError('account/delete-failed', err?.message || 'Account deletion failed.');
  }
  try { await signOut(auth); } catch { /* the auth listener resets the app */ }
}

/**
 * Sync the Firestore email field when it drifts from the auth email.
 * Call from the auth state listener after email verification completes.
 */
export async function syncUserEmail(uid: string, authEmail: string): Promise<void> {
  try {
    await syncUserEmailFn({ email: authEmail });
  } catch (err) {
    logError(err, 'syncUserEmail', { uid });
  }
}
