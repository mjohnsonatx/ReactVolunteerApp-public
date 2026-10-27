import { useState } from 'react';
import QRCode from 'qrcode';
import {
  EmailAuthProvider,
  multiFactor,
  reauthenticateWithCredential,
  sendEmailVerification,
  signOut,
  TotpMultiFactorGenerator,
  type TotpSecret,
} from 'firebase/auth';
import { ShieldCheck } from 'lucide-react';
import { auth } from '../firebase';
import { logError } from '../utils/logError';

type EnrollmentStep = 'password' | 'totp' | 'complete';

function enrollmentErrorMessage(error: unknown): string {
  const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : '';
  switch (code) {
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
      return 'That password was not accepted. Please try again.';
    case 'auth/requires-recent-login':
      return 'Your session is too old. Sign out, sign back in, and try again.';
    case 'auth/invalid-verification-code':
      return 'That verification code is not valid. Wait for a new code and try again.';
    case 'auth/operation-not-allowed':
    case 'auth/unsupported-first-factor':
      return 'Authenticator-app verification is not enabled for this Firebase project yet.';
    case 'auth/maximum-second-factor-count-exceeded':
      return 'This account already has the maximum number of second factors.';
    default:
      return 'Two-step verification could not be configured. Please try again.';
  }
}

export default function AdminMfaEnrollment() {
  const user = auth.currentUser;
  const [step, setStep] = useState<EnrollmentStep>('password');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [secret, setSecret] = useState<TotpSecret | null>(null);
  const [qrCode, setQrCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [verificationSent, setVerificationSent] = useState(false);

  if (!user) return null;

  const startEnrollment = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!user.email || !user.emailVerified || busy) return;
    setBusy(true);
    setError('');
    try {
      const enrolledFactors = multiFactor(user).enrolledFactors;
      if (enrolledFactors.some(factor => factor.factorId === TotpMultiFactorGenerator.FACTOR_ID)) {
        setError('An authenticator is already enrolled. Sign out and complete a fresh two-step sign-in.');
        return;
      }
      await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, password));
      const session = await multiFactor(user).getSession();
      const nextSecret = await TotpMultiFactorGenerator.generateSecret(session);
      const qrUrl = nextSecret.generateQrCodeUrl(user.email, 'Tillery Street Volunteer Group');
      setSecret(nextSecret);
      setQrCode(await QRCode.toDataURL(qrUrl, { width: 240, margin: 1, errorCorrectionLevel: 'M' }));
      setPassword('');
      setStep('totp');
    } catch (failure) {
      logError(failure, 'admin-mfa-start');
      setPassword('');
      setError(enrollmentErrorMessage(failure));
    } finally {
      setBusy(false);
    }
  };

  const finishEnrollment = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!secret || busy) return;
    setBusy(true);
    setError('');
    try {
      const assertion = TotpMultiFactorGenerator.assertionForEnrollment(secret, code.trim());
      await multiFactor(user).enroll(assertion, 'Authenticator app');
      setSecret(null);
      setQrCode('');
      setCode('');
      setStep('complete');
    } catch (failure) {
      logError(failure, 'admin-mfa-finish');
      setCode('');
      setError(enrollmentErrorMessage(failure));
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="public-site-theme min-h-screen bg-gradient-to-br from-gray-100 via-amber-50 to-teal-50 flex items-center justify-center p-6">
      <section className="w-full max-w-lg rounded-2xl bg-white p-8 shadow-xl" aria-labelledby="admin-mfa-title">
        <ShieldCheck size={44} className="mb-4 text-teal-700" aria-hidden="true" />
        <h1 id="admin-mfa-title" className="text-2xl font-bold text-gray-900">Protect your administrator account</h1>
        <p className="mt-2 text-sm leading-6 text-gray-600">
          Administrator tools stay locked until this account completes sign-in with an authenticator app.
          Regular member accounts do not need this step.
        </p>

        {!user.emailVerified && (
          <div className="mt-6 space-y-3 rounded-xl bg-amber-50 p-4 text-sm text-amber-900" role="alert">
            <p>Verify {user.email || 'this account'} by email, then sign out and back in before enrolling an authenticator.</p>
            <button
              type="button"
              disabled={busy || verificationSent}
              onClick={async () => {
                setBusy(true);
                setError('');
                try {
                  await sendEmailVerification(user);
                  setVerificationSent(true);
                } catch (failure) {
                  logError(failure, 'admin-email-verification');
                  setError('The verification email could not be sent. Please wait and try again.');
                } finally {
                  setBusy(false);
                }
              }}
              className="rounded-lg bg-amber-900 px-3 py-2 font-semibold text-white disabled:opacity-50"
            >
              {verificationSent ? 'Verification email sent' : 'Send verification email'}
            </button>
          </div>
        )}

        {user.emailVerified && step === 'password' && (
          <form className="mt-6 space-y-4" onSubmit={startEnrollment}>
            <label className="block text-sm font-medium text-gray-800">
              Confirm your password
              <input
                className="mt-1 block w-full rounded-xl border border-gray-300 px-3 py-2"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={event => setPassword(event.target.value)}
              />
            </label>
            <button disabled={busy} className="w-full rounded-xl bg-teal-700 px-4 py-3 font-semibold text-white disabled:opacity-50">
              {busy ? 'Preparing…' : 'Set up authenticator'}
            </button>
          </form>
        )}

        {step === 'totp' && secret && (
          <form className="mt-6 space-y-4" onSubmit={finishEnrollment}>
            <p className="text-sm text-gray-700">Scan this QR code with an authenticator app, then enter its six-digit code.</p>
            {qrCode && <img src={qrCode} width="240" height="240" alt="Authenticator enrollment QR code" className="mx-auto rounded-lg border" />}
            <details className="rounded-xl bg-gray-50 p-3 text-sm text-gray-700">
              <summary className="cursor-pointer font-medium">Enter the setup key manually</summary>
              <code className="mt-2 block break-all select-all">{secret.secretKey}</code>
            </details>
            <p className="text-xs text-amber-800">Do not email, message, or save a screenshot of this setup key.</p>
            <label className="block text-sm font-medium text-gray-800">
              Verification code
              <input
                className="mt-1 block w-full rounded-xl border border-gray-300 px-3 py-2 tracking-[0.35em]"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]{6}"
                maxLength={6}
                required
                value={code}
                onChange={event => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
              />
            </label>
            <button disabled={busy || code.length !== 6} className="w-full rounded-xl bg-teal-700 px-4 py-3 font-semibold text-white disabled:opacity-50">
              {busy ? 'Verifying…' : 'Finish setup'}
            </button>
          </form>
        )}

        {step === 'complete' && (
          <div className="mt-6 space-y-4">
            <p className="rounded-xl bg-green-50 p-4 text-sm text-green-900" role="status">
              Two-step verification is enrolled. Sign out now, then sign in with your password and authenticator code.
            </p>
            <button onClick={() => signOut(auth)} className="w-full rounded-xl bg-teal-700 px-4 py-3 font-semibold text-white">
              Sign out and verify
            </button>
          </div>
        )}

        {error && <p className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-700" role="alert">{error}</p>}
        {step !== 'complete' && (
          <button onClick={() => signOut(auth)} className="mt-4 w-full text-sm text-gray-600 hover:text-gray-900">Sign out</button>
        )}
      </section>
    </main>
  );
}
