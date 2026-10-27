import {
  getMultiFactorResolver,
  TotpMultiFactorGenerator,
  type Auth,
  type IdTokenResult,
  type MultiFactorError,
  type MultiFactorResolver,
  type UserCredential,
} from 'firebase/auth';

export type TotpSignInChallenge = {
  resolver: MultiFactorResolver;
  enrollmentId: string;
};

export function adminMfaSessionFromToken(token: IdTokenResult): boolean {
  return token.signInSecondFactor === TotpMultiFactorGenerator.FACTOR_ID
    || token.claims.desktop_admin_mfa === true;
}

export function totpChallengeFromError(auth: Auth, error: unknown): TotpSignInChallenge | null {
  if (!error || typeof error !== 'object' || !('code' in error)
    || error.code !== 'auth/multi-factor-auth-required') {
    return null;
  }

  const resolver = getMultiFactorResolver(auth, error as MultiFactorError);
  const totpHint = resolver.hints.find(hint => hint.factorId === TotpMultiFactorGenerator.FACTOR_ID);
  if (!totpHint) throw new Error('This account requires an unsupported second factor.');

  return { resolver, enrollmentId: totpHint.uid };
}

export function resolveTotpChallenge(
  challenge: TotpSignInChallenge,
  oneTimePassword: string,
): Promise<UserCredential> {
  const assertion = TotpMultiFactorGenerator.assertionForSignIn(
    challenge.enrollmentId,
    oneTimePassword.trim(),
  );
  return challenge.resolver.resolveSignIn(assertion);
}
