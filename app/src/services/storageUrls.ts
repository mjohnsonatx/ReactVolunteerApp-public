import { getDownloadURL, ref } from 'firebase/storage';
import { storage } from '@runtime/firebase';

// Images are stored as *paths* (`events/{eventId}/{imageId}.jpg`), never as
// long-lived download URLs. Resolving happens at render time so Storage rules
// stay in charge of access and rotating a token cannot break the record.
const cache = new Map<string, Promise<string>>();

export function resolveStoragePath(path: string): Promise<string> {
  if (!path) return Promise.reject(new Error('Missing storage path.'));
  const cached = cache.get(path);
  if (cached) return cached;
  const pending = getDownloadURL(ref(storage, path)).catch((err) => {
    cache.delete(path);
    throw err;
  });
  cache.set(path, pending);
  return pending;
}

export function forgetStoragePath(path: string): void {
  cache.delete(path);
}
