// desktop/src/auth/AdminGate.tsx
import { useEffect, useState, type ReactNode } from 'react';
import { FirebaseError } from 'firebase/app';
import { Droplets } from 'lucide-react';
import { onAuthStateChanged, signOut, type User } from 'firebase/auth';
import { auth, DesktopAppCheckError, initDesktopAppCheck, signInFromBrowser } from '../firebase';

type GateState = 'loading' | 'signedOut' | 'notAdmin' | 'ready';

function authErrorMessage(error: unknown): string {
  if (!(error instanceof FirebaseError)) return error instanceof Error ? error.message : 'Browser sign-in failed. Please try again.';

  switch (error.code) {
    case 'auth/invalid-credential':
    case 'auth/user-not-found':
    case 'auth/wrong-password':
      return 'Firebase rejected that email/password combination.';
    case 'auth/invalid-email':
      return 'Enter a valid email address.';
    case 'auth/user-disabled':
      return 'This Firebase Authentication account is disabled.';
    case 'auth/too-many-requests':
      return 'Firebase temporarily blocked sign-in after too many attempts. Please wait and try again.';
    case 'auth/network-request-failed':
      return 'The desktop app could not reach Firebase Authentication.';
    case 'auth/operation-not-allowed':
      return 'Email/password sign-in is disabled for this Firebase project.';
    case 'auth/unauthorized-domain':
      return 'This development host is not authorized in Firebase Authentication.';
    case 'auth/invalid-api-key':
      return 'The desktop app is using an invalid Firebase API key.';
    default:
      return `Firebase sign-in failed (${error.code}).`;
  }
}

function errorSummary(error: unknown): { code?: string; message: string } {
  if (error instanceof FirebaseError) return { code: error.code, message: error.message };
  if (error instanceof Error) return { message: error.message };
  return { message: String(error) };
}

export default function AdminGate({ children }: { children: ReactNode }) {
  const [state, setState] = useState<GateState>('loading');
  const [user, setUser] = useState<User | null>(null);
  const [error, setError] = useState('');

  useEffect(() => onAuthStateChanged(auth, async (u) => {
    if (!u) { setState('signedOut'); setUser(null); return; }
    try {
      const { claims } = await u.getIdTokenResult(true);
      if (claims.admin !== true || claims.email_verified !== true || claims.desktop_admin_mfa !== true) {
        setUser(null);
        await signOut(auth);
        setState('notAdmin');
        return;
      }
      await initDesktopAppCheck();
      setError('');
      setUser(u);
      setState('ready');
    } catch (err) {
      console.error('[desktop-auth] Administrator verification failed.', errorSummary(err));
      setUser(null);
      await signOut(auth).catch(() => undefined);
      setState('signedOut');
      const appCheckFailure = err instanceof DesktopAppCheckError
        || (err instanceof FirebaseError && err.code.startsWith('appCheck/'));
      setError(appCheckFailure
        ? `Your credentials and admin claim were accepted, but the desktop App Check endpoint could not issue a token${err instanceof DesktopAppCheckError && err.status ? ` (HTTP ${err.status}${err.serverCode ? `: ${err.serverCode}` : ''})` : ''}.`
        : 'Could not verify the administrator claim. Please try again.');
    }
  }), []);

  if (state === 'ready' && user) return <>{children}</>;
  if (state === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-100" role="status">
        <div className="text-center">
          <Droplets size={36} className="mx-auto mb-3 animate-pulse text-teal-600" aria-hidden="true" />
          <p className="text-gray-500">Checking credentials…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-gray-100">
      <div className="hidden w-[42%] flex-col justify-between bg-slate-900 p-10 text-gray-200 lg:flex">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/10 text-amber-300">
            <Droplets size={22} aria-hidden="true" />
          </span>
          <div>
            <p className="font-display text-lg leading-tight text-white">WatershedCrew</p>
            <p className="text-[11px] uppercase tracking-[0.18em] text-gray-400">Tillery Fields</p>
          </div>
        </div>
        <div>
          <h2 className="font-display text-4xl leading-tight text-white">The trail, at a glance.</h2>
          <p className="mt-4 max-w-sm text-sm leading-relaxed text-gray-300">
            Volunteers, events, forum activity, and everything waiting for review, in one place.
          </p>
        </div>
        <p className="text-xs text-gray-500">Administrators only.</p>
      </div>
      <div className="flex flex-1 items-center justify-center p-10">
        <form
          className="w-full max-w-sm space-y-4 rounded-2xl border border-gray-200 bg-white p-8 shadow-card"
          onSubmit={async (e) => {
            e.preventDefault(); setError(''); setState('loading');
            try {
              await signInFromBrowser();
            } catch (err) {
              console.error('[desktop-auth] Firebase sign-in failed.', errorSummary(err));
              setState('signedOut');
              setError(authErrorMessage(err));
            }
          }}
        >
          <div>
            <h1 className="font-display text-2xl text-gray-900">Sign in</h1>
            <p className="mt-1 text-sm text-gray-500">Continue in your browser using your administrator account, then return here.</p>
          </div>
          {state === 'notAdmin' && (
            <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
              This session does not have verified two-step administrator access.
            </p>
          )}
          {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
          <button className="w-full rounded-xl bg-teal-600 py-2.5 font-semibold text-white hover:bg-teal-700">
            Sign in with browser
          </button>
        </form>
      </div>
    </div>
  );
}
