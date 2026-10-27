import { useEffect, useState } from 'react';
import { sendEmailVerification } from 'firebase/auth';
import { auth } from '../../firebase';
import { useApp } from '../../context/AppContext';
import { LOCAL_EMAIL_TEST_MODE, PUBLIC_DOCUMENTS_ENABLED } from '../../features';

export default function VerifyEmailBanner() {
  const { currentUser, refreshUserProfile } = useApp();
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!LOCAL_EMAIL_TEST_MODE || !currentUser || currentUser.emailVerified) return;
    let cancelled = false;
    let checking = false;
    const timer = window.setInterval(async () => {
      const user = auth.currentUser;
      if (checking || !user || user.uid !== currentUser.id) return;
      checking = true;
      try {
        await user.reload();
        if (!cancelled && user.emailVerified) {
          await user.getIdToken(true);
          if (!cancelled) await refreshUserProfile();
        }
      } catch { /* The normal retry controls remain available. */ }
      finally { checking = false; }
    }, 1500);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [currentUser, refreshUserProfile]);

  if (!currentUser || currentUser.emailVerified === true) return null;

  const refresh = async () => {
    const user = auth.currentUser;
    if (!user) return;
    try {
      await user.reload();
      await user.getIdToken(true);
      await refreshUserProfile();
      setMessage(user.emailVerified ? 'Email verified.' : 'Your email is not verified yet.');
    } catch {
      setMessage('Could not check verification. Please try again.');
    }
  };

  const resend = async () => {
    const user = auth.currentUser;
    if (!user) return;
    try {
      await sendEmailVerification(user);
      setMessage('Verification email sent. Check your inbox and spam folder.');
    } catch {
      setMessage('Could not send the email right now. Please try again later.');
    }
  };

  return (
    <div className="mx-6 mt-5 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950" role="status">
      <p>{currentUser.userName
        ? PUBLIC_DOCUMENTS_ENABLED
          ? 'Verify your email address before posting, commenting, voting, RSVPing, or uploading documents.'
          : 'Verify your email address before posting, commenting, voting, or RSVPing.'
        : 'Verify your email address first. Then we will help you complete your public profile.'}</p>
      <div className="mt-2 flex flex-wrap gap-3">
        <button type="button" className="underline" onClick={resend}>Resend verification email</button>
        <button type="button" className="underline" onClick={refresh}>I verified my email</button>
      </div>
      {message && <p className="mt-2">{message}</p>}
    </div>
  );
}
