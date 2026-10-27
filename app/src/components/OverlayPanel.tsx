import { useState } from 'react';
import { ChevronDown } from 'lucide-react';

/* ── Type-accurate SVG swatches ──────────────────────── */
function Swatch({ item }) {
  const {
    type,
    stroke = '#999',
    fill = 'transparent',
    strokeStyle,
    strokeWidth,
    fillPattern,
    textColor,
    textBg,
  } = item;

  const w = 26, h = 14;
  const da =
    strokeStyle === 'dashed' ? '5,3' :
    strokeStyle === 'dotted' ? '2,3' : undefined;

  // Lines
  if (type === 'polyline' || type === 'LineString') {
    return (
      <svg width={w} height={h} className="flex-shrink-0 overflow-visible">
        <line x1="2" y1={h / 2} x2={w - 2} y2={h / 2}
          stroke={stroke}
          strokeWidth={Math.min(strokeWidth || 3, 4)}
          strokeDasharray={da}
          strokeLinecap="round" />
      </svg>
    );
  }

  // Polygons / circles
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
          <circle cx="8" cy={h / 2} r="1.2" fill={f} opacity=".6" />
          <circle cx="14" cy={h / 2} r="1.2" fill={f} opacity=".6" />
          <circle cx="20" cy={h / 2} r="1.2" fill={f} opacity=".6" />
        </>}
      </svg>
    );
  }

  // Markers
  if (type === 'marker' || type === 'Point') {
    return (
      <svg width={w} height={h} className="flex-shrink-0">
        <path d={`M${w / 2} 1 C${w / 2 - 4} 1 ${w / 2 - 5} 5 ${w / 2 - 5} 6.5 C${w / 2 - 5} 9 ${w / 2} ${h - 1} ${w / 2} ${h - 1} C${w / 2} ${h - 1} ${w / 2 + 5} 9 ${w / 2 + 5} 6.5 C${w / 2 + 5} 5 ${w / 2 + 4} 1 ${w / 2} 1Z`}
          fill={stroke || '#e74c3c'} stroke="#fff" strokeWidth="1" />
        <circle cx={w / 2} cy="6" r="2" fill="#fff" opacity=".8" />
      </svg>
    );
  }

  // Text labels
  if (type === 'text') {
    return (
      <span className="flex-shrink-0 rounded px-1 py-px text-[9px] font-bold leading-none"
        style={{ background: textBg || stroke || '#ff4d6d', color: textColor || fill || '#fff' }}>
        Aa
      </span>
    );
  }

  // Image points
  if (type === 'image') {
    return (
      <span className="flex-shrink-0 w-6 h-3.5 rounded bg-slate-700 text-[9px] text-white flex items-center justify-center">
        📷
      </span>
    );
  }

  // Fallback
  return (
    <span className="flex-shrink-0 w-6 h-3.5 rounded"
      style={{ background: fill || 'transparent', border: `2px solid ${stroke}` }} />
  );
}

/* ── Legend icon (tiny inline SVG) ────────────────────── */
const LegendIcon = () => (
  <svg width="14" height="14" viewBox="0 0 16 16" className="text-teal-600 flex-shrink-0">
    <rect x="1" y="1.5" width="5" height="4" rx="1" fill="currentColor" opacity=".7" />
    <rect x="1" y="8.5" width="5" height="4" rx="1" fill="currentColor" opacity=".4" />
    <line x1="8.5" y1="3.5" x2="15" y2="3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    <line x1="8.5" y1="10.5" x2="15" y2="10.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
);

/* ── Checkmark for the group toggle ──────────────────── */
const CheckSvg = () => (
  <svg width="10" height="10" viewBox="0 0 10 10">
    <path d="M2 5.2 L4 7.5 L8 2.5" fill="none" stroke="#fff" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

/* ══════════════════════════════════════════════════════════
   OverlayPanel — map legend with toggles
   ══════════════════════════════════════════════════════════ */
export default function OverlayPanel({ groups = [], visibleIds = [], onToggle }) {
  const [minimized, setMinimized] = useState(false);

  if (!groups.length) return null;

  const vis = new Set(visibleIds);

  const getLegend = (g) => {
    const raw = g.geojson?.context?.legend?.items?.length
      ? g.geojson.context.legend.items
      : (g.geojson?.features || [])
          .filter(f => f.properties?.legendTitle)
          .map(f => ({
            title:       f.properties.legendTitle,
            type:        f.properties.type || f.geometry?.type || '?',
            stroke:      f.properties.stroke      || f.properties.strokeHex || '#999',
            fill:        f.properties.fill         || f.properties.fillHex   || 'transparent',
            strokeStyle: f.properties.strokeStyle  || 'solid',
            strokeWidth: f.properties.strokeWidth  || 3,
            fillPattern: f.properties.fillPattern  || 'solid',
            textColor:   f.properties.textColor,
            textBg:      f.properties.textBg,
          }));

      // Dedupe by title + color so repeated zones collapse into one legend row.
      const seen = new Set();
      return raw.filter(it => {
        const key = `${it.title}|${it.stroke}|${it.fill}|${it.fillPattern}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    };

  return (
    <div className="absolute bottom-4 left-4 z-[1000] select-none flex flex-col"
      style={{ maxHeight: 'calc(100% - 2rem)' }}>

      {/* ── Header bar (always visible) ── */}
      <button
        onClick={() => setMinimized(m => !m)}
        className={`bg-white/95 backdrop-blur shadow-lg border border-gray-200/80
          px-3.5 py-2 flex items-center gap-2 hover:bg-white transition-colors
          ${minimized
            ? 'rounded-xl'
            : 'rounded-t-xl border-b-0'}`}
      >
        <LegendIcon />
        <span className="text-xs font-semibold text-gray-600 flex-1 text-left">Legend</span>
        <ChevronDown size={12}
          className={`text-gray-400 transition-transform duration-200 ${minimized ? '' : 'rotate-180'}`} />
      </button>

      {/* ── Body ── */}
      {!minimized && (
        <div className="bg-white/95 backdrop-blur rounded-b-xl shadow-lg border border-gray-200/80 border-t border-t-gray-100 overflow-y-auto flex-1 min-h-0">
          <div className="px-3.5 py-3 space-y-3.5">
            {groups.map(group => {
              const on = vis.has(group.id);
              const items = getLegend(group);
              const color = group.color || '#3366ff';

              return (
                <div key={group.id}
                  className={`transition-opacity duration-200 ${on ? '' : 'opacity-30 grayscale'}`}>

                  {/* Group header + toggle */}
                  <button
                    onClick={() => onToggle(group.id)}
                    className="flex items-center gap-2.5 w-full text-left group/h"
                  >
                    {/* Colored checkbox */}
                    <span
                      className="w-[18px] h-[18px] rounded flex items-center justify-center flex-shrink-0 border-2 transition-all duration-200"
                      style={{
                        borderColor: color,
                        background: on ? color : 'transparent',
                      }}
                    >
                      {on && <CheckSvg />}
                    </span>

                    <span className="text-[13px] font-semibold text-gray-700 group-hover/h:text-teal-700 transition-colors leading-tight">
                      {group.name}
                    </span>
                  </button>

                  {/* Feature items (always visible) */}
                  {items.length > 0 && (
                    <div className="mt-1.5 ml-[30px] space-y-[5px]">
                      {items.map((item, i) => (
                        <div key={i} className="flex items-center gap-2 min-w-0">
                          <Swatch item={item} />
                          <span className="text-[11px] text-gray-500 leading-tight truncate">
                            {item.title}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* If group has features but no named legend items */}
                  {items.length === 0 && (group.geojson?.features?.length || 0) > 0 && (
                    <p className="mt-1 ml-[30px] text-[10px] text-gray-400 italic">
                      {group.geojson.features.length} feature{group.geojson.features.length > 1 ? 's' : ''}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

