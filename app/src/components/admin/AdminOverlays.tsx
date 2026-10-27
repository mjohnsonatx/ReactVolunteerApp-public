import { useState, useMemo, useCallback } from 'react';
import {
  Upload, Layers, Eye, Check, X, Trash2, Clock,
  CheckCircle, XCircle, Globe, EyeOff, ChevronDown,
} from 'lucide-react';
import { useApp } from '@runtime/app-context';
import { extractLegend, countFeatures } from '../../utils/overlayLegend';
import OverlaySwatch from '../shared/OverlaySwatch';
import OverlayPreviewModal from './OverlayPreviewModal';

const LEGEND_PREVIEW_LIMIT = 4;

/* ── Status helpers ────────────────────────────────────── */
const uploadStatusStyle = {
  pending:  'bg-amber-100 text-amber-700',
  approved: 'bg-emerald-100 text-emerald-700',
  rejected: 'bg-red-100 text-red-700',
};
const uploadStatusIcon = { pending: Clock, approved: CheckCircle, rejected: XCircle };

function formatDate(ts) {
  if (!ts) return '—';
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

/* ── Inline Legend ──────────────────────────────────────── */
function InlineLegend({ overlay, expanded, onToggle }) {
  const items = useMemo(() => extractLegend(overlay), [overlay]);
  if (items.length === 0) return null;

  const visible = expanded ? items : items.slice(0, LEGEND_PREVIEW_LIMIT);
  const remaining = items.length - LEGEND_PREVIEW_LIMIT;

  return (
    <div className="mt-2 ml-7">
      <button
        onClick={onToggle}
        className="flex items-center gap-1 text-[11px] text-gray-400 hover:text-gray-600 mb-1.5 font-medium"
      >
        <ChevronDown size={12} className={`transition-transform ${expanded ? 'rotate-180' : ''}`} />
        Legend ({items.length})
      </button>
      <div className="space-y-[3px]">
        {visible.map((item, i) => (
          <div key={i} className="flex items-center gap-2 min-w-0">
            <OverlaySwatch {...item} />
            <span className="text-[11px] text-gray-500 leading-tight truncate">{item.title}</span>
          </div>
        ))}
        {!expanded && remaining > 0 && (
          <button onClick={onToggle}
            className="text-[11px] text-teal-500 hover:text-teal-700 font-medium pl-7">
            + {remaining} more
          </button>
        )}
      </div>
    </div>
  );
}

/* ── Breakdown tag ─────────────────────────────────────── */
function FeatureTag({ overlay }) {
  const { total, counts } = useMemo(() => countFeatures(overlay), [overlay]);
  if (total === 0) return null;
  const summary = counts.map(c => `${c.count} ${c.label}`).join(' · ');
  return <span className="text-xs text-gray-400">{total} features — {summary}</span>;
}

/* ══════════════════════════════════════════════════════════
   AdminOverlays
   ══════════════════════════════════════════════════════════ */
export default function AdminOverlays() {
  const {
    overlayGroups,
    overlayUploads,
    setShowImportModal,
    deleteOverlayGroup,
    approveOverlayUpload,
    rejectOverlayUpload,
    deleteOverlayUpload,
    toggleOverlayPublished,
  } = useApp();

  const [previewData, setPreviewData] = useState(null);
  const [rejectTarget, setRejectTarget] = useState(null);
  const [rejectNote, setRejectNote] = useState('');
  const [actionLoading, setActionLoading] = useState(null);
  const [expandedLegends, setExpandedLegends] = useState(new Set());

  const pendingUploads  = (overlayUploads || []).filter(u => u.status === 'pending');
  const processedUploads = (overlayUploads || []).filter(u => u.status !== 'pending');

  const publishedCount = overlayGroups.filter(g => g.published !== false).length;
  const draftCount     = overlayGroups.filter(g => g.published === false).length;

  const toggleLegend = useCallback((id) => {
    setExpandedLegends(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const handleApprove = async (id) => {
    setActionLoading(id);
    await approveOverlayUpload(id);
    setActionLoading(null);
  };

  const handleRejectConfirm = async () => {
    if (!rejectTarget) return;
    setActionLoading(rejectTarget);
    await rejectOverlayUpload(rejectTarget, rejectNote);
    setActionLoading(null);
    setRejectTarget(null);
    setRejectNote('');
  };

  const handleTogglePublished = async (id) => {
    setActionLoading(id);
    await toggleOverlayPublished(id);
    setActionLoading(null);
  };

  return (
    <div className="space-y-6">
      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-800">Map Overlays</h2>
          <p className="text-gray-500 mt-1">
            {publishedCount} published · {draftCount} draft{pendingUploads.length > 0 ? ` · ${pendingUploads.length} pending review` : ''}
          </p>
        </div>
        <button onClick={() => setShowImportModal(true)}
          className="flex items-center gap-2 bg-teal-500 text-white px-5 py-2.5 rounded-xl font-semibold hover:bg-teal-600 transition-colors">
          <Upload size={18} /> Manual Import
        </button>
      </div>

      {/* ── Pending Uploads ── */}
      {pendingUploads.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-6">
          <h3 className="text-lg font-bold text-amber-800 flex items-center gap-2 mb-4">
            <Clock size={20} /> Pending Review ({pendingUploads.length})
          </h3>
          <div className="space-y-3">
            {pendingUploads.map(upload => (
              <div key={upload.id} className="bg-white rounded-xl p-4 border border-amber-100 shadow-sm">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2.5">
                      <span className="w-4 h-4 rounded flex-shrink-0" style={{ backgroundColor: upload.color || '#3366ff' }} />
                      <h4 className="font-semibold text-gray-800 truncate">{upload.name}</h4>
                    </div>
                    {upload.description && <p className="text-xs text-gray-500 mt-1 ml-7 line-clamp-2">{upload.description}</p>}
                    <div className="mt-1 ml-7">
                      <FeatureTag overlay={upload} />
                    </div>
                    <p className="text-[11px] text-gray-400 mt-1 ml-7">
                      by {upload.uploadedByEmail || 'unknown'} · {formatDate(upload.uploadedAt)}
                    </p>
                    <InlineLegend
                      overlay={upload}
                      expanded={expandedLegends.has(upload.id)}
                      onToggle={() => toggleLegend(upload.id)}
                    />
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <button onClick={() => setPreviewData(upload)} title="Preview map & legend"
                      className="p-2 rounded-lg hover:bg-gray-100 text-gray-500"><Eye size={18} /></button>
                    <button onClick={() => void handleApprove(upload.id)} title="Approve & publish"
                      disabled={actionLoading === upload.id}
                      className="p-2 rounded-lg hover:bg-emerald-100 text-emerald-600 disabled:opacity-50"><Check size={18} /></button>
                    <button onClick={() => { setRejectTarget(upload.id); setRejectNote(''); }} title="Reject"
                      className="p-2 rounded-lg hover:bg-red-100 text-red-500"><X size={18} /></button>
                    <button onClick={() => void deleteOverlayUpload(upload.id)} title="Delete permanently"
                      className="p-2 rounded-lg hover:bg-red-100 text-red-400"><Trash2 size={16} /></button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Active Overlays ── */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-2">
          <Layers size={20} className="text-teal-600" />
          <h3 className="text-lg font-bold text-gray-800">Active Overlays ({overlayGroups.length})</h3>
        </div>

        {overlayGroups.length === 0 ? (
          <div className="px-6 py-14 text-center text-gray-400">
            <Layers size={44} className="mx-auto mb-3 opacity-20" />
            <p className="font-medium">No overlays yet</p>
            <p className="text-sm mt-1">Import manually or upload from the overlay builder.</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {overlayGroups.map(g => {
              const isPublished = g.published !== false;
              return (
                <div key={g.id} className={`px-6 py-4 transition-colors ${isPublished ? '' : 'bg-gray-50/60'}`}>
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2.5">
                        <span className="w-4 h-4 rounded flex-shrink-0" style={{ backgroundColor: g.color || '#3366ff' }} />
                        <h4 className="font-semibold text-gray-800 truncate">{g.name}</h4>
                        {isPublished ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-100 text-emerald-700">
                            <Globe size={10} /> Published
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-gray-200 text-gray-500">
                            <EyeOff size={10} /> Draft
                          </span>
                        )}
                      </div>
                      {g.description && <p className="text-xs text-gray-500 mt-1 ml-7 truncate">{g.description}</p>}
                      <div className="mt-1 ml-7">
                        <FeatureTag overlay={g} />
                      </div>
                      <InlineLegend
                        overlay={g}
                        expanded={expandedLegends.has(g.id)}
                        onToggle={() => toggleLegend(g.id)}
                      />
                    </div>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <button onClick={() => setPreviewData(g)} title="Preview map & legend"
                        className="p-2 rounded-lg hover:bg-gray-100 text-gray-500"><Eye size={18} /></button>
                      <button
                        onClick={() => void handleTogglePublished(g.id)}
                        disabled={actionLoading === g.id}
                        title={isPublished ? 'Unpublish (hide from users)' : 'Publish (show to users)'}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors disabled:opacity-50 ${
                          isPublished
                            ? 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                            : 'bg-emerald-500 text-white hover:bg-emerald-600'
                        }`}
                      >
                        {isPublished ? 'Unpublish' : 'Publish'}
                      </button>
                      <button
                        onClick={() => { if (window.confirm(`Delete overlay "${g.name}"? This cannot be undone.`)) deleteOverlayGroup(g.id); }}
                        title="Delete permanently"
                        className="p-2 rounded-lg hover:bg-red-100 text-red-400"><Trash2 size={16} /></button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Upload History ── */}
      {processedUploads.length > 0 && (
        <details className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <summary className="px-6 py-4 cursor-pointer select-none flex items-center gap-2 hover:bg-gray-50">
            <Clock size={18} className="text-gray-400" />
            <span className="text-sm font-semibold text-gray-600">Upload History ({processedUploads.length})</span>
          </summary>
          <div className="divide-y divide-gray-50 border-t border-gray-100">
            {processedUploads.map(u => {
              const StatusIcon = uploadStatusIcon[u.status] || Clock;
              return (
                <div key={u.id} className="px-6 py-3 flex items-center justify-between">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="w-3 h-3 rounded flex-shrink-0" style={{ backgroundColor: u.color || '#999' }} />
                    <span className="text-sm text-gray-700 truncate">{u.name}</span>
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium ${uploadStatusStyle[u.status] || ''}`}>
                      <StatusIcon size={11} /> {u.status}
                    </span>
                    {u.reviewNote && <span className="text-[11px] text-gray-400 italic truncate max-w-[200px]">"{u.reviewNote}"</span>}
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className="text-[11px] text-gray-400">{formatDate(u.uploadedAt)}</span>
                    <button onClick={() => void deleteOverlayUpload(u.id)} title="Delete record"
                      className="p-1.5 rounded-lg hover:bg-red-100 text-red-400"><Trash2 size={14} /></button>
                  </div>
                </div>
              );
            })}
          </div>
        </details>
      )}

      {/* ── Reject Note Modal ── */}
      {rejectTarget && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[2000] p-4">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full shadow-2xl">
            <h3 className="text-lg font-bold text-gray-800 mb-3">Reject Upload</h3>
            <textarea rows={3} maxLength={500} value={rejectNote} onChange={e => setRejectNote(e.target.value)}
              placeholder="Optional reason for rejection…"
              className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-red-400 outline-none text-sm" />
            <div className="mt-4 flex gap-3">
              <button onClick={() => setRejectTarget(null)} className="flex-1 py-2.5 border rounded-xl hover:bg-gray-50">Cancel</button>
              <button onClick={() => void handleRejectConfirm()} disabled={actionLoading === rejectTarget}
                className="flex-1 py-2.5 bg-red-500 text-white rounded-xl font-semibold hover:bg-red-600 disabled:opacity-50">
                {actionLoading === rejectTarget ? 'Rejecting…' : 'Reject'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Preview Modal ── */}
      <OverlayPreviewModal overlay={previewData} onClose={() => setPreviewData(null)} />
    </div>
  );
}

// import { useState } from 'react';
// import { Upload, Layers, Eye, Check, X, Trash2, Clock, CheckCircle, XCircle } from 'lucide-react';
// import { useApp } from '../../context/AppContext';
// import OverlayPreviewModal from './OverlayPreviewModal';

// const statusColors = {
//   pending: 'bg-amber-100 text-amber-700',
//   approved: 'bg-emerald-100 text-emerald-700',
//   rejected: 'bg-red-100 text-red-700',
// };
// const statusIcons = { pending: Clock, approved: CheckCircle, rejected: XCircle };

// export default function AdminOverlays() {
//   const {
//     overlayGroups,
//     overlayUploads,
//     setShowImportModal,
//     deleteOverlayGroup,
//     approveOverlayUpload,
//     rejectOverlayUpload,
//     deleteOverlayUpload,
//   } = useApp();

//   const [previewData, setPreviewData] = useState(null);
//   const [rejectTarget, setRejectTarget] = useState(null);
//   const [rejectNote, setRejectNote] = useState('');
//   const [actionLoading, setActionLoading] = useState(null);

//   const pendingUploads = (overlayUploads || []).filter(u => u.status === 'pending');
//   const processedUploads = (overlayUploads || []).filter(u => u.status !== 'pending');

//   const handleApprove = async (id) => {
//     setActionLoading(id);
//     await approveOverlayUpload(id);
//     setActionLoading(null);
//   };

//   const handleRejectConfirm = async () => {
//     if (!rejectTarget) return;
//     setActionLoading(rejectTarget);
//     await rejectOverlayUpload(rejectTarget, rejectNote);
//     setActionLoading(null);
//     setRejectTarget(null);
//     setRejectNote('');
//   };

//   const formatDate = (ts) => {
//     if (!ts) return '—';
//     const d = ts.toDate ? ts.toDate() : new Date(ts);
//     return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
//   };

//   return (
//     <div className="space-y-6">
//       {/* ── Header ── */}
//       <div className="flex items-center justify-between">
//         <div>
//           <h2 className="text-2xl font-bold text-gray-800">Map Overlays</h2>
//           <p className="text-gray-500 mt-1">Review uploads from the overlay builder and manage active overlays</p>
//         </div>
//         <button
//           onClick={() => setShowImportModal(true)}
//           className="flex items-center gap-2 bg-teal-500 text-white px-5 py-2.5 rounded-xl font-semibold hover:bg-teal-600 transition-colors"
//         >
//           <Upload size={18} /> Manual Import
//         </button>
//       </div>

//       {/* ── Pending Uploads ── */}
//       {pendingUploads.length > 0 && (
//         <div className="bg-amber-50 border border-amber-200 rounded-2xl p-6">
//           <h3 className="text-lg font-bold text-amber-800 flex items-center gap-2 mb-4">
//             <Clock size={20} /> Pending Uploads ({pendingUploads.length})
//           </h3>
//           <div className="space-y-3">
//             {pendingUploads.map(upload => (
//               <div key={upload.id} className="bg-white rounded-xl p-4 border border-amber-100 shadow-sm">
//                 <div className="flex items-start justify-between">
//                   <div className="flex items-center gap-3 min-w-0">
//                     <span className="w-4 h-4 rounded flex-shrink-0" style={{ backgroundColor: upload.color || '#3366ff' }} />
//                     <div className="min-w-0">
//                       <h4 className="font-semibold text-gray-800 truncate">{upload.name}</h4>
//                       {upload.description && <p className="text-xs text-gray-500 mt-0.5 truncate">{upload.description}</p>}
//                       <p className="text-xs text-gray-400 mt-1">
//                         {upload.featureCount} feature{upload.featureCount !== 1 ? 's' : ''} · by {upload.uploadedByEmail || 'unknown'} · {formatDate(upload.uploadedAt)}
//                       </p>
//                     </div>
//                   </div>
//                   <div className="flex items-center gap-2 flex-shrink-0 ml-4">
//                     <button onClick={() => setPreviewData(upload)} title="Preview"
//                       className="p-2 rounded-lg hover:bg-gray-100 text-gray-500"><Eye size={18} /></button>
//                     <button onClick={() => void handleApprove(upload.id)} title="Approve" disabled={actionLoading === upload.id}
//                       className="p-2 rounded-lg hover:bg-emerald-100 text-emerald-600 disabled:opacity-50"><Check size={18} /></button>
//                     <button onClick={() => { setRejectTarget(upload.id); setRejectNote(''); }} title="Reject"
//                       className="p-2 rounded-lg hover:bg-red-100 text-red-500"><X size={18} /></button>
//                     <button onClick={() => void deleteOverlayUpload(upload.id)} title="Delete"
//                       className="p-2 rounded-lg hover:bg-red-100 text-red-400"><Trash2 size={16} /></button>
//                   </div>
//                 </div>
//               </div>
//             ))}
//           </div>
//         </div>
//       )}

//       {/* ── Active Overlays ── */}
//       <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
//         <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-2">
//           <Layers size={20} className="text-teal-600" />
//           <h3 className="text-lg font-bold text-gray-800">Active Overlays ({overlayGroups.length})</h3>
//         </div>
//         {overlayGroups.length === 0 ? (
//           <div className="px-6 py-12 text-center text-gray-400">
//             <Layers size={40} className="mx-auto mb-3 opacity-30" />
//             <p>No active overlays yet.</p>
//           </div>
//         ) : (
//           <div className="divide-y divide-gray-50">
//             {overlayGroups.map(g => (
//               <div key={g.id} className="px-6 py-3 flex items-center justify-between hover:bg-gray-50">
//                 <div className="flex items-center gap-3 min-w-0">
//                   <span className="w-4 h-4 rounded flex-shrink-0" style={{ backgroundColor: g.color || '#3366ff' }} />
//                   <div className="min-w-0">
//                     <h4 className="font-medium text-gray-800 truncate">{g.name}</h4>
//                     <p className="text-xs text-gray-400">
//                       {g.geojson?.features?.length ?? g.featureCount ?? 0} features
//                     </p>
//                   </div>
//                 </div>
//                 <div className="flex items-center gap-2">
//                   <button onClick={() => setPreviewData(g)} title="Preview"
//                     className="p-2 rounded-lg hover:bg-gray-100 text-gray-500"><Eye size={18} /></button>
//                   <button onClick={() => { if (window.confirm(`Delete overlay "${g.name}"?`)) deleteOverlayGroup(g.id); }} title="Delete"
//                     className="p-2 rounded-lg hover:bg-red-100 text-red-400"><Trash2 size={16} /></button>
//                 </div>
//               </div>
//             ))}
//           </div>
//         )}
//       </div>

//       {/* ── Upload History ── */}
//       {processedUploads.length > 0 && (
//         <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
//           <div className="px-6 py-4 border-b border-gray-100">
//             <h3 className="text-lg font-bold text-gray-800">Upload History ({processedUploads.length})</h3>
//           </div>
//           <div className="divide-y divide-gray-50">
//             {processedUploads.map(u => {
//               const StatusIcon = statusIcons[u.status] || Clock;
//               return (
//                 <div key={u.id} className="px-6 py-3 flex items-center justify-between">
//                   <div className="flex items-center gap-3 min-w-0">
//                     <span className="w-3 h-3 rounded flex-shrink-0" style={{ backgroundColor: u.color || '#999' }} />
//                     <span className="text-sm text-gray-700 truncate">{u.name}</span>
//                     <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${statusColors[u.status] || ''}`}>
//                       <StatusIcon size={12} /> {u.status}
//                     </span>
//                   </div>
//                   <div className="flex items-center gap-2">
//                     <span className="text-xs text-gray-400">{formatDate(u.uploadedAt)}</span>
//                     <button onClick={() => void deleteOverlayUpload(u.id)} title="Delete record"
//                       className="p-1.5 rounded-lg hover:bg-red-100 text-red-400"><Trash2 size={14} /></button>
//                   </div>
//                 </div>
//               );
//             })}
//           </div>
//         </div>
//       )}

//       {/* ── Reject Note Modal ── */}
//       {rejectTarget && (
//         <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[2000] p-4">
//           <div className="bg-white rounded-2xl p-6 max-w-md w-full shadow-2xl">
//             <h3 className="text-lg font-bold text-gray-800 mb-3">Reject Upload</h3>
//             <textarea
//               rows={3} maxLength={500} value={rejectNote} onChange={e => setRejectNote(e.target.value)}
//               placeholder="Optional reason for rejection…"
//               className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-red-400 outline-none text-sm"
//             />
//             <div className="mt-4 flex gap-3">
//               <button onClick={() => setRejectTarget(null)} className="flex-1 py-2.5 border rounded-xl hover:bg-gray-50">Cancel</button>
//               <button onClick={() => void handleRejectConfirm()} disabled={actionLoading === rejectTarget}
//                 className="flex-1 py-2.5 bg-red-500 text-white rounded-xl font-semibold hover:bg-red-600 disabled:opacity-50">
//                 {actionLoading === rejectTarget ? 'Rejecting…' : 'Reject'}
//               </button>
//             </div>
//           </div>
//         </div>
//       )}

//       {/* ── Preview Modal ── */}
//       <OverlayPreviewModal overlay={previewData} onClose={() => setPreviewData(null)} />
//     </div>
//   );
// }
