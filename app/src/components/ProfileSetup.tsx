import { useState, type FormEvent } from 'react';
import { useApp } from '../context/AppContext';
import { completeAccountProfile } from '../services/accountService';
import { callableErrorMessage } from '../libs/callables';
import { logError } from '../utils/logError';
import { userNameFromEmail } from '@watershed/shared';
import ForumPostContent from './shared/ForumPostContent';

export default function ProfileSetup() {
  const { currentUser, refreshUserProfile, handleSignOut } = useApp();
  const userName = currentUser?.userName || userNameFromEmail(currentUser?.email);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true); setError('');
    try {
      await completeAccountProfile();
      await refreshUserProfile();
    } catch (cause) {
      setError(callableErrorMessage(cause, cause instanceof Error ? cause.message : 'Could not complete your profile. Please try again.'));
      logError(cause, 'ProfileSetup-saveProfile');
    } finally { setBusy(false); }
  };

  return (
    <main className="public-site-theme min-h-screen bg-gray-100 px-4 py-10">
      <div className="mx-auto max-w-xl rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-bold text-gray-800">Complete your public profile</h1>
        <p className="mt-3 text-gray-600">Your email is verified. Your public username will be created from the part of your email before @. Your full email is not shown on forum posts.</p>
        <form onSubmit={save} className="mt-6 space-y-4">
          <p className="text-xs text-gray-500">A suffix is added if this username is taken. You can change your username later in account settings.</p>
          <section aria-label="Public profile preview" className="rounded-xl border border-teal-200 bg-teal-50/30 p-4">
            <p className="mb-3 text-sm font-semibold text-teal-700">How you will appear — example only</p>
            <ForumPostContent post={{
              title: 'See you at the next cleanup!', content: 'This is a preview, not a published post.', date: 'Preview',
              author: '', authorUserName: userName || 'your-username',
            }} />
          </section>
          {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
          <button type="submit" disabled={busy} className="w-full rounded-xl bg-teal-600 p-3 font-semibold text-white disabled:opacity-50">{busy ? 'Saving profile…' : 'Save profile and continue'}</button>
          <button type="button" disabled={busy} onClick={handleSignOut} className="w-full p-2 text-sm text-gray-600">Sign out</button>
        </form>
      </div>
    </main>
  );
}
