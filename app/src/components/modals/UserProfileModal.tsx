// components/modals/UserProfileModal.jsx
import { useEffect, useState } from 'react';
import { Shield, Trash2, User, X } from 'lucide-react';
import { logError } from '../../utils/logError';
import { useApp } from '@runtime/app-context';

export default function UserProfileModal() {
  const {
    adminProfileUser,
    setAdminProfileUser,
    getAllUserComments,
    allUserDocs,
    adminRsvps,
    events,
    setViewingDoc,
    toggleUserModeration,
    deletePost,
    deleteReply,
    adminSendPasswordReset,
    adminDeleteUserData,
    adminAnonymizeForumPosts,
  } = useApp();

  const [u, setLocal] = useState(adminProfileUser);
  const [resetStatus, setResetStatus] = useState('idle');
  const [anonymizeStatus, setAnonymizeStatus] = useState('idle');
  const [anonymizeMessage, setAnonymizeMessage] = useState('');
  const [deleteStatus, setDeleteStatus] = useState('idle');
  const [deleteError, setDeleteError] = useState('');

  useEffect(() => {
    setLocal(adminProfileUser);
    setResetStatus('idle');
    setAnonymizeStatus('idle');
    setAnonymizeMessage('');
    setDeleteStatus('idle');
    setDeleteError('');
  }, [adminProfileUser]);

  if (!u) return null;

  const updateLocal = (patch) => {
    const next = { ...u, ...patch };
    setLocal(next);
    setAdminProfileUser(next);
  };

  const userComments = u.uid ? getAllUserComments(u.uid) : [];
  const userOwnedDocs = allUserDocs.filter(
    d => (u.uid && d.userId === u.uid) || d.userEmail?.toLowerCase() === u.email?.toLowerCase()
  );
  const userRsvps = adminRsvps.filter(
    r => (u.uid && r.userId === u.uid) || r.email?.toLowerCase() === u.email?.toLowerCase()
  );

  const sendPasswordReset = async () => {
    setResetStatus('sending');
    try {
      await adminSendPasswordReset(u.email);
      setResetStatus('sent');
    } catch (err) {
      setResetStatus('error');
      logError(err, 'UserProfileModal-passwordReset', { uid: u.uid });
    }
  };

  const anonymizeForumActivity = async () => {
    if (!u.uid) return;
    setAnonymizeStatus('running');
    setAnonymizeMessage('');
    try {
      const changed = await adminAnonymizeForumPosts(u.uid);
      setAnonymizeStatus('done');
      setAnonymizeMessage(`Anonymized ${changed} forum thread${changed === 1 ? '' : 's'}.`);
    } catch (err) {
      setAnonymizeStatus('error');
      setAnonymizeMessage('Could not anonymize forum activity.');
      logError(err, 'UserProfileModal-anonymizeForum', { uid: u.uid });
    }
  };

  const deleteUserData = async () => {
    if (!u.uid) return;
    if (!window.confirm(`Delete profile data for ${u.email}? The Firebase Auth account must still be removed with admin tools.`)) return;

    setDeleteStatus('deleting');
    setDeleteError('');
    try {
      await adminDeleteUserData(u.uid, u.email);
    } catch (err) {
      setDeleteStatus('error');
      setDeleteError(err instanceof Error ? err.message : 'Could not delete user data.');
      logError(err, 'UserProfileModal-deleteUserData', { uid: u.uid });
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-[3000] flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-3xl w-full max-h-[90vh] overflow-auto shadow-2xl">
        <div className="px-6 py-4 border-b flex items-center justify-between sticky top-0 bg-white z-10">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-12 h-12 rounded-full bg-teal-100 flex items-center justify-center text-teal-600">
              <User size={22} />
            </div>
            <div className="min-w-0">
              <h2 className="text-xl font-bold text-gray-800 truncate">{u.userName ? `@${u.userName}` : u.uid ? 'User' : u.name || 'Volunteer'}</h2>
              <p className="text-gray-500 text-sm truncate">
                {u.email}
              </p>
              {u.moderated && (
                <span className="inline-flex items-center gap-1 text-xs bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full mt-1">
                  <Shield size={10} /> Moderated
                </span>
              )}
            </div>
          </div>
          <button onClick={() => setAdminProfileUser(null)} className="text-gray-400 hover:text-gray-600">
            <X size={22} />
          </button>
        </div>

        <div className="p-6 space-y-6">
          <section>
            <h3 className="font-semibold text-gray-800 mb-3">Profile Details</h3>
            <div className="grid md:grid-cols-3 gap-3 text-sm">
              {!u.uid && <div className="border rounded-lg px-3 py-2 bg-gray-50">
                <p className="text-xs text-gray-500">Name</p>
                <p className="font-medium text-gray-800 break-words">{u.name || 'Not set'}</p>
              </div>}
              {u.uid && <div className="border rounded-lg px-3 py-2 bg-gray-50">
                <p className="text-xs text-gray-500">Username</p>
                <p className="font-medium text-gray-800 break-words">{u.userName ? `@${u.userName}` : 'Not set'}</p>
              </div>}
              <div className="border rounded-lg px-3 py-2 bg-gray-50">
                <p className="text-xs text-gray-500">Email</p>
                <p className="font-medium text-gray-800 break-words">{u.email || 'Not set'}</p>
              </div>
              <div className="border rounded-lg px-3 py-2 bg-gray-50">
                <p className="text-xs text-gray-500">Phone</p>
                <p className="font-medium text-gray-800 break-words">{u.phone || 'Not set'}</p>
              </div>
            </div>
          </section>

          {u.uid ? (
            <section className={`rounded-xl p-4 ${u.moderated ? 'bg-orange-50' : 'bg-emerald-50'}`}>
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className={`font-semibold ${u.moderated ? 'text-orange-800' : 'text-emerald-800'}`}>Content Moderation</p>
                  <p className={`text-sm ${u.moderated ? 'text-orange-700' : 'text-emerald-700'}`}>
                    {u.moderated ? 'New posts, replies, and event comments require admin approval.' : 'Moderation is off; content appears immediately.'}
                  </p>
                </div>
                <button
                  onClick={async () => { await toggleUserModeration(u.uid, u.moderated); updateLocal({ moderated: !u.moderated }); }}
                  className={`px-4 py-2 rounded-lg text-sm font-medium text-white ${
                    u.moderated ? 'bg-emerald-500 hover:bg-emerald-600' : 'bg-orange-500 hover:bg-orange-600'}`}
                >
                  {u.moderated ? 'Lift restriction' : 'Require approval'}
                </button>
              </div>
            </section>
          ) : (
            <section className="bg-gray-50 rounded-xl p-4 text-sm text-gray-500">
              No linked account. This volunteer signed up through the public form, so forum moderation and password actions do not apply.
            </section>
          )}

          {u.uid && (
            <section>
              <h3 className="font-semibold text-gray-800 mb-3">Account Actions</h3>
              <div className="flex flex-wrap gap-3">
                <button onClick={sendPasswordReset} disabled={resetStatus === 'sending'}
                  className="px-4 py-2 border border-teal-200 text-teal-700 rounded-lg text-sm hover:bg-teal-50 disabled:opacity-50">
                  {resetStatus === 'sending' ? 'Sending...' : 'Send Password Reset'}
                </button>
                <button onClick={anonymizeForumActivity} disabled={anonymizeStatus === 'running'}
                  className="px-4 py-2 border border-orange-200 text-orange-700 rounded-lg text-sm hover:bg-orange-50 disabled:opacity-50">
                  {anonymizeStatus === 'running' ? 'Anonymizing...' : 'Anonymize Forum Activity'}
                </button>
                <button onClick={deleteUserData} disabled={deleteStatus === 'deleting'}
                  className="px-4 py-2 border border-red-200 text-red-700 rounded-lg text-sm hover:bg-red-50 disabled:opacity-50">
                  {deleteStatus === 'deleting' ? 'Deleting...' : 'Delete User Data'}
                </button>
              </div>
              {resetStatus === 'sent' && <p className="text-sm text-emerald-600 mt-2">Password reset email sent.</p>}
              {resetStatus === 'error' && <p className="text-sm text-red-500 mt-2">Could not send password reset.</p>}
              {anonymizeMessage && <p className={`text-sm mt-2 ${anonymizeStatus === 'error' ? 'text-red-500' : 'text-emerald-600'}`}>{anonymizeMessage}</p>}
              {deleteError && <p className="text-sm text-red-500 mt-2">{deleteError}</p>}
            </section>
          )}

          <section className="grid grid-cols-3 gap-3 text-center">
            <div className="bg-gray-50 rounded-xl p-3">
              <div className="text-xl font-bold text-teal-600">{userComments.length}</div>
              <div className="text-xs text-gray-500">Forum activity</div>
            </div>
            <div className="bg-gray-50 rounded-xl p-3">
              <div className="text-xl font-bold text-emerald-600">{userOwnedDocs.length}</div>
              <div className="text-xs text-gray-500">Documents</div>
            </div>
            <div className="bg-gray-50 rounded-xl p-3">
              <div className="text-xl font-bold text-cyan-600">{userRsvps.length}</div>
              <div className="text-xs text-gray-500">RSVPs</div>
            </div>
          </section>

          {userOwnedDocs.length > 0 && (
            <section>
              <h3 className="font-semibold text-gray-800 mb-2">Documents</h3>
              <div className="space-y-2">
                {userOwnedDocs.map(d => (
                  <button key={d.id} onClick={() => setViewingDoc(d)}
                    className="w-full text-left flex items-center justify-between p-3 border rounded-lg hover:border-teal-200">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="bg-red-100 text-red-600 px-2 py-0.5 rounded text-xs">{d.type}</span>
                      <span className="text-sm truncate">{d.title || d.name}</span>
                    </div>
                    <span className={`text-xs px-2 py-0.5 rounded ${
                      d.status === 'approved' ? 'bg-emerald-100 text-emerald-700'
                      : d.status === 'rejected' ? 'bg-red-100 text-red-700'
                      : 'bg-orange-100 text-orange-700'}`}>{d.status}</span>
                  </button>
                ))}
              </div>
            </section>
          )}

          {userRsvps.length > 0 && (
            <section>
              <h3 className="font-semibold text-gray-800 mb-2">RSVPs</h3>
              <ul className="text-sm space-y-1">
                {userRsvps.map(r => {
                  const evt = events.find(e => e.id === r.eventId);
                  return (
                    <li key={r.id} className="border rounded-lg p-2">
                      <span className="font-medium">{evt?.title || 'Event'}</span>
                      <span className="text-gray-500"> - {evt?.date}</span>
                      {r.comments && <p className="text-xs text-gray-500 mt-1">"{r.comments}"</p>}
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

          {userComments.length > 0 && (
            <section>
              <h3 className="font-semibold text-gray-800 mb-2">Forum Activity</h3>
              <ul className="space-y-2">
                {userComments.map((c, i) => (
                  <li key={i} className="border rounded-lg p-3">
                    <div className="flex items-center gap-2 text-xs text-gray-500 mb-1">
                      {c.type === 'post'
                        ? <span className="bg-teal-100 text-teal-700 px-2 py-0.5 rounded">Post: {c.title}</span>
                        : <span className="bg-gray-100 text-gray-600 px-2 py-0.5 rounded">Reply on "{c.postTitle}"</span>}
                      <span>{c.date}</span>
                      <button
                        onClick={() => c.type === 'post' ? deletePost(c.id) : deleteReply(c.postId, c.id)}
                        className="ml-auto text-red-500 hover:bg-red-50 p-1 rounded">
                        <Trash2 size={14} />
                      </button>
                    </div>
                    <p className="text-sm text-gray-700">{c.type === 'post' ? c.content : c.text}</p>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
