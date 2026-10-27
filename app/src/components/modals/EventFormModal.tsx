// components/modals/EventFormModal.jsx
import { X } from 'lucide-react';
import { useApp } from '@runtime/app-context';
import MapView from '../Map';
import AdminEventImages from '../admin/AdminEventImages';

export default function EventFormModal() {
  const {
    editingEventId, setShowEventModal, saveEvent,
    eventForm, setEventForm, eventError, setEventError,
    eventNotice, setEventNotice, events,
    overlayGroups, effectiveVisibleIds,
  } = useApp();

  const editingEvent = editingEventId ? events.find(item => item.id === editingEventId) : null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[2000] p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl p-8 max-w-2xl w-full shadow-2xl my-8">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold text-gray-800">{editingEventId ? 'Edit Event' : 'New Event'}</h2>
          <button onClick={() => setShowEventModal(false)} className="text-gray-400 hover:text-gray-600"><X size={24} /></button>
        </div>
        <form onSubmit={saveEvent} className="space-y-4">
          <input type="text" placeholder="Title" required value={eventForm.title} onChange={e => setEventForm({ ...eventForm, title: e.target.value })} className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-teal-500 outline-none" />
          <div className="grid grid-cols-2 gap-4">
            <input type="date" required value={eventForm.date} onChange={e => setEventForm({ ...eventForm, date: e.target.value })} className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-teal-500 outline-none" />
            <input type="text" placeholder="Time (e.g. 9:00 AM)" required value={eventForm.time} onChange={e => setEventForm({ ...eventForm, time: e.target.value })} className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-teal-500 outline-none" />
          </div>
          <input type="text" placeholder="Location" required value={eventForm.location} onChange={e => setEventForm({ ...eventForm, location: e.target.value })} className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-teal-500 outline-none" />
          <textarea placeholder="Description" value={eventForm.description} onChange={e => setEventForm({ ...eventForm, description: e.target.value })} rows={2} className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-teal-500 outline-none" />
          <div>
            <p className="text-xs text-gray-500 mb-1">Click the map to pin the event location</p>
            <MapView center={eventForm.lat ? [eventForm.lat, eventForm.lng] : [30.244, -97.712]} zoom={eventForm.lat ? 15 : 13} height="200px"
              pickMode={true} onPick={(latlng) => setEventForm({ ...eventForm, lat: latlng.lat, lng: latlng.lng })}
              pickedLocation={eventForm.lat ? { lat: eventForm.lat, lng: eventForm.lng } : null}
              overlayGroups={overlayGroups} visibleGroupIds={effectiveVisibleIds} />
            {eventForm.lat && (
              <p className="text-xs text-teal-600 mt-1 flex items-center gap-2">
                Pinned: {eventForm.lat.toFixed(5)}, {eventForm.lng.toFixed(5)}
                <button type="button" onClick={() => setEventForm({ ...eventForm, lat: null, lng: null })} className="text-red-400 hover:text-red-600">Clear</button>
              </p>
            )}
          </div>
          {eventError && <p role="alert" className="text-red-500 text-sm bg-red-50 px-4 py-2 rounded-lg">{eventError}</p>}
          {eventNotice && <p className="text-emerald-700 text-sm bg-emerald-50 px-4 py-2 rounded-lg">{eventNotice}</p>}
          <div className="flex gap-3">
            <button type="button" onClick={() => { setShowEventModal(false); setEventError(''); setEventNotice(''); }} className="flex-1 py-3 border border-gray-200 rounded-xl hover:bg-gray-50">Close</button>
            <button type="submit" className="flex-1 bg-teal-500 text-white py-3 rounded-xl font-semibold hover:bg-teal-600">Save Event</button>
          </div>
        </form>

        {editingEvent
          ? <AdminEventImages event={editingEvent} />
          : (
            <p className="mt-4 rounded-xl border border-dashed border-gray-200 px-4 py-3 text-sm text-gray-500">
              Save the event first, then add photos and captions here.
            </p>
          )}
      </div>
    </div>
  );
}
