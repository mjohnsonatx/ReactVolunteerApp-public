import { useCallback, useEffect, useState } from 'react';
import { BarChart3, Loader2 } from 'lucide-react';
import { fetchPolls, type PollView } from '../../../services/polls';
import PollCard from '../../polls/PollCard';

// `/polls`
export default function PollsPage() {
  const [polls, setPolls] = useState<PollView[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setPolls(await fetchPolls());
    } catch (err) {
      setError(err?.message || 'Could not load polls.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const onChange = (updated: PollView) => {
    setPolls(prev => prev.map(poll => (poll.id === updated.id ? { ...poll, ...updated } : poll)));
  };

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
        <h2 className="flex items-center gap-2 text-2xl font-bold text-gray-800">
          <BarChart3 className="text-teal-600" aria-hidden="true" />Neighborhood polls
        </h2>
        <p className="mt-1 text-sm text-gray-500">
          Quick questions from the crew. Voting is limited by account or browser, not verified as one response per person.
        </p>
      </div>

      {loading && (
        <p className="flex items-center gap-2 rounded-2xl bg-white p-6 text-gray-500 shadow-sm" role="status">
          <Loader2 size={16} className="animate-spin" aria-hidden="true" />Loading polls...
        </p>
      )}

      {error && (
        <div role="alert" className="rounded-2xl bg-red-50 p-4 text-sm text-red-600">
          {error} <button type="button" onClick={load} className="underline">Try again</button>
        </div>
      )}

      {!loading && !error && polls.length === 0 && (
        <p className="rounded-2xl bg-white p-8 text-center text-gray-400 shadow-sm">No polls are open right now.</p>
      )}

      {polls.map(poll => <PollCard key={poll.id} poll={poll} onChange={onChange} />)}
    </div>
  );
}
