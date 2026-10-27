// The overview page: what needs attention, the shape of the last twelve weeks,
// and the newest things people have sent in. Everything links into the tab
// where the work actually happens.
import { useMemo, useState } from 'react';
import {
  Bug, Calendar, ChevronRight, CircleCheck, CornerDownRight, ExternalLink, FileText, Flag, Images, Inbox, Layers,
  LoaderCircle, MessageSquare, PenLine, Send, Sprout,
} from 'lucide-react';
import { useApp } from '@runtime/app-context';
import { LIMITS } from '@app/utils/sanitize';
import { countOpenEventReports } from '@watershed/shared';
import { logError } from '@app/utils/logError';
import ActivityChart from './ActivityChart';
import StatTile from './StatTile';
import {
  countSince, forumActivityDates, greetingFor, niceTicks, toDate, upcomingEvents, weekLabels, weeklyCounts,
} from '../dashboard/metrics';

const WEEKS = 12;

function dateLabel(value: unknown, options: Intl.DateTimeFormatOptions = { dateStyle: 'medium', timeStyle: 'short' }) {
  const date = toDate(value);
  return date ? date.toLocaleString(undefined, options) : '';
}

function eventDate(value: string) {
  const date = new Date(`${value}T12:00:00`);
  return Number.isNaN(date.getTime()) ? { month: '—', day: '' } : {
    month: date.toLocaleDateString(undefined, { month: 'short' }),
    day: String(date.getDate()),
  };
}

function SectionCard({ title, icon: Icon, action, children, id }: {
  title: string; icon: any; action?: React.ReactNode; children: React.ReactNode; id?: string;
}) {
  return (
    <section id={id} className="rounded-2xl border border-gray-200 bg-white shadow-card">
      <header className="flex items-center justify-between gap-3 border-b border-gray-100 px-5 py-3.5">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-gray-800">
          <Icon size={16} className="text-teal-600" aria-hidden="true" />{title}
        </h3>
        {action}
      </header>
      <div className="px-5 py-4">{children}</div>
    </section>
  );
}

function JumpLink({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} className="inline-flex items-center gap-1 text-xs font-medium text-teal-700 hover:text-teal-900">
      {children}<ChevronRight size={14} aria-hidden="true" />
    </button>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="py-6 text-center text-sm text-gray-400">{children}</p>;
}

function MessageCard({ message, replyToProfileMessage }: { message: any; replyToProfileMessage: (id: string, text: string) => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [error, setError] = useState('');

  const send = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    if (!text.trim()) { setError('Please enter a reply message.'); return; }
    setStatus('sending');
    try {
      await replyToProfileMessage(message.id, text);
      setStatus('sent'); setText(''); setOpen(false);
    } catch (err) {
      setStatus('error');
      setError(err instanceof Error ? err.message : 'Could not send reply. Please try again.');
      logError(err, 'desktop-overview-reply', { id: message.id });
    }
  };

  return (
    <div className="py-3 first:pt-0 last:pb-0">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-gray-800">{message.topicLabel || message.topic || 'Message'}</p>
          <p className="text-xs text-gray-500">
            {message.userName || message.userEmail || 'Member'}
            {dateLabel(message.createdAt) ? ` · ${dateLabel(message.createdAt)}` : ''}
          </p>
        </div>
        {!message.adminReply && <span className="shrink-0 rounded-full bg-orange-100 px-2 py-0.5 text-[11px] font-medium text-orange-800">Awaiting reply</span>}
      </div>
      <p className="mt-1 line-clamp-2 text-sm text-gray-600">{message.message}</p>
      {message.adminReply && (
        <div className="mt-2 flex gap-2 rounded-lg border border-emerald-100 bg-emerald-50/70 p-2">
          <CornerDownRight size={14} className="mt-0.5 shrink-0 text-emerald-700" aria-hidden="true" />
          <div className="min-w-0">
            <p className="text-xs font-semibold text-emerald-800">Your reply{dateLabel(message.adminReplyAt) ? ` · ${dateLabel(message.adminReplyAt)}` : ''}</p>
            <p className="text-sm text-gray-700">{message.adminReply}</p>
          </div>
        </div>
      )}
      {open ? (
        <form onSubmit={send} className="mt-2 space-y-2">
          <textarea
            aria-label={`Reply to ${message.userName || message.userEmail || 'member'}`}
            maxLength={LIMITS.comment} rows={2} value={text}
            onChange={event => { setError(''); setText(event.target.value); }}
            placeholder="Write a reply to this member..."
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-teal-500"
          />
          {error && <p role="alert" className="text-xs text-red-600">{error}</p>}
          <div className="flex gap-2">
            <button type="submit" disabled={status === 'sending'}
              className={`inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-medium text-white ${status === 'sending' ? 'bg-gray-300' : 'bg-teal-600 hover:bg-teal-700'}`}>
              {status === 'sending' ? <><LoaderCircle size={12} className="animate-spin" aria-hidden="true" />Sending...</> : <><Send size={12} aria-hidden="true" />Send reply</>}
            </button>
            <button type="button" onClick={() => { setOpen(false); setError(''); }} className="rounded-lg px-3 py-1.5 text-xs text-gray-500 hover:bg-gray-100">Cancel</button>
          </div>
        </form>
      ) : (
        <button type="button" onClick={() => setOpen(true)} className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-teal-700 hover:text-teal-900">
          <CornerDownRight size={12} aria-hidden="true" />{message.adminReply ? 'Reply again' : 'Reply'}
        </button>
      )}
      {status === 'sent' && <p role="status" className="mt-1 text-xs text-emerald-700">Reply sent.</p>}
    </div>
  );
}

export default function Overview() {
  const {
    currentUser, events, forumPosts, adminRsvps, allUserDocs, volunteers, mailingList, allUsers,
    errorLogs, profileMessages, pendingForumReplies, overlayUploads, eventCommentReports,
    pendingDocsCount, flaggedPostsCount, flaggedRepliesCount,
    setAdminTab, setAdminViewThread, setViewingDoc, openEditEvent, goToEvent, replyToProfileMessage,
  } = useApp();

  const now = useMemo(() => new Date(), []);
  const username = currentUser?.userName || '';

  const volunteerDates = useMemo(() => volunteers.map((item: any) => toDate(item.joinDate)), [volunteers]);
  const subscriberDates = useMemo(() => mailingList.map((item: any) => toDate(item.addedAt)), [mailingList]);
  const rsvpDates = useMemo(() => adminRsvps.map((item: any) => toDate(item.createdAt)), [adminRsvps]);
  const postDates = useMemo(() => forumPosts.map((item: any) => toDate(item.createdAt)), [forumPosts]);
  const forumDates = useMemo(() => forumActivityDates(forumPosts), [forumPosts]);

  const labels = useMemo(() => weekLabels(WEEKS, now), [now]);
  const series = useMemo(() => [
    { id: 'rsvps', label: 'Event RSVPs', color: '#3a8f57', values: weeklyCounts(rsvpDates, WEEKS, now) },
    { id: 'forum', label: 'Forum posts & replies', color: '#3f80b8', values: weeklyCounts(forumDates, WEEKS, now) },
    { id: 'volunteers', label: 'Volunteer sign-ups', color: '#b8781a', values: weeklyCounts(volunteerDates, WEEKS, now) },
  ], [rsvpDates, forumDates, volunteerDates, now]);
  const ticks = useMemo(() => niceTicks(Math.max(...series.flatMap(item => item.values))), [series]);

  const upcoming = useMemo(() => upcomingEvents(events, now), [events, now]);
  const rsvpCount = (eventId: string) => adminRsvps.filter((item: any) => item.eventId === eventId).length;
  const openReports = (eventId: string) => eventCommentReports.filter((item: any) => item.eventId === eventId && item.status !== 'resolved').length;

  const awaitingReply = profileMessages.filter((item: any) => !item.adminReply).length;
  const queue = [
    { id: 'documents', label: 'Documents awaiting review', count: pendingDocsCount, icon: FileText, tab: 'documents' },
    { id: 'forum', label: 'Forum posts flagged or pending', count: flaggedPostsCount + flaggedRepliesCount, icon: Flag, tab: 'forum' },
    { id: 'replies', label: 'Replies awaiting approval', count: pendingForumReplies.length, icon: MessageSquare, tab: 'forum' },
    { id: 'overlays', label: 'Map overlays to approve', count: overlayUploads.filter((item: any) => item.status === 'pending').length, icon: Layers, tab: 'overlays' },
    { id: 'reports', label: 'Reported event comments', count: countOpenEventReports(events, eventCommentReports), icon: Calendar, tab: 'events' },
    { id: 'messages', label: 'Messages awaiting a reply', count: awaitingReply, icon: Inbox, tab: null },
  ].filter(item => item.count > 0);

  const jump = (tab: string | null) => {
    if (tab) { setAdminTab(tab); return; }
    document.getElementById('overview-messages')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="font-display text-3xl text-gray-900">{greetingFor(now)}{username ? `, ${username}` : ''}.</h2>
          <p className="mt-1 text-sm text-gray-500">
            {queue.length === 0
              ? 'Nothing is waiting on you. Here is how the trail community is doing.'
              : `${queue.reduce((total, item) => total + item.count, 0)} item${queue.reduce((total, item) => total + item.count, 0) === 1 ? '' : 's'} need a look. Here is how the trail community is doing.`}
          </p>
        </div>
        <p className="text-sm text-gray-500">{now.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}</p>
      </div>

      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <StatTile label="Volunteers" value={volunteers.length} recent={countSince(volunteerDates, 30, now)} trend={weeklyCounts(volunteerDates, WEEKS, now)} />
        <StatTile label="Newsletter subscribers" value={mailingList.length} recent={countSince(subscriberDates, 30, now)} trend={weeklyCounts(subscriberDates, WEEKS, now)} />
        <StatTile label="Event RSVPs" value={adminRsvps.length} recent={countSince(rsvpDates, 30, now)} trend={weeklyCounts(rsvpDates, WEEKS, now)} />
        <StatTile label="Forum posts" value={forumPosts.length} recent={countSince(postDates, 30, now)} trend={weeklyCounts(postDates, WEEKS, now)} />
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <SectionCard title="Activity, last 12 weeks" icon={Sprout}>
            <ActivityChart labels={labels} series={series} ticks={ticks} />
          </SectionCard>
        </div>
        <SectionCard title="Needs attention" icon={Inbox}>
          {queue.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-6 text-center">
              <CircleCheck size={28} className="text-emerald-600" aria-hidden="true" />
              <p className="text-sm font-medium text-gray-700">All caught up</p>
              <p className="text-xs text-gray-400">New submissions will show up here.</p>
            </div>
          ) : (
            <ul className="divide-y divide-gray-100">
              {queue.map(item => (
                <li key={item.id}>
                  <button type="button" onClick={() => jump(item.tab)}
                    className="flex w-full items-center gap-3 py-2.5 text-left hover:bg-gray-50">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-orange-50 text-orange-700">
                      <item.icon size={16} aria-hidden="true" />
                    </span>
                    <span className="min-w-0 flex-1 text-sm text-gray-700">{item.label}</span>
                    <span className="rounded-full bg-orange-500 px-2 py-0.5 text-xs font-semibold text-white" style={{ fontVariantNumeric: 'tabular-nums' }}>{item.count}</span>
                    <ChevronRight size={16} className="text-gray-300" aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <SectionCard title="Upcoming events" icon={Calendar} action={<JumpLink onClick={() => setAdminTab('events')}>All events</JumpLink>}>
            {upcoming.length === 0 ? <Empty>Nothing on the calendar yet.</Empty> : (
              <table className="w-full text-sm">
                <thead className="text-left text-xs text-gray-500">
                  <tr>
                    <th className="pb-2 pr-3 font-medium">Date</th>
                    <th className="pb-2 pr-3 font-medium">Event</th>
                    <th className="pb-2 pr-3 text-right font-medium">RSVPs</th>
                    <th className="pb-2 pr-3 text-right font-medium">Photos</th>
                    <th className="pb-2 pr-3 text-right font-medium">Reports</th>
                    <th className="pb-2 text-right font-medium"><span className="sr-only">Actions</span></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {upcoming.map((event: any) => {
                    const date = eventDate(event.date);
                    const reports = openReports(event.id);
                    return (
                      <tr key={event.id} className="group">
                        <td className="py-2.5 pr-3">
                          <div className="flex w-12 flex-col items-center rounded-lg bg-teal-50 py-1 text-teal-800">
                            <span className="text-[10px] uppercase tracking-wide">{date.month}</span>
                            <span className="text-lg font-semibold leading-tight">{date.day}</span>
                          </div>
                        </td>
                        <td className="py-2.5 pr-3">
                          <p className="font-medium text-gray-800">{event.title}</p>
                          <p className="text-xs text-gray-500">{[event.time, event.location].filter(Boolean).join(' · ')}</p>
                        </td>
                        <td className="py-2.5 pr-3 text-right text-gray-700" style={{ fontVariantNumeric: 'tabular-nums' }}>{rsvpCount(event.id)}</td>
                        <td className="py-2.5 pr-3 text-right text-gray-700" style={{ fontVariantNumeric: 'tabular-nums' }}>
                          <span className="inline-flex items-center gap-1"><Images size={13} className="text-gray-400" aria-hidden="true" />{Array.isArray(event.images) ? event.images.length : 0}</span>
                        </td>
                        <td className="py-2.5 pr-3 text-right" style={{ fontVariantNumeric: 'tabular-nums' }}>
                          {reports > 0
                            ? <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700"><Flag size={12} aria-hidden="true" />{reports}</span>
                            : <span className="text-gray-300">—</span>}
                        </td>
                        <td className="py-2.5 text-right">
                          <span className="inline-flex gap-1">
                            <button type="button" onClick={() => openEditEvent(event)} aria-label={`Edit ${event.title}`} className="rounded-lg p-1.5 text-teal-700 hover:bg-teal-50"><PenLine size={15} aria-hidden="true" /></button>
                            <button type="button" onClick={() => goToEvent(event.id)} aria-label={`Open ${event.title} on the public site`} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700"><ExternalLink size={15} aria-hidden="true" /></button>
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </SectionCard>
        </div>
        <SectionCard id="overview-messages" title="Member messages" icon={Inbox}>
          {profileMessages.length === 0 ? <Empty>No messages yet.</Empty> : (
            <div className="divide-y divide-gray-100">
              {profileMessages.slice(0, 5).map((message: any) => (
                <MessageCard key={message.id} message={message} replyToProfileMessage={replyToProfileMessage} />
              ))}
            </div>
          )}
        </SectionCard>
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <SectionCard title="Recent forum posts" icon={MessageSquare} action={<JumpLink onClick={() => setAdminTab('forum')}>Open forum</JumpLink>}>
          {forumPosts.length === 0 ? <Empty>No posts yet.</Empty> : (
            <ul className="divide-y divide-gray-100">
              {forumPosts.slice(0, 6).map((post: any) => (
                <li key={post.id}>
                  <button type="button" onClick={() => { setAdminTab('forum'); setAdminViewThread(post); }} className="w-full py-2 text-left hover:bg-gray-50">
                    <p className="truncate text-sm font-medium text-gray-800">{post.title}</p>
                    <p className="text-xs text-gray-500">{post.author} · {post.date}{post.status && post.status !== 'approved' ? ` · ${post.status}` : ''}</p>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
        <SectionCard title="Recent uploads" icon={FileText} action={<JumpLink onClick={() => setAdminTab('documents')}>All documents</JumpLink>}>
          {allUserDocs.length === 0 ? <Empty>No uploads yet.</Empty> : (
            <ul className="divide-y divide-gray-100">
              {allUserDocs.slice(0, 6).map((document: any) => (
                <li key={document.id}>
                  <button type="button" onClick={() => setViewingDoc(document)} className="flex w-full items-center gap-3 py-2 text-left hover:bg-gray-50">
                    <span className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-gray-800">{document.title || document.name}</p>
                      <p className="text-xs text-gray-500">{document.userName}{dateLabel(document.uploadDate, { dateStyle: 'medium' }) ? ` · ${dateLabel(document.uploadDate, { dateStyle: 'medium' })}` : ''}</p>
                    </span>
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${
                      document.status === 'pending' ? 'bg-orange-100 text-orange-800'
                        : document.status === 'rejected' ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-800'}`}>
                      {document.status || 'approved'}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
        <SectionCard title="Community" icon={Sprout} action={<JumpLink onClick={() => setAdminTab('users')}>Manage users</JumpLink>}>
          <dl className="space-y-3 text-sm">
            {[
              { label: 'Registered accounts', value: allUsers.length },
              { label: 'Accounts under moderation', value: allUsers.filter((item: any) => item.moderated).length },
              { label: 'Events scheduled', value: events.length },
              { label: 'Open forum threads', value: forumPosts.filter((item: any) => item.status === 'approved' || !item.status).length },
            ].map(row => (
              <div key={row.label} className="flex items-center justify-between gap-3">
                <dt className="text-gray-600">{row.label}</dt>
                <dd className="font-semibold text-gray-900" style={{ fontVariantNumeric: 'tabular-nums' }}>{row.value.toLocaleString()}</dd>
              </div>
            ))}
          </dl>
        </SectionCard>
      </div>

      <SectionCard title={`Recent errors${errorLogs.length ? ` (${errorLogs.length})` : ''}`} icon={Bug} action={(
        <button type="button" onClick={() => setAdminTab('logs')} className="text-xs font-semibold text-teal-700 hover:underline">View all logs</button>
      )}>
        {errorLogs.length === 0 ? <Empty>No client errors logged.</Empty> : (
          <div className="max-h-72 space-y-1 overflow-auto font-mono text-xs">
            {errorLogs.map((log: any) => (
              <div key={log.id} className="border-b border-gray-100 py-1.5 last:border-0">
                <span className="text-gray-400">{dateLabel(log.createdAt || log.at) || '—'}</span>{' '}
                <span className="text-red-700">{log.context || 'unknown'}</span>:{' '}
                <span className="text-gray-700">{log.message || JSON.stringify(log)}</span>
              </div>
            ))}
          </div>
        )}
      </SectionCard>
    </div>
  );
}
