import { adminDeleteUserDataFn } from '../libs/callables';
import { CleanupPartialError } from './accountErrors';

/**
 * Compatibility wrapper for older admin call sites. User-data cleanup is now
 * performed by a callable Function so Firestore and Storage deletes stay server-side.
 */
export async function cleanupUserData(uid: string, email: string): Promise<void> {
  try {
    await adminDeleteUserDataFn({ uid, email });
  } catch (err: any) {
    throw new CleanupPartialError([err?.message || 'user data']);
  }
}
