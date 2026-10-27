import { useEffect, useState } from 'react';
import { ArrowLeft, BarChart3, Calendar } from 'lucide-react';
import { useApp } from '../../../context/AppContext';
import EventCard from '../../events/EventCard';
import PollCard from '../../polls/PollCard';
import { fetchPolls, type PollView } from '../../../services/polls';

// `/events/:eventId`
export default function EventDetailPage() {
  const { events, route, setPage } = useApp();
  const eventId = route?.params?.eventId;
  const event = events.find(item => item.id === eventId);
  const [linkedPolls, setLinkedPolls] = useState<PollView[]>([]);

  useEffect(() => {
    let active = true;
    if (!eventId) return () => { active = false; };
    fetchPolls()
      .then((polls) => {
        if (active) setLinkedPolls(polls.filter(poll => poll.eventId === eventId));
      })
      .catch(() => { if (active) setLinkedPolls([]); });
    return () => { active = false; };
  }, [eventId]);

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
        <button
          type="button"
          onClick={() => setPage('events')}
          className="mb-4 flex items-center gap-2 text-teal-600 hover:text-teal-700"
        >
          <ArrowLeft size={18} aria-hidden="true" />All events
        </button>

        {event ? (
          <>
            <h2 className="mb-4 flex items-center gap-2 text-2xl font-bold text-gray-800">
              <Calendar className="text-teal-600" aria-hidden="true" />{event.title}
            </h2>
            <EventCard event={event} variant="detail" />
          </>
        ) : (
          <p className="py-12 text-center text-gray-400">
            That event is no longer available. It may have been removed.
          </p>
        )}
      </div>

      {linkedPolls.length > 0 && (
        <section aria-label="Polls for this event" className="space-y-3">
          <h3 className="flex items-center gap-2 text-lg font-semibold text-gray-800">
            <BarChart3 size={18} className="text-teal-600" aria-hidden="true" />Polls for this event
          </h3>
          {linkedPolls.map(poll => (
            <PollCard
              key={poll.id}
              poll={poll}
              onChange={updated => setLinkedPolls(prev => prev.map(item => (item.id === updated.id ? updated : item)))}
            />
          ))}
        </section>
      )}
    </div>
  );
}
