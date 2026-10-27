import { useState } from 'react';
import { ArrowRight, Images, MapPin } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import StorageImage from '../shared/StorageImage';
import EventImageGallery from './EventImageGallery';
import { coverImage, eventImages } from '../../utils/eventImageList';
import EventComments from './EventComments';

function eventDate(value: unknown): Date | null {
  if (typeof value !== 'string' || !value) return null;
  const date = new Date(`${value}T12:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

type EventCardProps = {
  event: Record<string, any>;
  variant?: 'list' | 'detail';
};

export default function EventCard({ event, variant = 'list' }: EventCardProps) {
  const { isRsvped, toggleRsvp, setSelectedEventMap, goToEvent } = useApp();
  const [photosOpen, setPhotosOpen] = useState(variant === 'detail');

  const images = eventImages(event);
  const cover = coverImage(event);
  const date = eventDate(event.date);
  const photosPanelId = `event-photos-${event.id}`;

  return (
    <article className="rounded-xl border border-gray-100 p-4 hover:border-teal-200">
      <div className="flex flex-wrap items-start gap-4">
        <div className="min-w-14 rounded-xl bg-gradient-to-br from-teal-500 to-cyan-500 p-3 text-center text-white">
          <div className="text-xs">{date ? date.toLocaleDateString('en-US', { month: 'short' }) : '--'}</div>
          <div className="text-xl font-bold">{date ? date.getDate() : '--'}</div>
        </div>

        {cover && (
          <StorageImage
            path={cover.thumbnailPath || cover.storagePath}
            alt={cover.caption || `${event.title} cover photo`}
            className="h-20 w-28 rounded-lg object-cover"
            wrapperClassName="h-20 w-28 rounded-lg"
          />
        )}

        <div className="min-w-[12rem] flex-1">
          <h3 className="font-semibold text-gray-800">
            {variant === 'detail' ? event.title : (
              <button type="button" onClick={() => goToEvent(event.id)} className="text-left hover:text-teal-700 hover:underline">
                {event.title}
              </button>
            )}
          </h3>
          <p className="flex items-center gap-1 text-sm text-gray-500">
            <MapPin size={12} aria-hidden="true" />{event.location} - {event.time}
          </p>
          {event.description && <p className="mt-1 text-sm text-gray-500">{event.description}</p>}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {event.lat && (
            <button
              type="button"
              onClick={() => setSelectedEventMap(event)}
              aria-label={`Show ${event.title} on the map`}
              className="rounded-lg px-3 py-2 text-teal-600 hover:bg-teal-50"
            >
              <MapPin size={16} aria-hidden="true" />
            </button>
          )}
          {variant === 'list' && (
            <button
              type="button"
              onClick={() => goToEvent(event.id)}
              className="flex items-center gap-1 rounded-lg px-3 py-2 text-sm text-teal-700 hover:bg-teal-50"
            >
              Details <ArrowRight size={14} aria-hidden="true" />
            </button>
          )}
          <button
            type="button"
            onClick={() => toggleRsvp(event.id)}
            aria-pressed={isRsvped(event.id)}
            className={`rounded-lg px-4 py-2 text-sm font-medium ${isRsvped(event.id)
              ? 'bg-emerald-500 text-white'
              : 'bg-teal-100 text-teal-700 hover:bg-teal-200'}`}
          >
            {isRsvped(event.id) ? 'Going!' : 'RSVP'}
          </button>
        </div>
      </div>

      {images.length > 0 && (
        <div className="mt-3">
          {variant === 'list' && (
            <button
              type="button"
              onClick={() => setPhotosOpen(value => !value)}
              aria-expanded={photosOpen}
              aria-controls={photosPanelId}
              className="flex items-center gap-2 rounded-lg px-2 py-1 text-sm font-medium text-teal-700 hover:bg-teal-50"
            >
              <Images size={16} aria-hidden="true" />
              {photosOpen ? 'Hide photos' : `Photos (${images.length})`}
            </button>
          )}
          {photosOpen && (
            <div id={photosPanelId} className="mt-2">
              <EventImageGallery images={images} eventTitle={event.title} coverImageId={event.coverImageId} />
            </div>
          )}
        </div>
      )}

      <EventComments eventId={event.id} alwaysOpen={variant === 'detail'} />
    </article>
  );
}
