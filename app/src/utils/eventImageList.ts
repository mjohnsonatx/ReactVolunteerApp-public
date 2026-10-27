import type { EventImage } from '../components/events/EventImageGallery';

// Normalizes the `images` array stored on an event document. Records hold
// trusted Storage *paths*; URLs are resolved at render time.
export function eventImages(event: { images?: unknown }): EventImage[] {
  const raw = Array.isArray(event?.images) ? event.images : [];
  return raw
    .filter((image): image is EventImage => !!image && typeof image === 'object' && !!(image as EventImage).storagePath)
    .map(image => ({
      id: String(image.id || image.storagePath),
      storagePath: String(image.storagePath),
      thumbnailPath: image.thumbnailPath ? String(image.thumbnailPath) : '',
      caption: image.caption ? String(image.caption) : '',
    }));
}

export function coverImage(event: { images?: unknown; coverImageId?: unknown }): EventImage | null {
  const images = eventImages(event);
  if (!images.length) return null;
  const coverId = typeof event?.coverImageId === 'string' ? event.coverImageId : '';
  return images.find(image => image.id === coverId) || images[0];
}
