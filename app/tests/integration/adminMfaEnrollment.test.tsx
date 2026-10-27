import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const mocks = vi.hoisted(() => ({
  state: { currentUser: null as null | { email: string; emailVerified: boolean } },
  multiFactor: vi.fn(),
  getSession: vi.fn(),
  enroll: vi.fn(),
  reauthenticateWithCredential: vi.fn(),
  sendEmailVerification: vi.fn(),
  signOut: vi.fn(),
  generateSecret: vi.fn(),
  assertionForEnrollment: vi.fn(),
  credential: vi.fn(),
  toDataURL: vi.fn(),
  generateQrCodeUrl: vi.fn(),
  logError: vi.fn(),
}));

vi.mock('firebase/auth', () => ({
  EmailAuthProvider: { credential: mocks.credential },
  multiFactor: mocks.multiFactor,
  reauthenticateWithCredential: mocks.reauthenticateWithCredential,
  sendEmailVerification: mocks.sendEmailVerification,
  signOut: mocks.signOut,
  TotpMultiFactorGenerator: {
    FACTOR_ID: 'totp',
    generateSecret: mocks.generateSecret,
    assertionForEnrollment: mocks.assertionForEnrollment,
  },
}));

vi.mock('qrcode', () => ({
  default: { toDataURL: mocks.toDataURL },
}));

vi.mock('../../src/firebase', () => ({
  auth: {
    get currentUser() {
      return mocks.state.currentUser;
    },
  },
}));

vi.mock('../../src/utils/logError', () => ({ logError: mocks.logError }));

import AdminMfaEnrollment from '../../src/components/AdminMfaEnrollment';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.state.currentUser = { email: 'admin@example.com', emailVerified: true };
  mocks.multiFactor.mockReturnValue({
    enrolledFactors: [],
    getSession: mocks.getSession,
    enroll: mocks.enroll,
  });
  mocks.credential.mockReturnValue({ emailCredential: true });
  mocks.getSession.mockResolvedValue({ session: true });
  mocks.generateQrCodeUrl.mockReturnValue('otpauth://totp/Tillery?secret=TESTSECRET');
  mocks.generateSecret.mockResolvedValue({
    secretKey: 'TESTSECRET',
    generateQrCodeUrl: mocks.generateQrCodeUrl,
  });
  mocks.assertionForEnrollment.mockImplementation((secret, code) => ({ secret, code }));
  mocks.toDataURL.mockResolvedValue('data:image/png;base64,test');
  mocks.reauthenticateWithCredential.mockResolvedValue(undefined);
  mocks.enroll.mockResolvedValue(undefined);
  mocks.sendEmailVerification.mockResolvedValue(undefined);
  mocks.signOut.mockResolvedValue(undefined);
});

describe('administrator TOTP enrollment', () => {
  it('reauthenticates, presents a setup key, and completes enrollment', async () => {
    render(<AdminMfaEnrollment />);
    const user = userEvent.setup();

    await user.type(screen.getByLabelText(/confirm your password/i), 'current-password');
    await user.click(screen.getByRole('button', { name: /set up authenticator/i }));

    expect(await screen.findByRole('img', { name: /authenticator enrollment qr code/i })).toHaveAttribute(
      'src',
      'data:image/png;base64,test',
    );
    expect(screen.getByText('TESTSECRET')).toBeInTheDocument();
    expect(mocks.reauthenticateWithCredential).toHaveBeenCalledWith(
      mocks.state.currentUser,
      { emailCredential: true },
    );
    expect(mocks.generateQrCodeUrl).toHaveBeenCalledWith(
      'admin@example.com',
      'Tillery Street Volunteer Group',
    );

    const code = screen.getByLabelText(/verification code/i);
    await user.type(code, '12a34567');
    expect(code).toHaveValue('123456');
    await user.click(screen.getByRole('button', { name: /finish setup/i }));

    expect(await screen.findByText(/two-step verification is enrolled/i)).toBeInTheDocument();
    expect(mocks.assertionForEnrollment).toHaveBeenCalledWith(
      expect.objectContaining({ secretKey: 'TESTSECRET' }),
      '123456',
    );
    expect(mocks.enroll).toHaveBeenCalledWith(
      expect.objectContaining({ code: '123456' }),
      'Authenticator app',
    );

    await user.click(screen.getByRole('button', { name: /sign out and verify/i }));
    expect(mocks.signOut).toHaveBeenCalled();
  });

  it('requires email verification before enrollment and can resend the email', async () => {
    mocks.state.currentUser = { email: 'admin@example.com', emailVerified: false };
    render(<AdminMfaEnrollment />);
    const user = userEvent.setup();

    expect(screen.getByRole('alert')).toHaveTextContent(/verify admin@example.com by email/i);
    expect(screen.queryByRole('button', { name: /set up authenticator/i })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /send verification email/i }));

    await waitFor(() => expect(mocks.sendEmailVerification).toHaveBeenCalledWith(mocks.state.currentUser));
    expect(screen.getByRole('button', { name: /verification email sent/i })).toBeDisabled();
  });

  it('shows a safe error and clears the password when reauthentication fails', async () => {
    mocks.reauthenticateWithCredential.mockRejectedValueOnce({ code: 'auth/wrong-password' });
    render(<AdminMfaEnrollment />);
    const user = userEvent.setup();
    const password = screen.getByLabelText(/confirm your password/i);

    await user.type(password, 'wrong-password');
    await user.click(screen.getByRole('button', { name: /set up authenticator/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/password was not accepted/i);
    expect(password).toHaveValue('');
    expect(mocks.logError).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'auth/wrong-password' }),
      'admin-mfa-start',
    );
  });
});
