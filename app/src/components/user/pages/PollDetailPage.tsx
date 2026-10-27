import { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { useApp } from '../../../context/AppContext';
import { fetchPoll, type PollView } from '../../../services/polls';
import PollCard from '../../polls/PollCard';

// `/polls/:pollId`
export default function PollDetailPage() {
  const { route, setPage, events, goToEvent } = useApp();
  const pollId = route?.params?.pollId;
  const [poll, setPoll] = useState<PollView | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!pollId) return;
    setLoading(true);
    setError('');
    try {
      setPoll(await fetchPoll(pollId));
    } catch (err) {
      setError(err?.message || 'Could not load this poll.');
    } finally {
      setLoading(false);
    }
  }, [pollId]);

  useEffect(() => { load(); }, [load]);

  const linkedEvent = poll?.eventId ? events.find(event => event.id === poll.eventId) : null;

  return (
    <div className="space-y-4">
      <button type="button" onClick={() => setPage('polls')} className="flex items-center gap-2 text-teal-600 hover:text-teal-700">
        <ArrowLeft size={18} aria-hidden="true" />All polls
      </button>

      {loading && (
        <p className="flex items-center gap-2 rounded-2xl bg-white p-6 text-gray-500 shadow-sm" role="status">
          <Loader2 size={16} className="animate-spin" aria-hidden="true" />Loading poll...
        </p>
      )}
      {error && <div role="alert" className="rounded-2xl bg-red-50 p-4 text-sm text-red-600">{error}</div>}
      {poll && <PollCard poll={poll} onChange={setPoll} showLink={false} />}

      {linkedEvent && (
        <div className="rounded-2xl border border-gray-100 bg-white p-4 text-sm shadow-sm">
          Linked to event:{' '}
          <button type="button" onClick={() => goToEvent(linkedEvent.id)} className="font-medium text-teal-700 underline">
            {linkedEvent.title}
          </button>
        </div>
      )}
    </div>
  );
}
