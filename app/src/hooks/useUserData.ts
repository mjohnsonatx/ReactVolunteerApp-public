// hooks/useUserData.js
import { useState, useEffect } from 'react';
import { collection, query, where, orderBy, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import { logError } from '../utils/logError';

export function useUserData(currentUser) {
  const [rsvps, setRsvps] = useState([]);
  const [myMessages, setMyMessages] = useState([]);
  const userId = currentUser?.id;

  useEffect(() => {
    if (!userId) { setRsvps([]); setMyMessages([]); return; }
    const unsubRsvps = onSnapshot(query(collection(db, 'rsvps'), where('userId', '==', userId)),
      s => setRsvps(s.docs.map(d => ({ id: d.id, ...d.data() }))), e => logError(e, 'rsvps-listener'));
    // The sender can read their own contact thread, including any admin reply.
    const unsubMessages = onSnapshot(
      query(collection(db, 'profileMessages'), where('userId', '==', userId), orderBy('createdAt', 'desc')),
      s => setMyMessages(s.docs.map(d => ({ id: d.id, ...d.data() }))),
      e => logError(e, 'myMessages-listener'));
    return () => { unsubRsvps(); unsubMessages(); };
  }, [userId]);
  return { rsvps, myMessages };
}
