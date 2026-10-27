import { useState } from 'react';
import { X, KeyRound } from 'lucide-react';
import { changePassword } from '../../services/accountService';
import { AccountError } from '../../services/accountErrors';
import { logError } from '../../utils/logError';
import { useApp } from '../../context/AppContext';
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from '../../auth/passwordPolicy';

export default function ChangePasswordModal({ open, onClose }) {
  const { runBackendTask } = useApp();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [status, setStatus] = useState('idle');
  const [errorMsg, setErrorMsg] = useState('');

  if (!open) return null;

  const reset = () => {
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setStatus('idle');
    setErrorMsg('');
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg('');

    if (newPassword !== confirmPassword) {
      setErrorMsg('Passwords do not match.');
      return;
    }

    setStatus('submitting');
    try {
      await runBackendTask('Changing password...', () => changePassword(currentPassword, newPassword));
      setStatus('success');
    } catch (err) {
      setStatus('error');
      setErrorMsg(err instanceof AccountError ? err.message : 'Could not change password.');
      logError(err, 'ChangePasswordModal');
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[2000] p-4">
      <div className="bg-white rounded-2xl p-8 max-w-md w-full shadow-2xl">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-bold text-gray-800">Change Password</h2>
          <button onClick={handleClose} className="text-gray-400 hover:text-gray-600"><X size={24} /></button>
        </div>

        {status === 'success' ? (
          <div className="text-center py-4">
            <KeyRound size={40} className="mx-auto text-teal-500 mb-3" />
            <h3 className="text-lg font-bold text-gray-800 mb-2">Password Updated</h3>
            <p className="text-sm text-gray-500 mb-6">Use your new password the next time you sign in.</p>
            <button onClick={handleClose} className="w-full py-3 bg-teal-500 text-white rounded-xl font-semibold hover:bg-teal-600">
              Done
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Current password</label>
              <input type="password" name="currentPassword" autoComplete="current-password" required minLength={6} value={currentPassword} onChange={e => setCurrentPassword(e.target.value)}
                className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-teal-500 outline-none" />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">New password</label>
              <input type="password" name="newPassword" autoComplete="new-password" required minLength={PASSWORD_MIN_LENGTH} maxLength={PASSWORD_MAX_LENGTH} value={newPassword} onChange={e => setNewPassword(e.target.value)}
                className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-teal-500 outline-none" />
              <p className="mt-1 text-xs text-gray-500">Use {PASSWORD_MIN_LENGTH}–{PASSWORD_MAX_LENGTH} characters.</p>
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Confirm new password</label>
              <input type="password" name="confirmPassword" autoComplete="new-password" required minLength={PASSWORD_MIN_LENGTH} maxLength={PASSWORD_MAX_LENGTH} value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)}
                className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-teal-500 outline-none" />
            </div>

            {errorMsg && <p className="text-red-500 text-sm bg-red-50 px-4 py-2 rounded-lg">{errorMsg}</p>}

            <div className="flex gap-3 pt-2">
              <button type="button" onClick={handleClose} className="flex-1 py-3 border border-gray-200 rounded-xl hover:bg-gray-50">Cancel</button>
              <button type="submit" disabled={status === 'submitting'}
                className="flex-1 bg-teal-500 text-white py-3 rounded-xl font-semibold hover:bg-teal-600 disabled:opacity-50">
                {status === 'submitting' ? 'Saving...' : 'Save Password'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
