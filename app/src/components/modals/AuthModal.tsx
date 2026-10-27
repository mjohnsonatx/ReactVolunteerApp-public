// components/modals/AuthModal.jsx
import { X } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from '../../auth/passwordPolicy';
import { userNameFromEmail } from '@watershed/shared';

export default function AuthModal() {
  const {
    authMode, setAuthMode, setShowAuthModal,
    authForm, setAuthForm, authError, setAuthError,
    handleSignIn, handleCreateAccount,
    mfaChallenge, mfaCode, setMfaCode, handleMfaSignIn, cancelMfaSignIn,
  } = useApp();

  const close = () => {
    setShowAuthModal(false);
    setAuthError('');
    cancelMfaSignIn();
  };

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="auth-modal-title" className="fixed inset-0 bg-black/50 flex items-center justify-center z-[3000] p-4">
      <div className="bg-white rounded-2xl p-8 max-w-md w-full shadow-2xl">
        <div className="flex justify-between items-center mb-6">
          <h2 id="auth-modal-title" className="text-2xl font-bold text-gray-800">
            {mfaChallenge ? 'Two-step verification' : authMode === 'signin' ? 'Sign In' : 'Create Account'}
          </h2>
          <button onClick={close} className="text-gray-400 hover:text-gray-600"><X size={24} /></button>
        </div>
        {mfaChallenge ? (
          <form onSubmit={handleMfaSignIn} className="space-y-4">
            <p className="text-sm text-gray-600">Enter the six-digit code from your authenticator app.</p>
            <input
              type="text"
              name="mfaCode"
              inputMode="numeric"
              autoComplete="one-time-code"
              aria-label="Authenticator code"
              placeholder="123456"
              required
              pattern="[0-9]{6}"
              maxLength={6}
              autoFocus
              value={mfaCode}
              onChange={e => setMfaCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-teal-500 outline-none tracking-[0.35em]"
            />
            {authError && <p className="text-red-500 text-sm bg-red-50 px-4 py-2 rounded-lg">{authError}</p>}
            <button type="submit" disabled={mfaCode.length !== 6} className="w-full bg-teal-500 text-white py-3 rounded-xl font-semibold hover:bg-teal-600 disabled:opacity-50">Verify and sign in</button>
            <button type="button" onClick={cancelMfaSignIn} className="w-full text-sm text-gray-600 hover:text-gray-900">Use a different account</button>
          </form>
        ) : <form onSubmit={authMode === 'signin' ? handleSignIn : handleCreateAccount} className="space-y-4">
          <input type="email" name="email" autoComplete="username" placeholder="Email" required value={authForm.email}
            onChange={e => setAuthForm({ ...authForm, email: e.target.value })}
            className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-teal-500 outline-none" />
          {authMode === 'signup' && (
            <p className="text-xs text-gray-600" aria-live="polite">
              Your public username is created from the part of your email before @
              {userNameFromEmail(authForm.email) ? `: @${userNameFromEmail(authForm.email)}` : ''}.
              {' '}A suffix is added if needed. You can change it in account settings; your full email is not shown on posts.
            </p>
          )}
          <input type="password" name="password" autoComplete={authMode === 'signin' ? 'current-password' : 'new-password'} placeholder="Password" required minLength={authMode === 'signup' ? PASSWORD_MIN_LENGTH : undefined} maxLength={authMode === 'signup' ? PASSWORD_MAX_LENGTH : undefined} value={authForm.password}
            onChange={e => setAuthForm({ ...authForm, password: e.target.value })}
            className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-teal-500 outline-none" />
          {authMode === 'signup' && (
            <p className="text-xs text-gray-500 px-1">Use {PASSWORD_MIN_LENGTH}–{PASSWORD_MAX_LENGTH} characters.</p>
          )}
          {authMode === 'signup' && (
            <input type="password" name="confirmPassword" autoComplete="new-password" placeholder="Confirm Password" required minLength={PASSWORD_MIN_LENGTH} maxLength={PASSWORD_MAX_LENGTH} value={authForm.confirmPassword}
              onChange={e => setAuthForm({ ...authForm, confirmPassword: e.target.value })}
              className={`w-full px-4 py-3 rounded-xl border-2 outline-none transition-colors ${
                authForm.confirmPassword && authForm.password !== authForm.confirmPassword
                  ? 'border-red-300 focus:border-red-500'
                  : 'border-gray-200 focus:border-teal-500'}`} />
          )}
          {authMode === 'signup' && authForm.confirmPassword && authForm.password !== authForm.confirmPassword && (
            <p className="text-amber-600 text-xs px-1">Passwords do not match.</p>
          )}
          {authError && <p className="text-red-500 text-sm bg-red-50 px-4 py-2 rounded-lg">{authError}</p>}
          <button type="submit" className="w-full bg-teal-500 text-white py-3 rounded-xl font-semibold hover:bg-teal-600">{authMode === 'signin' ? 'Sign In' : 'Create Account'}</button>
        </form>}
        {!mfaChallenge && <button onClick={() => { setAuthMode(m => m === 'signin' ? 'signup' : 'signin'); setAuthError(''); }} className="mt-4 text-sm text-teal-600 hover:text-teal-700 w-full text-center">{authMode === 'signin' ? "Don't have an account? Sign Up" : 'Already have an account? Sign In'}</button>}
      </div>
    </div>
  );
}
