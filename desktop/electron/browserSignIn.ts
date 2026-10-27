import { createServer, type Server } from 'node:http';
import { randomBytes, timingSafeEqual } from 'node:crypto';

export type BrowserCredential = { customToken: string; appCheckToken: string; expiresAt: number };

export function trustedSignInUrl(value: string): URL {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password || url.port
    || !/^tillerystreettrail(?:-dev|--[a-z0-9-]+)?\.web\.app$/.test(url.hostname)
    || url.pathname !== '/desktop-sign-in' || url.search || url.hash) {
    throw new Error('Desktop sign-in must use the approved HTTPS website.');
  }
  return url;
}

export async function browserSignIn(value: string, open: (url: string) => Promise<unknown>): Promise<BrowserCredential> {
  const url = trustedSignInUrl(value);
  const state = randomBytes(32).toString('hex');
  let server: Server;
  let settled = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let resolveCredential!: (value: BrowserCredential) => void;
  let rejectCredential!: (error: Error) => void;
  const credential = new Promise<BrowserCredential>((resolve, reject) => {
    resolveCredential = resolve; rejectCredential = reject;
  });
  // Attach immediately: opening the browser can fail before the caller awaits it.
  credential.catch(() => undefined);
  function finish(error?: Error, result?: BrowserCredential) {
    if (settled) return;
    settled = true;
    if (timer) clearTimeout(timer);
    server.close();
    server.closeIdleConnections();
    if (error) rejectCredential(error);
    else resolveCredential(result!);
  }
  server = createServer(async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'");
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    const address = server.address();
    const port = address && typeof address === 'object' ? address.port : 0;
    if (settled || req.method !== 'POST' || req.url !== '/callback'
      || req.headers.host !== `127.0.0.1:${port}` || req.headers.origin !== url.origin
      || !req.headers['content-type']?.startsWith('application/x-www-form-urlencoded')) {
      res.writeHead(403).end('Sign-in request rejected.'); return;
    }
    try {
      const chunks: Buffer[] = [];
      let bytes = 0;
      for await (const chunk of req) {
        bytes += chunk.length;
        if (bytes > 32_768) { res.writeHead(413).end(); return; }
        chunks.push(Buffer.from(chunk));
      }
      const body = new URLSearchParams(Buffer.concat(chunks).toString('utf8'));
      const submittedState = body.get('state') || '';
      if (submittedState.length !== state.length || !timingSafeEqual(Buffer.from(state), Buffer.from(submittedState))) {
        res.writeHead(403).end('Sign-in request rejected.'); return;
      }
      const customToken = body.get('customToken') || '';
      const appCheckToken = body.get('appCheckToken') || '';
      const expiresAt = Number(body.get('expiresAt'));
      if (!customToken || !appCheckToken || !Number.isSafeInteger(expiresAt) || expiresAt <= Date.now()
        || expiresAt > Date.now() + 3_600_000) {
        res.writeHead(400).end('Sign-in credential expired or invalid.'); return;
      }
      res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Signed in. You can close this tab and return to the desktop application.');
      finish(undefined, { customToken, appCheckToken, expiresAt });
    } catch { if (!res.headersSent) res.writeHead(400).end('Sign-in request rejected.'); }
  });
  server.requestTimeout = 10_000;
  server.headersTimeout = 10_000;
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Could not start browser sign-in.');
  url.searchParams.set('port', String(address.port));
  url.searchParams.set('state', state);
  timer = setTimeout(() => finish(new Error('Browser sign-in timed out. Please try again.')), 5 * 60_000);
  try { await open(url.toString()); }
  catch { finish(new Error('Could not open your browser.')); }
  return credential;
}
