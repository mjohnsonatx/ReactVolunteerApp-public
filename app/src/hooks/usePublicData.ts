// hooks/usePublicData.js
import { useState, useEffect } from 'react';
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
  const [publicDocs, setPublicDocs] = useState([]);
  const [overlayGroups, setOverlayGroups] = useState([]);

  useEffect(() => {
    let active = true;
    const forumQuery = isAdmin
      ? query(collection(db, 'forumPosts'), orderBy('createdAt', 'desc'))
      : query(collection(db, 'forumPosts'), where('status', '==', 'approved'), orderBy('createdAt', 'desc'));
    const overlaysQuery = isAdmin
      ? query(collection(db, 'overlays'), orderBy('createdAt', 'asc'))
      : query(collection(db, 'overlays'), where('published', '==', true), orderBy('createdAt', 'asc'));

    const unsubEvents = onSnapshot(query(collection(db, 'events'), orderBy('date', 'asc')),
      s => setEvents(s.docs.map(d => ({ id: d.id, ...d.data() }))), e => logError(e, 'events-listener'));
    const unsubForum = onSnapshot(forumQuery,
      s => setForumPosts(s.docs.map(d => ({ id: d.id, ...d.data() }))), e => logError(e, 'forum-listener'));
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
    return () => { active = false; unsubEvents(); unsubForum(); unsubOverlays(); };
  }, [isAdmin]);

  return { events, forumPosts, publicDocs, overlayGroups };
}
