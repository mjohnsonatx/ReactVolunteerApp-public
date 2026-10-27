// components/modals/EventMapModal.jsx
import { X, MapPin } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import MapView from '../Map';
import OverlayPanel from '../OverlayPanel';

export default function EventMapModal() {
  const { selectedEventMap, setSelectedEventMap, overlayGroups, effectiveVisibleIds, toggleOverlayGroup, publishedOverlayGroups } = useApp();
  if (!selectedEventMap) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[2000] p-4">
      <div className="bg-white rounded-2xl p-6 max-w-4xl w-full shadow-2xl">
        <div className="flex justify-between items-center mb-4">
          <div>
            <h2 className="text-2xl font-bold text-gray-800">{selectedEventMap.title}</h2>
            <p className="text-gray-500 flex items-center gap-1"><MapPin size={14} />{selectedEventMap.location}</p>
          </div>
          <button onClick={() => setSelectedEventMap(null)} className="text-gray-400 hover:text-gray-600"><X size={24} /></button>
        </div>
        {selectedEventMap.lat ? (
          <div className="relative">
            <MapView center={[selectedEventMap.lat, selectedEventMap.lng]} zoom={15} height="400px"
              markers={[{ lat: selectedEventMap.lat, lng: selectedEventMap.lng, label: selectedEventMap.title, color: '#0f766e' }]}
              overlayGroups={overlayGroups} visibleGroupIds={effectiveVisibleIds} />
            <OverlayPanel groups={publishedOverlayGroups} visibleIds={effectiveVisibleIds} onToggle={toggleOverlayGroup} />
          </div>
        ) : (
          <div className="flex items-center justify-center h-40 bg-gray-50 rounded-xl text-gray-400 text-sm">No location set for this event.</div>
        )}
      </div>
    </div>
  );
}