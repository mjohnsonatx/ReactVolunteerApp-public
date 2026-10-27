import { HttpsError } from 'firebase-functions/v2/https';
import { db } from './firebaseAdmin';

export type ActiveUserProfile = FirebaseFirestore.DocumentData & {
  moderated?: boolean;
};

// Authentication proves who called the function; the profile proves that the
// account is still active in this application. Content-producing callables
// must require both so a stale token cannot keep posting after an admin removes
// the user's application data.
export async function requireActiveUserProfile(uid: string): Promise<ActiveUserProfile> {
  const snap = await db.collection('users').doc(uid).get();
  const profile = snap.data();
  if (!snap.exists || !profile || profile.accountStatus === 'deleting') {
    throw new HttpsError(
      'failed-precondition',
      'Your account profile is unavailable. Please sign out and contact an administrator if this persists.',
    );
  }
  return profile;
}
