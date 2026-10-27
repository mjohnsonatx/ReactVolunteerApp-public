import {
  callableErrorMessage,
  deleteEventCommentFn,
  editEventCommentFn,
  listEventCommentsFn,
  moderateEventCommentFn,
  reportEventCommentFn,
  submitEventCommentFn,
} from '../libs/callables';
import { recordCrash } from '../utils/crashReporting';
import { validateCommentBody } from '../utils/sanitize';

export type EventComment = {
  id: string;
  eventId: string;
  body: string;
  authorLabel: string;
  anonymous: boolean;
  isOwn: boolean;
  canEdit: boolean;
  canDelete: boolean;
  status: string;
  flagged: boolean;
  edited: boolean;
  createdAt: number | null;
  updatedAt: number | null;
  editedAt: number | null;
  reportedByMe: boolean;
  authorId?: string;
  authorName?: string;
  authorUserName?: string;
  reportCount?: number;
};

export type CommentPage = {
  comments: EventComment[];
  nextCursor: number | null;
  hasMore: boolean;
};

export async function fetchEventComments(eventId: string, options: { cursor?: number | null; limit?: number } = {}): Promise<CommentPage> {
  try {
    const response = await listEventCommentsFn({
      eventId,
      cursor: options.cursor ?? null,
      limit: options.limit ?? 10,
    });
    const data = (response.data ?? {}) as CommentPage;
    return {
      comments: Array.isArray(data.comments) ? data.comments : [],
      nextCursor: data.nextCursor ?? null,
      hasMore: !!data.hasMore,
    };
  } catch (err) {
    recordCrash(err, 'eventComments-list', { eventId });
    throw new Error(callableErrorMessage(err, 'Could not load comments. Please try again.'));
  }
}

export async function postEventComment(eventId: string, body: string, anonymous: boolean): Promise<EventComment> {
  const validation = validateCommentBody(body);
  if (!validation.ok) throw new Error(validation.reason);
  try {
    const response = await submitEventCommentFn({ eventId, body: validation.body, anonymous });
    return (response.data as { comment: EventComment }).comment;
  } catch (err) {
    recordCrash(err, 'eventComments-submit', { eventId });
    throw new Error(callableErrorMessage(err, 'Could not post your comment. Please try again.'));
  }
}

export async function updateEventComment(commentId: string, body: string, anonymous?: boolean): Promise<EventComment> {
  const validation = validateCommentBody(body);
  if (!validation.ok) throw new Error(validation.reason);
  try {
    const payload: Record<string, unknown> = { commentId, body: validation.body };
    if (typeof anonymous === 'boolean') payload.anonymous = anonymous;
    const response = await editEventCommentFn(payload);
    return (response.data as { comment: EventComment }).comment;
  } catch (err) {
    recordCrash(err, 'eventComments-edit', { commentId });
    throw new Error(callableErrorMessage(err, 'Could not save your changes. Please try again.'));
  }
}

export async function removeEventComment(commentId: string): Promise<void> {
  try {
    await deleteEventCommentFn({ commentId });
  } catch (err) {
    recordCrash(err, 'eventComments-delete', { commentId });
    throw new Error(callableErrorMessage(err, 'Could not delete the comment. Please try again.'));
  }
}

export async function reportEventComment(commentId: string, reason: string, details: string) {
  try {
    const response = await reportEventCommentFn({ commentId, reason, details });
    return response.data as { reportedContent: Record<string, boolean> };
  } catch (err) {
    recordCrash(err, 'eventComments-report', { commentId });
    throw new Error(callableErrorMessage(err, 'Could not submit the report. Please try again.'));
  }
}

export async function moderateEventComment(commentId: string, action: 'approve' | 'remove') {
  try {
    const response = await moderateEventCommentFn({ commentId, action });
    return response.data as { status: string };
  } catch (err) {
    recordCrash(err, 'eventComments-moderate', { commentId, action });
    throw new Error(callableErrorMessage(err, 'Could not update the comment. Please try again.'));
  }
}
