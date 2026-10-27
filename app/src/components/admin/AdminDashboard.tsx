// components/admin/AdminDashboard.jsx
import { useState } from 'react';
import { CornerDownRight, Loader, Send } from 'lucide-react';
import { useApp } from '@runtime/app-context';
import { LIMITS } from '../../utils/sanitize';
import { logError } from '../../utils/logError';

function messageDateLabel(value) {
  const date = value?.toDate ? value.toDate() : value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime()) ? date.toLocaleString() : '';
}

function MessageCard({ message, replyToProfileMessage }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [status, setStatus] = useState('idle'); // idle | sending | sent | error
  const [error, setError] = useState('');

  const send = async (e) => {
    e.preventDefault();
    setError('');
    if (!text.trim()) { setError('Please enter a reply message.'); return; }
    setStatus('sending');
    try {
      await replyToProfileMessage(message.id, text);
      setStatus('sent');
      setText('');
      setOpen(false);
    } catch (err) {
      setStatus('error');
      setError(err instanceof Error ? err.message : 'Could not send reply. Please try again.');
      logError(err, 'AdminDashboard-replyMessage', { id: message.id });
    }
  };

  return (
    <div className="py-2 border-b last:border-0 text-sm">
      <p className="font-medium text-gray-800">{message.topicLabel || message.topic || 'Message'}</p>
      <p className="text-gray-500">
        {message.userName || message.userEmail || 'User'}
        {messageDateLabel(message.createdAt) ? ` - ${messageDateLabel(message.createdAt)}` : ''}
      </p>
      <p className="text-gray-600 line-clamp-2">{message.message}</p>

      {message.adminReply && (
        <div className="mt-2 flex gap-2 bg-emerald-50/60 border border-emerald-100 rounded-lg p-2">
          <CornerDownRight size={14} className="text-emerald-600 shrink-0 mt-0.5" />
          <div>
            <p className="text-xs font-semibold text-emerald-700">
              Your reply{messageDateLabel(message.adminReplyAt) ? ` • ${messageDateLabel(message.adminReplyAt)}` : ''}
            </p>
            <p className="text-gray-700">{message.adminReply}</p>
          </div>
        </div>
      )}

      {open ? (
        <form onSubmit={send} className="mt-2 space-y-2">
          <textarea
            aria-label={`Reply to ${message.userName || message.userEmail || 'user'}`}
            maxLength={LIMITS.comment}
            rows={2}
            value={text}
            onChange={e => { setError(''); setText(e.target.value); }}
            placeholder="Write a reply to this member..."
            className="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-teal-500 outline-none"
          />
          {error && <p role="alert" className="text-red-500 text-xs">{error}</p>}
          <div className="flex gap-2">
            <button type="submit" disabled={status === 'sending'}
              className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium text-white ${status === 'sending' ? 'bg-gray-300' : 'bg-teal-500 hover:bg-teal-600'}`}>
              {status === 'sending' ? <><Loader size={12} className="animate-spin" />Sending...</> : <><Send size={12} />Send reply</>}
            </button>
            <button type="button" onClick={() => { setOpen(false); setError(''); }}
              className="px-3 py-1.5 rounded-lg text-xs text-gray-500 hover:bg-gray-100">Cancel</button>
          </div>
        </form>
      ) : (
        <button type="button" onClick={() => setOpen(true)}
          className="mt-2 inline-flex items-center gap-1 text-xs text-teal-600 hover:underline">
          <CornerDownRight size={12} />{message.adminReply ? 'Reply again' : 'Reply'}
        </button>
      )}
      {status === 'sent' && <p role="status" className="text-emerald-600 text-xs mt-1">Reply sent.</p>}
    </div>
  );
}

export default function AdminDashboard() {
  const {
    events, forumPosts, adminRsvps, allUserDocs, volunteers, mailingList,
    pendingDocsCount, flaggedPostsCount, flaggedRepliesCount, allUsers,
    errorLogs, profileMessages, setAdminTab, setAdminViewThread, setViewingDoc,
    replyToProfileMessage,
  } = useApp();

  const today = new Date();
  const upcomingEvents = [...events]
    .filter(e => new Date(e.date + 'T12:00:00') >= new Date(today.toDateString()))
    .slice(0, 5);
  const recentPosts = forumPosts.slice(0, 5);
  const recentRsvps = adminRsvps.slice(0, 5);
  const recentUploads = allUserDocs.slice(0, 5);
  const recentMessages = profileMessages.slice(0, 5);

  const weeks = [3, 2, 1, 0].map(w => {
    const end = new Date(); end.setDate(end.getDate() - w * 7);
    const start = new Date(end); start.setDate(start.getDate() - 7);
    const count = forumPosts.reduce((n, p) => {
      const created = p.createdAt?.toDate?.();
      let total = (created && created >= start && created < end) ? 1 : 0;
      total += (p.replies || []).filter(r => {
        const d = new Date(r.date);
        return !Number.isNaN(d.getTime()) && d >= start && d < end;
      }).length;
      return n + total;
    }, 0);
    return { label: w === 0 ? 'This week' : `${w}w ago`, count };
  });
  const peak = Math.max(1, ...weeks.map(w => w.count));

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Volunteers', count: volunteers.length, color: 'teal' },
          { label: 'Subscribers', count: mailingList.length, color: 'emerald' },
          { label: 'Forum Posts', count: forumPosts.length, color: 'cyan' },
          { label: 'RSVPs', count: adminRsvps.length, color: 'orange' },
        ].map(c => (
          <div key={c.label} className="bg-white rounded-2xl p-5 shadow-sm">
            <p className="text-sm text-gray-500">{c.label}</p>
            <p className={`text-3xl font-bold text-${c.color}-600`}>{c.count}</p>
          </div>
        ))}
      </div>

      <div className="grid md:grid-cols-3 gap-4">
        <div className="bg-orange-50 rounded-2xl p-5">
          <p className="text-sm text-orange-700">Pending documents</p>
          <p className="text-3xl font-bold text-orange-700">{pendingDocsCount}</p>
        </div>
        <div className="bg-red-50 rounded-2xl p-5">
          <p className="text-sm text-red-700">Forum needs review</p>
          <p className="text-3xl font-bold text-red-700">{flaggedPostsCount + flaggedRepliesCount}</p>
        </div>
        <div className="bg-cyan-50 rounded-2xl p-5">
          <p className="text-sm text-cyan-700">Moderated users</p>
          <p className="text-3xl font-bold text-cyan-700">
            {allUsers.filter(u => u.moderated).length}
          </p>
        </div>
      </div>

      <div className="bg-white rounded-2xl p-5 shadow-sm">
        <h3 className="font-bold text-gray-800 mb-3">Forum activity (last 4 weeks)</h3>
        <div className="flex items-end gap-4 h-32">
          {weeks.map((w, i) => (
            <div key={i} className="flex-1 flex flex-col items-center gap-1">
              <div className="text-xs text-gray-500">{w.count}</div>
              <div className="w-full bg-teal-100 rounded-t" style={{ height: `${(w.count / peak) * 100}%` }} />
              <div className="text-xs text-gray-400">{w.label}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <div className="bg-white rounded-2xl p-5 shadow-sm">
          <h3 className="font-bold text-gray-800 mb-3">Upcoming Events</h3>
          {upcomingEvents.length === 0 ? <p className="text-sm text-gray-400">None scheduled.</p>
            : upcomingEvents.map(e => (
              <div key={e.id} className="py-2 border-b last:border-0 text-sm">
                <p className="font-medium">{e.title}</p>
                <p className="text-gray-500">{e.date} • {e.location}</p>
                <p className="text-gray-400 text-xs">
                  {adminRsvps.filter(r => r.eventId === e.id).length} RSVPs
                </p>
              </div>
            ))}
        </div>
        <div className="bg-white rounded-2xl p-5 shadow-sm">
          <h3 className="font-bold text-gray-800 mb-3">Recent Forum Posts</h3>
          {recentPosts.length === 0 ? <p className="text-sm text-gray-400">No posts yet.</p>
            : recentPosts.map(p => (
              <button key={p.id}
                onClick={() => { setAdminTab('forum'); setAdminViewThread(p); }}
                className="w-full text-left py-2 border-b last:border-0 text-sm hover:bg-gray-50">
                <p className="font-medium truncate">{p.title}</p>
                <p className="text-gray-500">{p.author} • {p.date} • {p.status}</p>
              </button>
            ))}
        </div>
        <div className="bg-white rounded-2xl p-5 shadow-sm">
          <h3 className="font-bold text-gray-800 mb-3">Recent RSVPs</h3>
          {recentRsvps.length === 0 ? <p className="text-sm text-gray-400">None yet.</p>
            : recentRsvps.map(r => {
              const evt = events.find(e => e.id === r.eventId);
              return (
                <div key={r.id} className="py-2 border-b last:border-0 text-sm">
                  <p className="font-medium">{r.name}</p>
                  <p className="text-gray-500">{evt?.title || 'Event'} • {evt?.date}</p>
                </div>
              );
            })}
        </div>
        <div className="bg-white rounded-2xl p-5 shadow-sm">
          <h3 className="font-bold text-gray-800 mb-3">Recent Uploads</h3>
          {recentUploads.length === 0 ? <p className="text-sm text-gray-400">No uploads.</p>
            : recentUploads.map(d => (
              <button key={d.id}
                onClick={() => setViewingDoc(d)}
                className="w-full text-left py-2 border-b last:border-0 text-sm hover:bg-gray-50">
                <p className="font-medium truncate">{d.title || d.name}</p>
                <p className="text-gray-500">{d.userName} • {d.status}</p>
              </button>
            ))}
        </div>
        <div className="bg-white rounded-2xl p-5 shadow-sm">
          <h3 className="font-bold text-gray-800 mb-3">Recent Messages</h3>
          {recentMessages.length === 0 ? <p className="text-sm text-gray-400">No messages.</p>
            : recentMessages.map(m => (
              <MessageCard key={m.id} message={m} replyToProfileMessage={replyToProfileMessage} />
            ))}
        </div>
      </div>

      <div className="bg-white rounded-2xl p-5 shadow-sm">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h3 className="font-bold text-gray-800">Recent Errors</h3>
          <button type="button" onClick={() => setAdminTab('logs')} className="text-sm font-medium text-teal-700 hover:underline">View all logs</button>
        </div>
        <div className="text-xs font-mono max-h-80 overflow-auto space-y-1">
          {errorLogs.length === 0
            ? <p className="text-gray-400 font-sans">No errors logged 🎉</p>
            : errorLogs.map(l => (
                <div key={l.id} className="border-b py-1">
                  <span className="text-gray-400">
                    {(l.createdAt || l.at)?.toDate?.()?.toLocaleString() || '—'}
                  </span>{' '}
                  <span className="text-red-600">{l.context || 'unknown'}</span>:{' '}
                  <span className="text-gray-700">{l.message || JSON.stringify(l)}</span>
                </div>
              ))}
        </div>
      </div>
    </div>
  );
}
