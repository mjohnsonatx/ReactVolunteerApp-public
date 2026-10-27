import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const mocks = vi.hoisted(() => ({
  getToken: vi.fn(),
  signInWithEmailAndPassword: vi.fn(),
  signOut: vi.fn(),
  getMultiFactorResolver: vi.fn(),
  resolveMfaSignIn: vi.fn(),
  assertionForSignIn: vi.fn(),
  httpsCallable: vi.fn(),
  issueDesktopSignInToken: vi.fn(),
  appCheckToken: '',
}));

vi.mock('firebase/app-check', () => ({ getToken: mocks.getToken }));

vi.mock('firebase/auth', () => ({
  signInWithEmailAndPassword: mocks.signInWithEmailAndPassword,
  signOut: mocks.signOut,
  getMultiFactorResolver: mocks.getMultiFactorResolver,
  TotpMultiFactorGenerator: {
    FACTOR_ID: 'totp',
    assertionForSignIn: mocks.assertionForSignIn,
  },
}));

vi.mock('firebase/functions', () => ({ httpsCallable: mocks.httpsCallable }));

vi.mock('../../src/firebase', () => ({
  appCheck: { appCheck: true },
  auth: { auth: true },
  functions: { functions: true },
}));

vi.mock('../../src/components/AdminMfaEnrollment', () => ({
  default: () => <div>Administrator enrollment required</div>,
}));

import DesktopSignIn from '../../src/components/DesktopSignIn';

function appCheckToken(): string {
  const payload = btoa(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600 }))
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
  return `header.${payload}.signature`;
}

beforeEach(() => {
  vi.clearAllMocks();
  document.querySelectorAll('form[action^="http://127.0.0.1:"]').forEach(form => form.remove());
  window.history.replaceState({}, '', `/desktop-sign-in?port=4321&state=${'a'.repeat(64)}`);
  mocks.appCheckToken = appCheckToken();
  mocks.getToken.mockResolvedValue({ token: mocks.appCheckToken });
  mocks.signOut.mockResolvedValue(undefined);
  mocks.resolveMfaSignIn.mockResolvedValue({
    user: {
      getIdTokenResult: vi.fn().mockResolvedValue({
        claims: { admin: true },
        signInSecondFactor: 'totp',
      }),
    },
  });
  mocks.assertionForSignIn.mockImplementation((enrollmentId, code) => ({ enrollmentId, code }));
  mocks.getMultiFactorResolver.mockReturnValue({
    hints: [{ factorId: 'totp', uid: 'desktop-totp' }],
    resolveSignIn: mocks.resolveMfaSignIn,
  });
  mocks.issueDesktopSignInToken.mockResolvedValue({ data: { customToken: 'desktop-custom-token' } });
  mocks.httpsCallable.mockReturnValue(mocks.issueDesktopSignInToken);
});

describe('desktop browser authentication', () => {
  it('completes a TOTP challenge and posts the short-lived handoff to the desktop callback', async () => {
    mocks.signInWithEmailAndPassword.mockRejectedValueOnce({ code: 'auth/multi-factor-auth-required' });
    const submit = vi.spyOn(HTMLFormElement.prototype, 'submit').mockImplementation(() => undefined);
    render(<DesktopSignIn />);
    const user = userEvent.setup();

    await user.type(screen.getByLabelText(/email/i), 'admin@example.com');
    await user.type(screen.getByLabelText(/password/i), 'current-password');
    await user.click(screen.getByRole('button', { name: /sign in and connect desktop/i }));

    expect(await screen.findByRole('heading', { name: /two-step verification/i })).toBeInTheDocument();
    const code = screen.getByLabelText(/authenticator code/i);
    await user.type(code, '12a34567');
    expect(code).toHaveValue('123456');
    await user.click(screen.getByRole('button', { name: /verify and connect desktop/i }));

    await waitFor(() => expect(submit).toHaveBeenCalled());
    expect(mocks.assertionForSignIn).toHaveBeenCalledWith('desktop-totp', '123456');
    expect(mocks.issueDesktopSignInToken).toHaveBeenCalledWith(null);
    const relay = document.querySelector<HTMLFormElement>('form[action="http://127.0.0.1:4321/callback"]');
    expect(relay).not.toBeNull();
    const fields = new FormData(relay!);
    expect(fields.get('state')).toBe('a'.repeat(64));
    expect(fields.get('customToken')).toBe('desktop-custom-token');
    expect(fields.get('appCheckToken')).toBe(mocks.appCheckToken);
    expect(Number(fields.get('expiresAt'))).toBeGreaterThan(Date.now());
    submit.mockRestore();
  });

  it('routes a password-only administrator to authenticator enrollment', async () => {
    mocks.signInWithEmailAndPassword.mockResolvedValueOnce({
      user: {
        getIdTokenResult: vi.fn().mockResolvedValue({
          claims: { admin: true },
          signInSecondFactor: null,
        }),
      },
    });
    render(<DesktopSignIn />);
    const user = userEvent.setup();

    await user.type(screen.getByLabelText(/email/i), 'admin@example.com');
    await user.type(screen.getByLabelText(/password/i), 'current-password');
    await user.click(screen.getByRole('button', { name: /sign in and connect desktop/i }));

    expect(await screen.findByText(/administrator enrollment required/i)).toBeInTheDocument();
    expect(mocks.issueDesktopSignInToken).not.toHaveBeenCalled();
  });

  it('disables authentication when the page was not opened by the desktop application', () => {
    window.history.replaceState({}, '', '/desktop-sign-in');
    render(<DesktopSignIn />);

    expect(screen.getByRole('alert')).toHaveTextContent(/open this page using/i);
    expect(screen.getByRole('button', { name: /sign in and connect desktop/i })).toBeDisabled();
  });
});
