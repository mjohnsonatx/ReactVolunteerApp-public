import { Calendar } from 'lucide-react';
import { useApp } from '../../../context/AppContext';
import EventCard from '../../events/EventCard';

// `/events`
export default function EventsPage() {
  const { events } = useApp();

  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
      <h2 className="mb-6 flex items-center gap-2 text-2xl font-bold text-gray-800">
        <Calendar className="text-teal-600" aria-hidden="true" />Events
      </h2>
      {events.length === 0
        ? <p className="py-12 text-center text-gray-400">No upcoming events.</p>
        : <div className="space-y-4">{events.map(event => <EventCard key={event.id} event={event} />)}</div>}
    </div>
  );
}
