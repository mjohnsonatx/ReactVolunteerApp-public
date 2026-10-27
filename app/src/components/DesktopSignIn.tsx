import { useState } from 'react';
import { getToken } from 'firebase/app-check';
import { signInWithEmailAndPassword, signOut, type User } from 'firebase/auth';
import { httpsCallable } from 'firebase/functions';
import { appCheck, auth, functions } from '../firebase';
import { desktopSignInError } from '../libs/desktopSignInError';
import { desktopAttestationExpiry } from '../libs/desktopAttestationExpiry';
import {
  adminMfaSessionFromToken,
  resolveTotpChallenge,
  totpChallengeFromError,
  type TotpSignInChallenge,
} from '../auth/adminMfa';
import AdminMfaEnrollment from './AdminMfaEnrollment';

export default function DesktopSignIn() {
  const params = new URLSearchParams(window.location.search);
  const port = Number(params.get('port'));
  const state = params.get('state') || '';
  const valid = Number.isInteger(port) && port > 0 && port <= 65_535 && /^[a-f0-9]{64}$/.test(state);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mfaCode, setMfaCode] = useState('');
  const [mfaChallenge, setMfaChallenge] = useState<TotpSignInChallenge | null>(null);
  const [needsEnrollment, setNeedsEnrollment] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const connectDesktop = async (user: User) => {
    const token = await user.getIdTokenResult(true);
    if (token.claims.admin !== true) {
      await signOut(auth);
      throw new Error('This account does not have administrator access.');
    }
    if (!adminMfaSessionFromToken(token)) {
      setNeedsEnrollment(true);
      setBusy(false);
      return;
    }
    if (!appCheck) throw new Error('App verification is unavailable.');
    const attestation = await getToken(appCheck, true);
    const issue = httpsCallable<null, { customToken: string }>(functions, 'issueDesktopSignInToken');
    const { data } = await issue(null);
    const expiresAt = desktopAttestationExpiry(attestation.token);
    const relay = document.createElement('form');
    relay.method = 'POST';
    relay.action = `http://127.0.0.1:${port}/callback`;
    for (const [name, value] of Object.entries({ state, customToken: data.customToken, appCheckToken: attestation.token, expiresAt: String(expiresAt) })) {
      const field = document.createElement('input');
      field.type = 'hidden';
      field.name = name;
      field.value = value;
      relay.append(field);
    }
    document.body.append(relay);
    relay.submit();
  };

  const handlePasswordSignIn = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!valid || busy) return;
    setBusy(true);
    setError('');
    let stage = 'Application verification';
    try {
      if (!appCheck) throw new Error('App verification is unavailable.');
      // Acquire attestation before any Auth request, including the desktop handoff.
      await getToken(appCheck, true);
      stage = 'Browser sign-in';
      const credential = await signInWithEmailAndPassword(auth, email.trim(), password);
      setPassword('');
      stage = 'Administrator handoff';
      await connectDesktop(credential.user);
    } catch (failure) {
      const challenge = totpChallengeFromError(auth, failure);
      if (challenge) {
        setMfaChallenge(challenge);
        setMfaCode('');
        setPassword('');
        setBusy(false);
        return;
      }
      setBusy(false);
      setPassword('');
      setError(desktopSignInError(failure, stage));
    }
  };

  const handleMfaSignIn = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!mfaChallenge || busy) return;
    setBusy(true);
    setError('');
    let stage = 'Application verification';
    try {
      if (!appCheck) throw new Error('App verification is unavailable.');
      await getToken(appCheck, true);
      stage = 'Authenticator verification';
      const credential = await resolveTotpChallenge(mfaChallenge, mfaCode);
      setMfaChallenge(null);
      setMfaCode('');
      stage = 'Administrator handoff';
      await connectDesktop(credential.user);
    } catch (failure) {
      setBusy(false);
      setMfaCode('');
      setError(desktopSignInError(failure, stage));
    }
  };

  if (needsEnrollment) return <AdminMfaEnrollment />;

  return (
    <main className="public-site-theme min-h-screen flex items-center justify-center bg-gray-100 p-6">
      <form className="w-full max-w-sm rounded-2xl bg-white p-8 shadow-lg space-y-4" onSubmit={mfaChallenge ? handleMfaSignIn : handlePasswordSignIn}>
        <h1 className="text-2xl font-semibold">{mfaChallenge ? 'Two-step verification' : 'Sign into the desktop app'}</h1>
        <p className="text-sm text-gray-600">
          {mfaChallenge
            ? 'Enter the six-digit code from your authenticator app.'
            : 'Use your Tillery Street administrator account. This connects the desktop app you just opened.'}
        </p>
        {!valid && <p role="alert">Open this page using “Sign in with browser” in the desktop application.</p>}
        {mfaChallenge ? (
          <label className="block">
            Authenticator code
            <input
              className="block w-full border rounded px-3 py-2 tracking-[0.35em]"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]{6}"
              maxLength={6}
              required
              autoFocus
              value={mfaCode}
              onChange={event => setMfaCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
            />
          </label>
        ) : (
          <>
            <label className="block">Email<input className="block w-full border rounded px-3 py-2" type="email" autoComplete="username" required value={email} onChange={event => setEmail(event.target.value)} /></label>
            <label className="block">Password<input className="block w-full border rounded px-3 py-2" type="password" autoComplete="current-password" required value={password} onChange={event => setPassword(event.target.value)} /></label>
          </>
        )}
        {error && <p role="alert" className="text-red-700">{error}</p>}
        <button disabled={!valid || busy || (mfaChallenge && mfaCode.length !== 6)} className="w-full bg-teal-700 text-white rounded px-3 py-2 disabled:opacity-50">
          {busy ? 'Connecting…' : mfaChallenge ? 'Verify and connect desktop' : 'Sign in and connect desktop'}
        </button>
        {mfaChallenge && (
          <button type="button" onClick={() => { setMfaChallenge(null); setMfaCode(''); setError(''); }} className="w-full text-sm text-gray-600">
            Use a different account
          </button>
        )}
      </form>
    </main>
  );
}
