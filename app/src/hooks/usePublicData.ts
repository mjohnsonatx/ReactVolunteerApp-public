// hooks/usePublicData.js
import { useState, useEffect, useCallback } from 'react';
import { collection, query, orderBy, where, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import { logError } from '../utils/logError';
import { listPublicDocumentsFn } from '../libs/callables';
import { PUBLIC_DOCUMENTS_ENABLED } from '../features';

// Firestore rules only expose approved forum posts and published overlays to
// visitors and members. Because security rules are not filters, non-admin
// queries MUST include the matching constraints or the whole query is denied.
// Public document cards use a callable projection because the underlying
// records also contain uploader PII for the admin moderation view.
export function usePublicData(isAdmin = false) {
  const [events, setEvents] = useState([]);
  const [forumPosts, setForumPosts] = useState([]);
  // True only once the server has answered. Offline (or after a stalled
  // connection) Firestore delivers whatever its cache holds, which on a fresh
  // load is an empty list: fine to show, but it must not be read as "this
  // thread is gone" or "the forum is empty".
  const [forumSynced, setForumSynced] = useState(false);
  const [forumError, setForumError] = useState(false);
  const [forumAttempt, setForumAttempt] = useState(0);
  const [publicDocs, setPublicDocs] = useState([]);
  const [overlayGroups, setOverlayGroups] = useState([]);

  useEffect(() => {
    let active = true;
    const overlaysQuery = isAdmin
      ? query(collection(db, 'overlays'), orderBy('createdAt', 'asc'))
      : query(collection(db, 'overlays'), where('published', '==', true), orderBy('createdAt', 'asc'));

    const unsubEvents = onSnapshot(query(collection(db, 'events'), orderBy('date', 'asc')),
      s => setEvents(s.docs.map(d => ({ id: d.id, ...d.data() }))), e => logError(e, 'events-listener'));
    if (PUBLIC_DOCUMENTS_ENABLED) listPublicDocumentsFn({})
      .then((response) => {
        if (!active) return;
        const data = response.data as { documents?: unknown };
        setPublicDocs(Array.isArray(data?.documents) ? data.documents : []);
      })
      .catch((e) => {
        if (!active) return;
        setPublicDocs([]);
        logError(e, 'publicDocs-callable');
      });
    const unsubOverlays = onSnapshot(overlaysQuery,
      s => setOverlayGroups(s.docs.map(d => {
        const data = d.data();
        let geojson = data.geojson;
        if (typeof geojson === 'string') {
          try { geojson = JSON.parse(geojson); }
          catch (e) { logError(e, 'overlay-parse', { id: d.id }); geojson = null; }
        }
        return { id: d.id, ...data, geojson };
      })), e => logError(e, 'overlays-listener'));
    return () => { active = false; unsubEvents(); unsubOverlays(); };
  }, [isAdmin]);

  // A Firestore listener that errors is closed for good, so the forum gets its
  // own subscription that the page can restart instead of staying empty.
  useEffect(() => {
    const forumQuery = isAdmin
      ? query(collection(db, 'forumPosts'), orderBy('createdAt', 'desc'))
      : query(collection(db, 'forumPosts'), where('status', '==', 'approved'), orderBy('createdAt', 'desc'));
    // Metadata changes are needed to hear about a cached snapshot becoming
    // server-confirmed when the documents themselves did not change.
    return onSnapshot(forumQuery, { includeMetadataChanges: true },
      s => {
        setForumPosts(s.docs.map(d => ({ id: d.id, ...d.data() })));
        setForumError(false);
        setForumSynced(!s.metadata.fromCache);
      },
      e => { logError(e, 'forum-listener'); setForumError(true); });
  }, [isAdmin, forumAttempt]);

  const retryForum = useCallback(() => {
    setForumError(false);
    setForumSynced(false);
    setForumAttempt(n => n + 1);
  }, []);

  return { events, forumPosts, forumSynced, forumError, retryForum, publicDocs, overlayGroups };
}
