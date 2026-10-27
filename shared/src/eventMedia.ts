// Shared rules for event images.
//
// These constants and helpers are imported by the browser client (pre-flight
// validation + friendly errors), by the callable Functions (authoritative
// validation) and are mirrored by the Storage security rules. Keeping the
// values in one module keeps the three layers from drifting apart.

import { enforceLimit, sanitizeText } from './sanitize';

export const EVENT_IMAGE_MAX_BYTES = 5 * 1024 * 1024; // 5 MB
export const EVENT_IMAGE_MAX_PER_EVENT = 12;
export const EVENT_IMAGE_CAPTION_LIMIT = 200;
export const EVENT_IMAGE_ID_PATTERN = /^[a-z0-9]{6,40}$/;

export const EVENT_IMAGE_CONTENT_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
export type EventImageContentType = (typeof EVENT_IMAGE_CONTENT_TYPES)[number];

const EXTENSION_BY_TYPE: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

export const EVENT_IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp'] as const;

export const EVENT_IMAGE_ACCEPT_ATTRIBUTE = EVENT_IMAGE_CONTENT_TYPES.join(',');

export type EventImageRecord = {
  id: string;
  storagePath: string;
  thumbnailPath: string;
  contentType: string;
  caption: string;
  size: number;
  width: number;
  height: number;
  order: number;
  uploadedAt: unknown;
};

export function isAllowedEventImageType(contentType: unknown): contentType is EventImageContentType {
  return typeof contentType === 'string'
    && (EVENT_IMAGE_CONTENT_TYPES as readonly string[]).includes(contentType.toLowerCase());
}

export function eventImageExtension(contentType: unknown): string {
  const type = typeof contentType === 'string' ? contentType.toLowerCase() : '';
  return EXTENSION_BY_TYPE[type] || '';
}

export function isAllowedEventImageSize(size: unknown): boolean {
  return typeof size === 'number' && Number.isFinite(size) && size > 0 && size <= EVENT_IMAGE_MAX_BYTES;
}

export function formatBytes(size: unknown): string {
  const bytes = typeof size === 'number' && Number.isFinite(size) ? size : 0;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// Captions are plain text; they are rendered as text (never HTML/markdown).
export function sanitizeImageCaption(value: unknown): string {
  return enforceLimit(sanitizeText(value), EVENT_IMAGE_CAPTION_LIMIT);
}

export function isValidEventImageId(value: unknown): value is string {
  return typeof value === 'string' && EVENT_IMAGE_ID_PATTERN.test(value);
}

// Firestore document ids are URL-safe already, but event ids arrive from
// clients so they are re-checked before being interpolated into a path.
export function isValidEventId(value: unknown): value is string {
  return typeof value === 'string'
    && value.length > 0
    && value.length <= 128
    && /^[A-Za-z0-9_-]+$/.test(value);
}

// events/{eventId}/{imageId}.{extension}
export function buildEventImagePath(eventId: string, imageId: string, contentType: string): string {
  const extension = eventImageExtension(contentType);
  if (!isValidEventId(eventId) || !isValidEventImageId(imageId) || !extension) return '';
  return `events/${eventId}/${imageId}.${extension}`;
}

// events/{eventId}/{imageId}_thumb.jpg
export function buildEventThumbnailPath(eventId: string, imageId: string): string {
  if (!isValidEventId(eventId) || !isValidEventImageId(imageId)) return '';
  return `events/${eventId}/${imageId}_thumb.jpg`;
}

export function isEventImagePath(path: unknown, eventId?: string): boolean {
  if (typeof path !== 'string' || !path) return false;
  if (path.includes('..') || path.startsWith('/') || path.length > 300) return false;
  const match = /^events\/([A-Za-z0-9_-]{1,128})\/([a-z0-9]{6,40})(_thumb)?\.(jpg|jpeg|png|webp)$/.exec(path);
  if (!match) return false;
  return eventId ? match[1] === eventId : true;
}

// Plain (non-discriminated) shape so it narrows cleanly in both the strict
// Functions build and the looser app build.
export type EventImageValidation = { ok: boolean; reason: string };

// Single client-side gate used before an upload is started.
export function validateEventImageFile(file: { type?: unknown; size?: unknown } | null | undefined): EventImageValidation {
  if (!file) return { ok: false, reason: 'Please choose an image.' };
  if (!isAllowedEventImageType(file.type)) {
    return { ok: false, reason: 'Images must be JPEG, PNG, or WebP.' };
  }
  if (!isAllowedEventImageSize(file.size)) {
    return { ok: false, reason: `Images must be ${EVENT_IMAGE_MAX_BYTES / (1024 * 1024)} MB or smaller.` };
  }
  return { ok: true, reason: '' };
}
