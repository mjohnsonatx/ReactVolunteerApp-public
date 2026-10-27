// components/admin/AdminForum.jsx
import {
  ArrowLeft,
  CheckCircle,
  ChevronRight,
  Eye,
  Flag,
  MessageSquare,
  ThumbsDown,
  ThumbsUp,
  Trash2,
  User,
  Users,
} from 'lucide-react';
import { useApp } from '@runtime/app-context';

function authorLabel(author: string, userName?: string) {
  return userName ? `@${userName}` : author || 'User';
}

function AnonymousIdentity({ item }: { item: any }) {
  const { openProfileForUser } = useApp();
  if (!item.anonymous) return null;
  return <span className="block text-xs text-amber-800 break-all">
    {item.anonymousLabel || 'Anonymous'} to public · {item.authorId && item.authorId !== 'deleted'
      ? <button className="underline" onClick={() => openProfileForUser(item.authorId)}>Author ID: {item.authorId}</button>
      : 'Author identity unavailable'}
  </span>;
}

function formatReportDate(value: any) {
  const date = value?.toDate ? value.toDate() : value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime()) ? date.toLocaleDateString() : '';
}

function ReportSummary({ reports }: { reports: any[] }) {
  if (!reports.length) return null;
  return (
    <div className="mt-3 rounded-lg border border-red-100 bg-white/70 p-3 space-y-2">
      <p className="text-xs font-semibold text-red-700">{reports.length} report{reports.length === 1 ? '' : 's'}</p>
      {reports.slice(0, 2).map(report => (
        <div key={report.id} className="text-xs text-gray-600">
          <p>
            <span className="font-medium text-gray-800">{report.reasonLabel || 'Report'}</span>
            {report.reporterName && <span> by {authorLabel(report.reporterName, report.reporterUserName)}</span>}
            {formatReportDate(report.createdAt) && <span> on {formatReportDate(report.createdAt)}</span>}
          </p>
          <p className="mt-1 text-gray-500">{report.details}</p>
        </div>
      ))}
      {reports.length > 2 && <p className="text-xs text-gray-400">Open the thread to review more reports.</p>}
    </div>
  );
}

export default function AdminForum() {
  const {
    forumPosts,
    forumReports,
    adminViewUser,
    setAdminViewUser,
    adminViewThread,
    setAdminViewThread,
    getAllUserComments,
    deletePost,
    deleteReply,
    pendingForumReplies,
    approvePendingReply,
    deletePendingReply,
    approvePost,
    unflagReply,
    openProfileForUser,
  } = useApp();

  const flaggedPosts = forumPosts.filter(p => p.flagged || p.status === 'pending');
  const flaggedReplies = forumPosts.flatMap(p =>
    (p.replies || [])
      .filter(r => r.flagged)
      .map(r => ({ ...r, postId: p.id, postTitle: p.title }))
  );
  const reportsFor = (postId: string, replyId = '') => (
    (forumReports || []).filter(r => r.postId === postId && (r.replyId || '') === replyId)
  );
  const allAuthors = [
    ...new Map<string, any>(
      forumPosts
        .flatMap(p => [
          { id: p.authorId, name: p.author, userName: p.authorUserName },
          ...(p.replies || []).map(r => ({ id: r.authorId, name: r.author, userName: r.authorUserName })),
        ])
        .filter(a => a.id && a.id !== 'deleted')
        .map(a => [a.id, a])
    ).values(),
  ];

  if (adminViewUser) {
    const userComments = getAllUserComments(adminViewUser.id);
    return (
      <div className="bg-white rounded-2xl shadow-lg overflow-hidden">
        <div className="px-6 py-4 border-b flex items-center gap-3">
          <button onClick={() => setAdminViewUser(null)} className="text-teal-600 hover:bg-teal-50 p-2 rounded-lg"><ArrowLeft size={18} /></button>
          <User className="text-teal-600" />
          <h2 className="text-xl font-bold text-gray-800">{adminViewUser.name}'s Activity</h2>
        </div>
        <div className="p-6 space-y-3">
          {userComments.length === 0 ? <p className="text-gray-400 text-center py-8">No activity found.</p> : userComments.map((c, i) => (
            <div key={i} className="p-4 border rounded-xl">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2 text-sm">
                  {c.type === 'post'
                    ? <span className="bg-teal-100 text-teal-700 px-2 py-0.5 rounded text-xs">Post: {c.title}</span>
                    : <span className="bg-gray-100 text-gray-600 px-2 py-0.5 rounded text-xs">Reply on "{c.postTitle}"</span>}
                  <span className="text-gray-400">{c.date}</span>
                  <AnonymousIdentity item={c} />
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-1 text-sm">
                    <ThumbsUp size={12} className="text-emerald-500" />{c.upvotes || 0}
                    <ThumbsDown size={12} className="text-red-400 ml-2" />{c.downvotes || 0}
                  </div>
                  <button onClick={() => c.type === 'post' ? deletePost(c.id) : deleteReply(c.postId, c.id)} className="text-red-500 hover:bg-red-50 p-1 rounded">
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
              <p className="text-gray-700">{c.type === 'post' ? c.content : c.text}</p>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (adminViewThread) {
    const live = forumPosts.find(p => p.id === adminViewThread.id) || adminViewThread;
    return (
      <div className="bg-white rounded-2xl shadow-lg overflow-hidden">
        <div className="px-6 py-4 border-b flex items-center gap-3">
          <button onClick={() => setAdminViewThread(null)} className="text-teal-600 hover:bg-teal-50 p-2 rounded-lg"><ArrowLeft size={18} /></button>
          <MessageSquare className="text-teal-600" />
          <h2 className="text-xl font-bold text-gray-800">{live.title}</h2>
        </div>
        <div className="p-6">
          <div className="p-4 border rounded-xl mb-4 bg-teal-50/30">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2 text-sm">
                <span className="bg-teal-100 text-teal-700 px-2 py-0.5 rounded text-xs">Original Post</span>
                <button onClick={() => setAdminViewUser({ id: live.authorId, name: live.author })} className="text-teal-600 hover:underline">
                  {authorLabel(live.author, live.authorUserName)}
                </button>
                <span className="text-gray-400">{live.date}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className={`px-2 py-0.5 rounded text-xs ${live.status === 'approved' ? 'bg-emerald-100 text-emerald-700' : 'bg-orange-100 text-orange-700'}`}>{live.status}</span>
                {live.status !== 'approved' && <button onClick={() => approvePost(live.id)} className="text-emerald-600 hover:bg-emerald-50 p-1 rounded"><CheckCircle size={16} /></button>}
                <button onClick={() => deletePost(live.id)} className="text-red-500 hover:bg-red-50 p-1 rounded"><Trash2 size={16} /></button>
              </div>
            </div>
            <p className="text-gray-700">{live.content}</p>
            <AnonymousIdentity item={live} />
            <ReportSummary reports={reportsFor(live.id)} />
          </div>

          <h3 className="font-semibold text-gray-800 mb-3">{(live.replies || []).length} Replies</h3>
          <div className="space-y-3">
            {(live.replies || []).map(r => (
              <div key={r.id} className={`p-4 border rounded-xl ${r.flagged ? 'border-red-200 bg-red-50/30' : ''}`}>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2 text-sm">
                    <button onClick={() => setAdminViewUser({ id: r.authorId, name: r.author })} className="font-medium text-teal-600 hover:underline">
                      {authorLabel(r.author, r.authorUserName)}
                    </button>
                    <span className="text-gray-400">{r.date}</span>
                    {r.flagged && <span className="bg-red-100 text-red-600 px-2 py-0.5 rounded text-xs">Flagged</span>}
                  </div>
                  <div className="flex items-center gap-2">
                    {r.flagged && <button onClick={() => unflagReply(live.id, r.id)} className="text-emerald-600 hover:bg-emerald-50 p-1 rounded"><CheckCircle size={16} /></button>}
                    <button onClick={() => deleteReply(live.id, r.id)} className="text-red-500 hover:bg-red-50 p-1 rounded"><Trash2 size={16} /></button>
                  </div>
                </div>
                <p className="text-gray-700">{r.text}</p>
                <AnonymousIdentity item={r} />
                <ReportSummary reports={reportsFor(live.id, r.id)} />
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {(flaggedPosts.length > 0 || flaggedReplies.length > 0 || pendingForumReplies.length > 0) && (
        <div className="bg-white rounded-2xl shadow-lg overflow-hidden">
          <div className="px-6 py-4 border-b bg-red-50 flex items-center gap-3">
            <Flag className="text-red-500" />
            <h2 className="text-xl font-bold text-red-800">Needs Attention ({flaggedPosts.length + flaggedReplies.length + pendingForumReplies.length})</h2>
          </div>
          <div className="p-4 space-y-3">
            {flaggedPosts.map(p => (
              <div key={p.id} className="p-4 border border-red-200 bg-red-50/50 rounded-xl flex justify-between items-start">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="bg-red-100 text-red-600 px-2 py-0.5 rounded text-xs">{p.status === 'pending' ? 'Pending' : 'Flagged'}</span>
                    <span className="text-gray-500 text-sm">{authorLabel(p.author, p.authorUserName)}</span>
                  </div>
                  <h3 className="font-semibold text-gray-800">{p.title}</h3>
                  <p className="text-gray-600 text-sm">{p.content}</p>
                  <AnonymousIdentity item={p} />
                  <ReportSummary reports={reportsFor(p.id)} />
                </div>
                <div className="flex gap-2 ml-4 shrink-0">
                  <button onClick={() => setAdminViewThread(p)} className="text-teal-600 hover:bg-teal-50 p-2 rounded-lg"><Eye size={18} /></button>
                  <button onClick={() => approvePost(p.id)} className="text-emerald-600 hover:bg-emerald-50 p-2 rounded-lg"><CheckCircle size={18} /></button>
                  <button onClick={() => deletePost(p.id)} className="text-red-500 hover:bg-red-50 p-2 rounded-lg"><Trash2 size={18} /></button>
                </div>
              </div>
            ))}
            {flaggedReplies.map((r, i) => (
              <div key={i} className="p-4 border border-orange-200 bg-orange-50/50 rounded-xl flex justify-between items-start">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="bg-orange-100 text-orange-600 px-2 py-0.5 rounded text-xs">Flagged Reply</span>
                    <span className="text-gray-500 text-sm">on "{r.postTitle}"</span>
                  </div>
                  <p className="text-gray-600">"{r.text}" - <span className="font-medium">{authorLabel(r.author, r.authorUserName)}</span></p>
                  <AnonymousIdentity item={r} />
                  <ReportSummary reports={reportsFor(r.postId, r.id)} />
                </div>
                <div className="flex gap-2 ml-4 shrink-0">
                  <button onClick={() => setAdminViewThread(forumPosts.find(p => p.id === r.postId))} className="text-teal-600 hover:bg-teal-50 p-2 rounded-lg"><Eye size={18} /></button>
                  <button onClick={() => unflagReply(r.postId, r.id)} className="text-emerald-600 hover:bg-emerald-50 p-2 rounded-lg"><CheckCircle size={18} /></button>
                  <button onClick={() => deleteReply(r.postId, r.id)} className="text-red-500 hover:bg-red-50 p-2 rounded-lg"><Trash2 size={18} /></button>
                </div>
              </div>
            ))}
            {pendingForumReplies.map(pending => {
              const r = pending.reply || {};
              return (
                <div key={pending.id} className="p-4 border border-amber-200 bg-amber-50/50 rounded-xl flex justify-between items-start">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="bg-amber-100 text-amber-700 px-2 py-0.5 rounded text-xs">Pending Reply</span>
                      <span className="text-gray-500 text-sm">on &quot;{pending.postTitle || 'Forum post'}&quot;</span>
                    </div>
                    <p className="text-gray-600">&quot;{r.text}&quot; - <span className="font-medium">{authorLabel(r.author, r.authorUserName)}</span></p>
                    <AnonymousIdentity item={r} />
                  </div>
                  <div className="flex gap-2 ml-4 shrink-0">
                    <button onClick={() => approvePendingReply(pending.id)} aria-label="Approve pending reply" className="text-emerald-600 hover:bg-emerald-50 p-2 rounded-lg"><CheckCircle size={18} /></button>
                    <button onClick={() => deletePendingReply(pending.id)} aria-label="Delete pending reply" className="text-red-500 hover:bg-red-50 p-2 rounded-lg"><Trash2 size={18} /></button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="bg-white rounded-2xl shadow-lg overflow-hidden">
        <div className="px-6 py-4 border-b flex items-center gap-3">
          <MessageSquare className="text-teal-600" />
          <h2 className="text-xl font-bold text-gray-800">All Posts ({forumPosts.length})</h2>
        </div>
        <div className="divide-y">
          {forumPosts.map(p => (
            <div key={p.id} className="p-4 hover:bg-gray-50 flex justify-between items-center">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <span className={`px-2 py-0.5 rounded text-xs ${p.status === 'approved' ? 'bg-emerald-100 text-emerald-700' : 'bg-orange-100 text-orange-700'}`}>{p.status}</span>
                  <button onClick={() => setAdminViewUser({ id: p.authorId, name: p.author })} className="text-sm text-teal-600 hover:underline">
                    {authorLabel(p.author, p.authorUserName)}
                  </button>
                  <span className="text-gray-400 text-sm">{p.date}</span>
                </div>
                <h3 className="font-semibold text-gray-800">{p.title}</h3>
                <AnonymousIdentity item={p} />
                <p className="text-gray-500 text-sm">{(p.replies || []).length} replies - {p.upvotes || 0} up - {p.downvotes || 0} down</p>
              </div>
              <div className="flex gap-2">
                <button onClick={() => setAdminViewThread(p)} className="text-teal-600 hover:bg-teal-50 p-2 rounded-lg"><Eye size={18} /></button>
                {p.status !== 'approved' && <button onClick={() => approvePost(p.id)} className="text-emerald-600 hover:bg-emerald-50 p-2 rounded-lg"><CheckCircle size={18} /></button>}
                <button onClick={() => deletePost(p.id)} className="text-red-500 hover:bg-red-50 p-2 rounded-lg"><Trash2 size={18} /></button>
              </div>
            </div>
          ))}
        </div>
        {forumPosts.length === 0 && <p className="text-gray-400 text-center py-8">No posts yet.</p>}
      </div>

      <div className="bg-white rounded-2xl shadow-lg overflow-hidden">
        <div className="px-6 py-4 border-b flex items-center gap-3">
          <Users className="text-cyan-600" />
          <h2 className="text-xl font-bold text-gray-800">Forum Users</h2>
        </div>
        <div className="p-4 flex flex-wrap gap-2">
          {allAuthors.map((a, i) => (
            <button key={i} onClick={() => openProfileForUser(a.id)} className="px-3 py-2 bg-gray-100 hover:bg-teal-100 rounded-lg text-sm flex items-center gap-2">
              <User size={14} />{authorLabel(a.name, a.userName)}<ChevronRight size={14} />
            </button>
          ))}
          {allAuthors.length === 0 && <p className="text-gray-400">No forum activity yet.</p>}
        </div>
      </div>
    </div>
  );
}
