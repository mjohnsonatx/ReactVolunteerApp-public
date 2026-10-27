export const PASSWORD_MIN_LENGTH = 15;
export const PASSWORD_MAX_LENGTH = 25;

export const PASSWORD_REQUIREMENTS_MESSAGE =
  `Password must be between ${PASSWORD_MIN_LENGTH} and ${PASSWORD_MAX_LENGTH} characters.`;

export function passwordLengthError(password: string): string | null {
  if (password.length < PASSWORD_MIN_LENGTH) {
    return `Password must be at least ${PASSWORD_MIN_LENGTH} characters.`;
  }
  if (password.length > PASSWORD_MAX_LENGTH) {
    return `Password must be no more than ${PASSWORD_MAX_LENGTH} characters.`;
  }
  return null;
}
