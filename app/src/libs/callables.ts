import { httpsCallable } from 'firebase/functions';
import { functions } from '@runtime/firebase';
export const initializeAccountProfileFn = httpsCallable(functions, 'initializeAccountProfile');
export const deleteOwnAccountDataFn = httpsCallable(functions, 'deleteOwnAccountData', { timeout: 540_000 });
export const submitVolunteerSignupFn = httpsCallable(functions, 'submitVolunteerSignup');
export const subscribeMailingListFn = httpsCallable(functions, 'subscribeMailingList');
export const submitProfileMessageFn = httpsCallable(functions, 'submitProfileMessage');
export const submitRsvpFn = httpsCallable(functions, 'submitRsvp');
export const cancelRsvpFn = httpsCallable(functions, 'cancelRsvp');
export const submitForumPostFn = httpsCallable(functions, 'submitForumPost');
export const submitReplyFn = httpsCallable(functions, 'submitReply');
export const castVoteFn = httpsCallable(functions, 'castVote');
export const flagContentFn = httpsCallable(functions, 'flagContent');
export const updateAccountProfileFn = httpsCallable(functions, 'updateAccountProfile');
export const syncUserEmailFn = httpsCallable(functions, 'syncUserEmail');
export const logClientErrorFn = httpsCallable(functions, 'logClientError');
export const listPublicDocumentsFn = httpsCallable(functions, 'listPublicDocuments');
export const listAdminStorageObjectsFn = httpsCallable(functions, 'listAdminStorageObjects');
export const createDocumentUploadTicketFn = httpsCallable(functions, 'createDocumentUploadTicket');
export const createDocumentRecordFn = httpsCallable(functions, 'createDocumentRecord');
export const createAdminDocumentRecordFn = httpsCallable(functions, 'createAdminDocumentRecord');
export const setDocumentStatusFn = httpsCallable(functions, 'setDocumentStatus');
export const toggleDocumentPublishedFn = httpsCallable(functions, 'toggleDocumentPublished');
export const setAdminStorageObjectPublishedFn = httpsCallable(functions, 'setAdminStorageObjectPublished');
export const deleteDocumentRecordFn = httpsCallable(functions, 'deleteDocumentRecord');
export const deleteOwnDocumentFn = httpsCallable(functions, 'deleteOwnDocument');
export const deleteVolunteerFn = httpsCallable(functions, 'deleteVolunteer');
export const updateVolunteerFn = httpsCallable(functions, 'updateVolunteer');
export const removeMailingListEntryFn = httpsCallable(functions, 'removeMailingListEntry');
export const saveEventFn = httpsCallable(functions, 'saveEvent');
export const deleteEventFn = httpsCallable(functions, 'deleteEvent');
export const approveForumPostFn = httpsCallable(functions, 'approveForumPost');
export const deleteForumPostFn = httpsCallable(functions, 'deleteForumPost');
export const deleteForumReplyFn = httpsCallable(functions, 'deleteForumReply');
export const approvePendingForumReplyFn = httpsCallable(functions, 'approvePendingForumReply');
export const deletePendingForumReplyFn = httpsCallable(functions, 'deletePendingForumReply');
export const unflagForumReplyFn = httpsCallable(functions, 'unflagForumReply');
export const importOverlayFn = httpsCallable(functions, 'importOverlay');
export const deleteOverlayFn = httpsCallable(functions, 'deleteOverlay');
export const toggleOverlayPublishedFn = httpsCallable(functions, 'toggleOverlayPublished');
export const approveOverlayUploadFn = httpsCallable(functions, 'approveOverlayUpload');
export const rejectOverlayUploadFn = httpsCallable(functions, 'rejectOverlayUpload');
export const deleteOverlayUploadFn = httpsCallable(functions, 'deleteOverlayUpload');
export const toggleUserModerationFn = httpsCallable(functions, 'toggleUserModeration');
export const saveAdminUserProfileFn = httpsCallable(functions, 'saveAdminUserProfile');
export const adminAnonymizeForumPostsFn = httpsCallable(functions, 'adminAnonymizeForumPosts');
export const adminDeleteUserDataFn = httpsCallable(functions, 'adminDeleteUserData', { timeout: 540_000 });
export const replyToProfileMessageFn = httpsCallable(functions, 'replyToProfileMessage');
export const saveSiteContentFn = httpsCallable(functions, 'saveSiteContent');
export const recordAdminLogsExportFn = httpsCallable(functions, 'recordAdminLogsExport');

// Event images (admin only, enforced server-side).
export const createEventImageUploadTicketFn = httpsCallable(functions, 'createEventImageUploadTicket');
export const attachEventImageFn = httpsCallable(functions, 'attachEventImage');
export const updateEventImageFn = httpsCallable(functions, 'updateEventImage');
export const deleteEventImageFn = httpsCallable(functions, 'deleteEventImage');

// Event discussion comments.
export const listEventCommentsFn = httpsCallable(functions, 'listEventComments');
export const submitEventCommentFn = httpsCallable(functions, 'submitEventComment');
export const editEventCommentFn = httpsCallable(functions, 'editEventComment');
export const deleteEventCommentFn = httpsCallable(functions, 'deleteEventComment');
export const reportEventCommentFn = httpsCallable(functions, 'reportEventComment');
export const moderateEventCommentFn = httpsCallable(functions, 'moderateEventComment');

// Polls. Totals are always read back from these callables, never from Firestore.
export const savePollFn = httpsCallable(functions, 'savePoll');
export const setPollStatusFn = httpsCallable(functions, 'setPollStatus');
export const deletePollFn = httpsCallable(functions, 'deletePoll');
export const listAdminPollsFn = httpsCallable(functions, 'listAdminPolls');
export const listPollVotesFn = httpsCallable(functions, 'listPollVotes');
export const listPollsFn = httpsCallable(functions, 'listPolls');
export const getPollFn = httpsCallable(functions, 'getPoll');
export const getPollResultsFn = httpsCallable(functions, 'getPollResults');
export const listPublicPollVotesFn = httpsCallable(functions, 'listPublicPollVotes');
export const castPollVoteFn = httpsCallable(functions, 'castPollVote');

// Mailing list CSV export (admin only).
export const exportMailingListCsvFn = httpsCallable(functions, 'exportMailingListCsv');

// Opt-in push notifications and the daily email digest.
export const getNotificationSettingsFn = httpsCallable(functions, 'getNotificationSettings');
export const saveNotificationSettingsFn = httpsCallable(functions, 'saveNotificationSettings');
export const registerPushTokenFn = httpsCallable(functions, 'registerPushToken');
export const unregisterPushTokenFn = httpsCallable(functions, 'unregisterPushToken');
export const getEmailDeliverySettingsFn = httpsCallable(functions, 'getEmailDeliverySettings');
export const saveEmailDeliverySettingsFn = httpsCallable(functions, 'saveEmailDeliverySettings');
export const sendTestEmailFn = httpsCallable(functions, 'sendTestEmail');

// FunctionsError.message carries the server-side HttpsError message.
export function callableErrorMessage(err: unknown, fallback: string): string {
  const code = (err as { code?: unknown })?.code;
  if (typeof code !== 'string' || !code.startsWith('functions/')) return fallback;
  const msg = (err as { message?: unknown })?.message;
  return typeof msg === 'string' && msg ? msg : fallback;
}
