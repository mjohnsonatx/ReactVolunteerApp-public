// hooks/useSiteContent.js   ← NEW
import { useState, useEffect } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import { logError } from '../utils/logError';
import { DEFAULT_SITE_CONTENT, resolveSiteContent } from '../siteContent';

export function useSiteContent() {
  const [siteContent, setSiteContent] = useState(DEFAULT_SITE_CONTENT);
  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'siteContent', 'main'),
      snap => setSiteContent(resolveSiteContent(snap.exists() ? snap.data() : undefined)),
      err => logError(err, 'siteContent-listener'));
    return unsub;
  }, []);
  return siteContent;
}
