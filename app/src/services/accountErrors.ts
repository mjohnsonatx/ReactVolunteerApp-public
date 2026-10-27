import { PASSWORD_REQUIREMENTS_MESSAGE } from '../auth/passwordPolicy';

export class AccountError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = 'AccountError';
    this.code = code;
  }
}

export class AccountNotSignedInError extends AccountError {
  constructor() { super('account/not-signed-in', 'You must be signed in.'); this.name = 'AccountNotSignedInError'; }
}

export class ReauthFailedError extends AccountError {
  constructor() { super('account/reauth-failed', 'Incorrect password. Please try again.'); this.name = 'ReauthFailedError'; }
}

export class ReauthRequiredError extends AccountError {
  constructor() { super('account/reauth-required', 'Please sign out and sign back in, then try again.'); this.name = 'ReauthRequiredError'; }
}

export class EmailAlreadyInUseError extends AccountError {
  constructor() { super('account/email-in-use', 'This email address is already associated with another account.'); this.name = 'EmailAlreadyInUseError'; }
}

export class InvalidEmailError extends AccountError {
  constructor() { super('account/invalid-email', 'Please enter a valid email address.'); this.name = 'InvalidEmailError'; }
}

export class UserNotFoundError extends AccountError {
  constructor() { super('account/user-not-found', 'No account found with that email address.'); this.name = 'UserNotFoundError'; }
}

export class TooManyRequestsError extends AccountError {
  constructor() { super('account/too-many-requests', 'Too many attempts. Please wait a few minutes and try again.'); this.name = 'TooManyRequestsError'; }
}

export class CleanupPartialError extends AccountError {
  readonly failedSteps: string[];
  constructor(failedSteps: string[]) {
    super('account/cleanup-partial', `Some data could not be removed: ${failedSteps.join(', ')}.`);
    this.name = 'CleanupPartialError';
    this.failedSteps = failedSteps;
  }
}

export class PasswordTooWeakError extends AccountError {
  constructor(message = PASSWORD_REQUIREMENTS_MESSAGE) { super('account/weak-password', message); this.name = 'PasswordTooWeakError'; }
}
