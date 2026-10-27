import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Images } from 'lucide-react';
import StorageImage from '../shared/StorageImage';

export type EventImage = {
  id: string;
  storagePath: string;
  thumbnailPath?: string;
  caption?: string;
};

type GalleryProps = {
  images: EventImage[];
  eventTitle: string;
  coverImageId?: string;
};

// Accessible gallery: arrow keys move between images, every slide exposes its
// caption, and the live region announces position changes for screen readers.
export default function EventImageGallery({ images, eventTitle, coverImageId = '' }: GalleryProps) {
  const ordered = useMemo(() => {
    if (!coverImageId) return images;
    const cover = images.filter(image => image.id === coverImageId);
    return [...cover, ...images.filter(image => image.id !== coverImageId)];
  }, [images, coverImageId]);

  const [index, setIndex] = useState(0);
  const thumbRefs = useRef<Array<HTMLButtonElement | null>>([]);

  useEffect(() => { setIndex(0); }, [ordered.length]);

  if (!ordered.length) return null;
  const active = ordered[Math.min(index, ordered.length - 1)];
  const single = ordered.length === 1;

  const move = (delta: number) => {
    setIndex(prev => {
      const next = (prev + delta + ordered.length) % ordered.length;
      thumbRefs.current[next]?.focus();
      return next;
    });
  };

  return (
    <section
      aria-label={`Photos for ${eventTitle}`}
      className="rounded-xl border border-gray-100 bg-gray-50 p-3"
      onKeyDown={(event) => {
        if (single) return;
        if (event.key === 'ArrowRight') { event.preventDefault(); move(1); }
        if (event.key === 'ArrowLeft') { event.preventDefault(); move(-1); }
      }}
    >
      <div className="relative">
        <StorageImage
          path={active.storagePath}
          alt={active.caption || `${eventTitle} photo ${index + 1} of ${ordered.length}`}
          className="w-full max-h-96 object-contain rounded-lg bg-white"
          wrapperClassName="w-full h-64 rounded-lg"
        />
        {!single && (
          <>
            <button
              type="button"
              onClick={() => move(-1)}
              aria-label="Previous photo"
              className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-white/90 p-2 text-gray-700 shadow hover:bg-white"
            >
              <ChevronLeft size={18} aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => move(1)}
              aria-label="Next photo"
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-white/90 p-2 text-gray-700 shadow hover:bg-white"
            >
              <ChevronRight size={18} aria-hidden="true" />
            </button>
          </>
        )}
      </div>

      <p className="mt-2 text-sm text-gray-600" aria-live="polite">
        {active.caption
          ? active.caption
          : <span className="text-gray-400">No caption provided.</span>}
        {!single && <span className="ml-2 text-xs text-gray-400">Photo {index + 1} of {ordered.length}</span>}
      </p>

      {!single && (
        <ul className="mt-3 flex flex-wrap gap-2" aria-label="Choose a photo">
          {ordered.map((image, position) => (
            <li key={image.id}>
              <button
                type="button"
                ref={(element) => { thumbRefs.current[position] = element; }}
                onClick={() => setIndex(position)}
                aria-current={position === index}
                aria-label={image.caption || `Photo ${position + 1}`}
                className={`h-16 w-16 overflow-hidden rounded-lg border-2 ${position === index ? 'border-teal-500' : 'border-transparent hover:border-teal-200'}`}
              >
                <StorageImage
                  path={image.thumbnailPath || image.storagePath}
                  alt=""
                  className="h-full w-full object-cover"
                  wrapperClassName="h-full w-full"
                />
              </button>
            </li>
          ))}
        </ul>
      )}

      {single && (
        <p className="mt-2 flex items-center gap-1 text-xs text-gray-400">
          <Images size={12} aria-hidden="true" /> 1 photo
        </p>
      )}
    </section>
  );
}
