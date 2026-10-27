import { useState } from 'react';
import { X, AlertTriangle, Trash2 } from 'lucide-react';
import { deleteOwnAccount } from '../../services/accountService';
import { AccountError, CleanupPartialError } from '../../services/accountErrors';
import { logError } from '../../utils/logError';
import { useApp } from '../../context/AppContext';

export default function DeleteAccountModal({ open, onClose }) {
  const { runBackendTask } = useApp();
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [status, setStatus] = useState('idle');       // idle | deleting | error
  const [errorMsg, setErrorMsg] = useState('');
  const [warning, setWarning] = useState('');

  if (!open) return null;

  const canSubmit = confirmation === 'DELETE' && password.length >= 6 && status !== 'deleting';

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!canSubmit) return;
    setErrorMsg('');
    setWarning('');
    setStatus('deleting');

    try {
      await runBackendTask('Deleting account...', () => deleteOwnAccount(password));
      // Auth state listener will detect the deletion and reset the app.
      // The modal unmounts when the user becomes null.
    } catch (err) {
      setStatus('error');
      if (err instanceof CleanupPartialError) {
        setWarning(err.message);
        // The auth account was NOT deleted if cleanup threw.
        setErrorMsg('Account deletion was aborted because some data could not be removed. An admin can help.');
      } else {
        setErrorMsg(err instanceof AccountError ? err.message : 'Account deletion failed.');
      }
      logError(err, 'DeleteAccountModal');
    }
  };

  const handleClose = () => {
    setPassword('');
    setConfirmation('');
    setStatus('idle');
    setErrorMsg('');
    setWarning('');
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[2000] p-4">
      <div className="bg-white rounded-2xl p-8 max-w-md w-full shadow-2xl">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold text-red-700 flex items-center gap-2">
            <Trash2 size={22} /> Delete Account
          </h2>
          <button onClick={handleClose} className="text-gray-400 hover:text-gray-600"><X size={24} /></button>
        </div>

        <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-5">
          <div className="flex gap-2">
            <AlertTriangle size={20} className="text-red-500 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-red-700 space-y-1">
              <p className="font-semibold">This action is permanent and cannot be undone.</p>
              <ul className="list-disc ml-4 text-xs space-y-0.5">
                <li>Your profile and account will be deleted</li>
                <li>Your RSVPs will be removed</li>
                <li>Your uploaded documents will be deleted</li>
                <li>Your forum posts will be anonymized</li>
              </ul>
            </div>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Current password</label>
            <input type="password" name="currentPassword" autoComplete="current-password" required minLength={6} value={password} onChange={e => setPassword(e.target.value)}
              className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-red-400 outline-none"
              placeholder="••••••••" />
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">
              Type <span className="font-mono font-bold text-red-600">DELETE</span> to confirm
            </label>
            <input type="text" required value={confirmation} onChange={e => setConfirmation(e.target.value)}
              className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-red-400 outline-none font-mono"
              placeholder="DELETE" autoComplete="off" />
          </div>

          {warning && <p className="text-amber-600 text-sm bg-amber-50 px-4 py-2 rounded-lg">{warning}</p>}
          {errorMsg && <p className="text-red-500 text-sm bg-red-50 px-4 py-2 rounded-lg">{errorMsg}</p>}

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={handleClose} className="flex-1 py-3 border border-gray-200 rounded-xl hover:bg-gray-50">
              Cancel
            </button>
            <button type="submit" disabled={!canSubmit}
              className="flex-1 bg-red-600 text-white py-3 rounded-xl font-semibold hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed">
              {status === 'deleting' ? 'Deleting…' : 'Permanently Delete'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
