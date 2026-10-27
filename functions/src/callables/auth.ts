import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { FieldValue } from 'firebase-admin/firestore';
import { identityCallableOptions as callableOptions } from '../lib/options';
import { requireAuth } from '../lib/guards';
import { enforceRateLimit } from '../lib/rateLimiter';
import { db, adminAuth } from '../lib/firebaseAdmin';
import { requireActiveUserProfile } from '../lib/userProfile';
import { deleteAccountData } from '../lib/userData';
import { randomId } from '../lib/ids';
import {
  sanitizeUserName, sanitizeEmail, userNameFromEmail, LIMITS,
} from '../shared';

function userNameReservation(userName: string) {
  return db.collection('userNames').doc(userName);
}

async function assertUserNameAvailable(userName: string, uid?: string): Promise<void> {
  const reserved = await userNameReservation(userName).get();
  if (reserved.exists && reserved.data()?.uid !== uid) {
    throw new HttpsError('already-exists', 'This user name is already taken.');
  }

  const matchingUsers = await db.collection('users').where('userName', '==', userName).limit(2).get();
  const duplicate = matchingUsers.docs.find((doc) => doc.id !== uid);
  if (duplicate) {
    throw new HttpsError('already-exists', 'This user name is already taken.');
  }
}

// Keep the old endpoint deployed so existing clients receive a closed response
// instead of leaving an old password-accepting function active in Firebase.
export const createAccount = onCall(callableOptions, async () => {
  throw new HttpsError('failed-precondition', 'Please update the app to create an account.');
});

export const initializeAccountProfile = onCall(callableOptions, async (request) => {
  const { uid, token } = requireAuth(request);
  await enforceRateLimit({ key: `initializeProfile:${uid}`, max: 10, windowSeconds: 3600 });

  // Recovery is explicit, not a side effect of posting. A still-valid ID token
  // must not resurrect a profile after its Auth account was disabled/deleted.
  const authUser = await adminAuth.getUser(uid).catch((error) => {
    if (error?.code === 'auth/user-not-found') {
      throw new HttpsError('failed-precondition', 'This account is no longer available.');
    }
    throw error;
  });
  if (authUser.disabled || (authUser.tokensValidAfterTime
    && Number(token.auth_time || 0) * 1000 < Date.parse(authUser.tokensValidAfterTime))) {
    throw new HttpsError('failed-precondition', 'Please sign in again before completing your profile.');
  }

  const { userName } = request.data ?? {};
  // An omitted username opts into server-owned allocation. Explicit usernames
  // remain supported for older clients; later edits still use updateAccountProfile.
  const automatic = userName === undefined;
  const cleanEmail = sanitizeEmail(authUser.email);
  const preferred = automatic ? userNameFromEmail(cleanEmail) : sanitizeUserName(userName);

  if (!preferred) throw new HttpsError('invalid-argument', 'Please enter a user name using 3-30 letters, numbers, dashes, underscores, or periods.');
  if (!cleanEmail) throw new HttpsError('invalid-argument', 'Please enter a valid email address.');

  let cleanUserName = '';
  try {
    // Try readable numbered suffixes first, then bounded random suffixes for
    // crowded names. The reservation and profile are committed atomically.
    for (let attempt = 0; attempt < (automatic ? 20 : 1); attempt++) {
      const suffix = attempt === 0 ? '' : `-${attempt < 10 ? attempt + 1 : randomId(8)}`;
      const candidate = `${preferred.slice(0, LIMITS.userName - suffix.length)}${suffix}`;
      const allocated = await db.runTransaction(async (tx) => {
        const userRef = db.collection('users').doc(uid);
        const userNameRef = userNameReservation(candidate);
        const [userSnap, userNameSnap] = await Promise.all([tx.get(userRef), tx.get(userNameRef)]);
        if (userSnap.exists) {
          if (userSnap.data()?.accountStatus === 'deleting') {
            throw new HttpsError('failed-precondition', 'This account is being deleted. Contact an administrator for help.');
          }
          const existing = sanitizeUserName(userSnap.data()?.userName);
          if (existing) {
            if (automatic || existing === candidate) return existing;
            throw new HttpsError('already-exists', 'This account already has a profile.');
          }
        }
        // Include legacy profiles whose usernames predate reservation documents.
        const matching = await tx.get(db.collection('users').where('userName', '==', candidate).limit(2));
        if ((userNameSnap.exists && userNameSnap.data()?.uid !== uid)
          || matching.docs.some(doc => doc.id !== uid)) {
          return null;
        }
        tx.set(userRef, {
          // Legacy field retained for older clients; no separate display name.
          name: candidate,
          userName: candidate,
          email: cleanEmail,
          // Repair missing usernames without resetting moderation or other data.
          ...(!userSnap.exists ? {
            joinDate: FieldValue.serverTimestamp(), role: 'user', votes: {},
            moderated: false, accountStatus: 'active',
          } : {}),
        }, { merge: true });
        tx.set(userNameRef, {
          uid,
          userName: candidate,
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        });
        return candidate;
      });
      if (allocated) { cleanUserName = allocated; break; }
    }
    if (!cleanUserName) {
      throw new HttpsError(automatic ? 'resource-exhausted' : 'already-exists',
        automatic ? 'Could not reserve a username. Please try again.' : 'This user name is already taken.');
    }
  } catch (err) {
    if (err instanceof HttpsError) throw err;
    throw new HttpsError('internal', 'Could not complete account setup. Please try again.');
  }

  await adminAuth.updateUser(uid, { displayName: cleanUserName }).catch(() => {});
  return { uid, name: cleanUserName, userName: cleanUserName };
});

export const updateAccountProfile = onCall(callableOptions, async (request) => {
  const { uid } = requireAuth(request);
  await enforceRateLimit({ key: `updateProfile:${uid}`, max: 20, windowSeconds: 3600 });
  await requireActiveUserProfile(uid);

  const cleanUserName = sanitizeUserName(request.data?.userName);
  if (!cleanUserName) {
    throw new HttpsError('invalid-argument', 'Please enter a user name using 3-30 letters, numbers, dashes, underscores, or periods.');
  }
  await assertUserNameAvailable(cleanUserName, uid);

  await db.runTransaction(async (tx) => {
    const userRef = db.collection('users').doc(uid);
    const userSnap = await tx.get(userRef);
    if (!userSnap.exists || userSnap.data()?.accountStatus === 'deleting') {
      throw new HttpsError('failed-precondition', 'Your account profile is unavailable. Please complete account setup or contact an administrator.');
    }
    const currentUserName = sanitizeUserName(userSnap.data()?.userName || '');
    const nextUserNameRef = userNameReservation(cleanUserName);
    const nextUserNameSnap = await tx.get(nextUserNameRef);
    if (nextUserNameSnap.exists && nextUserNameSnap.data()?.uid !== uid) {
      throw new HttpsError('already-exists', 'This user name is already taken.');
    }
    if (currentUserName && currentUserName !== cleanUserName) {
      tx.delete(userNameReservation(currentUserName));
    }
    tx.set(userRef, { name: cleanUserName, userName: cleanUserName }, { merge: true });
    tx.set(nextUserNameRef, {
      uid,
      userName: cleanUserName,
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
  });
  await adminAuth.updateUser(uid, { displayName: cleanUserName }).catch(() => {});
  return { name: cleanUserName, userName: cleanUserName };
});

export const syncUserEmail = onCall(callableOptions, async (request) => {
  const { uid, token } = requireAuth(request);
  await requireActiveUserProfile(uid);
  if (token.email_verified !== true) {
    throw new HttpsError('failed-precondition', 'Verify your email address before updating it.');
  }
  const tokenEmail = sanitizeEmail(token.email);
  const requestedEmail = sanitizeEmail(request.data?.email);
  const email = tokenEmail || requestedEmail;
  if (!email) throw new HttpsError('invalid-argument', 'Missing verified email.');
  if (requestedEmail && tokenEmail && requestedEmail !== tokenEmail) {
    throw new HttpsError('permission-denied', 'Email does not match the signed-in account.');
  }

  await db.collection('users').doc(uid).set({ email }, { merge: true });
  return { email };
});

export const deleteOwnAccountData = onCall({ ...callableOptions, timeoutSeconds: 540 }, async (request) => {
  const { uid, token } = requireAuth(request);

  // Require a recent login (the client reauthenticates right before calling this).
  const authTimeSec = typeof token.auth_time === 'number' ? token.auth_time : 0;
  if (Date.now() / 1000 - authTimeSec > 5 * 60) {
    throw new HttpsError('failed-precondition', 'Please re-authenticate and try again.');
  }

  try { await deleteAccountData(uid, sanitizeEmail(token.email)); }
  catch (err: any) { throw new HttpsError('internal', err?.message || 'Account deletion failed. Please contact an administrator.'); }

  return { ok: true };
});
