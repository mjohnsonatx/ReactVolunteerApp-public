import { useRef, useState } from 'react';
import { Image as ImageIcon, Loader2, Star, Trash2, Upload } from 'lucide-react';
import StorageImage from '../shared/StorageImage';
import {
  removeEventImage,
  saveEventImageCaption,
  setEventCoverImage,
  uploadEventImage,
  type UploadStatus,
} from '../../services/eventImages';
import {
  EVENT_IMAGE_ACCEPT_ATTRIBUTE,
  EVENT_IMAGE_MAX_PER_EVENT,
  LIMITS,
  formatBytes,
  validateEventImageFile,
} from '../../utils/sanitize';

type AdminEventImagesProps = {
  event: Record<string, any>;
};

// Admin image manager for a single event. Uploading, captioning, choosing the
// cover, and removing images all stay available after the event is published.
export default function AdminEventImages({ event }: AdminEventImagesProps) {
  const images = Array.isArray(event.images) ? event.images : [];
  const coverImageId = event.coverImageId || images[0]?.id || '';

  const fileRef = useRef<HTMLInputElement | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [caption, setCaption] = useState('');
  const [status, setStatus] = useState<UploadStatus>({ phase: 'idle', percent: 0, message: '' });
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [captions, setCaptions] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState('');

  const uploading = status.phase === 'uploading' || status.phase === 'processing' || status.phase === 'saving' || status.phase === 'validating';
  const atLimit = images.length >= EVENT_IMAGE_MAX_PER_EVENT;

  const chooseFile = (event_) => {
    const picked = event_.target.files?.[0] || null;
    setError('');
    setNotice('');
    if (!picked) { setFile(null); return; }
    const validation = validateEventImageFile(picked);
    if (!validation.ok) {
      setFile(null);
      setError(validation.reason);
      if (fileRef.current) fileRef.current.value = '';
      return;
    }
    setFile(picked);
  };

  const handleUpload = async (formEvent) => {
    formEvent.preventDefault();
    if (!file) { setError('Please choose an image.'); return; }
    setError('');
    setNotice('');
    try {
      await uploadEventImage({
        eventId: event.id,
        file,
        caption,
        makeCover: images.length === 0,
        onProgress: setStatus,
      });
      setNotice('Image added to the event.');
      setFile(null);
      setCaption('');
      if (fileRef.current) fileRef.current.value = '';
      setStatus({ phase: 'idle', percent: 0, message: '' });
    } catch (err) {
      setError(err?.message || 'Image upload failed. Please try again.');
    }
  };

  const handleCaptionSave = async (imageId: string) => {
    setBusyId(imageId);
    setError('');
    setNotice('');
    try {
      await saveEventImageCaption(event.id, imageId, captions[imageId] ?? '');
      setNotice('Caption saved.');
    } catch (err) {
      setError(err?.message || 'Could not save the caption.');
    } finally {
      setBusyId('');
    }
  };

  const handleCover = async (imageId: string) => {
    setBusyId(imageId);
    setError('');
    try {
      await setEventCoverImage(event.id, imageId);
      setNotice('Cover image updated.');
    } catch (err) {
      setError(err?.message || 'Could not update the cover image.');
    } finally {
      setBusyId('');
    }
  };

  const handleRemove = async (imageId: string) => {
    setBusyId(imageId);
    setError('');
    try {
      await removeEventImage(event.id, imageId);
      setNotice('Image removed. The file is deleted from storage automatically.');
    } catch (err) {
      setError(err?.message || 'Could not remove the image.');
    } finally {
      setBusyId('');
    }
  };

  return (
    <section aria-label={`Images for ${event.title}`} className="mt-4 rounded-xl border border-gray-100 bg-gray-50 p-4">
      <h4 className="mb-3 flex items-center gap-2 text-sm font-semibold text-gray-700">
        <ImageIcon size={16} aria-hidden="true" />Event images ({images.length}/{EVENT_IMAGE_MAX_PER_EVENT})
      </h4>

      <p className="sr-only" role="status" aria-live="polite">{notice || status.message}</p>

      {images.length === 0 && (
        <p className="mb-3 rounded-lg border border-dashed border-gray-200 bg-white px-3 py-4 text-center text-sm text-gray-400">
          No images yet. The first image you add becomes the cover photo on the events list.
        </p>
      )}

      <ul className="space-y-3">
        {images.map((image: any) => (
          <li key={image.id} className="flex flex-wrap items-start gap-3 rounded-lg border border-gray-100 bg-white p-3">
            <StorageImage
              path={image.thumbnailPath || image.storagePath}
              alt={image.caption || 'Event image'}
              className="h-20 w-28 rounded-lg object-cover"
              wrapperClassName="h-20 w-28 rounded-lg"
            />
            <div className="min-w-[14rem] flex-1 space-y-2">
              <label className="block text-xs font-medium text-gray-600" htmlFor={`caption-${image.id}`}>
                Caption
              </label>
              <input
                id={`caption-${image.id}`}
                type="text"
                maxLength={LIMITS.eventImageCaption}
                defaultValue={image.caption || ''}
                onChange={changeEvent => setCaptions(prev => ({ ...prev, [image.id]: changeEvent.target.value }))}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-teal-500"
                placeholder="Describe the photo for screen readers and captions"
              />
              <p className="text-xs text-gray-400">
                {formatBytes(image.size)}{image.width ? ` - ${image.width}x${image.height}` : ''}
                {image.id === coverImageId ? ' - cover image' : ''}
              </p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => handleCaptionSave(image.id)}
                  disabled={busyId === image.id || captions[image.id] === undefined}
                  className="rounded-lg bg-teal-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-teal-600 disabled:opacity-50"
                >
                  Save caption
                </button>
                <button
                  type="button"
                  onClick={() => handleCover(image.id)}
                  disabled={busyId === image.id || image.id === coverImageId}
                  className="flex items-center gap-1 rounded-lg border border-gray-200 px-3 py-1.5 text-xs hover:bg-gray-50 disabled:opacity-50"
                >
                  <Star size={12} aria-hidden="true" />{image.id === coverImageId ? 'Cover' : 'Make cover'}
                </button>
                <button
                  type="button"
                  onClick={() => handleRemove(image.id)}
                  disabled={busyId === image.id}
                  className="flex items-center gap-1 rounded-lg border border-red-100 px-3 py-1.5 text-xs text-red-600 hover:bg-red-50 disabled:opacity-50"
                >
                  <Trash2 size={12} aria-hidden="true" />Remove
                </button>
                {busyId === image.id && <Loader2 size={14} className="animate-spin text-gray-400" aria-hidden="true" />}
              </div>
            </div>
          </li>
        ))}
      </ul>

      <form onSubmit={handleUpload} className="mt-4 space-y-2 rounded-lg border border-gray-100 bg-white p-3">
        <label className="block text-xs font-medium text-gray-600" htmlFor={`file-${event.id}`}>
          Add an image (JPEG, PNG, or WebP, up to 5 MB)
        </label>
        <input
          id={`file-${event.id}`}
          ref={fileRef}
          type="file"
          accept={EVENT_IMAGE_ACCEPT_ATTRIBUTE}
          onChange={chooseFile}
          disabled={uploading || atLimit}
          className="block w-full text-sm text-gray-600 file:mr-3 file:rounded-lg file:border-0 file:bg-teal-50 file:px-3 file:py-2 file:text-teal-700"
        />
        <label className="block text-xs font-medium text-gray-600" htmlFor={`new-caption-${event.id}`}>
          Caption (optional)
        </label>
        <input
          id={`new-caption-${event.id}`}
          type="text"
          maxLength={LIMITS.eventImageCaption}
          value={caption}
          onChange={captionEvent => setCaption(captionEvent.target.value)}
          disabled={uploading || atLimit}
          className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-teal-500"
        />

        {uploading && (
          <div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-gray-100">
              <div
                className="h-full rounded-full bg-teal-500 transition-all"
                style={{ width: `${Math.max(status.percent, 5)}%` }}
              />
            </div>
            <p className="mt-1 flex items-center gap-2 text-xs text-gray-500">
              <Loader2 size={12} className="animate-spin" aria-hidden="true" />{status.message}
            </p>
          </div>
        )}

        {atLimit && (
          <p className="text-xs text-amber-700">
            This event already has the maximum of {EVENT_IMAGE_MAX_PER_EVENT} images. Remove one to add another.
          </p>
        )}
        {notice && <p className="rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-700">{notice}</p>}
        {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">{error}</p>}

        <button
          type="submit"
          disabled={!file || uploading || atLimit}
          className="flex items-center gap-2 rounded-lg bg-teal-500 px-4 py-2 text-sm font-medium text-white hover:bg-teal-600 disabled:opacity-50"
        >
          {uploading ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : <Upload size={16} aria-hidden="true" />}
          {uploading ? 'Uploading...' : 'Upload image'}
        </button>
      </form>
    </section>
  );
}
