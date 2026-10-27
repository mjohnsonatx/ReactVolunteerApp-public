import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { randomUUID } from 'node:crypto';
import { mediaCallableOptions as callableOptions } from '../lib/options';
import { requireAdmin, requireAuth, requireVerifiedEmail } from '../lib/guards';
import { enforceRateLimit } from '../lib/rateLimiter';
import { db, adminStorage } from '../lib/firebaseAdmin';
import { randomId } from '../lib/ids';
import { requireActiveUserProfile } from '../lib/userProfile';
import { recordAdminAction } from '../lib/adminAudit';
import { detectMalicious, enforceLimit, LIMITS, sanitizeMultiline, sanitizeText } from '../shared';

const PUBLIC_DOCUMENT_LIMIT = 100;
const ADMIN_STORAGE_PAGE_SIZE = 200;
const DOCUMENT_MAX_BYTES = 10 * 1024 * 1024;
const DOCUMENT_THUMBNAIL_MAX_BYTES = 1024 * 1024;
const DOCUMENT_MAX_PER_USER = 50;
const DOCUMENT_MAX_TOTAL_BYTES = 250 * 1024 * 1024;
const DOCUMENT_MAX_ACTIVE_TICKETS = 3;
const TICKET_TTL_MS = 30 * 60 * 1000;
const COMPLETED_TICKET_RETENTION_MS = 24 * 60 * 60 * 1000;
const TICKETS = 'documentUploadTickets';
const QUOTAS = 'documentUploadQuotas';
const ALLOWED_TYPES = new Map([
  ['application/pdf', { extension: 'pdf', label: 'PDF' as const }],
  ['image/png', { extension: 'png', label: 'PNG' as const }],
  ['image/jpeg', { extension: 'jpg', label: 'JPG' as const }],
]);

type UploadTicket = {
  userId: string;
  originalName: string;
  contentType: string;
  sizeBytes: number;
  fileName: string;
  storagePath: string;
  wantsThumbnail: boolean;
  thumbnailFileName: string;
  thumbnailPath: string;
  status: 'issued' | 'completed' | 'cleanupPending';
  expiresAt: Timestamp;
};

type StorageDocumentLink = {
  documentId: string;
  documentTitle: string;
  linkRole: 'current-document' | 'current-thumbnail' | 'preserved-original' | 'preserved-thumbnail';
  recordPublished: boolean;
};

function requireId(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new HttpsError('invalid-argument', `Missing ${label}.`);
  }
  return value.trim();
}

function requireTicketId(value: unknown): string {
  const id = requireId(value, 'upload ticket');
  if (!/^[a-z0-9]{24}$/.test(id)) throw new HttpsError('invalid-argument', 'Invalid upload ticket.');
  return id;
}

function cleanStoragePath(value: unknown): string {
  if (typeof value !== 'string') return '';
  const path = value.trim();
  if (!path || path.startsWith('/') || path.includes('..') || path.length > 500) return '';
  return path;
}

function requireDocumentStorageObjectPath(value: unknown): string {
  const path = cleanStoragePath(value);
  if (!path || !/^documents\/[^/]+\/[^/]+$/.test(path)) {
    throw new HttpsError('invalid-argument', 'A valid document Storage object path is required.');
  }
  return path;
}

function pageToken(value: unknown): string {
  if (value === undefined || value === null || value === '') return '';
  if (typeof value !== 'string' || value.length > 2048 || /[\u0000-\u001f\u007f]/.test(value)) {
    throw new HttpsError('invalid-argument', 'Invalid Storage inventory page token.');
  }
  return value;
}

function normalizedContentType(value: unknown): string {
  return String(value || '').split(';', 1)[0].trim().toLowerCase();
}

function downloadTokens(value: unknown): string[] {
  if (typeof value !== 'string') return [];
  return [...new Set(value.split(',').map(token => token.trim()).filter(Boolean))];
}

async function deleteEmulatorDownloadTokens(
  bucketName: string,
  path: string,
  tokens: string[],
): Promise<void> {
  const emulatorHost = process.env.FIREBASE_STORAGE_EMULATOR_HOST?.trim();
  if (!emulatorHost || tokens.length === 0) return;
  const baseUrl = /^https?:\/\//i.test(emulatorHost) ? emulatorHost : `http://${emulatorHost}`;
  const objectUrl = `${baseUrl}/v0/b/${encodeURIComponent(bucketName)}/o/${encodeURIComponent(path)}`;
  for (const token of tokens) {
    const response = await fetch(`${objectUrl}?delete_token=${encodeURIComponent(token)}`, {
      method: 'POST',
      headers: { Authorization: 'Bearer owner' },
    });
    if (!response.ok) {
      throw new Error(`Storage emulator could not revoke a Firebase download token (${response.status}).`);
    }
  }
}

function cleanOriginalName(value: unknown, contentType: string): string {
  const fallbackExtension = ALLOWED_TYPES.get(contentType)?.extension || 'bin';
  return sanitizeText(value).replace(/[/\\]/g, '_').slice(0, 100) || `document.${fallbackExtension}`;
}

function displaySize(sizeBytes: number): string {
  if (sizeBytes >= 1024 * 1024) return `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(sizeBytes / 1024))} KB`;
}

function legacySizeBytes(data: FirebaseFirestore.DocumentData): number {
  const exact = Number(data.sizeBytes);
  if (Number.isFinite(exact) && exact >= 0) return exact;
  const legacy = String(data.size || '').trim().match(/^(\d+(?:\.\d+)?)\s*(KB|MB|B)$/i);
  if (!legacy) return DOCUMENT_MAX_BYTES;
  const amount = Number(legacy[1]);
  const unit = legacy[2].toUpperCase();
  if (unit === 'MB') return Math.round(amount * 1024 * 1024);
  if (unit === 'KB') return Math.round(amount * 1024);
  return Math.round(amount);
}

function publicDocumentProjection(
  id: string,
  data: FirebaseFirestore.DocumentData,
): Record<string, unknown> | null {
  const ownerId = typeof data.userId === 'string' ? data.userId : '';
  const storagePath = cleanStoragePath(data.storagePath);
  const thumbnailPath = cleanStoragePath(data.thumbnailPath);
  if (
    data.published !== true
    || data.status !== 'approved'
    || data.visibility !== 'public'
    || !ownerId
    || !storagePath.startsWith(`documents/${ownerId}/`)
    || (thumbnailPath && !thumbnailPath.startsWith(`documents/${ownerId}/`))
  ) {
    return null;
  }

  const type = ['PDF', 'PNG', 'JPG'].includes(data.type) ? data.type : 'PDF';
  return {
    id,
    title: enforceLimit(sanitizeText(data.title), LIMITS.name),
    notes: enforceLimit(sanitizeMultiline(data.notes), LIMITS.comment),
    name: sanitizeText(data.name).slice(0, 100),
    type,
    size: sanitizeText(data.size).slice(0, 40),
    sizeBytes: Number(data.sizeBytes || 0),
    storagePath,
    thumbnailPath,
  };
}

async function summarizeExistingDocuments(uid: string): Promise<{ storedCount: number; storedBytes: number }> {
  const snap = await db.collection('documents').where('userId', '==', uid).get();
  return {
    storedCount: snap.size,
    storedBytes: snap.docs.reduce((total, doc) => total + legacySizeBytes(doc.data()), 0),
  };
}

async function updatePublishedMetadata(path: unknown, published: boolean): Promise<void> {
  const cleanPath = cleanStoragePath(path);
  if (!cleanPath) return;
  try {
    await adminStorage.bucket().file(cleanPath).setMetadata({
      metadata: { published: published ? 'true' : 'false' },
    });
  } catch (err: any) {
    if (err?.code === 404) return;
    throw err;
  }
}

async function storageDocumentLinks(): Promise<Map<string, StorageDocumentLink>> {
  const snap = await db.collection('documents')
    .select(
      'title',
      'name',
      'published',
      'storagePath',
      'thumbnailPath',
      'originalStoragePath',
      'originalThumbnailPath',
    )
    .get();
  const links = new Map<string, StorageDocumentLink>();
  const add = (
    value: unknown,
    documentId: string,
    documentTitle: string,
    linkRole: StorageDocumentLink['linkRole'],
    recordPublished: boolean,
  ) => {
    const path = cleanStoragePath(value);
    if (path && !links.has(path)) {
      links.set(path, { documentId, documentTitle, linkRole, recordPublished });
    }
  };

  for (const doc of snap.docs) {
    const data = doc.data();
    const title = enforceLimit(sanitizeText(data.title || data.name), LIMITS.name);
    const published = data.published === true;
    add(data.storagePath, doc.id, title, 'current-document', published);
    add(data.thumbnailPath, doc.id, title, 'current-thumbnail', published);
    add(data.originalStoragePath, doc.id, title, 'preserved-original', published);
    add(data.originalThumbnailPath, doc.id, title, 'preserved-thumbnail', published);
  }
  return links;
}

async function currentDocumentForStoragePath(path: string): Promise<string> {
  const [primary, thumbnail] = await Promise.all([
    db.collection('documents').where('storagePath', '==', path).limit(1).get(),
    db.collection('documents').where('thumbnailPath', '==', path).limit(1).get(),
  ]);
  return primary.docs[0]?.id || thumbnail.docs[0]?.id || '';
}

async function deleteStorageFile(path: unknown): Promise<void> {
  const cleanPath = cleanStoragePath(path);
  if (!cleanPath) return;
  try {
    await adminStorage.bucket().file(cleanPath).delete();
  } catch (err: any) {
    if (err?.code === 404) return;
    throw err;
  }
}

async function getVerifiedMetadata(path: string): Promise<Record<string, any>> {
  try {
    const [metadata] = await adminStorage.bucket().file(path).getMetadata();
    return metadata as Record<string, any>;
  } catch (err: any) {
    if (err?.code === 404) {
      throw new HttpsError('failed-precondition', 'The uploaded document could not be found.');
    }
    throw err;
  }
}

function assertPrimaryMetadata(metadata: Record<string, any>, ticketId: string, ticket: UploadTicket): void {
  const size = Number(metadata.size || 0);
  const contentType = normalizedContentType(metadata.contentType);
  const custom = metadata.metadata ?? {};
  if (
    metadata.name !== ticket.storagePath
    || size !== ticket.sizeBytes
    || contentType !== ticket.contentType
    || !ALLOWED_TYPES.has(contentType)
    || size <= 0
    || size > DOCUMENT_MAX_BYTES
    || custom.ticketId !== ticketId
    || custom.role !== 'document'
    || custom.published !== 'false'
  ) {
    throw new HttpsError('failed-precondition', 'Stored document metadata does not match its upload ticket.');
  }
}

function assertThumbnailMetadata(metadata: Record<string, any>, ticketId: string, ticket: UploadTicket): void {
  const size = Number(metadata.size || 0);
  const custom = metadata.metadata ?? {};
  if (
    metadata.name !== ticket.thumbnailPath
    || normalizedContentType(metadata.contentType) !== 'image/jpeg'
    || size <= 0
    || size > DOCUMENT_THUMBNAIL_MAX_BYTES
    || custom.ticketId !== ticketId
    || custom.role !== 'thumbnail'
    || custom.published !== 'false'
  ) {
    throw new HttpsError('failed-precondition', 'Stored thumbnail metadata does not match its upload ticket.');
  }
}

async function releaseStoredQuotaAndDelete(
  ref: FirebaseFirestore.DocumentReference,
  expectedUid?: string,
): Promise<{ id: string; storagePath: string; thumbnailPath: string } | null> {
  const initial = await ref.get();
  if (!initial.exists) return null;
  const initialData = initial.data() ?? {};
  const uid = String(initialData.userId || '');
  if (expectedUid && uid !== expectedUid) {
    throw new HttpsError('permission-denied', 'You can only delete your own documents.');
  }

  const storagePath = cleanStoragePath(initialData.storagePath);
  const thumbnailPath = cleanStoragePath(initialData.thumbnailPath);
  await Promise.all([deleteStorageFile(storagePath), deleteStorageFile(thumbnailPath)]);

  await db.runTransaction(async (tx) => {
    const [current, quota] = await Promise.all([
      tx.get(ref),
      uid ? tx.get(db.collection(QUOTAS).doc(uid)) : Promise.resolve(null),
    ]);
    if (!current.exists) return;
    const currentData = current.data() ?? {};
    if (expectedUid && currentData.userId !== expectedUid) {
      throw new HttpsError('permission-denied', 'You can only delete your own documents.');
    }
    tx.delete(ref);
    if (uid && quota?.exists) {
      const quotaData = quota.data() ?? {};
      tx.update(quota.ref, {
        storedCount: Math.max(0, Number(quotaData.storedCount || 0) - 1),
        storedBytes: Math.max(0, Number(quotaData.storedBytes || 0) - legacySizeBytes(currentData)),
        updatedAt: FieldValue.serverTimestamp(),
      });
    }
  });
  return { id: ref.id, storagePath, thumbnailPath };
}

// Public document records contain uploader identity and therefore cannot be
// read directly from Firestore. Return only fields needed by the public UI.
export const listPublicDocuments = onCall(callableOptions, async () => {
  const snap = await db.collection('documents')
    .where('published', '==', true)
    .limit(PUBLIC_DOCUMENT_LIMIT)
    .get();
  const documents = snap.docs
    .map(doc => publicDocumentProjection(doc.id, doc.data()))
    .filter((doc): doc is Record<string, unknown> => doc !== null);
  return { documents };
});

// The document-record collection is intentionally not a bucket browser. This
// admin-only inventory exposes every object in the default application bucket
// without returning signed URLs or download-token values, and reconciles the
// document paths that Firestore knows about.
export const listAdminStorageObjects = onCall(callableOptions, async (request) => {
  requireAdmin(request);
  const token = pageToken(request.data?.pageToken);
  const options: { autoPaginate: false; maxResults: number; pageToken?: string } = {
    autoPaginate: false,
    maxResults: ADMIN_STORAGE_PAGE_SIZE,
  };
  if (token) options.pageToken = token;

  const [[files, nextQuery], links] = await Promise.all([
    adminStorage.bucket().getFiles(options),
    storageDocumentLinks(),
  ]);
  const objects = files.map((file) => {
    const metadata = file.metadata ?? {};
    const custom = metadata.metadata ?? {};
    const link = links.get(file.name);
    return {
      name: file.name,
      category: file.name.split('/', 1)[0] || 'root',
      contentType: normalizedContentType(metadata.contentType),
      sizeBytes: Number(metadata.size || 0),
      createdAt: String(metadata.timeCreated || ''),
      updatedAt: String(metadata.updated || ''),
      published: custom.published === 'true',
      role: sanitizeText(custom.role).slice(0, 40),
      hasDownloadToken: typeof custom.firebaseStorageDownloadTokens === 'string'
        && custom.firebaseStorageDownloadTokens.trim().length > 0,
      downloadTokenRotatedAt: sanitizeText(custom.downloadTokenRotatedAt),
      documentId: link?.documentId || '',
      documentTitle: link?.documentTitle || '',
      linkRole: link?.linkRole || '',
      recordPublished: link?.recordPublished === true,
    };
  });
  return {
    objects,
    nextPageToken: typeof nextQuery?.pageToken === 'string' ? nextQuery.pageToken : '',
  };
});

// Storage-only and preserved document objects have no normal moderation row.
// Let an MFA-authenticated administrator change their read metadata without
// allowing a current document and its Firestore record to drift apart.
export const setAdminStorageObjectPublished = onCall(callableOptions, async (request) => {
  requireAdmin(request);
  const path = requireDocumentStorageObjectPath(request.data?.path);
  if (typeof request.data?.published !== 'boolean') {
    throw new HttpsError('invalid-argument', 'Published must be true or false.');
  }
  const published = request.data.published;
  const currentDocumentId = await currentDocumentForStoragePath(path);
  if (currentDocumentId) {
    throw new HttpsError(
      'failed-precondition',
      'This object belongs to a current document record. Use the document publish control instead.',
    );
  }

  const file = adminStorage.bucket().file(path);
  let metadata: Record<string, any>;
  try {
    const [rawMetadata] = await file.getMetadata();
    metadata = rawMetadata as Record<string, any>;
  } catch (err: any) {
    if (err?.code === 404) throw new HttpsError('not-found', 'Storage object not found.');
    throw err;
  }
  const sizeBytes = Number(metadata.size || 0);
  const contentType = normalizedContentType(metadata.contentType);
  if (published && (!ALLOWED_TYPES.has(contentType) || sizeBytes <= 0 || sizeBytes > DOCUMENT_MAX_BYTES)) {
    throw new HttpsError('failed-precondition', 'Only safe PDF, PNG, or JPEG document objects can be public.');
  }

  const previousTokens = downloadTokens(metadata.metadata?.firebaseStorageDownloadTokens);
  const downloadTokensRevoked = !published && previousTokens.length > 0;
  let rotatedAt = sanitizeText(metadata.metadata?.downloadTokenRotatedAt);

  if (downloadTokensRevoked) {
    // Replacing the token revokes every previously shared download URL while
    // retaining one undisclosed capability token. The emulator models tokens
    // separately, so remove its old values through its token endpoint too.
    const replacementToken = randomUUID();
    await file.setMetadata({
      metadata: {
        published: 'false',
        firebaseStorageDownloadTokens: replacementToken,
      },
    });
    await deleteEmulatorDownloadTokens(file.bucket.name, path, previousTokens);

    const [updatedMetadata] = await file.getMetadata();
    const remainingTokens = downloadTokens(updatedMetadata.metadata?.firebaseStorageDownloadTokens);
    if (previousTokens.some(token => remainingTokens.includes(token))) {
      throw new Error('Storage did not revoke every previous Firebase download token.');
    }
    rotatedAt = new Date().toISOString();
    await file.setMetadata({ metadata: { downloadTokenRotatedAt: rotatedAt } });
  } else {
    await file.setMetadata({ metadata: { published: published ? 'true' : 'false' } });
  }

  const [finalMetadata] = await file.getMetadata();
  const hasDownloadToken = downloadTokens(finalMetadata.metadata?.firebaseStorageDownloadTokens).length > 0;

  await recordAdminAction(request, {
    action: published ? 'storage-object.publish' : 'storage-object.unpublish',
    summary: published ? 'Published Storage document object' : 'Made Storage document object private',
    resourceType: 'storage-object',
    resourceId: path,
    tags: ['document', 'storage'],
    details: { published, downloadTokensRevoked, downloadTokenRotatedAt: rotatedAt },
  });
  return { path, published, hasDownloadToken, downloadTokensRevoked, downloadTokenRotatedAt: rotatedAt };
});

// Reserves the only Storage paths a member may create. Quota state is updated
// in the same transaction, preventing parallel requests from racing the cap.
export const createDocumentUploadTicket = onCall(callableOptions, async (request) => {
  const { uid } = requireVerifiedEmail(request);
  await requireActiveUserProfile(uid);
  await enforceRateLimit({ key: `documentTicketHour:${uid}`, max: 12, windowSeconds: 3600 });
  await enforceRateLimit({ key: `documentTicketDay:${uid}`, max: 30, windowSeconds: 24 * 3600 });

  const contentType = normalizedContentType(request.data?.contentType);
  const type = ALLOWED_TYPES.get(contentType);
  const sizeBytes = Number(request.data?.sizeBytes);
  if (!type) throw new HttpsError('invalid-argument', 'Documents must be PDF, JPEG, or PNG.');
  if (!Number.isInteger(sizeBytes) || sizeBytes <= 0 || sizeBytes > DOCUMENT_MAX_BYTES) {
    throw new HttpsError('invalid-argument', 'Documents must be 10 MB or smaller.');
  }

  const wantsThumbnail = request.data?.wantsThumbnail === true;
  const originalName = cleanOriginalName(request.data?.name, contentType);
  const ticketId = randomId(24);
  const fileName = `${ticketId}.${type.extension}`;
  const thumbnailFileName = `${ticketId}_thumb.jpg`;
  const storagePath = `documents/${uid}/${fileName}`;
  const thumbnailPath = wantsThumbnail ? `documents/${uid}/${thumbnailFileName}` : '';
  const ticketRef = db.collection(TICKETS).doc(ticketId);
  const quotaRef = db.collection(QUOTAS).doc(uid);
  const existingQuota = await quotaRef.get();
  const baseline = existingQuota.exists
    ? { storedCount: 0, storedBytes: 0 }
    : await summarizeExistingDocuments(uid);
  const now = Date.now();

  await db.runTransaction(async (tx) => {
    const quotaSnap = await tx.get(quotaRef);
    const quota: FirebaseFirestore.DocumentData = quotaSnap.data() ?? baseline;
    const storedCount = Number(quota.storedCount || 0);
    const storedBytes = Number(quota.storedBytes || 0);
    const activeTicketCount = Number(quota.activeTicketCount || 0);
    const reservedBytes = Number(quota.reservedBytes || 0);
    if (storedCount >= DOCUMENT_MAX_PER_USER) {
      throw new HttpsError('resource-exhausted', `Each account can store up to ${DOCUMENT_MAX_PER_USER} documents.`);
    }
    if (storedBytes + reservedBytes + sizeBytes > DOCUMENT_MAX_TOTAL_BYTES) {
      throw new HttpsError('resource-exhausted', 'This account has reached its 250 MB document quota.');
    }
    if (activeTicketCount >= DOCUMENT_MAX_ACTIVE_TICKETS) {
      throw new HttpsError('resource-exhausted', 'Too many uploads are already in progress. Try again after they finish.');
    }

    tx.set(ticketRef, {
      userId: uid,
      originalName,
      contentType,
      sizeBytes,
      fileName,
      storagePath,
      wantsThumbnail,
      thumbnailFileName,
      thumbnailPath,
      status: 'issued',
      createdAt: Timestamp.fromMillis(now),
      expiresAt: Timestamp.fromMillis(now + TICKET_TTL_MS),
    });
    tx.set(quotaRef, {
      storedCount,
      storedBytes,
      activeTicketCount: activeTicketCount + 1,
      reservedBytes: reservedBytes + sizeBytes,
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
  });

  return {
    ticketId,
    storagePath,
    thumbnailPath,
    expiresAt: now + TICKET_TTL_MS,
    maxBytes: DOCUMENT_MAX_BYTES,
  };
});

async function finalizeDocument(request: any, adminUpload: boolean): Promise<{ id: string }> {
  const auth = adminUpload ? requireAdmin(request) : requireVerifiedEmail(request);
  const { uid } = auth;
  const profile = await requireActiveUserProfile(uid);
  await enforceRateLimit({ key: `documentFinalize:${uid}`, max: 30, windowSeconds: 3600 });

  const data = request.data ?? {};
  const ticketId = requireTicketId(data.ticketId);
  const ticketRef = db.collection(TICKETS).doc(ticketId);
  const initialTicketSnap = await ticketRef.get();
  if (!initialTicketSnap.exists) throw new HttpsError('failed-precondition', 'Upload ticket was not found or has expired.');
  const ticket = initialTicketSnap.data() as UploadTicket;
  if (ticket.userId !== uid) throw new HttpsError('permission-denied', 'Upload ticket is not owned by this account.');

  if (ticket.status !== 'completed') {
    if (ticket.status !== 'issued' || !(ticket.expiresAt instanceof Timestamp) || ticket.expiresAt.toMillis() <= Date.now()) {
      throw new HttpsError('failed-precondition', 'Upload ticket has expired. Please upload the document again.');
    }
    const primaryMetadata = await getVerifiedMetadata(ticket.storagePath);
    assertPrimaryMetadata(primaryMetadata, ticketId, ticket);
    if (ticket.wantsThumbnail) {
      const thumbnailMetadata = await getVerifiedMetadata(ticket.thumbnailPath);
      assertThumbnailMetadata(thumbnailMetadata, ticketId, ticket);
    }
  }

  const cleanTitle = enforceLimit(sanitizeText(data.title), LIMITS.name) || ticket.originalName || 'Untitled';
  const cleanNotes = enforceLimit(sanitizeMultiline(data.notes), LIMITS.comment);
  for (const value of [cleanTitle, cleanNotes]) {
    const check = detectMalicious(value);
    if (check.blocked) throw new HttpsError('invalid-argument', `Invalid document content: ${check.reason}`);
  }

  const type = ALLOWED_TYPES.get(ticket.contentType);
  if (!type) throw new HttpsError('failed-precondition', 'Upload ticket has an invalid document type.');
  const docRef = db.collection('documents').doc(ticketId);
  const quotaRef = db.collection(QUOTAS).doc(uid);
  const now = Date.now();

  await db.runTransaction(async (tx) => {
    const [currentTicket, existingDoc, quotaSnap] = await Promise.all([
      tx.get(ticketRef),
      tx.get(docRef),
      tx.get(quotaRef),
    ]);
    if (!currentTicket.exists) throw new HttpsError('failed-precondition', 'Upload ticket was not found or has expired.');
    const current = currentTicket.data() as UploadTicket;
    if (current.userId !== uid) throw new HttpsError('permission-denied', 'Upload ticket is not owned by this account.');
    if (current.status === 'completed' && existingDoc.exists) return;
    if (current.status !== 'issued' || current.expiresAt.toMillis() <= now) {
      throw new HttpsError('failed-precondition', 'Upload ticket has expired. Please upload the document again.');
    }

    const quota = quotaSnap.data() ?? {};
    tx.set(docRef, {
      userId: uid,
      userName: profile.name || '',
      userEmail: profile.email || auth.token.email || '',
      title: cleanTitle,
      notes: cleanNotes,
      name: ticket.originalName,
      type: type.label,
      contentType: ticket.contentType,
      size: displaySize(ticket.sizeBytes),
      sizeBytes: ticket.sizeBytes,
      visibility: adminUpload ? 'public' : data.visibility === 'public' ? 'public' : 'private',
      published: false,
      uploadDate: FieldValue.serverTimestamp(),
      status: adminUpload ? 'approved' : 'pending',
      storagePath: ticket.storagePath,
      thumbnailPath: ticket.wantsThumbnail ? ticket.thumbnailPath : '',
      ...(adminUpload ? { uploadedByAdmin: true } : {}),
    });
    tx.update(ticketRef, {
      status: 'completed',
      completedAt: FieldValue.serverTimestamp(),
      expiresAt: Timestamp.fromMillis(now + COMPLETED_TICKET_RETENTION_MS),
    });
    tx.set(quotaRef, {
      storedCount: Number(quota.storedCount || 0) + 1,
      storedBytes: Number(quota.storedBytes || 0) + ticket.sizeBytes,
      activeTicketCount: Math.max(0, Number(quota.activeTicketCount || 0) - 1),
      reservedBytes: Math.max(0, Number(quota.reservedBytes || 0) - ticket.sizeBytes),
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
  });

  if (adminUpload && data.publish === true) {
    await Promise.all([
      updatePublishedMetadata(ticket.storagePath, true),
      updatePublishedMetadata(ticket.wantsThumbnail ? ticket.thumbnailPath : '', true),
    ]);
    await docRef.update({ published: true });
  }
  if (adminUpload) {
    await recordAdminAction(request, {
      action: 'document.create', summary: 'Uploaded administrator document', resourceType: 'document', resourceId: docRef.id,
      details: { published: data.publish === true },
    });
  }
  return { id: docRef.id };
}

export const createDocumentRecord = onCall(callableOptions, request => finalizeDocument(request, false));
export const createAdminDocumentRecord = onCall(callableOptions, request => finalizeDocument(request, true));

export const setDocumentStatus = onCall(callableOptions, async (request) => {
  requireAdmin(request);
  const id = requireId(request.data?.id, 'document id');
  const status = request.data?.status;
  if (status !== 'approved' && status !== 'rejected') {
    throw new HttpsError('invalid-argument', 'Invalid document status.');
  }

  const ref = db.collection('documents').doc(id);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError('not-found', 'Document not found.');
  const data = snap.data() ?? {};

  if (status === 'rejected') {
    await Promise.all([
      updatePublishedMetadata(data.storagePath, false),
      updatePublishedMetadata(data.thumbnailPath, false),
    ]);
    await ref.update({ status: 'rejected', published: false });
    await recordAdminAction(request, {
      action: 'document.reject', summary: 'Rejected document', resourceType: 'document', resourceId: id,
    });
    return { ok: true, status: 'rejected', published: false };
  }

  await ref.update({ status: 'approved' });
  await recordAdminAction(request, {
    action: 'document.approve', summary: 'Approved document', resourceType: 'document', resourceId: id,
  });
  return { ok: true, status: 'approved', published: data.published === true };
});

export const toggleDocumentPublished = onCall(callableOptions, async (request) => {
  requireAdmin(request);
  const id = requireId(request.data?.id, 'document id');
  const ref = db.collection('documents').doc(id);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError('not-found', 'Document not found.');
  const data = snap.data() ?? {};
  const next = data.published !== true;

  if (next && data.status !== 'approved') {
    throw new HttpsError('failed-precondition', 'Only approved documents can be published.');
  }
  if (next && data.visibility !== 'public') {
    throw new HttpsError('failed-precondition', 'Only public documents can be published.');
  }

  await Promise.all([
    updatePublishedMetadata(data.storagePath, next),
    updatePublishedMetadata(data.thumbnailPath, next),
  ]);
  await ref.update({ published: next });
  await recordAdminAction(request, {
    action: next ? 'document.publish' : 'document.unpublish',
    summary: next ? 'Published document' : 'Unpublished document',
    resourceType: 'document',
    resourceId: id,
  });
  return { published: next };
});

export const deleteDocumentRecord = onCall(callableOptions, async (request) => {
  requireAdmin(request);
  const id = requireId(request.data?.id, 'document id');
  await releaseStoredQuotaAndDelete(db.collection('documents').doc(id));
  await recordAdminAction(request, {
    action: 'document.delete', summary: 'Deleted document', resourceType: 'document', resourceId: id,
  });
  return { ok: true };
});

export const deleteOwnDocument = onCall(callableOptions, async (request) => {
  const { uid } = requireAuth(request);
  const id = requireId(request.data?.id, 'document id');
  await releaseStoredQuotaAndDelete(db.collection('documents').doc(id), uid);
  return { ok: true, id };
});

// Called by the scheduled janitor. Issued tickets release their reservation
// and have any partially uploaded objects removed; completed tickets only lose
// their short-lived idempotency record.
export async function cleanupDocumentUploadTicket(
  ticketRef: FirebaseFirestore.DocumentReference,
): Promise<void> {
  const cleanup = await db.runTransaction(async (tx) => {
    const ticketSnap = await tx.get(ticketRef);
    if (!ticketSnap.exists) return null;
    const ticket = ticketSnap.data() as UploadTicket;
    if (ticket.status === 'completed') {
      tx.delete(ticketRef);
      return { paths: [] as string[], deleteTicket: false };
    }
    const quotaRef = db.collection(QUOTAS).doc(ticket.userId);
    const quotaSnap = await tx.get(quotaRef);
    if (ticket.status === 'issued') {
      const quota = quotaSnap.data() ?? {};
      tx.set(quotaRef, {
        activeTicketCount: Math.max(0, Number(quota.activeTicketCount || 0) - 1),
        reservedBytes: Math.max(0, Number(quota.reservedBytes || 0) - Number(ticket.sizeBytes || 0)),
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
      tx.update(ticketRef, { status: 'cleanupPending' });
    }
    return {
      paths: [cleanStoragePath(ticket.storagePath), cleanStoragePath(ticket.thumbnailPath)].filter(Boolean),
      deleteTicket: true,
    };
  });
  if (!cleanup) return;
  await Promise.all(cleanup.paths.map(path => deleteStorageFile(path)));
  if (cleanup.deleteTicket) await ticketRef.delete();
}
