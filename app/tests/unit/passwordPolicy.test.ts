import { describe, expect, it } from 'vitest';
import {
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  passwordLengthError,
} from '../../src/auth/passwordPolicy';

describe('passwordLengthError', () => {
  it('accepts both configured length boundaries', () => {
    expect(passwordLengthError('a'.repeat(PASSWORD_MIN_LENGTH))).toBeNull();
    expect(passwordLengthError('a'.repeat(PASSWORD_MAX_LENGTH))).toBeNull();
  });

  it('rejects passwords outside the configured range', () => {
    expect(passwordLengthError('a'.repeat(PASSWORD_MIN_LENGTH - 1))).toBe(
      'Password must be at least 15 characters.',
    );
    expect(passwordLengthError('a'.repeat(PASSWORD_MAX_LENGTH + 1))).toBe(
      'Password must be no more than 25 characters.',
    );
  });
});
