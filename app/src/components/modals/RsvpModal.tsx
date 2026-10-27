// components/modals/RsvpModal.jsx
import { X } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { LIMITS } from '../../utils/sanitize';

export default function RsvpModal() {
  const { setShowRsvpModal, handleRsvpSubmit, rsvpForm, setRsvpForm, rsvpError } = useApp();

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="rsvp-modal-title" className="fixed inset-0 bg-black/50 flex items-center justify-center z-[2000] p-4">
      <div className="bg-white rounded-2xl p-8 max-w-md w-full shadow-2xl">
        <div className="flex justify-between items-center mb-6">
          <h2 id="rsvp-modal-title" className="text-2xl font-bold text-gray-800">RSVP</h2>
          <button onClick={() => setShowRsvpModal(false)} className="text-gray-400 hover:text-gray-600"><X size={24} /></button>
        </div>
        <form onSubmit={handleRsvpSubmit} className="space-y-4">
          <input type="text" placeholder="Name" required value={rsvpForm.name} onChange={e => setRsvpForm({ ...rsvpForm, name: e.target.value })} className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-teal-500 outline-none" />
          <input type="email" placeholder="Email" required value={rsvpForm.email} onChange={e => setRsvpForm({ ...rsvpForm, email: e.target.value })} className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-teal-500 outline-none" />
          <textarea placeholder="Comments (optional)" maxLength={LIMITS.comment} value={rsvpForm.comments} onChange={e => setRsvpForm({ ...rsvpForm, comments: e.target.value })} rows={2} className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-teal-500 outline-none" />
          {rsvpError && <p className="text-red-500 text-sm bg-red-50 px-4 py-2 rounded-lg">{rsvpError}</p>}
          <button type="submit" className="w-full bg-teal-500 text-white py-3 rounded-xl font-semibold hover:bg-teal-600">Confirm RSVP</button>
        </form>
      </div>
    </div>
  );
}
