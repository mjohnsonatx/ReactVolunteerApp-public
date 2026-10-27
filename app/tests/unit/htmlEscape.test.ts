// tests/unit/htmlEscape.test.js
import { describe, it, expect } from 'vitest';
import { escapeHtml } from '../../src/components/htmlEscape';

describe('escapeHtml', () => {
  it('escapes angle brackets', () => {
    expect(escapeHtml('<script>')).toBe('&lt;script&gt;');
  });
  it('escapes double quotes (attribute-breakout defense)', () => {
    const out = escapeHtml('" onerror="alert(1)');
    expect(out).not.toContain('"');
    expect(out).toContain('&quot;');
  });
  it('escapes single quotes', () => {
    expect(escapeHtml("' onclick='x")).toContain('&#39;');
  });
  it('escapes ampersand first (no double-encoding)', () => {
    expect(escapeHtml('&lt;')).toBe('&amp;lt;');
  });
  it.each([null, undefined, 42, {}])('coerces non-string %p without throwing', (v) => {
    expect(() => escapeHtml(v)).not.toThrow();
  });

  // The actual exploit, reproduced and proven dead:
  it('prevents attribute breakout when interpolated into an attribute', () => {
    const title = escapeHtml('" onerror="alert(document.cookie)');
    const div = document.createElement('div');
    div.innerHTML = `<img src="https://x/y.png" alt="${title}">`;
    expect(div.querySelector('img').getAttribute('onerror')).toBeNull();
  });
});
