// components/modals/ImportOverlayModal.jsx
import { X, Upload } from 'lucide-react';
import { useApp } from '@runtime/app-context';

export default function ImportOverlayModal() {
  const {
    importJson, setImportJson, setShowImportModal, setImportError,
    handleImportOverlay, importName, setImportName,
    importColor, setImportColor, importDesc, setImportDesc,
    importError, handleImportFile,
  } = useApp();

  let preview = null;
  try {
    const parsed = JSON.parse(importJson);
    if (parsed?.type === 'FeatureCollection' && parsed.features) {
      preview = {
        count: parsed.features.length,
        items: parsed.features.slice(0, 10).map(f => ({
          type: f.properties?.type || f.geometry?.type || '?',
          title: f.properties?.legendTitle || f.properties?.id || 'Unnamed',
          stroke: f.properties?.stroke || '#999',
        })),
      };
    }
  } catch { preview = null; }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[2000] p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl p-8 max-w-2xl w-full shadow-2xl my-8">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold text-gray-800">Import GeoJSON Overlay</h2>
          <button onClick={() => { setShowImportModal(false); setImportError(''); }} className="text-gray-400 hover:text-gray-600"><X size={24} /></button>
        </div>
        <form onSubmit={handleImportOverlay} className="space-y-4">
          <div className="grid grid-cols-4 gap-4">
            <div className="col-span-3">
              <label className="text-xs text-gray-500 mb-1 block">Group Name *</label>
              <input type="text" required maxLength={60} value={importName} onChange={e => setImportName(e.target.value)}
                className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-teal-500 outline-none" placeholder="e.g. Trail System" />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Color</label>
              <div className="flex items-center gap-2">
                <input type="color" value={importColor} onChange={e => setImportColor(e.target.value)} className="w-10 h-10 rounded-lg border border-gray-200 cursor-pointer" />
                <input type="text" value={importColor} onChange={e => setImportColor(e.target.value)} className="w-full px-2 py-3 rounded-xl border border-gray-200 focus:border-teal-500 outline-none text-xs font-mono" />
              </div>
            </div>
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Description</label>
            <input type="text" maxLength={200} value={importDesc} onChange={e => setImportDesc(e.target.value)}
              className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-teal-500 outline-none" placeholder="Optional description" />
          </div>
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs text-gray-500">GeoJSON Data *</label>
              <label className="text-xs text-teal-600 hover:text-teal-700 cursor-pointer font-medium flex items-center gap-1">
                <Upload size={12} /> Upload .geojson
                <input type="file" accept=".json,.geojson" onChange={handleImportFile} className="hidden" />
              </label>
            </div>
            <textarea value={importJson} onChange={e => setImportJson(e.target.value)} rows={8}
              className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-teal-500 outline-none font-mono text-xs"
              placeholder='Paste exported GeoJSON here or upload a file...' />
          </div>
          {preview && (
            <div className="bg-emerald-50 rounded-xl p-4">
              <p className="text-sm text-emerald-700 font-semibold">{preview.count} features detected</p>
              <div className="mt-2 space-y-1">
                {preview.items.map((it, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs text-emerald-600">
                    <span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: it.stroke }} />
                    <span className="flex-1 truncate">{it.title}</span>
                    <span className="text-emerald-400">{it.type}</span>
                  </div>
                ))}
                {preview.count > 10 && <p className="text-xs text-emerald-400 mt-1">and {preview.count - 10} more…</p>}
              </div>
            </div>
          )}
          {importError && <p className="text-red-500 text-sm bg-red-50 px-4 py-2 rounded-lg">{importError}</p>}
          <div className="flex gap-3">
            <button type="button" onClick={() => { setShowImportModal(false); setImportError(''); }} className="flex-1 py-3 border border-gray-200 rounded-xl hover:bg-gray-50">Cancel</button>
            <button type="submit" className="flex-1 bg-teal-500 text-white py-3 rounded-xl font-semibold hover:bg-teal-600">Import Overlay</button>
          </div>
        </form>
      </div>
    </div>
  );
}
