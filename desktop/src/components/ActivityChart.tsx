// Grouped column chart for the overview page. Plain SVG: thin bars with rounded
// data-ends, hairline gridlines, a per-week hover tooltip, a legend, and a
// table view so every value is readable without color.
import { useEffect, useRef, useState } from 'react';
import { Table2 } from 'lucide-react';

export type ChartSeries = { id: string; label: string; color: string; values: number[] };

type Props = {
  labels: string[];
  series: ChartSeries[];
  ticks: number[];
  height?: number;
};

const MARGIN = { top: 12, right: 12, bottom: 28, left: 36 };
const MAX_BAR = 24;
const GAP = 2;

export default function ActivityChart({ labels, series, ticks, height = 240 }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(720);
  const [hover, setHover] = useState<number | null>(null);
  const [showTable, setShowTable] = useState(false);

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;
    const observer = new ResizeObserver(entries => {
      const next = entries[0]?.contentRect.width;
      if (next) setWidth(Math.max(320, Math.floor(next)));
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const plotWidth = width - MARGIN.left - MARGIN.right;
  const plotHeight = height - MARGIN.top - MARGIN.bottom;
  const top = ticks[ticks.length - 1] || 1;
  const band = plotWidth / Math.max(1, labels.length);
  const barWidth = Math.min(MAX_BAR, (band * 0.72 - GAP * (series.length - 1)) / series.length);
  const groupWidth = barWidth * series.length + GAP * (series.length - 1);
  const yFor = (value: number) => MARGIN.top + plotHeight - (value / top) * plotHeight;

  const barPath = (x: number, y: number, w: number, h: number) => {
    const r = Math.min(4, w / 2, h);
    if (h <= 0) return '';
    return `M${x},${y + h} V${y + r} Q${x},${y} ${x + r},${y} H${x + w - r} Q${x + w},${y} ${x + w},${y + r} V${y + h} Z`;
  };

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <ul className="flex flex-wrap gap-4 text-xs text-gray-600" aria-label="Series">
          {series.map(item => (
            <li key={item.id} className="flex items-center gap-2">
              <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: item.color }} aria-hidden="true" />
              {item.label}
            </li>
          ))}
        </ul>
        <button
          type="button"
          onClick={() => setShowTable(value => !value)}
          aria-pressed={showTable}
          className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-2.5 py-1 text-xs font-medium text-gray-600 hover:bg-gray-50"
        >
          <Table2 size={14} aria-hidden="true" />{showTable ? 'Hide table' : 'Show table'}
        </button>
      </div>

      <div ref={containerRef} className="relative" onMouseLeave={() => setHover(null)}>
        <svg width={width} height={height} role="img" aria-label="Weekly activity" className="block">
          {ticks.map(tick => (
            <g key={tick}>
              <line x1={MARGIN.left} x2={width - MARGIN.right} y1={yFor(tick)} y2={yFor(tick)} stroke="#e8e1d5" strokeWidth={1} />
              <text x={MARGIN.left - 8} y={yFor(tick)} dy="0.35em" textAnchor="end" fontSize={11} fill="#7d7264" style={{ fontVariantNumeric: 'tabular-nums' }}>
                {tick.toLocaleString()}
              </text>
            </g>
          ))}
          {labels.map((label, index) => {
            const bandX = MARGIN.left + index * band;
            const groupX = bandX + (band - groupWidth) / 2;
            const hovered = hover === index;
            return (
              <g key={label + index}>
                {hovered && <rect x={bandX} y={MARGIN.top} width={band} height={plotHeight} fill="#e8e1d5" opacity={0.45} />}
                {series.map((item, seriesIndex) => {
                  const value = item.values[index] || 0;
                  const h = (value / top) * plotHeight;
                  return (
                    <path
                      key={item.id}
                      d={barPath(groupX + seriesIndex * (barWidth + GAP), yFor(value), barWidth, h)}
                      fill={item.color}
                    />
                  );
                })}
                <text x={bandX + band / 2} y={height - 8} textAnchor="middle" fontSize={11} fill="#7d7264">{label}</text>
                <rect
                  x={bandX} y={MARGIN.top} width={band} height={plotHeight + MARGIN.bottom} fill="transparent"
                  onMouseEnter={() => setHover(index)}
                  onFocus={() => setHover(index)}
                  onBlur={() => setHover(null)}
                  tabIndex={0}
                  aria-label={`${label}: ${series.map(item => `${item.label} ${item.values[index] || 0}`).join(', ')}`}
                />
              </g>
            );
          })}
        </svg>
        {hover !== null && (
          <div
            role="tooltip"
            className="pointer-events-none absolute top-2 z-10 min-w-[10rem] rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs shadow-card"
            style={{ left: Math.min(width - 176, Math.max(0, MARGIN.left + hover * band + band / 2 - 80)) }}
          >
            <p className="mb-1 font-semibold text-gray-800">Week of {labels[hover]}</p>
            {series.map(item => (
              <p key={item.id} className="flex items-center justify-between gap-3 text-gray-600">
                <span className="flex items-center gap-1.5">
                  <span className="inline-block h-2 w-2 rounded-sm" style={{ background: item.color }} aria-hidden="true" />{item.label}
                </span>
                <span className="font-medium text-gray-800" style={{ fontVariantNumeric: 'tabular-nums' }}>{item.values[hover] || 0}</span>
              </p>
            ))}
          </div>
        )}
      </div>

      {showTable && (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="text-left text-gray-500">
              <tr>
                <th className="py-1.5 pr-3 font-medium">Week of</th>
                {series.map(item => <th key={item.id} className="py-1.5 pr-3 text-right font-medium">{item.label}</th>)}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 text-gray-700" style={{ fontVariantNumeric: 'tabular-nums' }}>
              {labels.map((label, index) => (
                <tr key={label + index}>
                  <td className="py-1.5 pr-3">{label}</td>
                  {series.map(item => <td key={item.id} className="py-1.5 pr-3 text-right">{item.values[index] || 0}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
