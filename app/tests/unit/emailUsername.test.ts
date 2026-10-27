import { describe, expect, it } from 'vitest';
import { userNameFromEmail } from '@watershed/shared';

describe('email-derived public usernames', () => {
  it.each([
    ['michael@example.com', 'michael'],
    [' M.Johnson@Example.com ', 'm.johnson'],
    ['michael+trail@example.com', 'michaeltrail'],
    ['a@example.com', 'a-user'],
    ['ab@example.com', 'ab-user'],
    ['+++@example.com', 'user'],
    ['x'.repeat(50) + '@example.com', 'x'.repeat(30)],
    ['missing-at', ''],
    [undefined, ''],
  ])('derives %j without exposing the domain', (email, expected) => {
    expect(userNameFromEmail(email)).toBe(expected);
    expect(userNameFromEmail(email)).not.toContain('@');
    expect(userNameFromEmail(email)).not.toContain('example.com');
  });
});
