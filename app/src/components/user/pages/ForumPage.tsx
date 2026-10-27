// components/user/pages/ForumPage.jsx
import { useEffect } from 'react';
import { MessageSquare, User, ArrowLeft, Plus, Flag, Send } from 'lucide-react';
import { useApp } from '../../../context/AppContext';
import { LIMITS } from '../../../utils/sanitize';
import VoteButtons from '../../shared/VoteButtons';
import ForumPostContent from '../../shared/ForumPostContent';
import { publicAuthorLabel } from '@watershed/shared';

export default function ForumPage() {
  const {
    forumPosts, selectedPost, setSelectedPost, currentUser,
    openReportDialog, hasReportedContent, replyText, setReplyText, handleReply,
    replyAnonymous, setReplyAnonymous,
    postError, setPostError, setShowAuthModal, setShowNewPostModal,
  } = useApp();

  const approved = forumPosts.filter(p => p.status === 'approved');

  // Notification links open a thread directly: /forum?post=<id>.
  const linkedPostId = new URLSearchParams(window.location.search).get('post');
  const linkedPostReady = !!linkedPostId && approved.some(p => p.id === linkedPostId);
  useEffect(() => {
    if (!linkedPostReady || !linkedPostId) return;
    setSelectedPost(approved.find(p => p.id === linkedPostId));
    window.history.replaceState(window.history.state, '', '/forum');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linkedPostReady, linkedPostId]);
  const reportButton = (target) => {
    if (!currentUser || currentUser.id === target.authorId) return null;
    const reported = hasReportedContent(target.postId, target.replyId || null);
    return (
      <button
        onClick={() => openReportDialog(target)}
        disabled={reported}
        className={`text-xs flex items-center gap-1 rounded-full px-2 py-1 ${
          reported
            ? 'bg-red-50 text-red-600 cursor-default'
            : 'text-gray-400 hover:text-red-500 hover:bg-red-50'
        }`}
      >
        <Flag size={12} />{reported ? 'Reported' : 'Report'}
      </button>
    );
  };

  return (
    <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
      {selectedPost ? (
        <div>
          <button onClick={() => setSelectedPost(null)} className="flex items-center gap-2 text-teal-600 hover:text-teal-700 mb-4"><ArrowLeft size={18} />Back</button>
          <ForumPostContent post={selectedPost}>
            <VoteButtons postId={selectedPost.id} upvotes={selectedPost.upvotes} downvotes={selectedPost.downvotes} />
            {reportButton({ type: 'post', postId: selectedPost.id, authorId: selectedPost.authorId, title: selectedPost.title })}
          </ForumPostContent>
          <h3 className="font-semibold text-gray-800 mb-4">{(selectedPost.replies || []).length} Replies</h3>
          <div className="space-y-4 mb-6">{(selectedPost.replies || []).map(r => (
            <div key={r.id} className="flex gap-3">
              <div className="w-10 h-10 rounded-full bg-teal-100 flex items-center justify-center text-teal-600"><User size={18} /></div>
              <div className="flex-1 bg-gray-50 rounded-xl p-4">
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2"><span className="font-medium text-gray-800">{publicAuthorLabel({ anonymous: r.anonymous, anonymousLabel: r.anonymousLabel, authorName: r.author, authorUserName: r.authorUserName })}</span><span className="text-xs text-gray-400">{r.date}</span></div>
                  <div className="flex items-center gap-2">
                    <VoteButtons postId={selectedPost.id} replyId={r.id} upvotes={r.upvotes} downvotes={r.downvotes} />
                    {reportButton({ type: 'reply', postId: selectedPost.id, replyId: r.id, authorId: r.authorId, title: selectedPost.title })}
                  </div>
                </div>
                <p className="text-gray-600">{r.text}</p>
              </div>
            </div>
          ))}</div>
          {currentUser
            ? <div className="flex gap-3">
              <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-600"><User size={18} /></div>
              <div className="flex-1 flex flex-col gap-2">
                {postError && <p className="text-red-500 text-sm bg-red-50 px-3 py-2 rounded-lg">{postError}</p>}
                <div className="flex gap-2">
                  <input type="text" placeholder="Write a reply..." maxLength={LIMITS.replyText} value={replyText}
                    onChange={e => { setPostError(''); setReplyText(e.target.value); }}
                    onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleReply(selectedPost.id)}
                    className="flex-1 px-4 py-2 border rounded-xl focus:border-teal-500 outline-none" />
                  <button aria-label="Send reply" onClick={() => handleReply(selectedPost.id)} className="px-4 py-2 bg-teal-500 text-white rounded-xl hover:bg-teal-600"><Send size={18} /></button>
                </div>
                <label className="flex items-center gap-2 text-sm text-gray-700">
                  <input type="checkbox" checked={replyAnonymous === true} onChange={e => setReplyAnonymous(e.target.checked)} aria-describedby="reply-anonymous-help" />
                  Reply anonymously
                </label>
                {replyAnonymous && <p id="reply-anonymous-help" className="text-xs text-gray-600">You keep the same anonymous handle within this thread (for example, Anonymous 2). Administrators can still see your username and account ID for moderation. Avoid identifying details in your text.</p>}
              </div>
            </div>
            : <button onClick={() => setShowAuthModal(true)} className="w-full py-3 border-2 border-dashed rounded-xl text-gray-500 hover:border-teal-300">Sign in to reply</button>}
        </div>
      ) : (
        <div>
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-2xl font-bold text-gray-800 flex items-center gap-2"><MessageSquare className="text-teal-600" />Forum</h2>
            <button onClick={() => currentUser ? setShowNewPostModal(true) : setShowAuthModal(true)} className="flex items-center gap-2 px-4 py-2 bg-teal-500 text-white rounded-lg text-sm font-medium hover:bg-teal-600"><Plus size={18} />New Post</button>
          </div>
          {currentUser && <div className="mb-4 p-3 bg-emerald-50 text-emerald-700 rounded-lg text-sm">Signed in as <strong>{currentUser.userName ? `@${currentUser.userName}` : 'Member'}</strong></div>}
          {approved.length === 0
            ? <p className="text-gray-400 text-center py-12">No posts yet — be the first!</p>
            : <div className="space-y-3">{approved.map(p => (
              <div key={p.id} onClick={() => setSelectedPost(p)} className="p-4 border border-gray-100 rounded-xl hover:border-teal-200 hover:bg-teal-50/30 cursor-pointer">
                <div className="flex justify-between items-start">
                  <div><h3 className="font-semibold text-gray-800 mb-1">{p.title}</h3>
                    <div className="flex items-center gap-4 text-sm text-gray-500"><span className="flex items-center gap-1"><User size={14} />{publicAuthorLabel({ anonymous: p.anonymous, anonymousLabel: p.anonymousLabel, authorName: p.author, authorUserName: p.authorUserName })}</span><span>{(p.replies || []).length} replies</span></div>
                  </div>
                  <VoteButtons postId={p.id} upvotes={p.upvotes} downvotes={p.downvotes} />
                </div>
              </div>
            ))}</div>}
        </div>
      )}
    </div>
  );
}
