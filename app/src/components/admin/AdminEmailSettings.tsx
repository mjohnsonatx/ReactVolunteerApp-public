// components/admin/AdminEmailSettings.tsx
import { useEffect, useState } from 'react';
import { CheckCircle2, Loader2, Send, Settings2, XCircle } from 'lucide-react';
import { useApp } from '@runtime/app-context';
import {
  loadEmailDeliverySettings,
  saveEmailDeliverySettings,
  sendTestEmail,
  type EmailDeliverySettings,
} from '../../services/emailDelivery';
import { callableErrorMessage } from '../../libs/callables';
import { DIGEST_TIME_LABEL } from '@watershed/shared';

function formatRun(value: string | null): string {
  if (!value) return 'Never';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Never' : date.toLocaleString();
}

// The sender address and on/off switch are editable here. The Brevo SMTP key
// lives in Secret Manager, so it never passes through the browser or Firestore.
export default function AdminEmailSettings() {
  const { isAdmin } = useApp();
  const [settings, setSettings] = useState<EmailDeliverySettings | null>(null);
  const [form, setForm] = useState({ senderAddress: '', senderName: '', digestEnabled: false });
  const [busy, setBusy] = useState<'' | 'save' | 'test'>('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isAdmin) return;
    let active = true;
    loadEmailDeliverySettings()
      .then(result => {
        if (!active) return;
        setSettings(result);
        setForm({ senderAddress: result.senderAddress, senderName: result.senderName, digestEnabled: result.digestEnabled });
      })
      .catch(err => { if (active) setError(callableErrorMessage(err, 'Could not load email settings.')); });
    return () => { active = false; };
  }, [isAdmin]);

  if (!isAdmin) return null;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy('save');
    setMessage('');
    setError('');
    try {
      const saved = await saveEmailDeliverySettings(form);
      setForm(saved);
      setSettings(current => (current ? { ...current, ...saved } : current));
      setMessage('Email settings saved.');
    } catch (err) {
      setError(callableErrorMessage(err, 'Could not save email settings.'));
    } finally {
      setBusy('');
    }
  };

  const handleTest = async () => {
    setBusy('test');
    setMessage('');
    setError('');
    try {
      const to = await sendTestEmail();
      setMessage(`Test email sent to ${to}. Check that inbox (and spam).`);
    } catch (err) {
      setError(callableErrorMessage(err, 'The test email could not be sent.'));
    } finally {
      setBusy('');
    }
  };

  const unsaved = !!settings && (form.senderAddress !== settings.senderAddress
    || form.senderName !== settings.senderName || form.digestEnabled !== settings.digestEnabled);

  return (
    <div className="overflow-hidden rounded-2xl bg-white shadow-lg">
      <div className="flex items-center gap-3 border-b px-6 py-4">
        <Settings2 className="text-teal-600" aria-hidden="true" />
        <div>
          <h2 className="text-xl font-bold text-gray-800">Daily digest email</h2>
          <p className="text-sm text-gray-500">Members who opt in get one email at {DIGEST_TIME_LABEL} on days with new activity.</p>
        </div>
      </div>

      <form onSubmit={handleSave} className="space-y-4 px-6 py-5">
        <p className="sr-only" role="status" aria-live="polite">{message || error}</p>
        {message && <p className="rounded-lg bg-emerald-50 px-4 py-2 text-sm text-emerald-700">{message}</p>}
        {error && <p role="alert" className="rounded-lg bg-red-50 px-4 py-2 text-sm text-red-600">{error}</p>}

        {!settings && !error ? (
          <p className="text-sm text-gray-500"><Loader2 size={14} className="inline animate-spin" aria-hidden="true" /> Loading…</p>
        ) : (
          <>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block text-sm">
                <span className="font-medium text-gray-700">Verified sender address</span>
                <input
                  type="email"
                  value={form.senderAddress}
                  onChange={e => setForm({ ...form, senderAddress: e.target.value })}
                  placeholder="no-reply@tillerystreetvolunteers.org"
                  autoComplete="off"
                  className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 outline-none focus:border-teal-500"
                />
                <span className="mt-1 block text-xs text-gray-500">Use a sender on the domain authenticated in Brevo.</span>
              </label>
              <label className="block text-sm">
                <span className="font-medium text-gray-700">Sender name</span>
                <input
                  type="text"
                  value={form.senderName}
                  maxLength={60}
                  onChange={e => setForm({ ...form, senderName: e.target.value })}
                  placeholder="WatershedCrew"
                  className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 outline-none focus:border-teal-500"
                />
              </label>
            </div>

            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={form.digestEnabled}
                onChange={e => setForm({ ...form, digestEnabled: e.target.checked })}
                className="h-4 w-4 accent-teal-600"
              />
              Send the daily digest
            </label>

            <div className="rounded-lg bg-gray-50 px-4 py-3 text-sm">
              <p className="flex items-center gap-2">
                {settings?.smtpConfigured
                  ? <><CheckCircle2 size={16} className="text-emerald-600" aria-hidden="true" /> Brevo SMTP is configured.</>
                  : <><XCircle size={16} className="text-red-500" aria-hidden="true" /> Brevo SMTP is not configured yet.</>}
              </p>
              <p className="mt-1 text-xs text-gray-500">
                For security the SMTP key is stored in Google Secret Manager, not here. Follow docs/NOTIFICATIONS.md to set or replace it.
              </p>
              <p className="mt-2 text-xs text-gray-500">
                Last digest: {formatRun(settings?.lastDigestRunAt ?? null)}
                {settings?.lastDigestStatus ? ` · ${settings.lastDigestStatus}` : ''}
                {settings?.lastDigestRunAt ? ` · ${settings.lastDigestSent} sent${settings.lastDigestFailed ? `, ${settings.lastDigestFailed} failed` : ''}` : ''}
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <button
                type="submit"
                disabled={!!busy || !unsaved}
                className="flex items-center gap-2 rounded-lg bg-teal-500 px-4 py-2 text-sm font-medium text-white hover:bg-teal-600 disabled:opacity-50"
              >
                {busy === 'save' && <Loader2 size={16} className="animate-spin" aria-hidden="true" />}
                Save settings
              </button>
              <button
                type="button"
                onClick={handleTest}
                disabled={!!busy || unsaved || !settings?.senderAddress || !settings?.smtpConfigured}
                className="flex items-center gap-2 rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                {busy === 'test' ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : <Send size={16} aria-hidden="true" />}
                Send me a test email
              </button>
            </div>
          </>
        )}
      </form>
    </div>
  );
}
