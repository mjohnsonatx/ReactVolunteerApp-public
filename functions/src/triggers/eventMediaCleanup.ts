import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { logger } from 'firebase-functions/v2';
import { adminStorage } from '../lib/firebaseAdmin';
import { runtimeConfig } from '../generatedConfig';
import { runtimeIdentity } from '../lib/runtimeIdentity';
import { isEventImagePath } from '../shared';

function imagePaths(data: FirebaseFirestore.DocumentData | undefined, eventId: string): string[] {
  const images = Array.isArray(data?.images) ? data!.images : [];
  const paths: string[] = [];
  for (const image of images) {
    if (!image || typeof image !== 'object') continue;
    const storagePath = (image as { storagePath?: unknown }).storagePath;
    const thumbnailPath = (image as { thumbnailPath?: unknown }).thumbnailPath;
    if (typeof storagePath === 'string' && isEventImagePath(storagePath, eventId)) paths.push(storagePath);
    if (typeof thumbnailPath === 'string' && isEventImagePath(thumbnailPath, eventId)) paths.push(thumbnailPath);
  }
  return paths;
}

// Storage janitor: when an admin removes (or replaces) an event image in the
// admin panel, the object itself is deleted here. Deleting the whole event
// clears the entire `events/{eventId}/` prefix so nothing is left behind.
export const cleanupEventImages = onDocumentWritten(
  { document: 'events/{eventId}', region: runtimeConfig.region, serviceAccount: runtimeIdentity.media },
  async (event) => {
    const eventId = event.params.eventId;
    const before = event.data?.before;
    const after = event.data?.after;
    const bucket = adminStorage.bucket();

    if (before?.exists && !after?.exists) {
      try {
        await bucket.deleteFiles({ prefix: `events/${eventId}/`, force: true });
      } catch (err) {
        logger.error('Failed to clear event image folder', { eventId, err: String(err) });
        throw err;
      }
      return;
    }

    const previous = imagePaths(before?.data(), eventId);
    if (!previous.length) return;
    const current = new Set(imagePaths(after?.data(), eventId));
    const orphans = previous.filter(path => !current.has(path));
    if (!orphans.length) return;

    await Promise.all(orphans.map(async (path) => {
      try {
        await bucket.file(path).delete();
      } catch (err: any) {
        // Already-gone files are fine; transient failures must reject so the
        // event trigger is retried instead of silently leaving an orphan.
        if (err?.code === 404) return;
        logger.error('Failed to delete event image', { eventId, path, err: String(err) });
        throw err;
      }
    }));
    logger.info('Removed orphaned event images', { eventId, count: orphans.length });
  },
);
