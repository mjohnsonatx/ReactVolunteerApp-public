import { useState, useEffect } from 'react';
import { collection, query, orderBy, onSnapshot, limit } from 'firebase/firestore';
import { adminLogTimestampMillis } from '@watershed/shared';
import { db } from '../firebase';
import { logError } from '../utils/logError';

export function useAdminData(isAdmin) {
  const [allUsers, setAllUsers] = useState([]);
  const [adminRsvps, setAdminRsvps] = useState([]);
  const [errorLogs, setErrorLogs] = useState([]);
  const [adminAuditLogs, setAdminAuditLogs] = useState([]);
  const [volunteers, setVolunteers] = useState([]);
  const [allUserDocs, setAllUserDocs] = useState([]);
  const [mailingList, setMailingList] = useState([]);
  const [profileMessages, setProfileMessages] = useState([]);
  const [forumReports, setForumReports] = useState([]);
  const [forumAuthors, setForumAuthors] = useState([]);
  const [pendingForumReplies, setPendingForumReplies] = useState([]);
  const [overlayUploads, setOverlayUploads] = useState([]);
  const [eventCommentReports, setEventCommentReports] = useState([]);

  useEffect(() => {
    if (!isAdmin) {
      setAllUsers([]); setAdminRsvps([]); setErrorLogs([]); setAdminAuditLogs([]);
      setVolunteers([]); setAllUserDocs([]); setMailingList([]);
      setProfileMessages([]);
      setForumReports([]);
      setForumAuthors([]);
      setPendingForumReplies([]);
      setOverlayUploads([]);
      setEventCommentReports([]);
      return;
    }
    let currentErrors = [];
    let legacyErrors = [];
    const updateErrors = () => {
      const merged = new Map();
      [...currentErrors, ...legacyErrors].forEach(item => merged.set(item.id, item));
      setErrorLogs([...merged.values()]
        .sort((a, b) => adminLogTimestampMillis(b.createdAt ?? b.at) - adminLogTimestampMillis(a.createdAt ?? a.at))
        .slice(0, 100));
    };
    const u = [
      onSnapshot(collection(db, 'forumAuthors'),
        s => setForumAuthors(s.docs.map(d => ({ id: d.id, ...d.data() }))),
        e => { setForumAuthors([]); logError(e, 'forumAuthors-listener'); }),
      onSnapshot(collection(db, 'users'),
        s => setAllUsers(s.docs.map(d => ({ id: d.id, ...d.data() }))), e => logError(e, 'users-listener')),
      onSnapshot(query(collection(db, 'rsvps'), orderBy('createdAt', 'desc')),
        s => setAdminRsvps(s.docs.map(d => ({ id: d.id, ...d.data() }))), e => logError(e, 'admin-rsvps-listener')),
      onSnapshot(query(collection(db, 'errorLogs'), orderBy('createdAt', 'desc'), limit(100)),
        s => { currentErrors = s.docs.map(d => ({ id: d.id, ...d.data() })); updateErrors(); }, e => logError(e, 'errorLogs-current-listener')),
      onSnapshot(query(collection(db, 'errorLogs'), orderBy('at', 'desc'), limit(100)),
        s => { legacyErrors = s.docs.map(d => ({ id: d.id, ...d.data() })); updateErrors(); }, e => logError(e, 'errorLogs-legacy-listener')),
      onSnapshot(query(collection(db, 'adminAuditLogs'), orderBy('createdAt', 'desc'), limit(100)),
        s => setAdminAuditLogs(s.docs.map(d => ({ id: d.id, ...d.data() }))), e => logError(e, 'adminAuditLogs-listener')),
      onSnapshot(query(collection(db, 'volunteers'), orderBy('joinDate', 'desc')),
        s => setVolunteers(s.docs.map(d => ({ id: d.id, ...d.data() }))), e => logError(e, 'volunteers-listener')),
      onSnapshot(query(collection(db, 'documents'), orderBy('uploadDate', 'desc')),
        s => setAllUserDocs(s.docs.map(d => ({ id: d.id, ...d.data() }))), e => logError(e, 'documents-listener')),
      onSnapshot(collection(db, 'mailingList'),
        s => setMailingList(s.docs.map(d => ({ id: d.id, ...d.data() }))), e => logError(e, 'mailing-listener')),
      onSnapshot(query(collection(db, 'profileMessages'), orderBy('createdAt', 'desc')),
        s => setProfileMessages(s.docs.map(d => ({ id: d.id, ...d.data() }))),
        e => logError(e, 'profileMessages-listener')),
      onSnapshot(query(collection(db, 'forumReports'), orderBy('createdAt', 'desc')),
        s => setForumReports(s.docs.map(d => ({ id: d.id, ...d.data() }))),
        e => logError(e, 'forumReports-listener')),
      onSnapshot(query(collection(db, 'forumPendingReplies'), orderBy('createdAt', 'desc')),
        s => setPendingForumReplies(s.docs.map(d => ({ id: d.id, ...d.data() }))),
        e => logError(e, 'forumPendingReplies-listener')),
      onSnapshot(query(collection(db, 'overlayUploads'), orderBy('uploadedAt', 'desc')),
        s => setOverlayUploads(s.docs.map(d => ({ id: d.id, ...d.data() }))),
        e => logError(e, 'overlayUploads-listener')),
      onSnapshot(query(collection(db, 'eventCommentReports'), orderBy('createdAt', 'desc')),
        s => setEventCommentReports(s.docs.map(d => ({ id: d.id, ...d.data() }))),
        e => logError(e, 'eventCommentReports-listener')),
    ];
    return () => u.forEach(fn => fn());
  }, [isAdmin]);

  return {
    allUsers, adminRsvps, errorLogs, adminAuditLogs, volunteers, allUserDocs, mailingList,
    profileMessages, forumReports, forumAuthors, pendingForumReplies, overlayUploads, eventCommentReports,
  };
}

// // hooks/useAdminData.js
// import { useState, useEffect } from 'react';
// import { collection, query, orderBy, onSnapshot } from 'firebase/firestore';
// import { db } from '../firebase';
// import { logError } from '../utils/logError';

// export function useAdminData(isAdmin) {
//   const [allUsers, setAllUsers] = useState([]);
//   const [adminRsvps, setAdminRsvps] = useState([]);
//   const [errorLogs, setErrorLogs] = useState([]);
//   const [volunteers, setVolunteers] = useState([]);
//   const [allUserDocs, setAllUserDocs] = useState([]);
//   const [mailingList, setMailingList] = useState([]);

//   useEffect(() => {
//     if (!isAdmin) {
//       setAllUsers([]); setAdminRsvps([]); setErrorLogs([]);
//       setVolunteers([]); setAllUserDocs([]); setMailingList([]);
//       return;
//     }
//     const u = [
//       onSnapshot(collection(db, 'users'),
//         s => setAllUsers(s.docs.map(d => ({ id: d.id, ...d.data() }))), e => logError(e, 'users-listener')),
//       onSnapshot(query(collection(db, 'rsvps'), orderBy('createdAt', 'desc')),
//         s => setAdminRsvps(s.docs.map(d => ({ id: d.id, ...d.data() }))), e => logError(e, 'admin-rsvps-listener')),
//       onSnapshot(query(collection(db, 'errorLogs'), orderBy('at', 'desc')),
//         s => setErrorLogs(s.docs.slice(0, 50).map(d => ({ id: d.id, ...d.data() }))), e => logError(e, 'errorLogs-listener')),
//       onSnapshot(query(collection(db, 'volunteers'), orderBy('joinDate', 'desc')),
//         s => setVolunteers(s.docs.map(d => ({ id: d.id, ...d.data() }))), e => logError(e, 'volunteers-listener')),
//       onSnapshot(query(collection(db, 'documents'), orderBy('uploadDate', 'desc')),
//         s => setAllUserDocs(s.docs.map(d => ({ id: d.id, ...d.data() }))), e => logError(e, 'documents-listener')),
//       onSnapshot(collection(db, 'mailingList'),
//         s => setMailingList(s.docs.map(d => ({ id: d.id, ...d.data() }))), e => logError(e, 'mailing-listener')),
//     ];
//     return () => u.forEach(fn => fn());
//   }, [isAdmin]);

//   return { allUsers, adminRsvps, errorLogs, volunteers, allUserDocs, mailingList };
// }
