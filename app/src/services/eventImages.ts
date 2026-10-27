import { deleteObject, uploadBytesResumable, ref, type UploadTaskSnapshot } from 'firebase/storage';
import { storage } from '@runtime/firebase';
import {
  attachEventImageFn,
  callableErrorMessage,
  createEventImageUploadTicketFn,
  deleteEventImageFn,
  updateEventImageFn,
} from '../libs/callables';
import { recordCrash } from '../utils/crashReporting';
import { sanitizeImageCaption, validateEventImageFile } from '../utils/sanitize';

export type UploadPhase = 'idle' | 'validating' | 'uploading' | 'processing' | 'saving' | 'done' | 'error';

export type UploadStatus = {
  phase: UploadPhase;
  percent: number;
  message: string;
};

type ProgressHandler = (status: UploadStatus) => void;

function report(onProgress: ProgressHandler | undefined, status: UploadStatus) {
  if (onProgress) onProgress(status);
}

async function makeThumbnailBlob(file: File): Promise<Blob | null> {
  try {
    const { makeThumbnail } = await import('../utils/thumbnail');
    return await makeThumbnail(file);
  } catch {
    return null;
  }
}

async function measureImage(file: File): Promise<{ width: number; height: number }> {
  try {
    if (typeof createImageBitmap !== 'function') return { width: 0, height: 0 };
    const bitmap = await createImageBitmap(file);
    const size = { width: bitmap.width, height: bitmap.height };
    bitmap.close?.();
    return size;
  } catch {
    return { width: 0, height: 0 };
  }
}

/**
 * Admin image upload pipeline:
 *   1. client-side type/size gate (mirrors Storage rules + the callable)
 *   2. server reserves events/{eventId}/{imageId}.{ext}
 *   3. resumable upload with progress reporting
 *   4. optional thumbnail for the event card
 *   5. server verifies the stored object and records it on the event
 */
export async function uploadEventImage(options: {
  eventId: string;
  file: File;
  caption?: string;
  makeCover?: boolean;
  onProgress?: ProgressHandler;
}): Promise<{ imageId: string; storagePath: string; images: unknown[]; coverImageId: string }> {
  const { eventId, file, caption = '', makeCover = false, onProgress } = options;

  report(onProgress, { phase: 'validating', percent: 0, message: 'Checking the image...' });
  const validation = validateEventImageFile(file);
  if (!validation.ok) {
    report(onProgress, { phase: 'error', percent: 0, message: validation.reason });
    throw new Error(validation.reason);
  }

  let uploadedPaths: string[] = [];
  let attachStarted = false;
  try {
    const ticketResponse = await createEventImageUploadTicketFn({
      eventId,
      contentType: file.type,
      size: file.size,
    });
    const ticket = ticketResponse.data as { imageId: string; storagePath: string; thumbnailPath: string };

    report(onProgress, { phase: 'uploading', percent: 1, message: 'Uploading image...' });
    uploadedPaths = [ticket.storagePath];
    await new Promise<void>((resolve, reject) => {
      const task = uploadBytesResumable(ref(storage, ticket.storagePath), file, {
        contentType: file.type,
        customMetadata: { eventId, imageId: ticket.imageId },
      });
      task.on(
        'state_changed',
        (snapshot: UploadTaskSnapshot) => {
          const percent = snapshot.totalBytes
            ? Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100)
            : 0;
          report(onProgress, {
            phase: 'uploading',
            percent: Math.min(percent, 99),
            message: `Uploading image... ${Math.min(percent, 99)}%`,
          });
        },
        reject,
        () => resolve(),
      );
    });

    report(onProgress, { phase: 'processing', percent: 100, message: 'Building card thumbnail...' });
    let hasThumbnail = false;
    const thumbnail = await makeThumbnailBlob(file);
    if (thumbnail && ticket.thumbnailPath) {
      try {
        await new Promise<void>((resolve, reject) => {
          const task = uploadBytesResumable(ref(storage, ticket.thumbnailPath), thumbnail, {
            contentType: 'image/jpeg',
            customMetadata: { eventId, imageId: ticket.imageId, thumbnail: 'true' },
          });
          task.on('state_changed', () => {}, reject, () => resolve());
        });
        hasThumbnail = true;
        uploadedPaths.push(ticket.thumbnailPath);
      } catch (err) {
        // Non-fatal: cards fall back to the full-size image.
        recordCrash(err, 'eventImage-thumbnail', { eventId, imageId: ticket.imageId });
      }
    }

    const { width, height } = await measureImage(file);

    report(onProgress, { phase: 'saving', percent: 100, message: 'Saving image details...' });
    attachStarted = true;
    const attached = await attachEventImageFn({
      eventId,
      imageId: ticket.imageId,
      contentType: file.type,
      caption: sanitizeImageCaption(caption),
      size: file.size,
      width,
      height,
      hasThumbnail,
      makeCover,
    });

    report(onProgress, { phase: 'done', percent: 100, message: 'Image added.' });
    const data = attached.data as { images: unknown[]; coverImageId: string };
    return {
      imageId: ticket.imageId,
      storagePath: ticket.storagePath,
      images: data?.images ?? [],
      coverImageId: data?.coverImageId ?? '',
    };
  } catch (err) {
    const message = callableErrorMessage(err, 'Image upload failed. Please try again.');
    recordCrash(err, 'eventImage-upload', { eventId, fileName: file?.name, size: file?.size });
    // Before attach starts, the browser still owns cleanup. Once it starts,
    // the callable owns cleanup and is idempotent: a lost success response
    // must never make the browser delete an already-referenced image.
    if (!attachStarted) {
      await Promise.all(uploadedPaths.map(path => deleteObject(ref(storage, path)).catch(() => {})));
    }
    report(onProgress, { phase: 'error', percent: 0, message });
    throw new Error(message);
  }
}

export async function saveEventImageCaption(eventId: string, imageId: string, caption: string) {
  try {
    const response = await updateEventImageFn({ eventId, imageId, caption: sanitizeImageCaption(caption) });
    return response.data as { images: unknown[]; coverImageId: string };
  } catch (err) {
    recordCrash(err, 'eventImage-caption', { eventId, imageId });
    throw new Error(callableErrorMessage(err, 'Could not save the caption. Please try again.'));
  }
}

export async function setEventCoverImage(eventId: string, imageId: string) {
  try {
    const response = await updateEventImageFn({ eventId, imageId, makeCover: true });
    return response.data as { images: unknown[]; coverImageId: string };
  } catch (err) {
    recordCrash(err, 'eventImage-cover', { eventId, imageId });
    throw new Error(callableErrorMessage(err, 'Could not update the cover image. Please try again.'));
  }
}

export async function removeEventImage(eventId: string, imageId: string) {
  try {
    const response = await deleteEventImageFn({ eventId, imageId });
    return response.data as { images: unknown[]; coverImageId: string };
  } catch (err) {
    recordCrash(err, 'eventImage-delete', { eventId, imageId });
    throw new Error(callableErrorMessage(err, 'Could not remove the image. Please try again.'));
  }
}
