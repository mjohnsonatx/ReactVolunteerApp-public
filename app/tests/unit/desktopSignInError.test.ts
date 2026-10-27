import { describe, expect, it } from 'vitest';
import { FirebaseError } from 'firebase/app';
import { desktopSignInError } from '../../src/libs/desktopSignInError';

describe('desktop browser sign-in feedback', () => {
  it.each([
    ['auth/invalid-credential', 'email/password combination'],
    ['auth/user-disabled', 'account is disabled'],
    ['auth/operation-not-allowed', 'sign-in is disabled'],
    ['functions/permission-denied', 'Administrator access'],
    ['appCheck/recaptcha-error', 'Application verification failed'],
  ])('shows a safe explanation and SDK code for %s', (code, explanation) => {
    const result = desktopSignInError(new FirebaseError(code, 'sensitive-token'), 'Browser sign-in');
    expect(result).toContain(explanation);
    expect(result).toContain(code);
    expect(result).not.toContain('sensitive-token');
  });
  it('does not reveal arbitrary exception details', () => {
    expect(desktopSignInError(new Error('sensitive-token'), 'Browser sign-in')).toBe('Browser sign-in failed. Please try again.');
  });
});
