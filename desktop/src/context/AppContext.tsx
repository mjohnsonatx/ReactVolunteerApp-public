import type { FormEvent, ReactNode } from 'react';
import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { collection, doc, limit, onSnapshot, orderBy, query } from 'firebase/firestore';
import { deleteObject, ref, uploadBytes } from 'firebase/storage';
import { auth, db, storage } from '../firebase';
import {
  LIMITS,
  detectMalicious,
  enforceLimit,
  sanitizeEmail,
  sanitizeEventForm,
  sanitizeMultiline,
  sanitizeText,
  sanitizeVolunteerForm,
} from '@app/utils/sanitize';
import { sanitizeGeoJSON } from '@app/utils/geojson';
import { adminLogTimestampMillis, countOpenEventReports, mergeForumAuthors, mergePendingForumAuthors } from '@watershed/shared';
import { logError } from '@app/utils/logError';
import { requestPasswordReset } from '@app/services/accountService';
import BackendProgressOverlay from '@app/components/shared/BackendProgressOverlay';
import {
  adminAnonymizeForumPostsFn,
  adminDeleteUserDataFn,
  approveForumPostFn,
  approveOverlayUploadFn,
  approvePendingForumReplyFn,
  callableErrorMessage,
  createAdminDocumentRecordFn,
  createDocumentUploadTicketFn,
  deleteDocumentRecordFn,
  deleteEventFn,
  deleteForumPostFn,
  deleteForumReplyFn,
  deleteOverlayFn,
  deleteOverlayUploadFn,
  deletePendingForumReplyFn,
  deleteVolunteerFn,
  importOverlayFn,
  rejectOverlayUploadFn,
  removeMailingListEntryFn,
  replyToProfileMessageFn,
  saveAdminUserProfileFn,
  saveEventFn,
  setDocumentStatusFn,
  toggleDocumentPublishedFn,
  toggleOverlayPublishedFn,
  toggleUserModerationFn,
  unflagForumReplyFn,
  updateVolunteerFn,
} from '@app/libs/callables';

const AppContext = createContext<any>(null);

export const useApp = () => {
  const value = useContext(AppContext);
  if (!value) throw new Error('useApp must be used inside AppProvider.');
  return value;
};

const EMPTY_SITE_CONTENT = {
  mission: '',
  goals: '',
  about: { name: '', bio: '', imageUrl: '', imagePath: '' },
};

async function generateThumbnail(file: File): Promise<Blob | null> {
  const { makeThumbnail } = await import('@app/utils/thumbnail');
  return makeThumbnail(file);
}

function snapshotRows(snapshot: any): any[] {
  return snapshot.docs.map((item: any) => ({ id: item.id, ...item.data() }));
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [currentUser, setCurrentUser] = useState<any>(() => {
    const user = auth.currentUser;
    return user ? { id: user.uid, name: user.displayName || '', email: user.email || '' } : null;
  });
  const [events, setEvents] = useState<any[]>([]);
  const [publicForumPosts, setForumPosts] = useState<any[]>([]);
  const [forumAuthors, setForumAuthors] = useState<any[]>([]);
  const [overlayGroups, setOverlayGroups] = useState<any[]>([]);
  const [allUsers, setAllUsers] = useState<any[]>([]);
  const [adminRsvps, setAdminRsvps] = useState<any[]>([]);
  const [errorLogs, setErrorLogs] = useState<any[]>([]);
  const [adminAuditLogs, setAdminAuditLogs] = useState<any[]>([]);
  const [volunteers, setVolunteers] = useState<any[]>([]);
  const [allUserDocs, setAllUserDocs] = useState<any[]>([]);
  const [mailingList, setMailingList] = useState<any[]>([]);
  const [profileMessages, setProfileMessages] = useState<any[]>([]);
  const [forumReports, setForumReports] = useState<any[]>([]);
  const [rawPendingReplies, setPendingForumReplies] = useState<any[]>([]);
  const forumPosts = useMemo(() => mergeForumAuthors(publicForumPosts, forumAuthors), [publicForumPosts, forumAuthors]);
  const pendingForumReplies = useMemo(() => mergePendingForumAuthors(rawPendingReplies, forumAuthors), [rawPendingReplies, forumAuthors]);
  const [overlayUploads, setOverlayUploads] = useState<any[]>([]);
  const [eventCommentReports, setEventCommentReports] = useState<any[]>([]);
  const [siteContent, setSiteContent] = useState<any>(EMPTY_SITE_CONTENT);

  const [adminTab, setAdminTab] = useState('dashboard');
  const [adminViewThread, setAdminViewThread] = useState<any>(null);
  const [adminViewUser, setAdminViewUser] = useState<any>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<any>({});
  const [editingEventId, setEditingEventId] = useState<string | null>(null);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [viewingDoc, setViewingDoc] = useState<any>(null);
  const [adminProfileUser, setAdminProfileUser] = useState<any>(null);
  const [showEventModal, setShowEventModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [eventForm, setEventForm] = useState<any>({
    title: '', date: '', time: '', location: '', lat: null, lng: null, description: '',
  });
  const [eventError, setEventError] = useState('');
  const [eventNotice, setEventNotice] = useState('');
  const [adminUploadForm, setAdminUploadForm] = useState<any>({
    title: '', notes: '', publish: true, file: null,
  });
  const [adminUploadError, setAdminUploadError] = useState('');
  const [adminUploadLoading, setAdminUploadLoading] = useState(false);
  const [docModerationError, setDocModerationError] = useState('');
  const [importJson, setImportJson] = useState('');
  const [importName, setImportName] = useState('');
  const [importDesc, setImportDesc] = useState('');
  const [importColor, setImportColor] = useState('#3366ff');
  const [importError, setImportError] = useState('');
  const [hiddenGroupIds, setHiddenGroupIds] = useState<string[]>([]);
  const backendTaskId = useRef(0);
  const [backendTasks, setBackendTasks] = useState<Array<{ id: number; message: string }>>([]);

  const isAdmin = true;

  useEffect(() => {
    let userUnsubscribe = () => {};
    const unsubscribe = onAuthStateChanged(auth, user => {
      userUnsubscribe();
      if (!user) {
        setCurrentUser(null);
        return;
      }
      setCurrentUser((previous: any) => ({
        ...previous,
        id: user.uid,
        name: user.displayName || previous?.name || '',
        email: user.email || previous?.email || '',
      }));
      userUnsubscribe = onSnapshot(doc(db, 'users', user.uid), snapshot => {
        const data = snapshot.data() || {};
        setCurrentUser({
          id: user.uid,
          name: data.name || user.displayName || '',
          userName: data.userName || '',
          email: user.email || data.email || '',
          moderated: data.moderated === true,
          reportedContent: data.reportedContent || {},
        });
      }, error => logError(error, 'desktop-user-listener'));
    });
    return () => { userUnsubscribe(); unsubscribe(); };
  }, []);

  useEffect(() => {
    let currentErrors: any[] = [];
    let legacyErrors: any[] = [];
    const updateErrors = () => {
      const merged = new Map<string, any>();
      [...currentErrors, ...legacyErrors].forEach(item => merged.set(item.id, item));
      setErrorLogs([...merged.values()]
        .sort((a, b) => adminLogTimestampMillis(b.createdAt ?? b.at) - adminLogTimestampMillis(a.createdAt ?? a.at))
        .slice(0, 100));
    };
    const subscriptions = [
      onSnapshot(collection(db, 'forumAuthors'),
        snapshot => setForumAuthors(snapshotRows(snapshot)),
        error => { setForumAuthors([]); logError(error, 'desktop-forum-authors-listener'); }),
      onSnapshot(query(collection(db, 'events'), orderBy('date', 'asc')),
        snapshot => setEvents(snapshotRows(snapshot)), error => logError(error, 'desktop-events-listener')),
      onSnapshot(query(collection(db, 'forumPosts'), orderBy('createdAt', 'desc')),
        snapshot => setForumPosts(snapshotRows(snapshot)), error => logError(error, 'desktop-forum-listener')),
      onSnapshot(query(collection(db, 'overlays'), orderBy('createdAt', 'asc')),
        snapshot => setOverlayGroups(snapshotRows(snapshot).map(item => {
          if (typeof item.geojson !== 'string') return item;
          try { return { ...item, geojson: JSON.parse(item.geojson) }; }
          catch (error) { logError(error, 'desktop-overlay-parse', { id: item.id }); return { ...item, geojson: null }; }
        })), error => logError(error, 'desktop-overlays-listener')),
      onSnapshot(collection(db, 'users'),
        snapshot => setAllUsers(snapshotRows(snapshot)), error => logError(error, 'desktop-users-listener')),
      onSnapshot(query(collection(db, 'rsvps'), orderBy('createdAt', 'desc')),
        snapshot => setAdminRsvps(snapshotRows(snapshot)), error => logError(error, 'desktop-rsvps-listener')),
      onSnapshot(query(collection(db, 'errorLogs'), orderBy('createdAt', 'desc'), limit(100)),
        snapshot => { currentErrors = snapshotRows(snapshot); updateErrors(); }, error => logError(error, 'desktop-errors-current-listener')),
      onSnapshot(query(collection(db, 'errorLogs'), orderBy('at', 'desc'), limit(100)),
        snapshot => { legacyErrors = snapshotRows(snapshot); updateErrors(); }, error => logError(error, 'desktop-errors-legacy-listener')),
      onSnapshot(query(collection(db, 'adminAuditLogs'), orderBy('createdAt', 'desc'), limit(100)),
        snapshot => setAdminAuditLogs(snapshotRows(snapshot)), error => logError(error, 'desktop-admin-audit-listener')),
      onSnapshot(query(collection(db, 'volunteers'), orderBy('joinDate', 'desc')),
        snapshot => setVolunteers(snapshotRows(snapshot)), error => logError(error, 'desktop-volunteers-listener')),
      onSnapshot(query(collection(db, 'documents'), orderBy('uploadDate', 'desc')),
        snapshot => setAllUserDocs(snapshotRows(snapshot)), error => logError(error, 'desktop-documents-listener')),
      onSnapshot(collection(db, 'mailingList'),
        snapshot => setMailingList(snapshotRows(snapshot)), error => logError(error, 'desktop-mailing-listener')),
      onSnapshot(query(collection(db, 'profileMessages'), orderBy('createdAt', 'desc')),
        snapshot => setProfileMessages(snapshotRows(snapshot)), error => logError(error, 'desktop-messages-listener')),
      onSnapshot(query(collection(db, 'forumReports'), orderBy('createdAt', 'desc')),
        snapshot => setForumReports(snapshotRows(snapshot)), error => logError(error, 'desktop-forum-reports-listener')),
      onSnapshot(query(collection(db, 'forumPendingReplies'), orderBy('createdAt', 'desc')),
        snapshot => setPendingForumReplies(snapshotRows(snapshot)), error => logError(error, 'desktop-pending-replies-listener')),
      onSnapshot(query(collection(db, 'overlayUploads'), orderBy('uploadedAt', 'desc')),
        snapshot => setOverlayUploads(snapshotRows(snapshot)), error => logError(error, 'desktop-overlay-uploads-listener')),
      onSnapshot(query(collection(db, 'eventCommentReports'), orderBy('createdAt', 'desc')),
        snapshot => setEventCommentReports(snapshotRows(snapshot)), error => logError(error, 'desktop-comment-reports-listener')),
      onSnapshot(doc(db, 'siteContent', 'main'), snapshot => {
        if (!snapshot.exists()) return;
        const data = snapshot.data();
        setSiteContent({ ...EMPTY_SITE_CONTENT, ...data, about: { ...EMPTY_SITE_CONTENT.about, ...(data.about || {}) } });
      }, error => logError(error, 'desktop-site-content-listener')),
    ];
    return () => subscriptions.forEach(unsubscribe => unsubscribe());
  }, []);

  const runBackendTask = async <T,>(message: string, task: () => Promise<T>): Promise<T> => {
    const id = ++backendTaskId.current;
    setBackendTasks(tasks => [...tasks, { id, message }]);
    try { return await task(); }
    finally { setBackendTasks(tasks => tasks.filter(item => item.id !== id)); }
  };

  const reportFailure = (error: unknown, context: string, extra: Record<string, unknown> = {}) => {
    void logError(error, context, extra);
  };

  const pendingDocsCount = allUserDocs.filter(item => item.status === 'pending').length;
  const flaggedPostsCount = forumPosts.filter(item => item.flagged || item.status === 'pending').length;
  const flaggedRepliesCount = forumPosts.reduce(
    (total, item) => total + (item.replies || []).filter((reply: any) => reply.flagged).length,
    0,
  );
  const adminBadges = {
    dashboard: 0,
    documents: pendingDocsCount,
    forum: flaggedPostsCount + flaggedRepliesCount + pendingForumReplies.length,
    overlays: overlayUploads.filter(item => item.status === 'pending').length,
    events: countOpenEventReports(events, eventCommentReports),
    logs: 0,
  };
  const effectiveVisibleIds = useMemo(
    () => overlayGroups.filter(item => !hiddenGroupIds.includes(item.id)).map(item => item.id),
    [hiddenGroupIds, overlayGroups],
  );

  const getAllUserComments = (authorId: string) => {
    const output: any[] = [];
    forumPosts.forEach(post => {
      if (post.authorId === authorId) output.push({ type: 'post', ...post });
      (post.replies || []).filter((reply: any) => reply.authorId === authorId).forEach((reply: any) => {
        output.push({ type: 'reply', postId: post.id, postTitle: post.title, ...reply });
      });
    });
    return output;
  };

  const handleSignOut = async () => {
    setAccountMenuOpen(false);
    await signOut(auth);
  };

  const deleteVolunteer = async (id: string) => {
    try { await runBackendTask('Deleting volunteer...', () => deleteVolunteerFn({ id })); }
    catch (error) { reportFailure(error, 'desktop-delete-volunteer', { id }); }
  };

  const startEdit = (volunteer: any) => { setEditingId(volunteer.id); setEditForm(volunteer); };

  const saveEdit = async () => {
    const clean = sanitizeVolunteerForm(editForm);
    if (!clean.name || !clean.email || !editingId) return;
    try {
      await runBackendTask('Saving volunteer...', () => updateVolunteerFn({ id: editingId, ...clean }));
      setEditingId(null);
    } catch (error) { reportFailure(error, 'desktop-save-volunteer', { editingId }); }
  };

  const removeMail = async (item: any) => {
    try { await runBackendTask('Removing mailing-list entry...', () => removeMailingListEntryFn({ id: item.id })); }
    catch (error) { reportFailure(error, 'desktop-remove-mail', { id: item.id }); }
  };

  const openNewEvent = () => {
    setEventForm({ title: '', date: '', time: '', location: '', lat: null, lng: null, description: '' });
    setEditingEventId(null); setEventError(''); setEventNotice(''); setShowEventModal(true);
  };

  const openEditEvent = (event: any) => {
    setEventForm({
      title: event.title || '', date: event.date || '', time: event.time || '',
      location: event.location || '', lat: event.lat ?? null, lng: event.lng ?? null,
      description: event.description || '',
    });
    setEditingEventId(event.id); setEventError(''); setEventNotice(''); setShowEventModal(true);
  };

  const saveEvent = async (event: FormEvent) => {
    event.preventDefault(); setEventError(''); setEventNotice('');
    const clean = sanitizeEventForm(eventForm);
    if (!clean.title || !clean.location) { setEventError('A valid title and location are required.'); return; }
    const titleCheck = detectMalicious(clean.title);
    const descriptionCheck = detectMalicious(clean.description);
    if (titleCheck.blocked || descriptionCheck.blocked) {
      setEventError(`Invalid content: ${titleCheck.reason || descriptionCheck.reason}`); return;
    }
    try {
      const result = await runBackendTask(editingEventId ? 'Saving event...' : 'Creating event...', () =>
        saveEventFn({ id: editingEventId || undefined, ...clean }));
      const newId = (result.data as { id?: string })?.id;
      if (!editingEventId && newId) {
        setEditingEventId(newId); setEventNotice('Event created. You can add images below.'); return;
      }
      setShowEventModal(false);
    } catch (error) {
      setEventError('Could not save event. Please try again.');
      reportFailure(error, 'desktop-save-event', { editingEventId });
    }
  };

  const deleteEvent = async (id: string) => {
    try { await runBackendTask('Deleting event...', () => deleteEventFn({ id })); }
    catch (error) { reportFailure(error, 'desktop-delete-event', { id }); }
  };

  const approveDoc = async (id: string) => {
    setDocModerationError('');
    try { await runBackendTask('Approving document...', () => setDocumentStatusFn({ id, status: 'approved' })); }
    catch (error) { setDocModerationError(callableErrorMessage(error, 'Could not approve the document.')); }
  };

  const rejectDoc = async (id: string) => {
    setDocModerationError('');
    try { await runBackendTask('Rejecting document...', () => setDocumentStatusFn({ id, status: 'rejected' })); }
    catch (error) { setDocModerationError(callableErrorMessage(error, 'Could not reject the document.')); }
  };

  const togglePublishDoc = async (document: any) => {
    setDocModerationError('');
    try {
      await runBackendTask(document.published ? 'Unpublishing document...' : 'Publishing document...', () =>
        toggleDocumentPublishedFn({ id: document.id }));
    } catch (error) { setDocModerationError(callableErrorMessage(error, 'Could not update the document.')); }
  };

  const deleteDocRecord = async (document: any) => {
    setDocModerationError('');
    try { await runBackendTask('Deleting document...', () => deleteDocumentRecordFn({ id: document.id })); }
    catch (error) { setDocModerationError(callableErrorMessage(error, 'Could not delete the document.')); }
  };

  const handleAdminUpload = async (event: FormEvent) => {
    event.preventDefault();
    const file = adminUploadForm.file as File | null;
    if (!file) { setAdminUploadError('Please choose a file.'); return; }
    if (!['application/pdf', 'image/jpeg', 'image/png'].includes(file.type)) {
      setAdminUploadError('Only PDF, JPG, and PNG files are allowed.'); return;
    }
    if (file.size > 10 * 1024 * 1024) { setAdminUploadError('File must be under 10 MB.'); return; }
    const title = enforceLimit(sanitizeText(adminUploadForm.title), LIMITS.name) || file.name;
    const notes = enforceLimit(sanitizeMultiline(adminUploadForm.notes), LIMITS.comment);
    if (detectMalicious(title).blocked || detectMalicious(notes).blocked) {
      setAdminUploadError('The title or notes contain invalid content.'); return;
    }
    setAdminUploadError(''); setAdminUploadLoading(true);
    const uploadedPaths: string[] = [];
    let finalizeStarted = false;
    try {
      await runBackendTask('Uploading admin document...', async () => {
        const thumbnail = await generateThumbnail(file);
        const response = await createDocumentUploadTicketFn({
          name: file.name, contentType: file.type, sizeBytes: file.size, wantsThumbnail: !!thumbnail,
        });
        const ticket = response.data as { ticketId: string; storagePath: string; thumbnailPath: string };
        await uploadBytes(ref(storage, ticket.storagePath), file, {
          contentType: file.type,
          customMetadata: { published: 'false', ticketId: ticket.ticketId, role: 'document' },
        });
        uploadedPaths.push(ticket.storagePath);
        if (thumbnail && ticket.thumbnailPath) {
          await uploadBytes(ref(storage, ticket.thumbnailPath), thumbnail, {
            contentType: 'image/jpeg',
            customMetadata: { published: 'false', ticketId: ticket.ticketId, role: 'thumbnail' },
          });
          uploadedPaths.push(ticket.thumbnailPath);
        }
        finalizeStarted = true;
        await createAdminDocumentRecordFn({ ticketId: ticket.ticketId, title, notes, publish: !!adminUploadForm.publish });
      });
      setAdminUploadForm({ title: '', notes: '', publish: true, file: null });
    } catch (error) {
      if (!finalizeStarted) await Promise.all(uploadedPaths.map(path => deleteObject(ref(storage, path)).catch(() => undefined)));
      setAdminUploadError(callableErrorMessage(error, 'Upload failed. Please try again.'));
      reportFailure(error, 'desktop-admin-upload', { fileName: file.name });
    } finally { setAdminUploadLoading(false); }
  };

  const approvePost = async (id: string) => {
    try { await runBackendTask('Approving forum post...', () => approveForumPostFn({ id })); }
    catch (error) { reportFailure(error, 'desktop-approve-post', { id }); }
  };

  const deletePost = async (id: string) => {
    try { await runBackendTask('Deleting forum post...', () => deleteForumPostFn({ id })); setAdminViewThread(null); }
    catch (error) { reportFailure(error, 'desktop-delete-post', { id }); }
  };

  const deleteReply = async (postId: string, replyId: string) => {
    try { await runBackendTask('Deleting forum reply...', () => deleteForumReplyFn({ postId, replyId })); }
    catch (error) { reportFailure(error, 'desktop-delete-reply', { postId, replyId }); }
  };

  const approvePendingReply = async (replyId: string) => {
    try { await runBackendTask('Approving forum reply...', () => approvePendingForumReplyFn({ replyId })); }
    catch (error) { reportFailure(error, 'desktop-approve-reply', { replyId }); }
  };

  const deletePendingReply = async (replyId: string) => {
    try { await runBackendTask('Deleting pending reply...', () => deletePendingForumReplyFn({ replyId })); }
    catch (error) { reportFailure(error, 'desktop-delete-pending-reply', { replyId }); }
  };

  const unflagReply = async (postId: string, replyId: string) => {
    try { await runBackendTask('Clearing reply flag...', () => unflagForumReplyFn({ postId, replyId })); }
    catch (error) { reportFailure(error, 'desktop-unflag-reply', { postId, replyId }); }
  };

  const handleImportOverlay = async (event: FormEvent) => {
    event.preventDefault(); setImportError('');
    if (!importName.trim()) { setImportError('Please enter a name.'); return; }
    let geojson: any;
    try { geojson = sanitizeGeoJSON(JSON.parse(importJson)); }
    catch (error) { setImportError(error instanceof Error ? error.message : 'Invalid GeoJSON.'); return; }
    try {
      await runBackendTask('Importing overlay...', () => importOverlayFn({
        name: importName.trim(), description: importDesc.trim(), color: importColor,
        geojson: JSON.stringify(geojson),
      }));
      setShowImportModal(false); setImportJson(''); setImportName(''); setImportDesc(''); setImportColor('#3366ff');
    } catch (error) { setImportError('Could not save overlay.'); reportFailure(error, 'desktop-import-overlay'); }
  };

  const handleImportFile = (event: any) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result || ''); setImportJson(text); setImportError('');
      try {
        const parsed: any = sanitizeGeoJSON(JSON.parse(text));
        if (!importName.trim()) setImportName((parsed.context?.summary || file.name.replace(/\.(geo)?json$/i, '')).slice(0, 60));
        const stroke = parsed.features.find((feature: any) => feature.properties?.stroke)?.properties?.stroke;
        if (stroke) setImportColor(stroke);
      } catch { /* The form displays validation when submitted. */ }
    };
    reader.readAsText(file); event.target.value = '';
  };

  const deleteOverlayGroup = async (id: string) => {
    try { await runBackendTask('Deleting overlay...', () => deleteOverlayFn({ id })); }
    catch (error) { reportFailure(error, 'desktop-delete-overlay', { id }); }
  };
  const approveOverlayUpload = (uploadId: string) => runBackendTask('Approving overlay...', () => approveOverlayUploadFn({ uploadId }));
  const rejectOverlayUpload = (uploadId: string, note = '') => runBackendTask('Rejecting overlay...', () => rejectOverlayUploadFn({ uploadId, note }));
  const deleteOverlayUpload = (uploadId: string) => runBackendTask('Deleting overlay upload...', () => deleteOverlayUploadFn({ uploadId }));
  const toggleOverlayPublished = (id: string) => runBackendTask('Updating overlay visibility...', () => toggleOverlayPublishedFn({ id }));

  const toggleUserModeration = (uid: string, current: boolean) =>
    runBackendTask(current ? 'Lifting user restriction...' : 'Requiring user approval...', () =>
      toggleUserModerationFn({ uid, moderated: !current }));

  const openProfileForVolunteer = (volunteer: any) => {
    const user = allUsers.find(item => item.email?.toLowerCase() === volunteer.email?.toLowerCase());
    setAdminProfileUser({
      volunteerId: volunteer.id, uid: user?.id || null, name: volunteer.name,
      userName: user?.userName || '', email: volunteer.email, phone: volunteer.phone,
      moderated: !!user?.moderated,
    });
  };

  const openProfileForUser = (uid: string) => {
    const user = allUsers.find(item => item.id === uid);
    if (!user) return;
    const volunteer = volunteers.find(item => item.email?.toLowerCase() === user.email?.toLowerCase());
    setAdminProfileUser({
      volunteerId: volunteer?.id || null, uid: user.id, name: user.name || volunteer?.name || 'User',
      userName: user.userName || '', email: user.email, phone: volunteer?.phone || '', moderated: !!user.moderated,
    });
  };

  const saveAdminUserProfile = async (profile: any) => {
    const name = enforceLimit(sanitizeText(profile.name), LIMITS.name);
    const email = sanitizeEmail(profile.email);
    if (!name || !email) throw new Error('A valid name and email are required.');
    const response = await runBackendTask('Saving user profile...', () => saveAdminUserProfileFn({ ...profile, name, email }));
    setAdminProfileUser(response.data); return response.data;
  };

  const adminSendPasswordReset = (email: string) => runBackendTask('Sending password reset...', () => requestPasswordReset(email));
  const adminAnonymizeForumPosts = async (uid: string) => {
    const response = await runBackendTask('Anonymizing forum activity...', () => adminAnonymizeForumPostsFn({ uid }));
    return (response.data as { changed?: number }).changed || 0;
  };
  const adminDeleteUserData = async (uid: string, email: string) => {
    await runBackendTask('Deleting user data...', () => adminDeleteUserDataFn({ uid, email }));
    setAdminProfileUser(null);
  };
  const replyToProfileMessage = async (id: string, reply: string) => {
    const clean = enforceLimit(sanitizeMultiline(reply), LIMITS.comment);
    if (!clean) throw new Error('Please enter a reply message.');
    await runBackendTask('Sending reply...', () => replyToProfileMessageFn({ id, reply: clean }));
  };

  const goToEvent = (eventId: string) => {
    const site = (import.meta.env.VITE_PUBLIC_SITE_URL || 'https://tillerystreettrail.web.app').replace(/\/$/, '');
    window.open(`${site}/events/${encodeURIComponent(eventId)}`, '_blank', 'noopener,noreferrer');
  };

  const activeTask = backendTasks.at(-1);
  const value = {
    currentUser, setCurrentUser, isAdmin,
    events, forumPosts, overlayGroups, allUsers, adminRsvps, errorLogs, adminAuditLogs, volunteers,
    allUserDocs, mailingList, profileMessages, forumReports, pendingForumReplies,
    overlayUploads, eventCommentReports, siteContent,
    adminTab, setAdminTab, adminViewThread, setAdminViewThread, adminViewUser, setAdminViewUser,
    editingId, setEditingId, editForm, setEditForm, editingEventId, setEditingEventId,
    accountMenuOpen, setAccountMenuOpen, viewingDoc, setViewingDoc,
    adminProfileUser, setAdminProfileUser, showEventModal, setShowEventModal,
    showImportModal, setShowImportModal, eventForm, setEventForm, eventError, setEventError,
    eventNotice, setEventNotice, adminUploadForm, setAdminUploadForm,
    adminUploadError, setAdminUploadError, adminUploadLoading, docModerationError,
    importJson, setImportJson, importName, setImportName, importDesc, setImportDesc,
    importColor, setImportColor, importError, setImportError,
    hiddenGroupIds, setHiddenGroupIds, effectiveVisibleIds,
    pendingDocsCount, flaggedPostsCount, flaggedRepliesCount, adminBadges,
    getAllUserComments, runBackendTask, handleSignOut, deleteVolunteer, startEdit, saveEdit,
    removeMail, openNewEvent, openEditEvent, saveEvent, deleteEvent, goToEvent,
    approveDoc, rejectDoc, togglePublishDoc, deleteDocRecord, handleAdminUpload,
    approvePost, deletePost, deleteReply, approvePendingReply, deletePendingReply, unflagReply,
    handleImportOverlay, handleImportFile, deleteOverlayGroup, approveOverlayUpload,
    rejectOverlayUpload, deleteOverlayUpload, toggleOverlayPublished,
    toggleUserModeration, openProfileForVolunteer, openProfileForUser, saveAdminUserProfile,
    adminSendPasswordReset, adminAnonymizeForumPosts, adminDeleteUserData, replyToProfileMessage,
    setShowAuthModal: () => {},
  };

  return (
    <AppContext.Provider value={value}>
      <div className={activeTask ? 'pointer-events-none select-none' : undefined} inert={activeTask ? true : undefined}>
        {children}
      </div>
      {activeTask && <BackendProgressOverlay message={activeTask.message} />}
    </AppContext.Provider>
  );
}
