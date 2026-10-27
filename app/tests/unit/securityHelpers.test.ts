import { describe, expect, it } from 'vitest';
import { trustedClientIp } from '@watershed/shared/src/network';
import {
  sanitizeTelemetryExtras,
  sanitizeTelemetryText,
  sanitizeTelemetryUrl,
} from '@watershed/shared/src/telemetry';

describe('trustedClientIp', () => {
  it('uses the next-to-last load-balancer value and ignores caller-supplied prefixes', () => {
    expect(trustedClientIp('198.51.100.1, garbage, 203.0.113.8, 35.1.2.3', '10.0.0.1'))
      .toBe('203.0.113.8');
  });

  it('does not trust a single forwarded value and normalizes direct mapped IPv4', () => {
    expect(trustedClientIp('198.51.100.1', '::ffff:127.0.0.1')).toBe('127.0.0.1');
  });
});

describe('telemetry sanitization', () => {
  it('removes URL credentials, query strings, and fragments', () => {
    expect(sanitizeTelemetryUrl('https://user:pass@example.test/documents?token=secret#page=2'))
      .toBe('https://example.test/documents');
  });

  it('drops identifiers, file names, email addresses, and arbitrary nested extras', () => {
    expect(sanitizeTelemetryExtras({
      feature: 'crash',
      uid: 'user-1',
      email: 'private@example.test',
      fileName: 'medical-record.pdf',
      nested: { token: 'secret' },
    })).toEqual({ feature: 'crash' });
  });

  it('redacts secrets and strips query strings from URLs embedded in messages', () => {
    expect(sanitizeTelemetryText(
      'Failed https://example.test/file.pdf?alt=media&token=secret access_token=topsecret',
      500,
    )).toBe('Failed https://example.test/file.pdf access_token=[redacted]');
  });
});
