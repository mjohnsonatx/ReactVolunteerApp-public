// tests/unit/mapSafe.test.js
import { describe, it, expect } from 'vitest';
import { safeColor, safeNum, isSafeImageUrl } from '../../src/components/mapSafe';

describe('safeColor', () => {
  it.each(['#fff', '#abc123', '#AABBCCDD', 'red', 'rgba(1,2,3,0.5)', 'rgb(0, 0, 0)'])('accepts %s', (c) => {
    expect(safeColor(c)).toBe(c.trim());
  });
  it.each(['red;background:url(x)', '#xyz', '<script>', 'javascript:alert(1)', 'expression(alert(1))', '" onload="x'])('rejects %s', (c) => {
    expect(safeColor(c)).toBe('');
  });
  it.each([null, undefined, 42, {}])('rejects non-string %p', (v) => {
    expect(safeColor(v)).toBe('');
  });
});

describe('safeNum (closes the data-base-zoom hole)', () => {
  it('returns the number when finite', () => expect(safeNum('16', 1)).toBe(16));
  it.each(['" onclick="x', undefined, NaN, '"><img src=x onerror=alert(1)>'])('falls back to default for %p', (v) => {
    expect(safeNum(v, 14)).toBe(14);
  });
});

describe('isSafeImageUrl', () => {
  it('accepts https', () => expect(isSafeImageUrl('https://x/y.png')).toBe(true));
  it.each(['http://x/y.png', 'javascript:alert(1)', 'data:text/html,<script>', 'ftp://x', 'not a url', null, 42])('rejects %p', (u) => {
    expect(isSafeImageUrl(u)).toBe(false);
  });
});
