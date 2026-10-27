import { AlertTriangle, X } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { LIMITS } from '../../utils/sanitize';

const reasons = [
  { value: 'spam', label: 'Spam or scam' },
  { value: 'harassment', label: 'Harassment or abuse' },
  { value: 'unsafe', label: 'Unsafe or illegal content' },
  { value: 'privacy', label: 'Private information' },
  { value: 'other', label: 'Other' },
];

export default function ReportContentModal() {
  const {
    reportTarget,
    reportForm,
    setReportForm,
    reportError,
    closeReportDialog,
    submitReport,
  } = useApp();

  if (!reportTarget) return null;

  const label = reportTarget.type === 'reply' ? 'reply' : 'post';

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="report-content-title" className="fixed inset-0 bg-black/50 z-[2200] flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl p-6 max-w-md w-full shadow-2xl">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-red-100 text-red-600 flex items-center justify-center">
              <AlertTriangle size={20} />
            </div>
            <div>
              <h2 id="report-content-title" className="text-xl font-bold text-gray-800">Report {label}</h2>
              <p className="text-sm text-gray-500">This goes to the site administrator.</p>
            </div>
          </div>
          <button onClick={closeReportDialog} className="text-gray-400 hover:text-gray-600">
            <X size={22} />
          </button>
        </div>

        <form onSubmit={submitReport} className="space-y-4">
          <label className="block">
            <span className="text-sm font-medium text-gray-700">Reason</span>
            <select
              value={reportForm.reason}
              onChange={e => setReportForm({ ...reportForm, reason: e.target.value })}
              className="mt-1 w-full px-3 py-2 border border-gray-200 rounded-lg focus:border-red-400 outline-none bg-white"
            >
              {reasons.map(reason => <option key={reason.value} value={reason.value}>{reason.label}</option>)}
            </select>
          </label>

          <label className="block">
            <span className="text-sm font-medium text-gray-700">What should we know?</span>
            <textarea
              required
              maxLength={LIMITS.comment}
              rows={4}
              value={reportForm.details}
              onChange={e => setReportForm({ ...reportForm, details: e.target.value })}
              className="mt-1 w-full px-3 py-2 border border-gray-200 rounded-lg focus:border-red-400 outline-none resize-none"
              placeholder="Add a short note for the administrator."
            />
          </label>

          {reportError && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{reportError}</p>}

          <div className="flex gap-3">
            <button type="button" onClick={closeReportDialog} className="flex-1 py-2 border border-gray-200 rounded-lg hover:bg-gray-50">
              Cancel
            </button>
            <button type="submit" className="flex-1 py-2 bg-red-500 text-white rounded-lg font-medium hover:bg-red-600">
              Submit Report
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
