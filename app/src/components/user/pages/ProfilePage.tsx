// components/user/pages/ProfilePage.jsx
import { User, Shield, LogOut, ThumbsUp, ThumbsDown, Upload, Loader, FileText, MessageSquare, Send, Trash2, CornerDownRight } from 'lucide-react';
import { useApp } from '../../../context/AppContext';
import { LIMITS } from '../../../utils/sanitize';
import StorageImage from '../../shared/StorageImage';
import AccountSettings from '../AccountSettings';
import NotificationSettings from '../NotificationSettings';
import { PUBLIC_DOCUMENTS_ENABLED } from '../../../features';

function messageDateLabel(value) {
  const date = value?.toDate ? value.toDate() : value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime()) ? date.toLocaleString() : '';
}

const messageTopics = [
  { value: 'general', label: 'General question' },
  { value: 'volunteering', label: 'Volunteering' },
  { value: 'events', label: 'Events' },
  { value: 'documents', label: 'Documents' },
  { value: 'account', label: 'Account help' },
  { value: 'privacy', label: 'Privacy request' },
  { value: 'technical', label: 'Technical issue' },
];

export default function ProfilePage() {
  const {
    currentUser, getAllUserComments, rsvps, isAdmin, handleSignOut, userDocs,
    uploadForm, setUploadForm, uploadError, setUploadError, uploadLoading, handleDocumentUpload,
    profileMessageForm, setProfileMessageForm, profileMessageError, setProfileMessageError,
    profileMessageSubmitted, setProfileMessageSubmitted, profileMessageLoading, handleProfileMessageSubmit,
    myMessages, deleteOwnDocument, docDeleteError, docDeleteMessage,
  } = useApp();

  const messages = myMessages || [];

  const confirmDeleteDoc = (d) => {
    if (window.confirm(`Delete "${d.title || d.name || 'this document'}"? This permanently removes it for you and, if listed, from the public Documents page.`)) {
      deleteOwnDocument(d);
    }
  };

  if (!currentUser) return null;
  const myComments = getAllUserComments(currentUser.id);
  const myRsvps = rsvps.filter(r => r.userId === currentUser.id);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <AccountSettings />
      <NotificationSettings />
      <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
        <div className="flex flex-wrap items-center gap-4 mb-6">
          <div className="w-16 h-16 shrink-0 rounded-full bg-teal-100 flex items-center justify-center text-teal-600"><User size={32} /></div>
          <div className="min-w-0 flex-1 [overflow-wrap:anywhere]"><h2 className="text-2xl font-bold text-gray-800">{currentUser.userName ? `@${currentUser.userName}` : 'My Profile'}</h2><p className="text-gray-500">{currentUser.email}</p>
            {isAdmin && <span className="inline-flex items-center gap-1 text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full mt-1"><Shield size={10} />Admin</span>}</div>
          <button onClick={handleSignOut} className="flex w-full shrink-0 items-center justify-center gap-2 px-4 py-2 text-gray-500 hover:bg-gray-100 rounded-xl text-sm sm:ml-auto sm:w-auto"><LogOut size={16} />Sign Out</button>
        </div>
        <div className={`grid ${PUBLIC_DOCUMENTS_ENABLED ? 'grid-cols-3' : 'grid-cols-2'} gap-4 text-center`}>
          <div className="bg-gray-50 rounded-xl p-4"><div className="text-2xl font-bold text-teal-600">{myComments.length}</div><div className="text-sm text-gray-500">Comments</div></div>
          <div className="bg-gray-50 rounded-xl p-4"><div className="text-2xl font-bold text-emerald-600">{myRsvps.length}</div><div className="text-sm text-gray-500">RSVPs</div></div>
          {PUBLIC_DOCUMENTS_ENABLED && <div className="bg-gray-50 rounded-xl p-4"><div className="text-2xl font-bold text-cyan-600">{userDocs.length}</div><div className="text-sm text-gray-500">Documents</div></div>}
        </div>
      </div>

      <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
        <h3 className="text-xl font-bold text-gray-800 mb-4 flex items-center gap-2">
          <MessageSquare className="text-teal-600" size={20} />Message the Team
        </h3>
        <form onSubmit={handleProfileMessageSubmit} className="space-y-3">
          <label className="block text-sm font-medium text-gray-700" htmlFor="profile-message-topic">Topic</label>
          <select
            id="profile-message-topic"
            value={profileMessageForm.topic}
            onChange={e => {
              setProfileMessageError('');
              setProfileMessageSubmitted(false);
              setProfileMessageForm({ ...profileMessageForm, topic: e.target.value });
            }}
            className="w-full px-4 py-2 rounded-lg border border-gray-200 focus:border-teal-500 outline-none bg-white"
          >
            {messageTopics.map(topic => <option key={topic.value} value={topic.value}>{topic.label}</option>)}
          </select>
          <label className="block text-sm font-medium text-gray-700" htmlFor="profile-message-body">Message</label>
          <textarea
            id="profile-message-body"
            placeholder="Type your message"
            maxLength={LIMITS.comment}
            rows={4}
            value={profileMessageForm.message}
            onChange={e => {
              setProfileMessageError('');
              setProfileMessageSubmitted(false);
              setProfileMessageForm({ ...profileMessageForm, message: e.target.value });
            }}
            className="w-full px-4 py-2 rounded-lg border border-gray-200 focus:border-teal-500 outline-none"
          />
          {profileMessageError && <p className="text-red-500 text-sm bg-red-50 px-4 py-2 rounded-lg">{profileMessageError}</p>}
          {profileMessageSubmitted && <p className="text-emerald-600 text-sm bg-emerald-50 px-4 py-2 rounded-lg">Message sent.</p>}
          <button type="submit" disabled={profileMessageLoading}
            className={`w-full py-2 rounded-lg font-medium text-white flex items-center justify-center gap-2 ${profileMessageLoading ? 'bg-gray-300' : 'bg-teal-500 hover:bg-teal-600'}`}>
            {profileMessageLoading ? <><Loader size={16} className="animate-spin" />Sending...</> : <><Send size={16} />Send Message</>}
          </button>
        </form>

        {messages.length > 0 && (
          <div className="mt-6 border-t pt-4">
            <h4 className="text-sm font-semibold text-gray-700 mb-3">Your Messages</h4>
            <ul className="space-y-3">
              {messages.map(m => (
                <li key={m.id} className="border border-gray-100 rounded-xl p-4">
                  <div className="flex items-center gap-2 text-xs text-gray-500 mb-1">
                    <span className="bg-teal-100 text-teal-700 px-2 py-0.5 rounded">{m.topicLabel || m.topic || 'Message'}</span>
                    {messageDateLabel(m.createdAt) && <span>{messageDateLabel(m.createdAt)}</span>}
                    {m.adminReply
                      ? <span className="ml-auto bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full">Replied</span>
                      : <span className="ml-auto bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full">Awaiting reply</span>}
                  </div>
                  <p className="text-sm text-gray-700">{m.message}</p>
                  {m.adminReply && (
                    <div className="mt-3 flex gap-2 bg-emerald-50/60 border border-emerald-100 rounded-lg p-3">
                      <CornerDownRight size={16} className="text-emerald-600 shrink-0 mt-0.5" />
                      <div>
                        <p className="text-xs font-semibold text-emerald-700">
                          Reply from {m.adminReplyByName || 'the team'}
                          {messageDateLabel(m.adminReplyAt) && <span className="font-normal text-emerald-600"> • {messageDateLabel(m.adminReplyAt)}</span>}
                        </p>
                        <p className="text-sm text-gray-700 mt-1">{m.adminReply}</p>
                      </div>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
        <h3 className="text-xl font-bold text-gray-800 mb-4">My Comments</h3>
        {myComments.length === 0 ? <p className="text-gray-400 text-center py-8">No comments yet</p>
          : <div className="space-y-3">{myComments.map((c, i) => (
            <div key={i} className="p-4 border border-gray-100 rounded-xl">
              <div className="flex items-center gap-2 text-sm text-gray-500 mb-2">
                {c.type === 'post' ? <span className="bg-teal-100 text-teal-700 px-2 py-0.5 rounded text-xs">Post</span> : <span className="bg-gray-100 text-gray-600 px-2 py-0.5 rounded text-xs">Reply to "{c.postTitle}"</span>}
                <span>{c.date}</span>
                <div className="ml-auto flex items-center gap-2"><ThumbsUp size={12} className="text-emerald-500" />{c.upvotes || 0}<ThumbsDown size={12} className="text-red-400 ml-1" />{c.downvotes || 0}</div>
              </div>
              <p className="text-gray-700">{c.type === 'post' ? c.content : c.text}</p>
            </div>
          ))}</div>}
      </div>

      {PUBLIC_DOCUMENTS_ENABLED && <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
        <h3 className="text-xl font-bold text-gray-800 mb-4 flex items-center gap-2">
          <Upload className="text-emerald-600" size={20} />Upload a Document
        </h3>
        <form onSubmit={handleDocumentUpload} className="space-y-3">
          <input type="text" placeholder="Title" maxLength={LIMITS.name} value={uploadForm.title}
            onChange={e => { setUploadError(''); setUploadForm({ ...uploadForm, title: e.target.value }); }}
            className="w-full px-4 py-2 rounded-lg border border-gray-200 focus:border-emerald-500 outline-none" />
          <textarea placeholder="Notes / description (optional)" maxLength={LIMITS.comment} rows={3} value={uploadForm.notes}
            onChange={e => { setUploadError(''); setUploadForm({ ...uploadForm, notes: e.target.value }); }}
            className="w-full px-4 py-2 rounded-lg border border-gray-200 focus:border-emerald-500 outline-none" />
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 text-sm text-gray-600">
              <input type="radio" name="vis" checked={uploadForm.visibility === 'private'}
                onChange={() => setUploadForm({ ...uploadForm, visibility: 'private' })} /> Private
            </label>
            <label className="flex items-center gap-2 text-sm text-gray-600">
              <input type="radio" name="vis" checked={uploadForm.visibility === 'public'}
                onChange={() => setUploadForm({ ...uploadForm, visibility: 'public' })} /> Public (request listing)
            </label>
          </div>
          <input type="file" accept=".pdf,.jpg,.jpeg,.png"
            onChange={e => { setUploadError(''); setUploadForm({ ...uploadForm, file: e.target.files[0] || null }); }}
            className="block w-full text-sm text-gray-500 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-emerald-50 file:text-emerald-700 hover:file:bg-emerald-100" />
          {uploadError && <p className="text-red-500 text-sm bg-red-50 px-4 py-2 rounded-lg">{uploadError}</p>}
          <button type="submit" disabled={uploadLoading}
            className={`w-full py-2 rounded-lg font-medium text-white ${uploadLoading ? 'bg-gray-300' : 'bg-emerald-500 hover:bg-emerald-600'}`}>
            {uploadLoading ? <span className="flex items-center justify-center gap-2"><Loader size={16} className="animate-spin" />Uploading…</span> : 'Upload'}
          </button>
        </form>
      </div>}

      {PUBLIC_DOCUMENTS_ENABLED && <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
        <h3 className="text-xl font-bold text-gray-800 mb-4">My Documents</h3>
        {docDeleteMessage && <p role="status" className="text-emerald-600 text-sm bg-emerald-50 px-4 py-2 rounded-lg mb-3">{docDeleteMessage}</p>}
        {docDeleteError && <p role="alert" className="text-red-500 text-sm bg-red-50 px-4 py-2 rounded-lg mb-3">{docDeleteError}</p>}
        {userDocs.length > 0
          ? <div className="grid sm:grid-cols-2 gap-3">{userDocs.map(d => (
              <div key={d.id} className="flex gap-3 p-3 border border-emerald-100 bg-emerald-50/30 rounded-xl">
                {d.thumbnailPath
                  ? <StorageImage path={d.thumbnailPath} alt="" className="w-16 h-16 object-cover rounded-lg flex-shrink-0" />
                  : <div className="w-16 h-16 rounded-lg bg-emerald-100 flex items-center justify-center text-emerald-500 flex-shrink-0"><FileText size={24} /></div>}
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-gray-800 truncate">{d.title || d.name}</p>
                  {d.notes && <p className="text-xs text-gray-500 line-clamp-2">{d.notes}</p>}
                  <div className="flex items-center gap-2 mt-1">
                    <span className={`px-2 py-0.5 rounded text-xs ${d.status === 'approved' ? 'bg-emerald-100 text-emerald-700' : d.status === 'rejected' ? 'bg-red-100 text-red-700' : 'bg-orange-100 text-orange-700'}`}>{d.status}</span>
                    <span className="text-xs text-gray-400">{d.visibility}</span>
                    {d.published && <span className="text-xs text-teal-600">• listed</span>}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => confirmDeleteDoc(d)}
                  aria-label={`Delete ${d.title || d.name || 'document'}`}
                  title="Delete document"
                  className="self-start text-red-500 hover:bg-red-50 p-2 rounded-lg shrink-0"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ))}</div>
          : <div className="text-center py-8 border-2 border-dashed rounded-xl text-gray-400">No uploads yet</div>}
      </div>}
    </div>
  );
}
