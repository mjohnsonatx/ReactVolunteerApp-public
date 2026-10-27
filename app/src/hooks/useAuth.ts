// hooks/useAuth.js
import { useState, useEffect, useCallback, useRef } from 'react';
import { onIdTokenChanged, type User } from 'firebase/auth';
import { doc, getDocFromServer } from 'firebase/firestore';
import { auth, db } from '../firebase';
import { logError } from '../utils/logError';
import { syncUserEmail } from '../services/accountService';
import { adminMfaSessionFromToken } from '../auth/adminMfa';
import { profileStatus } from '../auth/profileStatus';

export function useAuth() {
  const [currentUser, setCurrentUser] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [hasAdminClaim, setHasAdminClaim] = useState(false);
  const [hasAdminMfaSession, setHasAdminMfaSession] = useState(false);
  const [authLoading, setAuthLoading] = useState(true);
  const [userVotes, setUserVotes] = useState({});
  const [accountLoadError, setAccountLoadError] = useState('');
  const loadVersion = useRef({ value: 0 });
  const activeUid = useRef<string | null>(null);

  const loadUser = useCallback(async (user: User | null) => {
      const version = ++loadVersion.current.value;
      if (activeUid.current !== (user?.uid ?? null)) {
        activeUid.current = user?.uid ?? null;
        setAuthLoading(true);
        setCurrentUser(null);
        setHasAdminClaim(false);
        setHasAdminMfaSession(false);
        setIsAdmin(false);
        setUserVotes({});
      }
      setAccountLoadError('');
      try {
        if (user) {
          const token = await user.getIdTokenResult();
          // An offline cache miss must not be mistaken for an absent profile.
          const snap = await getDocFromServer(doc(db, 'users', user.uid));
          if (version !== loadVersion.current.value) return;
          const data = snap.exists() ? snap.data() : {};
          if (user.emailVerified && user.email && data.email && data.email !== user.email) {
            syncUserEmail(user.uid, user.email);
          }
          setCurrentUser({
            id: user.uid,
            name: data.userName || '',
            userName: data.userName || '',
            email: user.email || data.email || '',
            emailVerified: user.emailVerified === true,
            moderated: data.moderated === true,
            reportedContent: data.reportedContent || {},
            profileStatus: profileStatus(snap.exists(), data),
          });
          const adminClaim = token.claims.admin === true;
          const adminMfaSession = adminClaim && adminMfaSessionFromToken(token);
          setHasAdminClaim(adminClaim);
          setHasAdminMfaSession(adminMfaSession);
          setIsAdmin(adminMfaSession);
          setUserVotes(data.votes || {});
        } else {
          setCurrentUser(null);
          setHasAdminClaim(false);
          setHasAdminMfaSession(false);
          setIsAdmin(false);
          setUserVotes({});
        }
      } catch (err) {
        if (version !== loadVersion.current.value) return;
        logError(err, 'auth-listener');
        setCurrentUser(null);
        setUserVotes({});
        setHasAdminClaim(false);
        setHasAdminMfaSession(false);
        setIsAdmin(false);
        setAccountLoadError('Could not load your account profile. Check your connection and try again.');
      } finally {
        if (version === loadVersion.current.value) setAuthLoading(false);
      }
  }, []);

  useEffect(() => {
    const generation = loadVersion.current;
    const unsub = onIdTokenChanged(auth, loadUser);
    return () => { ++generation.value; unsub(); };
  }, [loadUser]);

  const refreshUserProfile = useCallback(() => {
    setAuthLoading(true);
    return loadUser(auth.currentUser);
  }, [loadUser]);

  return {
    currentUser,
    setCurrentUser,
    isAdmin,
    hasAdminClaim,
    hasAdminMfaSession,
    adminEnrollmentRequired: hasAdminClaim && !hasAdminMfaSession,
    authLoading,
    accountLoadError,
    refreshUserProfile,
    userVotes,
    setUserVotes,
  };
}
