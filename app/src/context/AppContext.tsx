// context/AppContext.jsx
import type { ReactNode } from 'react';
import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { createUserWithEmailAndPassword, sendEmailVerification, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { deleteObject, ref, uploadBytes } from 'firebase/storage';
import { auth, storage } from '../firebase';
import {
  LIMITS,
  detectMalicious,
  enforceLimit,
  sanitizeEmail,
  sanitizeEventForm,
  sanitizeMultiline,
  sanitizePostForm,
  sanitizeRsvpForm,
  sanitizeText,
  sanitizeUserName,
  sanitizeVolunteerForm,
} from '../utils/sanitize';
import { sanitizeGeoJSON } from '../utils/geojson';
import { logError } from '../utils/logError';
import { useAdminData } from '../hooks/useAdminData';
import { useAuth } from '../hooks/useAuth';
import { useLocalStorageState } from '../hooks/useLocalStorageState';
import { usePublicData } from '../hooks/usePublicData';
import { useSiteContent } from '../hooks/useSiteContent';
import { countOpenEventReports, mergeForumAuthors, mergePendingForumAuthors } from '@watershed/shared';
import { useUserData } from '../hooks/useUserData';
import { useRoute } from '../hooks/useRoute';
import { pathForAdminTab, pathForPage } from '../router/routes';
import { requestPasswordReset } from '../services/accountService';
import { disablePushOnThisDevice } from '../services/notifications';
import BackendProgressOverlay from '../components/shared/BackendProgressOverlay';
import {
  resolveTotpChallenge,
  totpChallengeFromError,
  type TotpSignInChallenge,
} from '../auth/adminMfa';
import { passwordLengthError } from '../auth/passwordPolicy';
import { PUBLIC_DOCUMENTS_ENABLED } from '../features';

import {
  initializeAccountProfileFn, submitVolunteerSignupFn, subscribeMailingListFn, submitProfileMessageFn,
  submitRsvpFn, cancelRsvpFn, submitForumPostFn, submitReplyFn, castVoteFn, flagContentFn,
  callableErrorMessage,
  createDocumentUploadTicketFn, createDocumentRecordFn, createAdminDocumentRecordFn, setDocumentStatusFn,
  toggleDocumentPublishedFn, deleteDocumentRecordFn, deleteOwnDocumentFn, deleteVolunteerFn, updateVolunteerFn,
  removeMailingListEntryFn, saveEventFn, deleteEventFn, approveForumPostFn,
  deleteForumPostFn, deleteForumReplyFn, unflagForumReplyFn, importOverlayFn,
  approvePendingForumReplyFn, deletePendingForumReplyFn,
  deleteOverlayFn, toggleOverlayPublishedFn, approveOverlayUploadFn, rejectOverlayUploadFn,
  deleteOverlayUploadFn, toggleUserModerationFn, saveAdminUserProfileFn,
  adminAnonymizeForumPostsFn, adminDeleteUserDataFn, replyToProfileMessageFn,
} from '../libs/callables';

const AppContext = createContext<any>(null);

async function generateThumbnail(file: File): Promise<Blob | null> {
  const { makeThumbnail } = await import('../utils/thumbnail');
  return makeThumbnail(file);
}
// eslint-disable-next-line react-refresh/only-export-components
export const useApp = () => useContext(AppContext);

export function AppProvider({ children }: { children: ReactNode }) {
  const {
    currentUser,
    setCurrentUser,
    isAdmin,
    hasAdminClaim,
    hasAdminMfaSession,
    adminEnrollmentRequired,
    authLoading,
    accountLoadError,
    refreshUserProfile,
    userVotes,
    setUserVotes,
  } = useAuth();
  const { events, forumPosts: publicForumPosts, publicDocs, overlayGroups } = usePublicData(isAdmin);
  const { rsvps, myMessages } = useUserData(currentUser);
  const {
    allUsers, adminRsvps, errorLogs, adminAuditLogs = [], volunteers, allUserDocs, mailingList,
    profileMessages, forumReports, forumAuthors = [], pendingForumReplies: rawPendingReplies = [], overlayUploads,
    // Older mocks/tests may not provide every collection; default defensively.
    eventCommentReports = [],
  } = useAdminData(isAdmin) as Record<string, any>;
  const forumPosts = useMemo(() => isAdmin ? mergeForumAuthors(publicForumPosts, forumAuthors) : publicForumPosts,
    [isAdmin, publicForumPosts, forumAuthors]);
  const pendingForumReplies = useMemo(() => isAdmin ? mergePendingForumAuthors(rawPendingReplies, forumAuthors) : [],
    [isAdmin, rawPendingReplies, forumAuthors]);
  // const { allUsers, adminRsvps, errorLogs, volunteers, allUserDocs, mailingList } = useAdminData(isAdmin);
  const siteContent = useSiteContent();

  // Conventional routes drive the visible screen: /events, /events/:eventId,
  // /polls, /polls/:pollId, /admin/events, /admin/polls, /admin/mailing-list.
  const { route, navigate, goBack } = useRoute();
  const view = route.view;
  const page = route.page;
  const adminTab = route.adminTab;
  const setPage = (nextPage, params = {}) => navigate(pathForPage(nextPage, params));
  const setAdminTab = (nextTab) => navigate(pathForAdminTab(nextTab));
  const setView = (nextView) => navigate(nextView === 'admin' ? pathForAdminTab(route.adminTab) : '/');
  const goToEvent = (eventId) => navigate(pathForPage('eventDetail', { eventId }));
  const goToPoll = (pollId) => navigate(pathForPage('pollDetail', { pollId }));

  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [openFaq, setOpenFaq] = useState(null);
  const [selectedPostId, setSelectedPostId] = useState<string | null>(null);
  // Keep the open thread attached to the live snapshot, not a stale copy from
  // the click. Replies, votes, moderation, and deletion must remain visible.
  const selectedPost = forumPosts.find(post => post.id === selectedPostId && post.status === 'approved') || null;
  const setSelectedPost = (post) => {
    setSelectedPostId(post?.id ?? null);
    setReplyText('');
    setReplyAnonymous(false);
  };
  const [selectedEventMap, setSelectedEventMap] = useState(null);
  const [adminViewThread, setAdminViewThread] = useState(null);
  const [adminViewUser, setAdminViewUser] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState<any>({});
  const [editingEventId, setEditingEventId] = useState(null);
  const [replyText, setReplyText] = useState('');
  const [replyAnonymous, setReplyAnonymous] = useState(false);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [viewingDoc, setViewingDoc] = useState(null);
  const [adminProfileUser, setAdminProfileUser] = useState(null);
  const [hiddenGroupIds, setHiddenGroupIds] = useState([]);
  const [hiddenItemKeys, setHiddenItemKeys] = useLocalStorageState('hiddenItemKeys', []);

  const [form, setForm] = useState({ name: '', email: '', phone: '' });
  const [mailForm, setMailForm] = useState('');
  const [authForm, setAuthForm] = useState({ email: '', password: '', confirmPassword: '' });
  const [rsvpForm, setRsvpForm] = useState({ eventId: null, name: '', email: '', comments: '' });
  const [eventForm, setEventForm] = useState({
    title: '',
    date: '',
    time: '',
    location: '',
    lat: null,
    lng: null,
    description: '',
  });
  const [newPostForm, setNewPostForm] = useState({ title: '', content: '', anonymous: false });
  const [reportTarget, setReportTarget] = useState<any>(null);
  const [reportForm, setReportForm] = useState({ reason: 'spam', details: '' });
  const [uploadForm, setUploadForm] = useState<{ title: string; notes: string; visibility: string; file: File | null }>({ title: '', notes: '', visibility: 'private', file: null });
  const [profileMessageForm, setProfileMessageForm] = useState({ topic: 'general', message: '' });
  const [adminUploadForm, setAdminUploadForm] = useState<{ title: string; notes: string; publish: boolean; file: File | null }>({ title: '', notes: '', publish: true, file: null });
  const [importJson, setImportJson] = useState('');
  const [importName, setImportName] = useState('');
  const [importDesc, setImportDesc] = useState('');
  const [importColor, setImportColor] = useState('#3366ff');
  const [importError, setImportError] = useState('');
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [showRsvpModal, setShowRsvpModal] = useState(false);
  const [showEventModal, setShowEventModal] = useState(false);
  const [showNewPostModal, setShowNewPostModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [authMode, setAuthMode] = useState('signin');
  const [submitted, setSubmitted] = useState(false);
  const [mailSubmitted, setMailSubmitted] = useState(false);
  const [authError, setAuthError] = useState('');
  const [mfaChallenge, setMfaChallenge] = useState<TotpSignInChallenge | null>(null);
  const [mfaCode, setMfaCode] = useState('');
  const [uploadError, setUploadError] = useState('');
  const [uploadLoading, setUploadLoading] = useState(false);
  const [profileMessageError, setProfileMessageError] = useState('');
  const [profileMessageSubmitted, setProfileMessageSubmitted] = useState(false);
  const [profileMessageLoading, setProfileMessageLoading] = useState(false);
  const [signupError, setSignupError] = useState('');
  const [mailError, setMailError] = useState('');
  const [rsvpError, setRsvpError] = useState('');
  const [postError, setPostError] = useState('');
  const [reportError, setReportError] = useState('');
  const [eventError, setEventError] = useState('');
  const [eventNotice, setEventNotice] = useState('');
  const [adminUploadError, setAdminUploadError] = useState('');
  const [adminUploadLoading, setAdminUploadLoading] = useState(false);
  const [docModerationError, setDocModerationError] = useState('');
  const [docDeleteError, setDocDeleteError] = useState('');
  const [docDeleteMessage, setDocDeleteMessage] = useState('');
  const backendTaskIdRef = useRef(0);
  const [backendTasks, setBackendTasks] = useState<Array<{ id: number; message: string }>>([]);

  const runBackendTask = async <T,>(message: string, task: () => Promise<T>): Promise<T> => {
    const id = ++backendTaskIdRef.current;
    setBackendTasks(tasks => [...tasks, { id, message }]);
    try {
      return await task();
    } finally {
      setBackendTasks(tasks => tasks.filter(t => t.id !== id));
    }
  };

  const activeBackendTask = backendTasks[backendTasks.length - 1] || null;

  useEffect(() => {
    // Wait for session restoration before treating an admin deep link as a
    // signed-out visit. Shell and backend guards still require admin MFA.
    if (!authLoading && !currentUser && route.view === 'admin') navigate('/', { replace: true });
  }, [authLoading, currentUser, route.view, navigate]);

  const userDocs = allUserDocs.filter(d => d.userId === currentUser?.id);
  const routedDocument = route.page === 'documentDetail'
    ? publicDocs.find(doc => doc.id === route.params.documentId) || null
    : null;
  const activeDocument = route.page === 'documentDetail' ? routedDocument : viewingDoc;
  const closeDocument = () => {
    if (route.page === 'documentDetail') goBack('/documents');
    else setViewingDoc(null);
  };
  const isRsvped = (eventId) => rsvps.some(r => r.eventId === eventId && r.userId === currentUser?.id);

  // Overlays visible to public users — excludes explicitly unpublished overlays.
  // Overlays without a published field are treated as published (backward compat).
  const publishedOverlayGroups = useMemo(
    () => overlayGroups.filter(g => g.published !== false),
    [overlayGroups]
  );

  const effectiveVisibleIds = useMemo(
    () => publishedOverlayGroups.filter(g => !hiddenGroupIds.includes(g.id)).map(g => g.id),
    [publishedOverlayGroups, hiddenGroupIds]
  );
  // const effectiveVisibleIds = useMemo(
  //   () => overlayGroups.filter(g => !hiddenGroupIds.includes(g.id)).map(g => g.id),
  //   [overlayGroups, hiddenGroupIds]
  // );

  const toggleOverlayGroup = (id) => {
    setHiddenGroupIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const handleCreateAccount = async (e) => {
  e.preventDefault();
  setAuthError('');
  const cleanEmail = sanitizeEmail(authForm.email);
  if (!cleanEmail) { setAuthError('Please enter a valid email address.'); return; }
  const passwordError = passwordLengthError(authForm.password);
  if (passwordError) { setAuthError(passwordError); return; }
  if (authForm.password !== authForm.confirmPassword) { setAuthError('Passwords do not match.'); return; }
  try {
    await runBackendTask('Creating your account...', async () => {
      const existing = auth.currentUser;
      const user = existing?.email === cleanEmail && !currentUser?.userName
        ? existing
        : (await createUserWithEmailAndPassword(auth, cleanEmail, authForm.password)).user;
      const result = await initializeAccountProfileFn({});
      const cleanUserName = sanitizeUserName((result.data as { userName?: string })?.userName);
      if (!cleanUserName) throw new Error('Could not finish profile setup. Please try again.');
      setCurrentUser({
        id: user.uid, name: cleanUserName, userName: cleanUserName,
        email: cleanEmail, emailVerified: user.emailVerified === true,
        moderated: false, reportedContent: {},
        profileStatus: 'active',
      });
      if (!user.emailVerified) {
        try { await sendEmailVerification(user); }
        catch (error) { logError(error, 'sendEmailVerification'); }
      }
    });
    setShowAuthModal(false);
    setAuthForm({ email: '', password: '', confirmPassword: '' });
  } catch (err) {
    setAuthError(callableErrorMessage(err, 'Could not create account.'));
    logError(err, 'handleCreateAccount', { email: cleanEmail });
  }
};

const handleSignup = async (e) => {
  e.preventDefault();
  setSignupError('');
  const clean = sanitizeVolunteerForm(form);
  if (!clean.name) { setSignupError('Please enter a valid name.'); return; }
  if (!clean.email) { setSignupError('Please enter a valid email address.'); return; }
  const nameCheck = detectMalicious(clean.name);
  if (nameCheck.blocked) { setSignupError(`Invalid input: ${nameCheck.reason}`); return; }
  try {
    await runBackendTask('Submitting volunteer signup...', () => submitVolunteerSignupFn(clean));
    setForm({ name: '', email: '', phone: '' });
    setSubmitted(true);
    setTimeout(() => setSubmitted(false), 3000);
  } catch (err) {
    setSignupError(callableErrorMessage(err, 'Something went wrong. Please try again.'));
    logError(err, 'handleSignup');
  }
};

const handleMailingList = async (e) => {
  e.preventDefault();
  setMailError('');
  const cleanEmail = sanitizeEmail(mailForm);
  if (!cleanEmail) { setMailError('Please enter a valid email address.'); return; }
  try {
    await runBackendTask('Subscribing to mailing list...', () => subscribeMailingListFn({ email: cleanEmail }));
    setMailForm('');
    setMailSubmitted(true);
    setTimeout(() => setMailSubmitted(false), 3000);
  } catch (err) {
    setMailError(callableErrorMessage(err, 'Something went wrong. Please try again.'));
    logError(err, 'handleMailingList');
  }
};

const handleProfileMessageSubmit = async (e) => {
  e.preventDefault();
  setProfileMessageError('');
  setProfileMessageSubmitted(false);

  if (!currentUser) {
    setShowAuthModal(true);
    return;
  }

  const topic = sanitizeText(profileMessageForm.topic).toLowerCase();
  const message = enforceLimit(sanitizeMultiline(profileMessageForm.message), LIMITS.comment);
  if (!message) { setProfileMessageError('Please enter a message.'); return; }

  const messageCheck = detectMalicious(message);
  if (messageCheck.blocked) {
    setProfileMessageError(`Invalid message: ${messageCheck.reason}`);
    return;
  }

  setProfileMessageLoading(true);
  try {
    await runBackendTask('Sending your message...', () => submitProfileMessageFn({ topic, message }));
    setProfileMessageForm(current => ({ ...current, message: '' }));
    setProfileMessageSubmitted(true);
    setTimeout(() => setProfileMessageSubmitted(false), 4000);
  } catch (err) {
    setProfileMessageError(callableErrorMessage(err, 'Could not send message. Please try again.'));
    logError(err, 'handleProfileMessageSubmit', { topic });
  } finally {
    setProfileMessageLoading(false);
  }
};

const toggleRsvp = async (eventId) => {
  if (!currentUser) { setShowAuthModal(true); return; }
  if (isRsvped(eventId)) {
    const existing = rsvps.find(r => r.eventId === eventId && r.userId === currentUser.id);
    if (existing) {
      try {
        await runBackendTask('Cancelling RSVP...', () => cancelRsvpFn({ rsvpId: existing.id }));
      } catch (err) {
        logError(err, 'toggleRsvp-cancel');
      }
    }
    return;
  }
  setRsvpForm({ eventId, name: currentUser.name || '', email: currentUser.email || '', comments: '' });
  setShowRsvpModal(true);
};

const handleRsvpSubmit = async (e) => {
  e.preventDefault();
  setRsvpError('');
  if (!currentUser) { setRsvpError('Please sign in to RSVP.'); return; }
  const clean = sanitizeRsvpForm(rsvpForm);
  if (!clean.name) { setRsvpError('Please enter a valid name.'); return; }
  if (!clean.email) { setRsvpError('Please enter a valid email address.'); return; }
  const commentCheck = detectMalicious(clean.comments);
  if (commentCheck.blocked) { setRsvpError(`Invalid content: ${commentCheck.reason}`); return; }
  try {
    await runBackendTask('Submitting RSVP...', () => submitRsvpFn({ eventId: rsvpForm.eventId, name: clean.name, email: clean.email, comments: clean.comments }));
    setShowRsvpModal(false);
    setRsvpForm({ eventId: null, name: '', email: '', comments: '' });
  } catch (err) {
    setRsvpError(callableErrorMessage(err, 'Could not submit RSVP. Please try again.'));
    logError(err, 'handleRsvpSubmit', { eventId: rsvpForm.eventId });
  }
};

const handleVote = async (postId, replyId, type) => {
  if (!currentUser) { setShowAuthModal(true); return; }
  try {
    const res = await runBackendTask('Saving vote...', () => castVoteFn({ postId, replyId: replyId || null, type }));
    const votes = (res.data as any)?.votes;
    if (votes) setUserVotes(votes); // post/reply counts refresh via the forum onSnapshot
  } catch (err) {
    logError(err, 'handleVote', { postId, replyId, type });
  }
};

const handleReply = async (postId) => {
  if (!replyText.trim() || !currentUser) return;
  setPostError('');
  const cleanText = enforceLimit(sanitizeMultiline(replyText), LIMITS.replyText);
  if (!cleanText) return;
  const { blocked, reason } = detectMalicious(cleanText);
  if (blocked) { setPostError(`Reply blocked: ${reason}`); return; }
  try {
    const result = await runBackendTask('Posting reply...', () => submitReplyFn({ postId, text: replyText, anonymous: replyAnonymous }));
    setReplyText('');
    if ((result.data as any)?.status === 'pending') {
      setPostError('Your reply is awaiting administrator approval.');
    }
  } catch (err) {
    setPostError(callableErrorMessage(err, 'Could not post reply. Please try again.'));
    logError(err, 'handleReply', { postId });
  }
};

const handleNewPost = async (e) => {
  e.preventDefault();
  if (!currentUser) return;
  setPostError('');
  const rawTitleCheck = detectMalicious(newPostForm.title);
  if (rawTitleCheck.blocked) { setPostError(`Post blocked: ${rawTitleCheck.reason}`); return; }
  const rawContentCheck = detectMalicious(newPostForm.content);
  if (rawContentCheck.blocked) { setPostError(`Post blocked: ${rawContentCheck.reason}`); return; }
  const clean = sanitizePostForm(newPostForm);
  if (!clean.title) { setPostError('Please enter a valid title.'); return; }
  if (!clean.content) { setPostError('Please enter post content.'); return; }
  try {
    await runBackendTask('Creating forum post...', () => submitForumPostFn({ title: newPostForm.title, content: newPostForm.content, anonymous: newPostForm.anonymous === true }));
    setNewPostForm({ title: '', content: '', anonymous: false });
    setShowNewPostModal(false);
  } catch (err) {
    setPostError(callableErrorMessage(err, 'Could not submit post. Please try again.'));
    logError(err, 'handleNewPost');
  }
};

const reportKeyFor = (postId, replyId = null) => `${postId}_${replyId || 'post'}`.replace(/[^a-zA-Z0-9_.-]/g, '_').slice(0, 240);

const hasReportedContent = (postId, replyId = null) => (
  !!currentUser?.reportedContent?.[reportKeyFor(postId, replyId)]
);

const openReportDialog = (target) => {
  if (!currentUser) { setShowAuthModal(true); return; }
  if (!target?.postId || hasReportedContent(target.postId, target.replyId || null)) return;
  setReportTarget(target);
  setReportForm({ reason: 'spam', details: '' });
  setReportError('');
};

const closeReportDialog = () => {
  setReportTarget(null);
  setReportForm({ reason: 'spam', details: '' });
  setReportError('');
};

const submitReport = async (e) => {
  e.preventDefault();
  if (!currentUser || !reportTarget) return;
  setReportError('');

  const reason = sanitizeText(reportForm.reason).toLowerCase() || 'other';
  const details = enforceLimit(sanitizeMultiline(reportForm.details), LIMITS.comment);
  if (!details) { setReportError('Please describe why you are reporting this.'); return; }
  const detailsCheck = detectMalicious(details);
  if (detailsCheck.blocked) { setReportError(`Report blocked: ${detailsCheck.reason}`); return; }

  try {
    const res = await runBackendTask('Submitting report...', () => flagContentFn({
      postId: reportTarget.postId,
      replyId: reportTarget.replyId || null,
      reason,
      details,
    }));
    const reportedContent = (res.data as any)?.reportedContent
      || { ...(currentUser.reportedContent || {}), [reportKeyFor(reportTarget.postId, reportTarget.replyId || null)]: true };
    setCurrentUser({ ...currentUser, reportedContent });
    closeReportDialog();
  } catch (err) {
    setReportError(callableErrorMessage(err, 'Could not submit report. Please try again.'));
    logError(err, 'submitReport', { postId: reportTarget.postId, replyId: reportTarget.replyId });
  }
};

  const pendingUploadsCount = overlayUploads.filter(u => u.status === 'pending').length;
  const pendingDocsCount = allUserDocs.filter(d => d.status === 'pending').length;
  const flaggedPostsCount = forumPosts.filter(p => p.flagged || p.status === 'pending').length;
  const flaggedRepliesCount = forumPosts.reduce(
    (n, p) => n + (p.replies || []).filter(r => r.flagged).length,
    0
  );
    
  const openCommentReportsCount = countOpenEventReports(events || [], eventCommentReports || []);

  const adminBadges = {
    dashboard: 0,
    documents: pendingDocsCount,
    forum: flaggedPostsCount + flaggedRepliesCount + pendingForumReplies.length,
    overlays: pendingUploadsCount,
    events: openCommentReportsCount,
    logs: 0,
  };

  const getAllUserComments = (authorId) => {
    const out = [];
    forumPosts.forEach(p => {
      if (p.authorId === authorId) out.push({ type: 'post', ...p });
      (p.replies || [])
        .filter(r => r.authorId === authorId)
        .forEach(r => out.push({ type: 'reply', postId: p.id, postTitle: p.title, ...r }));
    });
    return out;
  };

  const handleSignIn = async (e) => {
    e.preventDefault();
    setAuthError('');

    try {
      await runBackendTask('Signing you in...', () => signInWithEmailAndPassword(auth, authForm.email, authForm.password));
      setShowAuthModal(false);
      setAuthForm({ email: '', password: '', confirmPassword: '' });
    } catch (err) {
      const challenge = totpChallengeFromError(auth, err);
      if (challenge) {
        setMfaChallenge(challenge);
        setMfaCode('');
        setAuthForm({ ...authForm, password: '' });
        return;
      }
      setAuthError('Invalid email or password.');
      logError(err, 'handleSignIn');
    }
  };

  const handleMfaSignIn = async (e) => {
    e.preventDefault();
    if (!mfaChallenge) return;
    setAuthError('');
    try {
      await runBackendTask('Verifying your authenticator code...', () => resolveTotpChallenge(mfaChallenge, mfaCode));
      setMfaChallenge(null);
      setMfaCode('');
      setShowAuthModal(false);
      setAuthForm({ email: '', password: '', confirmPassword: '' });
    } catch (err) {
      setMfaCode('');
      setAuthError('That authenticator code was not accepted. Wait for a new code and try again.');
      logError(err, 'handleMfaSignIn');
    }
  };

  const cancelMfaSignIn = () => {
    setMfaChallenge(null);
    setMfaCode('');
    setAuthError('');
  };

  const handleSignOut = async () => {
    try {
      await runBackendTask('Signing you out...', async () => {
        // A shared browser should stop receiving this member's notifications.
        await disablePushOnThisDevice().catch(err => logError(err, 'handleSignOut-push'));
        await signOut(auth);
      });
      setPage('home');
      setView('user');
    } catch (err) {
      logError(err, 'handleSignOut');
    }
  };


  const handleDocumentUpload = async (e) => {
    e.preventDefault();

    if (!PUBLIC_DOCUMENTS_ENABLED) {
      setUploadError('Document uploads are temporarily unavailable.');
      return;
    }

    if (!currentUser) {
      setShowAuthModal(true);
      return;
    }

    const file = uploadForm.file;
    if (!file) { setUploadError('Please choose a file.'); return; }

    const allowed = ['application/pdf', 'image/jpeg', 'image/png'];
    if (!allowed.includes(file.type)) { setUploadError('Only PDF, JPG, and PNG files are allowed.'); return; }
    if (file.size > 10 * 1024 * 1024) { setUploadError('File must be under 10 MB.'); return; }

    const cleanTitle = enforceLimit(sanitizeText(uploadForm.title), LIMITS.name) || file.name;
    const cleanNotes = enforceLimit(sanitizeMultiline(uploadForm.notes), LIMITS.comment);
    const titleCheck = detectMalicious(cleanTitle);
    if (titleCheck.blocked) { setUploadError(`Invalid title: ${titleCheck.reason}`); return; }
    const notesCheck = detectMalicious(cleanNotes);
    if (notesCheck.blocked) { setUploadError(`Invalid notes: ${notesCheck.reason}`); return; }

    setUploadError('');
    setUploadLoading(true);

    const uploadedPaths: string[] = [];
    let finalizeStarted = false;
    try {
      await runBackendTask('Uploading document...', async () => {
        const thumbBlob = await generateThumbnail(file);
        const ticketResponse = await createDocumentUploadTicketFn({
          name: file.name,
          contentType: file.type,
          sizeBytes: file.size,
          wantsThumbnail: !!thumbBlob,
        });
        const ticket = ticketResponse.data as { ticketId: string; storagePath: string; thumbnailPath: string };
        const fileRef = ref(storage, ticket.storagePath);
        await uploadBytes(fileRef, file, {
          contentType: file.type,
          customMetadata: { published: 'false', ticketId: ticket.ticketId, role: 'document' },
        });
        uploadedPaths.push(ticket.storagePath);

        if (thumbBlob && ticket.thumbnailPath) {
          const thumbRef = ref(storage, ticket.thumbnailPath);
          await uploadBytes(thumbRef, thumbBlob, {
            contentType: 'image/jpeg',
            customMetadata: { published: 'false', ticketId: ticket.ticketId, role: 'thumbnail' },
          });
          uploadedPaths.push(ticket.thumbnailPath);
        }

        finalizeStarted = true;
        await createDocumentRecordFn({
          ticketId: ticket.ticketId,
          title: cleanTitle,
          notes: cleanNotes,
          visibility: uploadForm.visibility === 'public' ? 'public' : 'private',
        });
      });
      setUploadForm({ title: '', notes: '', visibility: 'private', file: null });
    } catch (err) {
      if (!finalizeStarted) {
        await Promise.all(uploadedPaths.map(path => deleteObject(ref(storage, path)).catch(() => undefined)));
      }
      setUploadError(callableErrorMessage(err, 'Upload failed. Please try again.'));
      logError(err, 'handleDocumentUpload', { fileName: file.name, size: file.size });
    } finally {
      setUploadLoading(false);
    }
  };

  const handleAdminUpload = async (e) => {
    e.preventDefault();
    if (!isAdmin || !currentUser) return;

    const file = adminUploadForm.file;
    if (!file) { setAdminUploadError('Please choose a file.'); return; }

    const allowed = ['application/pdf', 'image/jpeg', 'image/png'];
    if (!allowed.includes(file.type)) { setAdminUploadError('Only PDF, JPG, and PNG files are allowed.'); return; }
    if (file.size > 10 * 1024 * 1024) { setAdminUploadError('File must be under 10 MB.'); return; }

    const cleanTitle = enforceLimit(sanitizeText(adminUploadForm.title), LIMITS.name) || file.name;
    const cleanNotes = enforceLimit(sanitizeMultiline(adminUploadForm.notes), LIMITS.comment);
    const titleCheck = detectMalicious(cleanTitle);
    if (titleCheck.blocked) { setAdminUploadError(`Invalid title: ${titleCheck.reason}`); return; }
    const notesCheck = detectMalicious(cleanNotes);
    if (notesCheck.blocked) { setAdminUploadError(`Invalid notes: ${notesCheck.reason}`); return; }

    setAdminUploadError('');
    setAdminUploadLoading(true);

    const uploadedPaths: string[] = [];
    let finalizeStarted = false;
    try {
      await runBackendTask('Uploading admin document...', async () => {
        const thumbBlob = await generateThumbnail(file);
        const ticketResponse = await createDocumentUploadTicketFn({
          name: file.name,
          contentType: file.type,
          sizeBytes: file.size,
          wantsThumbnail: !!thumbBlob,
        });
        const ticket = ticketResponse.data as { ticketId: string; storagePath: string; thumbnailPath: string };
        const fileRef = ref(storage, ticket.storagePath);
        await uploadBytes(fileRef, file, {
          contentType: file.type,
          customMetadata: { published: 'false', ticketId: ticket.ticketId, role: 'document' },
        });
        uploadedPaths.push(ticket.storagePath);

        if (thumbBlob && ticket.thumbnailPath) {
          const thumbRef = ref(storage, ticket.thumbnailPath);
          await uploadBytes(thumbRef, thumbBlob, {
            contentType: 'image/jpeg',
            customMetadata: { published: 'false', ticketId: ticket.ticketId, role: 'thumbnail' },
          });
          uploadedPaths.push(ticket.thumbnailPath);
        }

        finalizeStarted = true;
        await createAdminDocumentRecordFn({
          ticketId: ticket.ticketId,
          title: cleanTitle,
          notes: cleanNotes,
          publish: !!adminUploadForm.publish,
        });
      });
      setAdminUploadForm({ title: '', notes: '', publish: true, file: null });
    } catch (err) {
      if (!finalizeStarted) {
        await Promise.all(uploadedPaths.map(path => deleteObject(ref(storage, path)).catch(() => undefined)));
      }
      setAdminUploadError(callableErrorMessage(err, 'Upload failed. Please try again.'));
      logError(err, 'handleAdminUpload', { fileName: file.name });
    } finally {
      setAdminUploadLoading(false);
    }
  };


  const deleteVolunteer = async (id) => {
    try { await runBackendTask('Deleting volunteer...', () => deleteVolunteerFn({ id })); }
    catch (err) { logError(err, 'deleteVolunteer', { id }); }
  };

  const saveEdit = async () => {
    try {
      const clean = sanitizeVolunteerForm({
        name: editForm.name,
        email: editForm.email,
        phone: editForm.phone,
      });
      if (!clean.name || !clean.email) return;
      await runBackendTask('Saving volunteer...', () => updateVolunteerFn({ id: editingId, ...clean }));
      setEditingId(null);
    } catch (err) {
      logError(err, 'saveEdit', { editingId });
    }
  };

  const removeMail = async (item) => {
    try { await runBackendTask('Removing mailing-list entry...', () => removeMailingListEntryFn({ id: item.id })); }
    catch (err) { logError(err, 'removeMail', { id: item?.id }); }
  };

  const saveEvent = async (e) => {
    e.preventDefault();
    setEventError('');
    setEventNotice('');

    const clean = sanitizeEventForm(eventForm);
    if (!clean.title) { setEventError('Please enter a valid title.'); return; }
    if (!clean.location) { setEventError('Please enter a valid location.'); return; }

    const titleCheck = detectMalicious(clean.title);
    if (titleCheck.blocked) { setEventError(`Invalid content: ${titleCheck.reason}`); return; }
    const descCheck = detectMalicious(clean.description);
    if (descCheck.blocked) { setEventError(`Invalid content: ${descCheck.reason}`); return; }

    try {
      const result = await runBackendTask(
        editingEventId ? 'Saving event...' : 'Creating event...',
        () => saveEventFn({ id: editingEventId || undefined, ...clean }),
      );
      const newId = (result?.data as { id?: string })?.id;
      if (!editingEventId && newId) {
        // Images need an event id, so stay on the freshly created event.
        setEditingEventId(newId);
        setEventNotice('Event created. You can add images below.');
        return;
      }
      setShowEventModal(false);
    } catch (err) {
      setEventError('Could not save event. Please try again.');
      logError(err, 'saveEvent', { editingEventId });
    }
  };

  const deleteEvent = async (id) => {
    try { await runBackendTask('Deleting event...', () => deleteEventFn({ id })); }
    catch (err) { logError(err, 'deleteEvent', { id }); }
  };

  const approveDoc = async (id) => {
    setDocModerationError('');
    try { await runBackendTask('Approving document...', () => setDocumentStatusFn({ id, status: 'approved' })); }
    catch (err) {
      setDocModerationError(callableErrorMessage(err, 'Could not approve the document. Please try again.'));
      logError(err, 'approveDoc', { id });
    }
  };

  const rejectDoc = async (id) => {
    setDocModerationError('');
    try { await runBackendTask('Rejecting document...', () => setDocumentStatusFn({ id, status: 'rejected' })); }
    catch (err) {
      setDocModerationError(callableErrorMessage(err, 'Could not reject the document. Please try again.'));
      logError(err, 'rejectDoc', { id });
    }
  };

  const approvePost = async (id) => {
    try { await runBackendTask('Approving forum post...', () => approveForumPostFn({ id })); }
    catch (err) { logError(err, 'approvePost', { id }); }
  };

  const deletePost = async (id) => {
    try {
      await runBackendTask('Deleting forum post...', () => deleteForumPostFn({ id }));
      setAdminViewThread(null);
      setSelectedPost(null);
    } catch (err) {
      logError(err, 'deletePost', { id });
    }
  };

  const deleteReply = async (postId, replyId) => {
    try {
      await runBackendTask('Deleting forum reply...', () => deleteForumReplyFn({ postId, replyId }));
    } catch (err) {
      logError(err, 'deleteReply', { postId, replyId });
    }
  };

  const approvePendingReply = async (replyId) => {
    try {
      await runBackendTask('Approving forum reply...', () => approvePendingForumReplyFn({ replyId }));
    } catch (err) {
      logError(err, 'approvePendingReply', { replyId });
    }
  };

  const deletePendingReply = async (replyId) => {
    try {
      await runBackendTask('Deleting pending reply...', () => deletePendingForumReplyFn({ replyId }));
    } catch (err) {
      logError(err, 'deletePendingReply', { replyId });
    }
  };

  const unflagReply = async (postId, replyId) => {
    try {
      await runBackendTask('Clearing reply flag...', () => unflagForumReplyFn({ postId, replyId }));
    } catch (err) {
      logError(err, 'unflagReply', { postId, replyId });
    }
  };

  const togglePublishDoc = async (d) => {
    setDocModerationError('');
    try {
      await runBackendTask(d.published ? 'Unpublishing document...' : 'Publishing document...', () => toggleDocumentPublishedFn({ id: d.id }));
    } catch (err) {
      setDocModerationError(callableErrorMessage(err, 'Could not update the document. Please try again.'));
      logError(err, 'togglePublishDoc', { id: d.id });
    }
  };

  const deleteDocRecord = async (d) => {
    setDocModerationError('');
    try {
      await runBackendTask('Deleting document...', () => deleteDocumentRecordFn({ id: d.id }));
    } catch (err) {
      setDocModerationError(callableErrorMessage(err, 'Could not delete the document. Please try again.'));
      logError(err, 'deleteDocRecord', { id: d?.id });
    }
  };

  // Lets a signed-in member delete one of their own documents and get an
  // automated confirmation (or a graceful, retryable failure message).
  const deleteOwnDocument = async (d) => {
    if (!currentUser || !d?.id) return;
    setDocDeleteError('');
    setDocDeleteMessage('');
    try {
      await runBackendTask('Deleting your document...', () => deleteOwnDocumentFn({ id: d.id }));
      setDocDeleteMessage(`"${d.title || d.name || 'Document'}" was deleted.`);
      setTimeout(() => setDocDeleteMessage(''), 5000);
    } catch (err) {
      setDocDeleteError(callableErrorMessage(err, 'Could not delete the document. Please try again.'));
      logError(err, 'deleteOwnDocument', { id: d.id });
    }
  };

  const startEdit = (v) => {
    setEditingId(v.id);
    setEditForm(v);
  };

  const handleImportOverlay = async (e) => {
    e.preventDefault();
    setImportError('');

    if (!importName.trim()) { setImportError('Please enter a name.'); return; }

    let geojson;
    try {
      geojson = sanitizeGeoJSON(JSON.parse(importJson));
    } catch (err) {
      setImportError(err.message || 'Invalid GeoJSON.');
      return;
    }

    try {
      const cleanGeojson = JSON.parse(JSON.stringify(geojson));
      await runBackendTask('Importing overlay...', () => importOverlayFn({
        name: importName.trim(),
        description: importDesc.trim() || '',
        color: importColor || cleanGeojson.features?.[0]?.properties?.stroke || '#3366ff',
        geojson: JSON.stringify(cleanGeojson),
      }));
      setShowImportModal(false);
      setImportJson('');
      setImportName('');
      setImportDesc('');
      setImportColor('#3366ff');
      setImportError('');
    } catch (err) {
      setImportError('Could not save overlay. Please try again.');
      logError(err, 'handleImportOverlay');
    }
  };

  const handleImportFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result || '');
      setImportJson(text);
      setImportError('');

      try {
        const parsed = sanitizeGeoJSON(JSON.parse(text));
        if (!importName.trim()) {
          setImportName((parsed.context?.summary || file.name.replace(/\.(geo)?json$/i, '')).slice(0, 60));
        }
        const stroke = parsed.features.find(f => f.properties?.stroke)?.properties?.stroke;
        if (stroke) setImportColor(stroke);
      } catch (err) {
        if (!(err instanceof SyntaxError)) {
          logError(err, 'handleImportFile-parse', { fileName: file.name });
        }
      }
    };
    reader.onerror = () => logError(reader.error, 'handleImportFile-read', { fileName: file.name });
    reader.readAsText(file);
    e.target.value = '';
  };

  const deleteOverlayGroup = async (id) => {
    try { await runBackendTask('Deleting overlay...', () => deleteOverlayFn({ id })); }
    catch (err) { logError(err, 'deleteOverlayGroup', { id }); }
  };

  const approveOverlayUpload = async (uploadId) => {
    try {
      await runBackendTask('Approving overlay upload...', () => approveOverlayUploadFn({ uploadId }));
    } catch (err) {
      logError(err, 'approveOverlayUpload', { uploadId });
    }
  };

  const rejectOverlayUpload = async (uploadId, note = '') => {
    try {
      await runBackendTask('Rejecting overlay upload...', () => rejectOverlayUploadFn({ uploadId, note }));
    } catch (err) {
      logError(err, 'rejectOverlayUpload', { uploadId });
    }
  };

  const deleteOverlayUpload = async (uploadId) => {
    try {
      await runBackendTask('Deleting overlay upload...', () => deleteOverlayUploadFn({ uploadId }));
    } catch (err) {
      logError(err, 'deleteOverlayUpload', { uploadId });
    }
  };

  const toggleOverlayPublished = async (id) => {
    try {
      await runBackendTask('Updating overlay visibility...', () => toggleOverlayPublishedFn({ id }));
    } catch (err) {
      logError(err, 'toggleOverlayPublished', { id });
    }
  };

  const openNewEvent = () => {
    setEventForm({ title: '', date: '', time: '', location: '', lat: null, lng: null, description: '' });
    setEditingEventId(null);
    setEventError('');
    setEventNotice('');
    setShowEventModal(true);
  };

  const openEditEvent = (evt) => {
    setEventForm({
      title: evt.title || '',
      date: evt.date || '',
      time: evt.time || '',
      location: evt.location || '',
      lat: evt.lat ?? null,
      lng: evt.lng ?? null,
      description: evt.description || '',
    });
    setEditingEventId(evt.id);
    setEventError('');
    setEventNotice('');
    setShowEventModal(true);
  };

  const toggleUserModeration = async (uid, current) => {
    try {
      await runBackendTask(current ? 'Lifting user restriction...' : 'Requiring user approval...', () => toggleUserModerationFn({ uid, moderated: !current }));
    } catch (err) {
      logError(err, 'toggleUserModeration', { uid });
    }
  };

  const saveAdminUserProfile = async (profile) => {
    if (!isAdmin || !profile) throw new Error('Admin access is required.');

    const cleanName = enforceLimit(sanitizeText(profile.name), LIMITS.name);
    const cleanEmail = sanitizeEmail(profile.email);
    const cleanPhone = enforceLimit(sanitizeText(profile.phone || ''), LIMITS.phone);
    if (!cleanName) throw new Error('Please enter a valid name.');
    if (!cleanEmail) throw new Error('Please enter a valid email address.');

    const res = await runBackendTask('Saving user profile...', () => saveAdminUserProfileFn({
      ...profile,
      name: cleanName,
      email: cleanEmail,
      phone: cleanPhone,
    }));
    const saved = res.data as typeof profile;

    setAdminProfileUser(saved);
    return saved;
  };

  const adminAnonymizeForumPosts = async (uid) => {
    if (!isAdmin || !uid) throw new Error('Admin access is required.');
    const res = await runBackendTask('Anonymizing forum activity...', () => adminAnonymizeForumPostsFn({ uid }));
    return (res.data as { changed?: number }).changed ?? 0;
  };

  const openProfileForVolunteer = (v) => {
    const linked = allUsers.find(u => u.email?.toLowerCase() === v.email?.toLowerCase());
    setAdminProfileUser({
      volunteerId: v.id,
      uid: linked?.id || null,
      name: v.name,
      userName: linked?.userName || '',
      email: v.email,
      phone: v.phone,
      moderated: !!linked?.moderated,
    });
  };

  const openProfileForUser = (uid) => {
    const u = allUsers.find(x => x.id === uid);
    if (!u) return;

    const linkedVol = volunteers.find(v => v.email?.toLowerCase() === u.email?.toLowerCase());
    setAdminProfileUser({
      volunteerId: linkedVol?.id || null,
      uid: u.id,
      name: u.name || linkedVol?.name || 'User',
      userName: u.userName || '',
      email: u.email,
      phone: linkedVol?.phone || '',
      moderated: !!u.moderated,
    });
  };

  const adminSendPasswordReset = async (email) => {
    try {
      await runBackendTask('Sending password reset...', () => requestPasswordReset(email));
    } catch (err) {
      logError(err, 'adminSendPasswordReset', { email });
      throw err;
    }
  };

  const adminDeleteUserData = async (uid, email) => {
    try {
      await runBackendTask('Deleting user data...', () => adminDeleteUserDataFn({ uid, email }));
      setAdminProfileUser(null);
    } catch (err) {
      logError(err, 'adminDeleteUserData', { uid });
      throw err;
    }
  };

  // Admin -> member reply. Validates on the client for a fast error, then the
  // callable re-validates and stores the reply on the member's message thread.
  const replyToProfileMessage = async (id, reply) => {
    if (!isAdmin) throw new Error('Admin access is required.');
    if (!id) throw new Error('Missing message.');
    const clean = enforceLimit(sanitizeMultiline(reply), LIMITS.comment);
    if (!clean) throw new Error('Please enter a reply message.');
    const check = detectMalicious(clean);
    if (check.blocked) throw new Error(`Reply blocked: ${check.reason}`);
    await runBackendTask('Sending reply...', () => replyToProfileMessageFn({ id, reply: clean }));
  };

  const value = {
    adminSendPasswordReset,
    adminDeleteUserData,
    adminAnonymizeForumPosts,
    replyToProfileMessage,
    saveAdminUserProfile,
    runBackendTask,
    backendBusy: backendTasks.length > 0,
    backendProgressMessage: activeBackendTask?.message || '',
    currentUser,
    setCurrentUser,
    isAdmin,
    hasAdminClaim,
    hasAdminMfaSession,
    adminEnrollmentRequired,
    authLoading,
    accountLoadError,
    refreshUserProfile,
    userVotes,
    setUserVotes,
    events,
    forumPosts,
    publicDocs,
    overlayGroups,
    rsvps,
    myMessages,
    allUsers,
    adminRsvps,
    errorLogs,
    adminAuditLogs,
    volunteers,
    allUserDocs,
    mailingList,
    profileMessages,
    forumReports,
    eventCommentReports,
    siteContent,
    route,
    navigate,
    goBack,
    goToEvent,
    goToPoll,
    closeDocument,
    view,
    setView,
    page,
    setPage,
    sidebarOpen,
    setSidebarOpen,
    openFaq,
    setOpenFaq,
    selectedPost,
    setSelectedPost,
    selectedEventMap,
    setSelectedEventMap,
    adminViewThread,
    setAdminViewThread,
    adminViewUser,
    setAdminViewUser,
    editingId,
    setEditingId,
    editForm,
    setEditForm,
    editingEventId,
    setEditingEventId,
    replyText,
    replyAnonymous,
    setReplyAnonymous,
    setReplyText,
    accountMenuOpen,
    setAccountMenuOpen,
    viewingDoc: activeDocument,
    setViewingDoc,
    adminTab,
    setAdminTab,
    adminProfileUser,
    setAdminProfileUser,
    hiddenGroupIds,
    setHiddenGroupIds,
    hiddenItemKeys,
    setHiddenItemKeys,
    form,
    setForm,
    mailForm,
    setMailForm,
    authForm,
    setAuthForm,
    rsvpForm,
    setRsvpForm,
    eventForm,
    setEventForm,
    newPostForm,
    setNewPostForm,
    reportTarget,
    reportForm,
    setReportForm,
    uploadForm,
    setUploadForm,
    profileMessageForm,
    setProfileMessageForm,
    adminUploadForm,
    setAdminUploadForm,
    importJson,
    setImportJson,
    importName,
    setImportName,
    importDesc,
    setImportDesc,
    importColor,
    setImportColor,
    importError,
    setImportError,
    showAuthModal,
    setShowAuthModal,
    showRsvpModal,
    setShowRsvpModal,
    showEventModal,
    setShowEventModal,
    showNewPostModal,
    setShowNewPostModal,
    showImportModal,
    setShowImportModal,
    authMode,
    setAuthMode,
    submitted,
    setSubmitted,
    mailSubmitted,
    setMailSubmitted,
    authError,
    setAuthError,
    mfaChallenge,
    mfaCode,
    setMfaCode,
    uploadError,
    setUploadError,
    uploadLoading,
    setUploadLoading,
    profileMessageError,
    setProfileMessageError,
    profileMessageSubmitted,
    setProfileMessageSubmitted,
    profileMessageLoading,
    setProfileMessageLoading,
    signupError,
    setSignupError,
    mailError,
    setMailError,
    rsvpError,
    setRsvpError,
    postError,
    setPostError,
    reportError,
    setReportError,
    eventError,
    setEventError,
    eventNotice,
    setEventNotice,
    adminUploadError,
    setAdminUploadError,
    adminUploadLoading,
    setAdminUploadLoading,
    docModerationError,
    setDocModerationError,
    docDeleteError,
    setDocDeleteError,
    docDeleteMessage,
    setDocDeleteMessage,
    deleteOwnDocument,
    userDocs,
    isRsvped,
    effectiveVisibleIds,
    toggleOverlayGroup,
    getAllUserComments,
    pendingDocsCount,
    flaggedPostsCount,
    flaggedRepliesCount,
    adminBadges,
    publishedOverlayGroups,
    toggleOverlayPublished,
    handleCreateAccount,
    handleSignIn,
    handleMfaSignIn,
    cancelMfaSignIn,
    handleSignOut,
    handleSignup,
    handleMailingList,
    toggleRsvp,
    handleRsvpSubmit,
    handleProfileMessageSubmit,
    handleDocumentUpload,
    handleAdminUpload,
    handleVote,
    handleReply,
    handleNewPost,
    hasReportedContent,
    openReportDialog,
    closeReportDialog,
    submitReport,
    deleteVolunteer,
    saveEdit,
    startEdit,
    removeMail,
    saveEvent,
    deleteEvent,
    approveDoc,
    rejectDoc,
    approvePost,
    deletePost,
    deleteReply,
    approvePendingReply,
    deletePendingReply,
    unflagReply,
    pendingForumReplies,
    togglePublishDoc,
    deleteDocRecord,
    handleImportOverlay,
    handleImportFile,
    deleteOverlayGroup,
    openNewEvent,
    openEditEvent,
    toggleUserModeration,
    openProfileForVolunteer,
    openProfileForUser,
    overlayUploads,
    approveOverlayUpload,
    rejectOverlayUpload,
    deleteOverlayUpload,
  };

  return (
    <AppContext.Provider value={value}>
      <div
        className={activeBackendTask ? 'pointer-events-none select-none' : undefined}
        inert={activeBackendTask ? true : undefined}
        aria-hidden={activeBackendTask ? true : undefined}
      >
        {children}
      </div>
      {activeBackendTask && <BackendProgressOverlay message={activeBackendTask.message} />}
    </AppContext.Provider>
  );
}
