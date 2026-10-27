// components/admin/AdminMailing.tsx
import { useState } from 'react';
import { Download, Loader2, Mail, X } from 'lucide-react';
import { useApp } from '@runtime/app-context';
import { exportMailingListCsv } from '../../services/mailingListExport';
import AdminEmailSettings from './AdminEmailSettings';

function formatDate(value: any): string {
  const date = value?.toDate ? value.toDate() : value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime()) ? date.toLocaleDateString() : 'Unknown';
}

export default function AdminMailing() {
  const { mailingList, removeMail, isAdmin } = useApp();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  if (!isAdmin) return null;

  const handleExport = async () => {
    setBusy(true);
    setError('');
    setSuccess('');
    try {
      const result = await exportMailingListCsv();
      setSuccess(`Exported ${result.count} subscriber${result.count === 1 ? '' : 's'} to ${result.filename}.`);
    } catch (err) {
      setError(err?.message || 'Could not export the mailing list.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <AdminEmailSettings />
      <div className="overflow-hidden rounded-2xl bg-white shadow-lg">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b px-6 py-4">
          <div className="flex items-center gap-3">
            <Mail className="text-emerald-600" aria-hidden="true" />
            <h2 className="text-xl font-bold text-gray-800">Mailing List ({mailingList.length})</h2>
          </div>
          <button
            type="button"
            onClick={handleExport}
            disabled={busy || mailingList.length === 0}
            className="flex items-center gap-2 rounded-lg bg-emerald-500 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-600 disabled:opacity-50"
          >
            {busy ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : <Download size={16} aria-hidden="true" />}
            {busy ? 'Preparing CSV...' : 'Export CSV'}
          </button>
        </div>

        <div className="px-6 pt-4">
          <p className="sr-only" role="status" aria-live="polite">{success || error}</p>
          {success && <p className="rounded-lg bg-emerald-50 px-4 py-2 text-sm text-emerald-700">{success}</p>}
          {error && <p role="alert" className="rounded-lg bg-red-50 px-4 py-2 text-sm text-red-600">{error}</p>}
        </div>

        {mailingList.length === 0 ? (
          <p className="px-6 py-10 text-center text-gray-400">
            No subscribers yet. Once neighbors sign up from the home page they will show up here and in the CSV export.
          </p>
        ) : (
          <div className="p-6">
            <table className="w-full text-left text-sm">
              <caption className="sr-only">Mailing list subscribers</caption>
              <thead>
                <tr className="text-xs uppercase tracking-wide text-gray-400">
                  <th scope="col" className="pb-2">Email</th>
                  <th scope="col" className="pb-2">Subscribed</th>
                  <th scope="col" className="pb-2">Status</th>
                  <th scope="col" className="pb-2"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {mailingList.map(item => (
                  <tr key={item.id} className="border-t border-gray-100">
                    <td className="py-2 text-gray-700">{item.email}</td>
                    <td className="py-2 text-gray-500">{formatDate(item.addedAt)}</td>
                    <td className="py-2 text-gray-500">{item.status || (item.unsubscribedAt ? 'unsubscribed' : 'subscribed')}</td>
                    <td className="py-2 text-right">
                      <button
                        type="button"
                        onClick={() => removeMail(item)}
                        aria-label={`Remove ${item.email}`}
                        className="rounded-full p-1 text-gray-400 hover:bg-red-50 hover:text-red-600"
                      >
                        <X size={14} aria-hidden="true" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
