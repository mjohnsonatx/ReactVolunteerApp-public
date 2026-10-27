// tests/unit/sanitize.test.js
import { describe, it, expect } from 'vitest';
import {
  sanitizeText, sanitizeMultiline, sanitizeEmail, enforceLimit,
  detectMalicious, sanitizeMarkdown, sanitizeSiteContentForm, sanitizeUserName, LIMITS,
} from '../../src/utils/sanitize';

describe('enforceLimit', () => {
  it('truncates to the limit', () => {
    expect(enforceLimit('a'.repeat(100), 10)).toHaveLength(10);
  });
  it('is a no-op under the limit', () => {
    expect(enforceLimit('hello', 10)).toBe('hello');
  });
  // Edge: wrong types must not throw — they degrade to empty/string.
  it.each([null, undefined, 42, {}, [], NaN])('coerces non-string %p safely', (v) => {
    expect(() => enforceLimit(v, 10)).not.toThrow();
  });
});

describe('sanitizeEmail', () => {
  it('accepts and normalizes a valid email', () => {
    expect(sanitizeEmail('  Foo@Bar.COM ')).toBe('foo@bar.com');
  });
  it.each(['not-an-email', 'a@b', '@b.com', 'a@.com', '', '   '])('rejects %p', (bad) => {
    expect(sanitizeEmail(bad)).toBe('');
  });
  it.each([null, undefined, 123, {}, []])('coerces non-string %p to empty', (v) => {
    expect(sanitizeEmail(v)).toBe('');
  });
});

describe('sanitizeUserName', () => {
  it('normalizes profile user names', () => {
    expect(sanitizeUserName(' Jane Walker! ')).toBe('jane-walker');
    expect(sanitizeUserName('Trail_Crew.42')).toBe('trail_crew.42');
  });

  it.each(['ab', '!!!', '', '   '])('rejects %p', (bad) => {
    expect(sanitizeUserName(bad)).toBe('');
  });
});

describe('sanitizeText / sanitizeMultiline', () => {
  it('strips HTML tags', () => {
    expect(sanitizeText('<b>hi</b>')).not.toMatch(/<[^>]+>/);
  });
  it('multiline preserves newlines but text collapses them', () => {
    expect(sanitizeMultiline('a\nb')).toContain('\n');
  });
  it.each([null, undefined, 0, {}, []])('non-string %p → empty string', (v) => {
    expect(sanitizeText(v)).toBe('');
  });
});

describe('detectMalicious (the core XSS/injection gate)', () => {
  const attacks = [
    '<script>alert(1)</script>',
    '<img src=x onerror=alert(1)>',
    'javascript:alert(document.cookie)',
    '"><svg/onload=alert(1)>',
    "'; DROP TABLE users;--",
    '<iframe src="evil"></iframe>',
  ];
  it.each(attacks)('blocks: %s', (payload) => {
    const { blocked, reason } = detectMalicious(payload);
    expect(blocked).toBe(true);
    expect(reason).toBeTruthy();
  });

  const benign = [
    'Creek cleanup this Saturday!',
    "I'll bring gloves & bags (10:00am).",
    'Meet at 5th St. — see you there.',
    'Email me at volunteer@creek.org',
    // React renders this as literal text — not a threat in this stack:
    '{{constructor.constructor("alert(1)")()}}',
  ];
  it.each(benign)('allows: %s', (text) => {
    expect(detectMalicious(text).blocked).toBe(false);
  });

  it.each([null, undefined, 42, {}, [], NaN])('does not throw on %p', (v) => {
    expect(() => detectMalicious(v)).not.toThrow();
  });
});

describe('sanitizeMarkdown (renders to the page → highest XSS risk)', () => {
  it('strips raw HTML tags', () => {
    const out = sanitizeMarkdown('Hello <script>alert(1)</script> **world**');
    expect(out).not.toMatch(/<script/i);
    expect(out).toContain('**world**'); // markdown emphasis preserved
  });
  it('neutralizes javascript: links', () => {
    const out = sanitizeMarkdown('[click](javascript:alert(1))');
    expect(out).not.toMatch(/javascript:/i);
  });
  it('neutralizes data: and vbscript: links', () => {
    expect(sanitizeMarkdown('[x](data:text/html,<script>1</script>)')).not.toMatch(/data:/i);
    expect(sanitizeMarkdown('[x](vbscript:msgbox)')).not.toMatch(/vbscript:/i);
  });
  it('enforces the length limit', () => {
    expect(sanitizeMarkdown('a'.repeat(LIMITS.markdown + 500)).length).toBeLessThanOrEqual(LIMITS.markdown);
  });
  it('collapses pathological blank-line runs', () => {
    expect(sanitizeMarkdown('a\n\n\n\n\n\nb')).not.toMatch(/\n{4,}/);
  });
  it.each([null, undefined, 5, {}, []])('non-string %p → empty', (v) => {
    expect(sanitizeMarkdown(v)).toBe('');
  });
});

describe('sanitizeSiteContentForm (shape + nested sanitization)', () => {
  it('produces the exact Firestore document shape', () => {
    const out = sanitizeSiteContentForm({
      mission: '# Mission <script>x</script>',
      goals: '- a\n- b',
      about: { name: '<b>Jane</b>', bio: 'Hi _all_', imageUrl: 'https://x/y.jpg', imagePath: 'siteContent/p.jpg' },
    });
    expect(out).toEqual({
      mission: expect.not.stringContaining('<script'),
      goals: expect.stringContaining('- a'),
      about: {
        name: expect.not.stringContaining('<b>'),
        bio: expect.stringContaining('_all_'),
        imageUrl: 'https://x/y.jpg',
        imagePath: 'siteContent/p.jpg',
      },
    });
  });
  it('tolerates a missing about object', () => {
    expect(() => sanitizeSiteContentForm({ mission: 'x', goals: 'y' })).not.toThrow();
  });
  it('caps absurd image URLs', () => {
    const out = sanitizeSiteContentForm({ about: { imageUrl: 'h'.repeat(5000) } });
    expect(out.about.imageUrl.length).toBeLessThanOrEqual(1000);
  });
});
