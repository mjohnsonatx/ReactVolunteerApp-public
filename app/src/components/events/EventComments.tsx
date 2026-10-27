import { useCallback, useEffect, useRef, useState } from 'react';
import { Flag, Loader2, MessageSquare, Pencil, Send, Trash2, UserCheck } from 'lucide-react';
import { useApp } from '@runtime/app-context';
import { LIMITS } from '../../utils/sanitize';
import {
  fetchEventComments,
  moderateEventComment,
  postEventComment,
  removeEventComment,
  reportEventComment,
  updateEventComment,
  type EventComment,
} from '../../services/eventComments';
import ReportCommentDialog from './ReportCommentDialog';

function formatStamp(value: number | null): string {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleString();
}

type EventCommentsProps = {
  eventId: string;
  /** Rendered inline (event detail page) instead of inside a disclosure. */
  alwaysOpen?: boolean;
  commentCountHint?: number;
};

/**
 * Event discussion thread. Everything (read + write) travels through callable
 * Functions, so anonymity, moderation, and rate limits are enforced server
 * side. Comments load in small batches with an explicit "Load more" control.
 */
export default function EventComments({ eventId, alwaysOpen = false, commentCountHint = 0 }: EventCommentsProps) {
  const { currentUser, isAdmin, setShowAuthModal, setCurrentUser } = useApp();

  const [open, setOpen] = useState(alwaysOpen);
  const [comments, setComments] = useState<EventComment[]>([]);
  const [cursor, setCursor] = useState<number | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [loaded, setLoaded] = useState(false);

  const [draft, setDraft] = useState('');
  const [anonymous, setAnonymous] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');
  const [statusMessage, setStatusMessage] = useState('');

  const [editingId, setEditingId] = useState('');
  const [editDraft, setEditDraft] = useState('');
  const [rowError, setRowError] = useState('');
  const [busyId, setBusyId] = useState('');
  const [reportTarget, setReportTarget] = useState<EventComment | null>(null);

  const panelId = `event-comments-${eventId}`;
  const mounted = useRef(true);
  useEffect(() => () => { mounted.current = false; }, []);

  const load = useCallback(async (options: { append?: boolean; cursor?: number | null } = {}) => {
    const append = !!options.append;
    if (append) setLoadingMore(true); else setLoading(true);
    setLoadError('');
    try {
      const page = await fetchEventComments(eventId, { cursor: options.cursor ?? null });
      if (!mounted.current) return;
      setComments(prev => (append ? [...prev, ...page.comments] : page.comments));
      setCursor(page.nextCursor);
      setHasMore(page.hasMore);
      setLoaded(true);
    } catch (err) {
      if (mounted.current) setLoadError(err?.message || 'Could not load comments.');
    } finally {
      if (mounted.current) { setLoading(false); setLoadingMore(false); }
    }
  }, [eventId]);

  useEffect(() => {
    if (!open || loaded) return;
    load();
  }, [open, loaded, load]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!currentUser) { setShowAuthModal(true); return; }
    setFormError('');
    setStatusMessage('');
    setSubmitting(true);
    try {
      const comment = await postEventComment(eventId, draft, anonymous);
      if (!mounted.current) return;
      setComments(prev => [comment, ...prev.filter(item => item.id !== comment.id)]);
      setDraft('');
      setStatusMessage(comment.status === 'pending'
        ? 'Thanks! Your comment is awaiting moderator review.'
        : 'Comment posted.');
    } catch (err) {
      if (mounted.current) setFormError(err?.message || 'Could not post your comment.');
    } finally {
      if (mounted.current) setSubmitting(false);
    }
  };

  const startEdit = (comment: EventComment) => {
    setEditingId(comment.id);
    setEditDraft(comment.body);
    setRowError('');
  };

  const saveEdit = async (comment: EventComment) => {
    setRowError('');
    setBusyId(comment.id);
    try {
      const updated = await updateEventComment(comment.id, editDraft);
      if (!mounted.current) return;
      setComments(prev => prev.map(item => (item.id === updated.id ? updated : item)));
      setEditingId('');
      setStatusMessage('Comment updated.');
    } catch (err) {
      if (mounted.current) setRowError(err?.message || 'Could not save your changes.');
    } finally {
      if (mounted.current) setBusyId('');
    }
  };

  const handleDelete = async (comment: EventComment) => {
    setRowError('');
    setBusyId(comment.id);
    try {
      await removeEventComment(comment.id);
      if (!mounted.current) return;
      setComments(prev => prev.filter(item => item.id !== comment.id));
      setStatusMessage('Comment deleted.');
    } catch (err) {
      if (mounted.current) setRowError(err?.message || 'Could not delete the comment.');
    } finally {
      if (mounted.current) setBusyId('');
    }
  };

  const handleModerate = async (comment: EventComment, action: 'approve' | 'remove') => {
    setRowError('');
    setBusyId(comment.id);
    try {
      const result = await moderateEventComment(comment.id, action);
      if (!mounted.current) return;
      setComments(prev => prev.map(item => (
        item.id === comment.id ? { ...item, status: result.status, flagged: false } : item
      )));
      setStatusMessage(action === 'approve' ? 'Comment approved.' : 'Comment hidden from members.');
    } catch (err) {
      if (mounted.current) setRowError(err?.message || 'Could not update the comment.');
    } finally {
      if (mounted.current) setBusyId('');
    }
  };

  const submitReport = async (reason: string, details: string) => {
    if (!reportTarget) return;
    const result = await reportEventComment(reportTarget.id, reason, details);
    setComments(prev => prev.map(item => (
      item.id === reportTarget.id ? { ...item, reportedByMe: true, flagged: true } : item
    )));
    if (result?.reportedContent && currentUser) {
      setCurrentUser({ ...currentUser, reportedContent: result.reportedContent });
    }
    setStatusMessage('Report submitted. Thank you.');
    setReportTarget(null);
  };

  const count = comments.length || commentCountHint;

  const body = (
    <div id={panelId} className="mt-3 space-y-4">
      <h3 className="sr-only">Comments for this event</h3>

      <p className="sr-only" role="status" aria-live="polite">{statusMessage}</p>

      {currentUser ? (
        <form onSubmit={handleSubmit} className="space-y-2 rounded-xl border border-gray-100 bg-gray-50 p-3">
          <label htmlFor={`${panelId}-input`} className="block text-sm font-medium text-gray-700">
            Add a question or comment
          </label>
          <textarea
            id={`${panelId}-input`}
            rows={3}
            maxLength={LIMITS.eventComment}
            value={draft}
            onChange={(event) => { setFormError(''); setDraft(event.target.value); }}
            placeholder="Ask a question or share something helpful about this event."
            className="w-full resize-none rounded-lg border border-gray-200 px-3 py-2 outline-none focus:border-teal-500"
            aria-describedby={`${panelId}-help`}
          />
          <div className="flex flex-wrap items-center justify-between gap-3">
            <label className="flex items-center gap-2 text-sm text-gray-600">
              <input
                type="checkbox"
                checked={anonymous}
                onChange={event => setAnonymous(event.target.checked)}
                className="h-4 w-4 rounded border-gray-300"
              />
              Post anonymously
            </label>
            <button
              type="submit"
              disabled={submitting || !draft.trim()}
              className="flex items-center gap-2 rounded-lg bg-teal-500 px-4 py-2 text-sm font-medium text-white hover:bg-teal-600 disabled:opacity-60"
            >
              {submitting ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : <Send size={16} aria-hidden="true" />}
              {submitting ? 'Posting...' : 'Post comment'}
            </button>
          </div>
          <p id={`${panelId}-help`} className="text-xs text-gray-500">
            {anonymous
              ? 'Your name is hidden from other members. Site administrators can still see who posted.'
              : `Posting as ${currentUser.userName ? `@${currentUser.userName}` : 'member'}.`}
            {' '}{draft.length}/{LIMITS.eventComment} characters.
          </p>
          {formError && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{formError}</p>}
        </form>
      ) : (
        <button
          type="button"
          onClick={() => setShowAuthModal(true)}
          className="w-full rounded-xl border-2 border-dashed border-gray-200 py-3 text-sm text-gray-500 hover:border-teal-300"
        >
          Sign in to join the conversation
        </button>
      )}

      {loading && (
        <p className="flex items-center gap-2 py-4 text-sm text-gray-500" role="status">
          <Loader2 size={16} className="animate-spin" aria-hidden="true" /> Loading comments...
        </p>
      )}

      {loadError && (
        <div role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
          {loadError}{' '}
          <button type="button" onClick={() => load()} className="underline">Try again</button>
        </div>
      )}

      {!loading && !loadError && comments.length === 0 && (
        <p className="py-4 text-center text-sm text-gray-400">No comments yet - start the conversation.</p>
      )}

      {rowError && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{rowError}</p>}

      <ul className="space-y-3">
        {comments.map(comment => (
          <li key={comment.id} className="rounded-xl border border-gray-100 p-3">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="font-medium text-gray-800">{comment.authorLabel}</span>
              {comment.anonymous && (
                <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500">Anonymous</span>
              )}
              {isAdmin && comment.anonymous && comment.authorName && (
                <span className="flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-xs text-amber-700">
                  <UserCheck size={12} aria-hidden="true" /> {comment.authorUserName ? `@${comment.authorUserName}` : comment.authorName}
                </span>
              )}
              <span className="text-xs text-gray-400">
                <time dateTime={comment.createdAt ? new Date(comment.createdAt).toISOString() : undefined}>
                  {formatStamp(comment.createdAt)}
                </time>
              </span>
              {comment.edited && (
                <span className="text-xs italic text-gray-400" title={`Edited ${formatStamp(comment.editedAt)}`}>
                  (edited)
                </span>
              )}
              {comment.status === 'pending' && (
                <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs text-amber-700">Awaiting review</span>
              )}
              {comment.flagged && isAdmin && (
                <span className="rounded-full bg-red-50 px-2 py-0.5 text-xs text-red-600">Flagged</span>
              )}
            </div>

            {editingId === comment.id ? (
              <div className="mt-2 space-y-2">
                <label className="sr-only" htmlFor={`${panelId}-edit-${comment.id}`}>Edit your comment</label>
                <textarea
                  id={`${panelId}-edit-${comment.id}`}
                  rows={3}
                  maxLength={LIMITS.eventComment}
                  value={editDraft}
                  onChange={event => setEditDraft(event.target.value)}
                  className="w-full resize-none rounded-lg border border-gray-200 px-3 py-2 outline-none focus:border-teal-500"
                />
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => saveEdit(comment)}
                    disabled={busyId === comment.id}
                    className="rounded-lg bg-teal-500 px-3 py-1.5 text-sm text-white hover:bg-teal-600 disabled:opacity-60"
                  >
                    {busyId === comment.id ? 'Saving...' : 'Save changes'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditingId('')}
                    className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <p className="mt-2 whitespace-pre-wrap text-gray-700">{comment.body}</p>
            )}

            <div className="mt-2 flex flex-wrap items-center gap-3">
              {comment.canEdit && editingId !== comment.id && (
                <button
                  type="button"
                  onClick={() => startEdit(comment)}
                  className="flex items-center gap-1 rounded-full px-2 py-1 text-xs text-gray-500 hover:bg-teal-50 hover:text-teal-700"
                >
                  <Pencil size={12} aria-hidden="true" /> Edit
                </button>
              )}
              {comment.canDelete && (
                <button
                  type="button"
                  onClick={() => handleDelete(comment)}
                  disabled={busyId === comment.id}
                  className="flex items-center gap-1 rounded-full px-2 py-1 text-xs text-gray-500 hover:bg-red-50 hover:text-red-600 disabled:opacity-60"
                >
                  <Trash2 size={12} aria-hidden="true" /> Delete
                </button>
              )}
              {isAdmin && comment.status !== 'approved' && (
                <button
                  type="button"
                  onClick={() => handleModerate(comment, 'approve')}
                  disabled={busyId === comment.id}
                  className="rounded-full px-2 py-1 text-xs text-emerald-700 hover:bg-emerald-50 disabled:opacity-60"
                >
                  Approve
                </button>
              )}
              {isAdmin && comment.status === 'approved' && (
                <button
                  type="button"
                  onClick={() => handleModerate(comment, 'remove')}
                  disabled={busyId === comment.id}
                  className="rounded-full px-2 py-1 text-xs text-amber-700 hover:bg-amber-50 disabled:opacity-60"
                >
                  Hide
                </button>
              )}
              {currentUser && !comment.isOwn && (
                <button
                  type="button"
                  onClick={() => setReportTarget(comment)}
                  disabled={comment.reportedByMe}
                  className={`flex items-center gap-1 rounded-full px-2 py-1 text-xs ${comment.reportedByMe
                    ? 'cursor-default bg-red-50 text-red-600'
                    : 'text-gray-400 hover:bg-red-50 hover:text-red-500'}`}
                >
                  <Flag size={12} aria-hidden="true" /> {comment.reportedByMe ? 'Reported' : 'Report'}
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>

      {hasMore && (
        <button
          type="button"
          onClick={() => load({ append: true, cursor })}
          disabled={loadingMore}
          className="w-full rounded-lg border border-gray-200 py-2 text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-60"
        >
          {loadingMore ? 'Loading...' : 'Load more comments'}
        </button>
      )}

      {reportTarget && (
        <ReportCommentDialog onClose={() => setReportTarget(null)} onSubmit={submitReport} />
      )}
    </div>
  );

  if (alwaysOpen) {
    return <section aria-label="Event discussion" className="mt-4">{body}</section>;
  }

  return (
    <section aria-label="Event discussion" className="mt-4 border-t border-gray-100 pt-3">
      <button
        type="button"
        onClick={() => setOpen(value => !value)}
        aria-expanded={open}
        aria-controls={panelId}
        className="flex w-full items-center justify-between rounded-lg px-2 py-2 text-sm font-medium text-teal-700 hover:bg-teal-50"
      >
        <span className="flex items-center gap-2">
          <MessageSquare size={16} aria-hidden="true" />
          Questions &amp; comments{count ? ` (${count})` : ''}
        </span>
        <span aria-hidden="true">{open ? '-' : '+'}</span>
      </button>
      {open && body}
    </section>
  );
}
