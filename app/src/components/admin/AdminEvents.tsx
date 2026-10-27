// components/admin/AdminEvents.tsx
import { useState } from 'react';
import { Calendar, Edit2, ExternalLink, Flag, Images, MessageSquare, Plus, Trash2 } from 'lucide-react';
import { useApp } from '@runtime/app-context';
import AdminEventImages from './AdminEventImages';
import EventComments from '../events/EventComments';

export default function AdminEvents() {
  const { events, openNewEvent, openEditEvent, deleteEvent, goToEvent, eventCommentReports = [] } = useApp();
  const [imagesFor, setImagesFor] = useState('');
  const [commentsFor, setCommentsFor] = useState('');

  const reportsByEvent = (eventId: string) => (eventCommentReports || []).filter(
    report => report.eventId === eventId && report.status !== 'resolved',
  );

  return (
    <div className="overflow-hidden rounded-2xl bg-white shadow-lg">
      <div className="flex items-center justify-between border-b px-6 py-4">
        <div className="flex items-center gap-3">
          <Calendar className="text-teal-600" aria-hidden="true" />
          <h2 className="text-xl font-bold text-gray-800">Events</h2>
        </div>
        <button
          type="button"
          onClick={openNewEvent}
          className="flex items-center gap-2 rounded-lg bg-teal-500 px-4 py-2 text-sm text-white hover:bg-teal-600"
        >
          <Plus size={18} aria-hidden="true" />New Event
        </button>
      </div>

      <div className="space-y-4 p-6">
        {events.map((event) => {
          const images = Array.isArray(event.images) ? event.images : [];
          return (
            <div key={event.id} className="rounded-xl border p-4 hover:border-teal-200">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="flex gap-4">
                  <div className="min-w-14 rounded-xl bg-gradient-to-br from-teal-500 to-cyan-500 p-3 text-center text-white">
                    <div className="text-xs">{new Date(`${event.date}T12:00:00`).toLocaleDateString('en-US', { month: 'short' })}</div>
                    <div className="text-xl font-bold">{new Date(`${event.date}T12:00:00`).getDate()}</div>
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-800">{event.title}</h3>
                    <p className="text-sm text-gray-500">{event.location} - {event.time}</p>
                    {event.description && <p className="text-sm text-gray-400">{event.description}</p>}
                    <p className="mt-1 text-xs text-gray-400">{images.length} image{images.length === 1 ? '' : 's'}</p>
                    {reportsByEvent(event.id).length > 0 && (
                      <p className="mt-1 flex items-center gap-1 text-xs text-red-600">
                        <Flag size={12} aria-hidden="true" />
                        {reportsByEvent(event.id).length} reported comment{reportsByEvent(event.id).length === 1 ? '' : 's'}
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setImagesFor(current => (current === event.id ? '' : event.id))}
                    aria-expanded={imagesFor === event.id}
                    className="flex items-center gap-1 rounded-lg px-3 py-2 text-sm text-teal-700 hover:bg-teal-50"
                  >
                    <Images size={16} aria-hidden="true" />Images
                  </button>
                  <button
                    type="button"
                    onClick={() => setCommentsFor(current => (current === event.id ? '' : event.id))}
                    aria-expanded={commentsFor === event.id}
                    className="flex items-center gap-1 rounded-lg px-3 py-2 text-sm text-teal-700 hover:bg-teal-50"
                  >
                    <MessageSquare size={16} aria-hidden="true" />Comments
                  </button>
                  <button
                    type="button"
                    onClick={() => goToEvent(event.id)}
                    className="flex items-center gap-1 rounded-lg px-3 py-2 text-sm text-gray-500 hover:bg-gray-50"
                  >
                    <ExternalLink size={16} aria-hidden="true" />View
                  </button>
                  <button
                    type="button"
                    onClick={() => openEditEvent(event)}
                    aria-label={`Edit ${event.title}`}
                    className="rounded-lg p-2 text-teal-600 hover:bg-teal-50"
                  >
                    <Edit2 size={18} aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    onClick={() => deleteEvent(event.id)}
                    aria-label={`Delete ${event.title}`}
                    className="rounded-lg p-2 text-red-500 hover:bg-red-50"
                  >
                    <Trash2 size={18} aria-hidden="true" />
                  </button>
                </div>
              </div>

              {imagesFor === event.id && <AdminEventImages event={event} />}
              {commentsFor === event.id && (
                <>
                  {reportsByEvent(event.id).length > 0 && (
                    <div className="mt-4 rounded-xl border border-red-100 bg-red-50/60 p-3">
                      <h4 className="text-sm font-semibold text-red-700">Reported comments</h4>
                      <ul className="mt-2 space-y-2 text-xs text-gray-700">
                        {reportsByEvent(event.id).map(report => (
                          <li key={report.id}>
                            <span className="font-medium">{report.reasonLabel || 'Report'}</span>
                            {report.reporterName ? ` from ${report.reporterName}` : ''}
                            {report.targetAuthorName ? ` about ${report.targetAuthorName}` : ''}
                            {report.targetWasAnonymous ? ' (posted anonymously)' : ''}
                            <p className="text-gray-500">{report.details}</p>
                            <p className="text-gray-400">"{report.excerpt}"</p>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  <EventComments eventId={event.id} alwaysOpen />
                </>
              )}
            </div>
          );
        })}
        {events.length === 0 && <p className="py-8 text-center text-gray-400">No events yet.</p>}
      </div>
    </div>
  );
}
