import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { mediaCallableOptions as callableOptions } from '../lib/options';
import { requireAdmin } from '../lib/guards';
import { enforceRateLimit } from '../lib/rateLimiter';
import { db, adminStorage } from '../lib/firebaseAdmin';
import { randomId } from '../lib/ids';
import { recordAdminAction } from '../lib/adminAudit';
import {
  EVENT_IMAGE_MAX_BYTES,
  EVENT_IMAGE_MAX_PER_EVENT,
  buildEventImagePath,
  buildEventThumbnailPath,
  eventImageExtension,
  isAllowedEventImageSize,
  isAllowedEventImageType,
  isEventImagePath,
  isValidEventId,
  isValidEventImageId,
  sanitizeImageCaption,
  detectMalicious,
} from '../shared';

type StoredEventImage = {
  id: string;
  storagePath: string;
  thumbnailPath: string;
  contentType: string;
  caption: string;
  size: number;
  width: number;
  height: number;
  order: number;
  uploadedAt: Timestamp;
};

function requireEventId(value: unknown): string {
  if (!isValidEventId(value)) throw new HttpsError('invalid-argument', 'Missing or invalid event id.');
  return value;
}

function requireImageId(value: unknown): string {
  if (!isValidEventImageId(value)) throw new HttpsError('invalid-argument', 'Missing or invalid image id.');
  return value;
}

function cleanCaption(value: unknown): string {
  const rawCheck = detectMalicious(value);
  if (rawCheck.blocked) throw new HttpsError('invalid-argument', `Caption blocked: ${rawCheck.reason}`);
  const caption = sanitizeImageCaption(value);
  const check = detectMalicious(caption);
  if (check.blocked) throw new HttpsError('invalid-argument', `Caption blocked: ${check.reason}`);
  return caption;
}

function boundedDimension(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 && value < 100000
    ? Math.round(value)
    : 0;
}

function readImages(data: FirebaseFirestore.DocumentData | undefined): StoredEventImage[] {
  const images = Array.isArray(data?.images) ? data!.images : [];
  return images
    .filter((image: unknown): image is StoredEventImage => !!image && typeof image === 'object')
    .map((image: StoredEventImage, index: number) => ({ ...image, order: index }));
}

function nextCover(images: StoredEventImage[], preferred: string): string {
  if (preferred && images.some(image => image.id === preferred)) return preferred;
  return images[0]?.id || '';
}

// Reserves the `events/{eventId}/{imageId}.{extension}` slot before the client
// is allowed to touch Storage. The client never invents its own path.
export const createEventImageUploadTicket = onCall(callableOptions, async (request) => {
  const { uid } = requireAdmin(request);
  await enforceRateLimit({ key: `eventImageTicket:${uid}`, max: 120, windowSeconds: 3600 });

  const eventId = requireEventId(request.data?.eventId);
  const contentType = String(request.data?.contentType || '').toLowerCase();
  const size = Number(request.data?.size);

  if (!isAllowedEventImageType(contentType)) {
    throw new HttpsError('invalid-argument', 'Images must be JPEG, PNG, or WebP.');
  }
  if (!isAllowedEventImageSize(size)) {
    throw new HttpsError('invalid-argument', 'Images must be 5 MB or smaller.');
  }

  const eventSnap = await db.collection('events').doc(eventId).get();
  if (!eventSnap.exists) throw new HttpsError('not-found', 'Event not found.');
  if (readImages(eventSnap.data()).length >= EVENT_IMAGE_MAX_PER_EVENT) {
    throw new HttpsError('resource-exhausted', `Events can hold ${EVENT_IMAGE_MAX_PER_EVENT} images.`);
  }

  const imageId = randomId(20);
  return {
    imageId,
    eventId,
    extension: eventImageExtension(contentType),
    storagePath: buildEventImagePath(eventId, imageId, contentType),
    thumbnailPath: buildEventThumbnailPath(eventId, imageId),
    maxBytes: EVENT_IMAGE_MAX_BYTES,
  };
});

// Confirms an upload: the object is re-read from Storage so the recorded
// size/content type is the real one, not whatever the client claimed.
export const attachEventImage = onCall(callableOptions, async (request) => {
  const { uid } = requireAdmin(request);
  await enforceRateLimit({ key: `eventImageAttach:${uid}`, max: 120, windowSeconds: 3600 });

  const eventId = requireEventId(request.data?.eventId);
  const imageId = requireImageId(request.data?.imageId);
  const contentType = String(request.data?.contentType || '').toLowerCase();
  if (!isAllowedEventImageType(contentType)) {
    throw new HttpsError('invalid-argument', 'Images must be JPEG, PNG, or WebP.');
  }

  const storagePath = buildEventImagePath(eventId, imageId, contentType);
  if (!isEventImagePath(storagePath, eventId)) {
    throw new HttpsError('invalid-argument', 'Invalid image path.');
  }

  const bucket = adminStorage.bucket();
  const file = bucket.file(storagePath);
  const thumbnailPathForAttempt = buildEventThumbnailPath(eventId, imageId);
  const cleanAttempt = async () => {
    await Promise.all([
      file.delete().catch(() => {}),
      bucket.file(thumbnailPathForAttempt).delete().catch(() => {}),
    ]);
  };
  const [exists] = await file.exists();
  if (!exists) {
    await cleanAttempt();
    throw new HttpsError('failed-precondition', 'The uploaded image could not be found.');
  }

  const [metadata] = await file.getMetadata();
  const actualSize = Number(metadata.size || 0);
  const actualType = String(metadata.contentType || '').toLowerCase();
  if (!isAllowedEventImageType(actualType) || actualType !== contentType) {
    await cleanAttempt();
    throw new HttpsError('invalid-argument', 'The uploaded file is not a supported image type.');
  }
  if (!isAllowedEventImageSize(actualSize)) {
    await cleanAttempt();
    throw new HttpsError('invalid-argument', 'Images must be 5 MB or smaller.');
  }

  // A missing thumbnail is never fatal - cards fall back to the full image.
  let thumbnailPath = request.data?.hasThumbnail === true ? buildEventThumbnailPath(eventId, imageId) : '';
  if (thumbnailPath) {
    const [thumbExists] = await bucket.file(thumbnailPath).exists();
    if (!thumbExists) thumbnailPath = '';
  }

  const caption = cleanCaption(request.data?.caption);
  const makeCover = request.data?.makeCover === true;

  const record: StoredEventImage = {
    id: imageId,
    storagePath,
    thumbnailPath,
    contentType,
    caption,
    size: actualSize,
    width: boundedDimension(request.data?.width),
    height: boundedDimension(request.data?.height),
    order: 0,
    uploadedAt: Timestamp.now(),
  };

  const eventRef = db.collection('events').doc(eventId);
  let saved: { images: StoredEventImage[]; coverImageId: string };
  try {
    saved = await db.runTransaction(async (tx) => {
      const snap = await tx.get(eventRef);
      if (!snap.exists) throw new HttpsError('not-found', 'Event not found.');
      const images = readImages(snap.data());
      const existing = images.find(image => image.id === imageId);
      if (existing) {
        // Callable responses can be lost after the transaction commits. A
        // retry of the same ticket is safe and returns the existing record
        // instead of deleting an image that is already referenced.
        if (existing.storagePath !== storagePath) {
          throw new HttpsError('already-exists', 'That image id is already in use.');
        }
        return {
          images,
          coverImageId: nextCover(images, String(snap.data()?.coverImageId || '')),
        };
      }
      if (images.length >= EVENT_IMAGE_MAX_PER_EVENT) {
        throw new HttpsError('resource-exhausted', `Events can hold ${EVENT_IMAGE_MAX_PER_EVENT} images.`);
      }
      const next = [...images, record].map((image, index) => ({ ...image, order: index }));
      const coverImageId = makeCover || !images.length
        ? imageId
        : nextCover(next, String(snap.data()?.coverImageId || ''));
      tx.update(eventRef, {
        images: next,
        coverImageId,
        imageCount: next.length,
        updatedAt: FieldValue.serverTimestamp(),
      });
      return { images: next, coverImageId };
    });
  } catch (err) {
    // Once attach starts, the server owns cleanup. That avoids a client with a
    // lost success response deleting a file that the transaction committed.
    // Re-read after an ambiguous transaction failure and clean only when the
    // image is definitely not referenced. If this verification read also
    // fails, retain the object rather than risk breaking a committed record.
    try {
      const after = await eventRef.get();
      const afterImages = after.exists ? readImages(after.data()) : [];
      const existing = afterImages.find(image => image.id === imageId);
      if (!existing || existing.storagePath !== storagePath) {
        await file.delete().catch(() => {});
        // A same-id record may own the shared thumbnail path, even when its
        // original extension differs from this failed attempt.
        if (!existing) await bucket.file(thumbnailPathForAttempt).delete().catch(() => {});
      }
    } catch {
      // Intentionally leave the object for an operator/scheduled orphan sweep.
    }
    throw err;
  }

  await recordAdminAction(request, {
    action: 'event-image.attach', summary: 'Attached image to event', resourceType: 'event-image', resourceId: imageId,
    details: { eventId, makeCover },
  });
  return { ok: true, imageId, storagePath, ...saved };
});

// Captions and cover selection stay editable after the event is published.
export const updateEventImage = onCall(callableOptions, async (request) => {
  const { uid } = requireAdmin(request);
  await enforceRateLimit({ key: `eventImageUpdate:${uid}`, max: 200, windowSeconds: 3600 });

  const eventId = requireEventId(request.data?.eventId);
  const imageId = requireImageId(request.data?.imageId);
  const hasCaption = Object.prototype.hasOwnProperty.call(request.data ?? {}, 'caption');
  const caption = hasCaption ? cleanCaption(request.data?.caption) : '';
  const makeCover = request.data?.makeCover === true;

  const eventRef = db.collection('events').doc(eventId);
  const saved = await db.runTransaction(async (tx) => {
    const snap = await tx.get(eventRef);
    if (!snap.exists) throw new HttpsError('not-found', 'Event not found.');
    const images = readImages(snap.data());
    if (!images.some(image => image.id === imageId)) {
      throw new HttpsError('not-found', 'Image not found on this event.');
    }
    const next = images.map((image, index) => ({
      ...image,
      order: index,
      caption: image.id === imageId && hasCaption ? caption : image.caption || '',
    }));
    const coverImageId = makeCover ? imageId : nextCover(next, String(snap.data()?.coverImageId || ''));
    tx.update(eventRef, {
      images: next,
      coverImageId,
      imageCount: next.length,
      updatedAt: FieldValue.serverTimestamp(),
    });
    return { images: next, coverImageId };
  });

  await recordAdminAction(request, {
    action: 'event-image.update', summary: 'Updated event image', resourceType: 'event-image', resourceId: imageId,
    details: { eventId, makeCover },
  });
  return { ok: true, ...saved };
});

// Removing the record is enough: the Firestore trigger sweeps the orphaned
// Storage objects (see triggers/eventMediaCleanup.ts).
export const deleteEventImage = onCall(callableOptions, async (request) => {
  const { uid } = requireAdmin(request);
  await enforceRateLimit({ key: `eventImageDelete:${uid}`, max: 200, windowSeconds: 3600 });

  const eventId = requireEventId(request.data?.eventId);
  const imageId = requireImageId(request.data?.imageId);

  const eventRef = db.collection('events').doc(eventId);
  const saved = await db.runTransaction(async (tx) => {
    const snap = await tx.get(eventRef);
    if (!snap.exists) throw new HttpsError('not-found', 'Event not found.');
    const images = readImages(snap.data());
    const next = images.filter(image => image.id !== imageId).map((image, index) => ({ ...image, order: index }));
    if (next.length === images.length) return { images: next, coverImageId: String(snap.data()?.coverImageId || '') };
    const coverImageId = nextCover(next, String(snap.data()?.coverImageId || ''));
    tx.update(eventRef, {
      images: next,
      coverImageId,
      imageCount: next.length,
      updatedAt: FieldValue.serverTimestamp(),
    });
    return { images: next, coverImageId };
  });

  await recordAdminAction(request, {
    action: 'event-image.delete', summary: 'Deleted event image', resourceType: 'event-image', resourceId: imageId,
    details: { eventId },
  });
  return { ok: true, ...saved };
});
