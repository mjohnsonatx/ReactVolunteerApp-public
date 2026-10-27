import { useState } from 'react';
import { X, Mail, AlertTriangle } from 'lucide-react';
import { requestEmailChange } from '../../services/accountService';
import { AccountError } from '../../services/accountErrors';
import { logError } from '../../utils/logError';
import { useApp } from '../../context/AppContext';

export default function ChangeEmailModal({ open, currentEmail, onClose }) {
  const { runBackendTask } = useApp();
  const [newEmail, setNewEmail] = useState('');
  const [password, setPassword] = useState('');
  const [status, setStatus] = useState('idle');       // idle | submitting | success | error
  const [errorMsg, setErrorMsg] = useState('');

  if (!open) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg('');
    setStatus('submitting');
    try {
      await runBackendTask('Sending email verification...', () => requestEmailChange(newEmail.trim(), password));
      setStatus('success');
    } catch (err) {
      setStatus('error');
      setErrorMsg(err instanceof AccountError ? err.message : 'Could not change email.');
      logError(err, 'ChangeEmailModal', { newEmail: newEmail.trim() });
    }
  };

  const handleClose = () => {
    setNewEmail('');
    setPassword('');
    setStatus('idle');
    setErrorMsg('');
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[2000] p-4">
      <div className="bg-white rounded-2xl p-8 max-w-md w-full shadow-2xl">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-bold text-gray-800">Change Email</h2>
          <button onClick={handleClose} className="text-gray-400 hover:text-gray-600"><X size={24} /></button>
        </div>

        {status === 'success' ? (
          <div className="text-center py-4">
            <Mail size={40} className="mx-auto text-teal-500 mb-3" />
            <h3 className="text-lg font-bold text-gray-800 mb-2">Verification Email Sent</h3>
            <p className="text-sm text-gray-600 mb-1">
              We sent a verification link to <strong>{newEmail.trim()}</strong>.
            </p>
            <p className="text-sm text-gray-500 mb-6">
              Click the link in that email to complete the change. Until then, keep using <strong>{currentEmail}</strong> to sign in.
            </p>
            <button onClick={handleClose} className="w-full py-3 bg-teal-500 text-white rounded-xl font-semibold hover:bg-teal-600">
              Done
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Current email</label>
              <p className="text-sm font-medium text-gray-700 bg-gray-50 px-4 py-3 rounded-xl">{currentEmail}</p>
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">New email address</label>
              <input type="email" name="newEmail" autoComplete="email" required value={newEmail} onChange={e => setNewEmail(e.target.value)}
                className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-teal-500 outline-none"
                placeholder="new@example.com" />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Current password (to confirm identity)</label>
              <input type="password" name="currentPassword" autoComplete="current-password" required minLength={6} value={password} onChange={e => setPassword(e.target.value)}
                className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-teal-500 outline-none"
                placeholder="••••••••" />
            </div>

            <div className="bg-amber-50 rounded-xl p-3 flex gap-2 text-xs text-amber-700">
              <AlertTriangle size={16} className="flex-shrink-0 mt-0.5" />
              <p>You'll receive a verification link at the new address. Your email won't change until you click it.</p>
            </div>

            {errorMsg && <p className="text-red-500 text-sm bg-red-50 px-4 py-2 rounded-lg">{errorMsg}</p>}

            <div className="flex gap-3 pt-2">
              <button type="button" onClick={handleClose} className="flex-1 py-3 border border-gray-200 rounded-xl hover:bg-gray-50">Cancel</button>
              <button type="submit" disabled={status === 'submitting'}
                className="flex-1 bg-teal-500 text-white py-3 rounded-xl font-semibold hover:bg-teal-600 disabled:opacity-50">
                {status === 'submitting' ? 'Sending…' : 'Send Verification'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
