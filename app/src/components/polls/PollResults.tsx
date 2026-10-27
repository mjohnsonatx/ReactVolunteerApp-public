import type { PollView } from '../../services/polls';

type Props = Pick<PollView, 'options' | 'votingMode' | 'maxRankedChoices' | 'results' | 'totalVotes'>;

export default function PollResults({ options, votingMode, maxRankedChoices, results, totalVotes }: Props) {
  if (!results) return null;
  const ranked = votingMode === 'ranked';
  const total = totalVotes ?? 0;
  const sorted = [...options].sort((a, b) => (results[b.id] || 0) - (results[a.id] || 0) || a.order - b.order);
  const maximum = Math.max(1, total * (ranked ? Number(maxRankedChoices) : 1));
  return (
    <section aria-label="Poll results" className="mt-4 space-y-2 border-t border-gray-100 pt-3">
      <h4 className="text-sm font-semibold text-gray-700">{ranked ? 'Ranked results' : 'Results'}</h4>
      {ranked && <p className="text-xs text-gray-500">First choice earns {maxRankedChoices} points, each next choice earns one fewer. Unranked choices earn zero. Equal scores tie.</p>}
      {votingMode === 'multiple' && <p className="text-xs text-gray-500">Each percentage is the share of respondents who selected that option. Percentages can add up to more than 100%.</p>}
      {total === 0 && <p className="text-xs text-gray-500">No responses yet.</p>}
      <ol className="space-y-2">
        {sorted.map((option, index) => {
          const count = Number(results[option.id] || 0);
          const percent = Math.round(count / maximum * 100);
          const rank = sorted.findIndex(item => Number(results[item.id] || 0) === count) + 1;
          const tied = ranked && total > 0 && sorted.filter(item => Number(results[item.id] || 0) === count).length > 1;
          return (
            <li key={option.id} className="rounded-lg bg-gray-50 px-3 py-2 text-sm">
              <div className="flex justify-between gap-3">
                <span className="min-w-0 break-words text-gray-700">{ranked && total > 0 && <span className="mr-2 font-semibold">{rank}.{tied ? ' (tie)' : ''}</span>}{option.label}</span>
                <span className="shrink-0 text-gray-600">{ranked ? `${count} points` : `${count} (${percent}%)`}</span>
              </div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-gray-200" role="meter" aria-label={`${option.label}: ${count}${ranked ? ' points' : ' responses'}`} aria-valuenow={count} aria-valuemin={0} aria-valuemax={maximum}>
                <div className={`h-full rounded-full ${index === 0 ? 'bg-teal-600' : 'bg-teal-400'}`} style={{ width: `${Math.min(100, percent)}%` }} />
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
