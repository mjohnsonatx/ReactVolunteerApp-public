import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, X } from 'lucide-react';
import { LIMITS } from '../../utils/sanitize';

const reasons = [
  { value: 'spam', label: 'Spam or scam' },
  { value: 'harassment', label: 'Harassment or abuse' },
  { value: 'unsafe', label: 'Unsafe or illegal content' },
  { value: 'privacy', label: 'Private information' },
  { value: 'other', label: 'Other' },
];

type ReportCommentDialogProps = {
  onClose: () => void;
  onSubmit: (reason: string, details: string) => Promise<void>;
};

// Mirrors the forum report flow: flag icon -> dialog -> callable-backed report.
export default function ReportCommentDialog({ onClose, onSubmit }: ReportCommentDialogProps) {
  const [reason, setReason] = useState('spam');
  const [details, setDetails] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const closeRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => { closeRef.current?.focus(); }, []);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await onSubmit(reason, details);
    } catch (err) {
      setError(err?.message || 'Could not submit the report. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="report-comment-title"
      className="fixed inset-0 z-[2200] flex items-center justify-center bg-black/50 p-4"
      onKeyDown={(event) => { if (event.key === 'Escape') onClose(); }}
    >
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
        <div className="mb-4 flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-red-100 text-red-600">
              <AlertTriangle size={20} aria-hidden="true" />
            </div>
            <div>
              <h2 id="report-comment-title" className="text-xl font-bold text-gray-800">Report comment</h2>
              <p className="text-sm text-gray-500">This goes to the site administrator.</p>
            </div>
          </div>
          <button ref={closeRef} type="button" onClick={onClose} aria-label="Close report dialog" className="text-gray-400 hover:text-gray-600">
            <X size={22} aria-hidden="true" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <label className="block">
            <span className="text-sm font-medium text-gray-700">Reason</span>
            <select
              value={reason}
              onChange={event => setReason(event.target.value)}
              className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 outline-none focus:border-red-400"
            >
              {reasons.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}
            </select>
          </label>

          <label className="block">
            <span className="text-sm font-medium text-gray-700">What should we know?</span>
            <textarea
              required
              rows={4}
              maxLength={LIMITS.reportDetails}
              value={details}
              onChange={event => setDetails(event.target.value)}
              className="mt-1 w-full resize-none rounded-lg border border-gray-200 px-3 py-2 outline-none focus:border-red-400"
              placeholder="Add a short note for the administrator."
            />
          </label>

          {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}

          <div className="flex gap-3">
            <button type="button" onClick={onClose} className="flex-1 rounded-lg border border-gray-200 py-2 hover:bg-gray-50">
              Cancel
            </button>
            <button type="submit" disabled={submitting} className="flex-1 rounded-lg bg-red-500 py-2 font-medium text-white hover:bg-red-600 disabled:opacity-60">
              {submitting ? 'Submitting...' : 'Submit Report'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
