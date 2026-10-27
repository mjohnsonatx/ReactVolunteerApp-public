import { describe, expect, it } from 'vitest';
import { browserSignIn, trustedSignInUrl } from '../../electron/browserSignIn';
import { chromium } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { desktopAttestationExpiry } from '../../../app/src/libs/desktopAttestationExpiry';

const signInOrigins = ['https://tillerystreettrail.web.app', 'https://tillerystreettrail-dev.web.app'];

describe('browser sign-in boundary', () => {
  it('allows only the approved HTTPS sign-in page', () => {
    for (const origin of [...signInOrigins, 'https://tillerystreettrail--review-example.web.app']) {
      expect(trustedSignInUrl(`${origin}/desktop-sign-in`).origin).toBe(origin);
    }
    for (const url of [
      'http://tillerystreettrail.web.app/desktop-sign-in',
      'https://tillerystreettrail.web.app.evil.example/desktop-sign-in',
      'https://tillerystreettrail-dev.web.app.evil.example/desktop-sign-in',
      'https://tillerystreettrail-dev-other.web.app/desktop-sign-in',
      'https://tillerystreettrail-dev--review-example.web.app/desktop-sign-in',
      'https://user@tillerystreettrail.web.app/desktop-sign-in',
      'https://tillerystreettrail.web.app:444/desktop-sign-in',
      'https://tillerystreettrail.web.app/other',
      'https://tillerystreettrail.web.app/desktop-sign-in?port=1',
    ]) expect(() => trustedSignInUrl(url)).toThrow();
  });

  it.each(signInOrigins)('rejects wrong origins and state for %s, then accepts one credential without putting tokens in the URL', async origin => {
    let opened!: (url: URL) => void;
    const ready = new Promise<URL>(resolve => { opened = resolve; });
    const pending = browserSignIn(`${origin}/desktop-sign-in`, async url => { opened(new URL(url)); });
    const url = await ready;
    expect([...url.searchParams.keys()]).toEqual(['port', 'state']);
    const callback = `http://127.0.0.1:${url.searchParams.get('port')}/callback`;
    const values = { state: url.searchParams.get('state')!, customToken: 'custom-secret', appCheckToken: 'attestation-secret', expiresAt: String(Date.now() + 60_000) };
    const post = (origin: string, state = values.state) => fetch(callback, {
      method: 'POST', headers: { Origin: origin }, body: new URLSearchParams({ ...values, state }),
    });
    expect((await post('https://evil.example')).status).toBe(403);
    expect((await post(signInOrigins.find(candidate => candidate !== origin)!)).status).toBe(403);
    expect((await post(url.origin, '0'.repeat(64))).status).toBe(403);
    expect((await fetch(callback)).status).toBe(403);
    const response = await post(url.origin);
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.text()).not.toContain('secret');
    expect(await pending).toEqual({ customToken: values.customToken, appCheckToken: values.appCheckToken, expiresAt: Number(values.expiresAt) });
    await expect(post(url.origin)).rejects.toThrow();
  });

  it('closes the listener when opening the browser fails', async () => {
    await expect(browserSignIn('https://tillerystreettrail.web.app/desktop-sign-in', async () => { throw new Error('failed'); })).rejects.toThrow('Could not open your browser');
  });

  it.each(signInOrigins)('accepts a browser form POST from %s under the Hosting CSP and referrer policy', async origin => {
    const config = JSON.parse(readFileSync(new URL('../../../firebase.json', import.meta.url), 'utf8'));
    const headers: Record<string, string> = Object.fromEntries(config.hosting.headers.find((rule: { source: string }) => rule.source === '/desktop-sign-in').headers.map((header: { key: string; value: string }) => [header.key, header.value]));
    const browser = await chromium.launch({ headless: true });
    let callback = '';
    let values!: Record<string, string>;
    try {
      let opened!: (value: string) => void;
      const ready = new Promise<string>(resolve => { opened = resolve; });
      const pending = browserSignIn(`${origin}/desktop-sign-in`, async value => { opened(value); });
      const value = await ready;
      const url = new URL(value);
      callback = `http://127.0.0.1:${url.searchParams.get('port')}/callback`;
      const appCheckToken = `header.${btoa(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 7 * 24 * 3600 }))}.signature`;
      values = { state: url.searchParams.get('state')!, customToken: 'fixture-custom', appCheckToken, expiresAt: String(desktopAttestationExpiry(appCheckToken)) };
      const page = await browser.newPage();
      await page.route(`${url.origin}/**`, route => route.fulfill({ contentType: 'text/html', headers, body: '<form></form>' }));
      await page.goto(value);
      await Promise.all([
        page.waitForURL(callback),
        page.evaluate(({ callbackUrl, body }) => {
          const form = document.querySelector('form')!;
          form.action = callbackUrl; form.method = 'POST';
          for (const [name, fieldValue] of Object.entries(body)) {
            const field = document.createElement('input'); field.name = name; field.value = fieldValue; form.append(field);
          }
          form.submit();
        }, { callbackUrl: callback, body: values }),
      ]);
      expect(await page.textContent('body')).toContain('Signed in.');
      const result = await pending;
      expect(result.customToken).toBe('fixture-custom');
    } finally {
      if (callback) await fetch(callback, { method: 'POST', headers: { Origin: origin }, body: new URLSearchParams(values) }).catch(() => undefined);
      await browser.close();
    }
  }, 15_000);
});
