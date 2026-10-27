import { FirebaseError } from 'firebase/app';

export function desktopSignInError(error: unknown, stage: string): string {
  const code = error instanceof FirebaseError && /^(auth|appCheck|functions)\/[a-z-]+$/.test(error.code) ? error.code : '';
  let message = `${stage} failed. Please try again.`;
  if (['auth/invalid-credential', 'auth/user-not-found', 'auth/wrong-password'].includes(code)) {
    message = 'Firebase rejected that email/password combination.';
  } else if (code === 'auth/user-disabled') {
    message = 'This administrator account is disabled.';
  } else if (code === 'auth/operation-not-allowed') {
    message = 'Email/password sign-in is disabled for this Firebase project.';
  } else if (code === 'auth/too-many-requests') {
    message = 'Firebase temporarily blocked sign-in. Please wait and try again.';
  } else if (code === 'functions/permission-denied') {
    message = 'Administrator access is required.';
  } else if (code.startsWith('appCheck/')) {
    message = 'Application verification failed. Reload the sign-in page and try again.';
  }
  // Only the SDK code is shown: exception messages can contain request URLs or credentials.
  return code ? `${message} (${code})` : message;
}
