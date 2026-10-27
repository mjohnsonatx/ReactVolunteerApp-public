import { useMemo } from 'react';
import { X, Globe, EyeOff } from 'lucide-react';
import Map from '../Map';
import OverlaySwatch from '../shared/OverlaySwatch';
import { sanitizeGeoJSON } from '../../utils/geojson';
import { extractLegend, countFeatures } from '../../utils/overlayLegend';

interface OverlayPreviewModalProps {
  overlay: Record<string, any> | null;
  onClose: () => void;
}

export default function OverlayPreviewModal({ overlay, onClose }: OverlayPreviewModalProps) {
  const safeGroup = useMemo(() => {
    if (!overlay) return null;
    try {
      const raw = typeof overlay.geojson === 'string' ? JSON.parse(overlay.geojson) : overlay.geojson;
      const sanitized = sanitizeGeoJSON(raw);
      return { id: overlay.id, name: overlay.name, color: overlay.color, geojson: sanitized };
    } catch {
      return null;
    }
  }, [overlay]);

  const legend = useMemo(() => overlay ? extractLegend(overlay) : [], [overlay]);
  const breakdown = useMemo(() => overlay ? countFeatures(overlay) : { total: 0, counts: [] }, [overlay]);

  if (!overlay) return null;

  const isPublished = overlay.published !== false && overlay.status !== 'pending';

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[2000] p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl max-w-5xl w-full my-8">
        {/* ── Header ── */}
        <div className="flex items-start justify-between px-6 pt-6 pb-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2.5">
              <span className="w-5 h-5 rounded" style={{ backgroundColor: overlay.color || '#3366ff' }} />
              <h2 className="text-xl font-bold text-gray-800 truncate">{overlay.name}</h2>
              {overlay.status === 'pending' ? (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-100 text-amber-700">
                  Pending Review
                </span>
              ) : isPublished ? (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-100 text-emerald-700">
                  <Globe size={10} /> Published
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-gray-200 text-gray-500">
                  <EyeOff size={10} /> Draft
                </span>
              )}
            </div>
            {overlay.description && <p className="text-sm text-gray-500 mt-1">{overlay.description}</p>}
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 ml-4 flex-shrink-0">
            <X size={24} />
          </button>
        </div>

        {/* ── Content: Map + Legend side by side ── */}
        <div className="px-6 pb-2 flex flex-col lg:flex-row gap-4">
          {/* Map */}
          <div className="flex-1 min-w-0">
            {safeGroup ? (
              <Map overlayGroups={[safeGroup]} visibleGroupIds={[safeGroup.id]} height="420px" />
            ) : (
              <div className="h-[420px] flex items-center justify-center bg-gray-100 rounded-xl">
                <p className="text-gray-400">Could not parse overlay GeoJSON for preview.</p>
              </div>
            )}
          </div>

          {/* Legend panel */}
          <div className="lg:w-72 flex-shrink-0">
            <div className="bg-gray-50 rounded-xl p-4 h-full max-h-[420px] overflow-y-auto">
              <h3 className="text-sm font-bold text-gray-700 mb-3">
                Legend ({breakdown.total} feature{breakdown.total !== 1 ? 's' : ''})
              </h3>

              {legend.length > 0 ? (
                <div className="space-y-1.5">
                  {legend.map((item, i) => (
                    <div key={i} className="flex items-center gap-2.5 min-w-0">
                      <OverlaySwatch {...item} size="md" />
                      <span className="text-[12px] text-gray-600 leading-tight truncate">{item.title}</span>
                    </div>
                  ))}
                </div>
              ) : breakdown.total > 0 ? (
                <p className="text-xs text-gray-400 italic">
                  {breakdown.total} feature{breakdown.total !== 1 ? 's' : ''} without legend titles
                </p>
              ) : (
                <p className="text-xs text-gray-400 italic">No features found</p>
              )}

              {/* Breakdown */}
              {breakdown.counts.length > 0 && (
                <div className="mt-4 pt-3 border-t border-gray-200">
                  <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-2">Breakdown</p>
                  <div className="flex flex-wrap gap-x-3 gap-y-1">
                    {breakdown.counts.map((c, i) => (
                      <span key={i} className="text-xs text-gray-500">
                        <span className="font-semibold text-gray-700">{c.count}</span> {c.label}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Upload metadata (for pending items) */}
              {overlay.uploadedByEmail && (
                <div className="mt-4 pt-3 border-t border-gray-200 text-[11px] text-gray-400 space-y-0.5">
                  <p>Uploaded by {overlay.uploadedByEmail}</p>
                  {overlay.uploadedAt && (
                    <p>{(overlay.uploadedAt.toDate ? overlay.uploadedAt.toDate() : new Date(overlay.uploadedAt)).toLocaleString()}</p>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── Footer ── */}
        <div className="px-6 py-4 flex justify-end border-t border-gray-100">
          <button onClick={onClose}
            className="px-6 py-2.5 bg-gray-100 rounded-xl hover:bg-gray-200 text-gray-700 font-medium transition-colors">
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

// import { useMemo } from 'react';
// import { X } from 'lucide-react';
// import Map from '../Map';
// import { sanitizeGeoJSON } from '../../utils/geojson';

// interface OverlayPreviewModalProps {
//   overlay: { id: string; name: string; color: string; geojson: any; description?: string } | null;
//   onClose: () => void;
// }

// export default function OverlayPreviewModal({ overlay, onClose }: OverlayPreviewModalProps) {
//   const safeGroup = useMemo(() => {
//     if (!overlay) return null;
//     try {
//       const raw = typeof overlay.geojson === 'string' ? JSON.parse(overlay.geojson) : overlay.geojson;
//       const sanitized = sanitizeGeoJSON(raw);
//       return { id: overlay.id, name: overlay.name, color: overlay.color, geojson: sanitized };
//     } catch {
//       return null;
//     }
//   }, [overlay]);

//   if (!overlay) return null;

//   return (
//     <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[2000] p-4">
//       <div className="bg-white rounded-2xl p-6 max-w-3xl w-full shadow-2xl">
//         <div className="flex justify-between items-center mb-4">
//           <div>
//             <h2 className="text-xl font-bold text-gray-800">Preview: {overlay.name}</h2>
//             {overlay.description && (
//               <p className="text-sm text-gray-500 mt-1">{overlay.description}</p>
//             )}
//           </div>
//           <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={24} /></button>
//         </div>
//         {safeGroup ? (
//           <Map
//             overlayGroups={[safeGroup]}
//             visibleGroupIds={[safeGroup.id]}
//             height="420px"
//           />
//         ) : (
//           <div className="h-[420px] flex items-center justify-center bg-gray-100 rounded-xl">
//             <p className="text-gray-400">Could not parse overlay GeoJSON for preview.</p>
//           </div>
//         )}
//         <div className="mt-4 flex justify-end">
//           <button onClick={onClose} className="px-6 py-2 bg-gray-100 rounded-xl hover:bg-gray-200 text-gray-700 font-medium">
//             Close
//           </button>
//         </div>
//       </div>
//     </div>
//   );
// }