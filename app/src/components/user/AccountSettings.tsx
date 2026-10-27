import { useState } from 'react';
import { Check, KeyRound, Loader2, Mail, Trash2, User } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { requestPasswordReset, updateAccountProfile } from '../../services/accountService';
import { AccountError } from '../../services/accountErrors';
import { logError } from '../../utils/logError';
import ChangeEmailModal from '../modals/ChangeEmailModal';
import ChangePasswordModal from '../modals/ChangePasswordModal';
import DeleteAccountModal from '../modals/DeleteAccountModal';

export default function AccountSettings() {
  const { currentUser, setCurrentUser, runBackendTask } = useApp();
  const [editingProfile, setEditingProfile] = useState(false);
  const [userNameValue, setUserNameValue] = useState('');
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileError, setProfileError] = useState('');
  const [profileSaved, setProfileSaved] = useState(false);
  const [resetStatus, setResetStatus] = useState('idle');
  const [resetError, setResetError] = useState('');
  const [showChangeEmail, setShowChangeEmail] = useState(false);
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [showDeleteAccount, setShowDeleteAccount] = useState(false);

  if (!currentUser) return null;

  const handleStartEditProfile = () => {
    setUserNameValue(currentUser.userName || '');
    setEditingProfile(true);
    setProfileError('');
    setProfileSaved(false);
  };

  const handleSaveProfile = async () => {
    setProfileError('');
    setProfileSaving(true);
    try {
      const clean = await runBackendTask('Saving profile...', () => updateAccountProfile({ userName: userNameValue }));
      setCurrentUser({ ...currentUser, ...clean });
      setEditingProfile(false);
      setProfileSaved(true);
      setTimeout(() => setProfileSaved(false), 3000);
    } catch (err) {
      setProfileError(err instanceof AccountError ? err.message : 'Could not update profile.');
      logError(err, 'AccountSettings-saveProfile');
    } finally {
      setProfileSaving(false);
    }
  };

  const handlePasswordReset = async () => {
    if (!currentUser.email) return;
    setResetStatus('sending');
    setResetError('');
    try {
      await runBackendTask('Sending password reset...', () => requestPasswordReset(currentUser.email));
      setResetStatus('sent');
    } catch (err) {
      setResetStatus('error');
      setResetError(err instanceof AccountError ? err.message : 'Could not send reset email.');
      logError(err, 'AccountSettings-passwordReset');
    }
  };

  return (
    <>
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100">
          <h3 className="text-lg font-bold text-gray-800">Account Settings</h3>
        </div>

        <div className="divide-y divide-gray-50">
          <div className="px-6 py-4">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-3 min-w-0">
                <User size={18} className="shrink-0 text-gray-400 mt-0.5" />
                <div className="min-w-0">
                  <p className="text-xs text-gray-500">Username</p>
                  {editingProfile ? (
                    <div className="flex flex-wrap items-center gap-2 mt-1">
                      <input
                        type="text"
                        aria-label="Username"
                        autoComplete="nickname"
                        value={userNameValue}
                        onChange={e => setUserNameValue(e.target.value)}
                        maxLength={30}
                        placeholder="user-name"
                        className="px-3 py-1.5 rounded-lg border border-gray-200 focus:border-teal-500 outline-none text-sm w-40"
                      />
                      <button
                        onClick={handleSaveProfile}
                        disabled={profileSaving || !userNameValue.trim()}
                        className="px-3 py-1.5 bg-teal-500 text-white rounded-lg text-xs font-semibold hover:bg-teal-600 disabled:opacity-50"
                      >
                        {profileSaving ? <Loader2 size={14} className="animate-spin" /> : 'Save'}
                      </button>
                      <button onClick={() => setEditingProfile(false)} className="text-xs text-gray-400 hover:text-gray-600">Cancel</button>
                    </div>
                  ) : (
                    <p className="text-sm font-medium text-gray-800 truncate">
                      {currentUser.userName ? `@${currentUser.userName}` : 'Not set'}
                      {profileSaved && <span className="ml-2 text-emerald-500 text-xs"><Check size={12} className="inline" /> Saved</span>}
                    </p>
                  )}
                  {profileError && <p className="text-xs text-red-500 mt-1">{profileError}</p>}
                </div>
              </div>
              {!editingProfile && (
                <button onClick={handleStartEditProfile} className="text-xs text-teal-600 hover:text-teal-700 font-medium">Edit</button>
              )}
            </div>
          </div>

          <div className="px-6 py-4">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3 min-w-0">
                <Mail size={18} className="shrink-0 text-gray-400" />
                <div className="min-w-0">
                  <p className="text-xs text-gray-500">Email Address</p>
                  <p className="text-sm font-medium text-gray-800 truncate">{currentUser.email}</p>
                </div>
              </div>
              <button onClick={() => setShowChangeEmail(true)} className="text-xs text-teal-600 hover:text-teal-700 font-medium">
                Change
              </button>
            </div>
          </div>

          <div className="px-6 py-4">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3 min-w-0">
                <KeyRound size={18} className="shrink-0 text-gray-400" />
                <div>
                  <p className="text-xs text-gray-500">Password</p>
                  <p className="text-sm text-gray-600">********</p>
                  {resetStatus === 'sent' && <p className="text-xs text-emerald-600 mt-0.5">Reset email sent. Check your inbox.</p>}
                  {resetStatus === 'error' && <p className="text-xs text-red-500 mt-0.5">{resetError}</p>}
                </div>
              </div>
              <div className="flex flex-wrap justify-end gap-3">
                <button onClick={() => setShowChangePassword(true)} className="text-xs text-teal-600 hover:text-teal-700 font-medium">
                  Change
                </button>
                <button
                  onClick={handlePasswordReset}
                  disabled={resetStatus === 'sending'}
                  className="text-xs text-teal-600 hover:text-teal-700 font-medium disabled:opacity-50"
                >
                  {resetStatus === 'sending' ? 'Sending...' : 'Reset'}
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="px-6 py-5 bg-red-50/50 border-t border-red-100">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <Trash2 size={18} className="shrink-0 text-red-400" />
              <div>
                <p className="text-sm font-semibold text-red-700">Delete Account</p>
                <p className="text-xs text-red-500">Permanently remove your account and associated data.</p>
              </div>
            </div>
            <button
              onClick={() => setShowDeleteAccount(true)}
              className="px-4 py-2 bg-red-100 text-red-700 rounded-xl text-xs font-semibold hover:bg-red-200 transition-colors"
            >
              Delete Account
            </button>
          </div>
        </div>
      </div>

      <ChangeEmailModal open={showChangeEmail} currentEmail={currentUser.email} onClose={() => setShowChangeEmail(false)} />
      <ChangePasswordModal open={showChangePassword} onClose={() => setShowChangePassword(false)} />
      <DeleteAccountModal open={showDeleteAccount} onClose={() => setShowDeleteAccount(false)} />
    </>
  );
}
