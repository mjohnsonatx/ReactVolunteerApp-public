// components/modals/NewPostModal.jsx
import { X } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { useApp } from '../../context/AppContext';
import { detectMalicious, sanitizePostForm, LIMITS } from '../../utils/sanitize';
import ForumPostContent from '../shared/ForumPostContent';

export default function NewPostModal() {
  const {
    setShowNewPostModal, currentUser, handleNewPost,
    newPostForm, setNewPostForm, postError, setPostError,
  } = useApp();
  const [reviewing, setReviewing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const preview = sanitizePostForm(newPostForm);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (submitting) return;
    if (!reviewing) {
      setPostError('');
      for (const value of [newPostForm.title, newPostForm.content, preview.title, preview.content]) {
        const check = detectMalicious(value);
        if (check.blocked) { setPostError(`Post blocked: ${check.reason}`); return; }
      }
      if (!preview.title) { setPostError('Please enter a valid title.'); return; }
      if (!preview.content) { setPostError('Please enter post content.'); return; }
      setReviewing(true);
      return;
    }
    setSubmitting(true);
    try { await handleNewPost(event); }
    finally { setSubmitting(false); }
  };

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="new-post-modal-title" className="fixed inset-0 bg-black/50 flex items-center justify-center z-[2000] p-4">
      <div className="bg-white rounded-2xl p-6 sm:p-8 max-w-lg w-full max-h-[90dvh] overflow-y-auto shadow-2xl">
        <div className="flex justify-between items-center mb-4">
          <h2 id="new-post-modal-title" className="text-2xl font-bold text-gray-800">New Post</h2>
          <button aria-label="Close new post" disabled={submitting} onClick={() => { setShowNewPostModal(false); setPostError(''); }} className="text-gray-400 hover:text-gray-600"><X size={24} /></button>
        </div>
        {currentUser?.moderated ? (
          <p className="text-sm text-amber-600 bg-amber-50 px-4 py-2 rounded-lg mb-4">
            Your account is under review — posts will be checked by a moderator before appearing.
          </p>
        ) : (
          <p className="text-sm text-emerald-600 bg-emerald-50 px-4 py-2 rounded-lg mb-4">
            Your post will appear immediately.
          </p>
        )}
        <form onSubmit={submit} className="space-y-4">
          {reviewing ? <section aria-label="Post preview" className="rounded-xl border border-gray-200 p-4">
            <p className="mb-3 text-sm font-semibold text-teal-700">Preview — not published yet</p>
            <ForumPostContent post={{ ...preview, anonymous: newPostForm.anonymous === true, anonymousLabel: 'Anonymous 1', author: currentUser?.name || '', authorUserName: currentUser?.userName || '', date: new Date().toLocaleDateString() }} />
          </section> : <>
            <input type="text" aria-label="Title" placeholder="Title" required maxLength={LIMITS.postTitle} value={newPostForm.title} onChange={e => setNewPostForm({ ...newPostForm, title: e.target.value })} className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-teal-500 outline-none" />
            <textarea aria-label="Post content" placeholder="What's on your mind?" required maxLength={LIMITS.postContent} value={newPostForm.content} onChange={e => setNewPostForm({ ...newPostForm, content: e.target.value })} rows={5} className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-teal-500 outline-none" />
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input type="checkbox" checked={newPostForm.anonymous === true} onChange={e => setNewPostForm({ ...newPostForm, anonymous: e.target.checked })} aria-describedby="post-anonymous-help" />
              Post anonymously
            </label>
          </>}
          {newPostForm.anonymous && <p id="post-anonymous-help" className="text-xs text-gray-600">Shown as Anonymous 1. Your anonymous replies keep the same handle in this thread. Administrators can still see your username and account ID for moderation. Avoid identifying details in your text.</p>}
          {postError && <p role="alert" className="text-red-500 text-sm bg-red-50 px-4 py-2 rounded-lg">{postError}</p>}
          <div className="flex gap-3">
            {reviewing
              ? <button type="button" disabled={submitting} onClick={() => { setReviewing(false); setPostError(''); }} className="flex-1 py-3 border border-gray-200 rounded-xl hover:bg-gray-50">Edit post</button>
              : <button type="button" onClick={() => { setShowNewPostModal(false); setPostError(''); }} className="flex-1 py-3 border border-gray-200 rounded-xl hover:bg-gray-50">Cancel</button>}
            <button type="submit" disabled={submitting} className="flex-1 bg-teal-500 text-white py-3 rounded-xl font-semibold hover:bg-teal-600 disabled:opacity-50">{submitting ? 'Publishing…' : reviewing ? 'Create Post' : 'Preview post'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
