// KPI tile: label, value, a signed 30-day delta, and a 12-week sparkline.
import { compactNumber } from '../dashboard/metrics';

type Props = {
  label: string;
  value: number;
  recent: number;
  recentLabel?: string;
  trend: number[];
};

export default function StatTile({ label, value, recent, recentLabel = 'in the last 30 days', trend }: Props) {
  const width = 96;
  const height = 36;
  const peak = Math.max(1, ...trend);
  const step = trend.length > 1 ? width / (trend.length - 1) : width;
  const points = trend.map((count, index) => [index * step, height - 4 - (count / peak) * (height - 8)] as const);
  const path = points.map(([x, y], index) => `${index === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const last = points[points.length - 1];

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-card">
      <p className="text-sm text-gray-500">{label}</p>
      <div className="mt-1 flex items-end justify-between gap-4">
        <p className="text-3xl font-semibold leading-none text-gray-900">{compactNumber(value)}</p>
        <svg width={width} height={height} aria-hidden="true" className="shrink-0 overflow-visible">
          <path d={path} fill="none" stroke="#d6ccbb" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
          {last && <circle cx={last[0]} cy={last[1]} r={4} fill="#3b6543" stroke="#ffffff" strokeWidth={2} />}
        </svg>
      </div>
      <p className={`mt-2 whitespace-nowrap text-xs ${recent > 0 ? 'text-emerald-700' : 'text-gray-400'}`}>
        {recent > 0 ? `+${recent.toLocaleString()} ${recentLabel}` : `No change ${recentLabel}`}
      </p>
    </div>
  );
}
