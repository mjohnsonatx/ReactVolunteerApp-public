/**
 * Type-accurate SVG swatch for overlay legend items.
 * Shared between OverlayPanel (public) and admin overlay views.
 */

interface SwatchProps {
  type: string;
  stroke?: string;
  fill?: string;
  strokeStyle?: string;
  strokeWidth?: number;
  fillPattern?: string;
  textColor?: string;
  textBg?: string;
  size?: 'sm' | 'md';
}

export default function OverlaySwatch({
  type,
  stroke = '#999',
  fill = 'transparent',
  strokeStyle,
  strokeWidth,
  fillPattern,
  textColor,
  textBg,
  size = 'sm',
}: SwatchProps) {
  const w = size === 'md' ? 32 : 26;
  const h = size === 'md' ? 16 : 14;
  const da =
    strokeStyle === 'dashed' ? '5,3' :
    strokeStyle === 'dotted' ? '2,3' : undefined;

  if (type === 'polyline' || type === 'LineString') {
    return (
      <svg width={w} height={h} className="flex-shrink-0 overflow-visible">
        <line x1="2" y1={h / 2} x2={w - 2} y2={h / 2}
          stroke={stroke} strokeWidth={Math.min(strokeWidth || 3, 4)}
          strokeDasharray={da} strokeLinecap="round" />
      </svg>
    );
  }

  if (['polygon', 'circle', 'Polygon'].includes(type)) {
    const isNone = fillPattern === 'none';
    const f = isNone ? 'transparent' : (fill !== 'transparent' ? fill : '#3366ff');
    return (
      <svg width={w} height={h} className="flex-shrink-0">
        <rect x="1.5" y="1.5" width={w - 3} height={h - 3} rx="2.5"
          fill={f} fillOpacity={isNone ? 0 : 0.35}
          stroke={stroke} strokeWidth="1.5" strokeDasharray={da} />
        {fillPattern === 'crosshatch' && <>
          <line x1="4" y1="2" x2={w - 4} y2={h - 2} stroke={f} strokeWidth=".8" opacity=".5" />
          <line x1={w - 4} y1="2" x2="4" y2={h - 2} stroke={f} strokeWidth=".8" opacity=".5" />
        </>}
        {fillPattern === 'horizontal' &&
          <line x1="4" y1={h / 2} x2={w - 4} y2={h / 2} stroke={f} strokeWidth=".8" opacity=".6" />}
        {fillPattern === 'diagonal-right' &&
          <line x1="4" y1="2" x2={w - 4} y2={h - 2} stroke={f} strokeWidth=".8" opacity=".6" />}
        {fillPattern === 'dots' && <>
          <circle cx={w * 0.3} cy={h / 2} r="1.2" fill={f} opacity=".6" />
          <circle cx={w * 0.5} cy={h / 2} r="1.2" fill={f} opacity=".6" />
          <circle cx={w * 0.7} cy={h / 2} r="1.2" fill={f} opacity=".6" />
        </>}
      </svg>
    );
  }

  if (type === 'marker' || type === 'Point') {
    return (
      <svg width={w} height={h} className="flex-shrink-0">
        <path
          d={`M${w / 2} 1 C${w / 2 - 4} 1 ${w / 2 - 5} 5 ${w / 2 - 5} 6.5 C${w / 2 - 5} 9 ${w / 2} ${h - 1} ${w / 2} ${h - 1} C${w / 2} ${h - 1} ${w / 2 + 5} 9 ${w / 2 + 5} 6.5 C${w / 2 + 5} 5 ${w / 2 + 4} 1 ${w / 2} 1Z`}
          fill={stroke || '#e74c3c'} stroke="#fff" strokeWidth="1" />
        <circle cx={w / 2} cy="6" r="2" fill="#fff" opacity=".8" />
      </svg>
    );
  }

  if (type === 'text') {
    return (
      <span className="flex-shrink-0 rounded px-1 py-px text-[9px] font-bold leading-none"
        style={{ background: textBg || stroke || '#ff4d6d', color: textColor || fill || '#fff' }}>
        Aa
      </span>
    );
  }

  if (type === 'image') {
    return (
      <span className="flex-shrink-0 w-6 h-3.5 rounded bg-slate-700 text-[9px] text-white flex items-center justify-center">
        📷
      </span>
    );
  }

  return (
    <span className="flex-shrink-0 w-6 h-3.5 rounded"
      style={{ background: fill || 'transparent', border: `2px solid ${stroke}` }} />
  );
}