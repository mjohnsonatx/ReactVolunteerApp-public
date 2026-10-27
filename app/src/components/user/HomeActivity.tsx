import { useEffect, useState } from 'react';
import { BarChart3, Calendar, Loader2 } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { fetchPolls, type PollView } from '../../services/polls';
import { currentPolls, upcomingEvents } from '../../utils/homeActivity';
import { pathForPage } from '../../router/routes';
import AppLink from '../shared/AppLink';
import EventCard from '../events/EventCard';
import PollCard from '../polls/PollCard';

function HomePolls({ now }: { now: number }) {
  const [polls, setPolls] = useState<PollView[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(false);
    fetchPolls().then(data => {
      if (active) setPolls(data);
    }).catch(() => {
      if (active) setError(true);
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [attempt]);

  useEffect(() => {
    const refresh = () => setAttempt(value => value + 1);
    window.addEventListener('focus', refresh);
    return () => window.removeEventListener('focus', refresh);
  }, []);

  const openPolls = currentPolls(polls, now);

  return (
    <section aria-labelledby="home-polls-heading" className="min-w-0 space-y-4 rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="home-polls-heading" className="flex items-center gap-2 text-xl font-bold text-gray-800">
          <BarChart3 className="text-teal-600" size={24} aria-hidden="true" />Current polls
        </h2>
        <AppLink to={pathForPage('polls')} className="text-sm font-medium text-teal-700 underline underline-offset-4">All polls</AppLink>
      </div>
      <p className="text-sm text-gray-600">Have your say in what happens next in the neighborhood.</p>
      {loading ? (
        <p role="status" className="flex items-center gap-2 rounded-xl bg-white p-5 text-sm text-gray-500">
          <Loader2 size={16} className="animate-spin" aria-hidden="true" />Loading current polls...
        </p>
      ) : error ? (
        <div role="alert" className="rounded-xl bg-red-50 p-5 text-sm text-red-700">
          <p>We couldn’t load the current polls.</p>
          <button type="button" onClick={() => setAttempt(value => value + 1)} className="mt-2 font-medium underline">Try again</button>
        </div>
      ) : openPolls.length === 0 ? (
        <p className="rounded-xl border border-gray-100 bg-white p-5 text-sm text-gray-500">No polls are open right now. Check back for the next community question.</p>
      ) : openPolls.map(poll => (
        <PollCard key={poll.id} poll={poll} onChange={updated => setPolls(previous => previous.map(item => item.id === updated.id ? updated : item))} />
      ))}
    </section>
  );
}

export default function HomeActivity() {
  const { events = [], currentUser } = useApp();
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const refresh = () => setNow(Date.now());
    const timer = window.setInterval(refresh, 60_000);
    window.addEventListener('focus', refresh);
    return () => { window.clearInterval(timer); window.removeEventListener('focus', refresh); };
  }, []);
  const upcoming = upcomingEvents(events, new Date(now));

  return (
    <aside aria-label="Community activity" className="min-w-0 space-y-6 xl:col-start-2 xl:row-start-1 xl:row-span-2">
      <section aria-labelledby="home-events-heading" className="min-w-0 rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h2 id="home-events-heading" className="flex items-center gap-2 text-xl font-bold text-gray-800">
            <Calendar className="text-teal-600" size={24} aria-hidden="true" />Upcoming events
          </h2>
          <AppLink to={pathForPage('events')} className="text-sm font-medium text-teal-700 underline underline-offset-4">All events</AppLink>
        </div>
        <p className="mb-4 text-sm text-gray-600">Join a cleanup or meet your neighbors. RSVP right here.</p>
        {upcoming.length === 0
          ? <p className="rounded-xl bg-gray-50 p-5 text-sm text-gray-500">No upcoming events are scheduled. Check back soon for our next gathering.</p>
          : <div className="space-y-4">{upcoming.map(event => <EventCard key={event.id} event={event} />)}</div>}
      </section>
      {/* Remount when identity changes so guest votes/results never carry into a member session. */}
      <HomePolls key={currentUser?.id || currentUser?.uid || 'guest'} now={now} />
    </aside>
  );
}
