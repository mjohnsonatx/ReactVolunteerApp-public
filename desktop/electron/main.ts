// desktop/electron/main.ts
import { app, BrowserWindow, ipcMain, protocol, session, shell } from 'electron';
import path from 'node:path';
import { browserSignIn } from './browserSignIn';

const DEV_URL = process.env.VITE_DEV_SERVER_URL;
const APP_SCHEME = 'app';
const APP_HOST = 'admin-desktop';
const DEVELOPMENT_CSP = [
  "default-src 'self' http: https: data: blob:",
  "connect-src 'self' http: https: ws: wss:",
  "img-src 'self' http: https: data: blob:",
  "style-src 'self' 'unsafe-inline'",
  "script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'",
  "font-src 'self' blob: data:",
  "worker-src 'self' blob:",
].join('; ');
const PRODUCTION_CSP = [
  "default-src 'self'",
  "connect-src 'self' https://*.googleapis.com https://*.cloudfunctions.net https://firebasestorage.googleapis.com",
  "img-src 'self' https: data: blob:",
  "style-src 'self' 'unsafe-inline'",
  "script-src 'self' 'wasm-unsafe-eval'",
  "font-src 'self' blob: data:",
  "worker-src 'self' blob:",
].join('; ');

protocol.registerSchemesAsPrivileged([{
  scheme: APP_SCHEME,
  privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true },
}]);

if (!app.requestSingleInstanceLock()) app.quit();

function createWindow() {
  const win = new BrowserWindow({
    width: 1360,
    height: 900,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  // Block all navigation away from the app and open external links in the OS browser.
  win.webContents.on('will-navigate', (e, url) => {
    const ok = DEV_URL ? url.startsWith(DEV_URL) : url.startsWith(`${APP_SCHEME}://${APP_HOST}`);
    if (!ok) { e.preventDefault(); }
  });
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https:')) shell.openExternal(url);
    return { action: 'deny' };
  });

  if (DEV_URL) {
    win.webContents.on('console-message', (_event, level, message, line, sourceId) => {
      console.log(`[renderer:${level}] ${message} (${sourceId}:${line})`);
    });
    win.webContents.on('did-fail-load', (_event, code, description, url) => {
      console.error(`[renderer:load] ${description} (${code}) ${url}`);
    });
  }

  if (DEV_URL) win.loadURL(DEV_URL);
  else win.loadURL(`${APP_SCHEME}://${APP_HOST}/index.html`);
}

app.whenReady().then(() => {
  let signInPending = false;
  ipcMain.handle('desktop:sign-in', async (event) => {
    const frame = event.senderFrame;
    const expectedOrigin = DEV_URL ? new URL(DEV_URL).origin : `${APP_SCHEME}://${APP_HOST}`;
    const frameUrl = frame ? new URL(frame.url) : null;
    const frameOrigin = frameUrl ? `${frameUrl.protocol}//${frameUrl.host}` : '';
    if (!frame || frame !== event.sender.mainFrame || frameOrigin !== expectedOrigin || signInPending) {
      throw new Error('Browser sign-in is unavailable.');
    }
    signInPending = true;
    try {
      return await browserSignIn(process.env.DESKTOP_SIGN_IN_URL || 'https://tillerystreettrail.web.app/desktop-sign-in', url => shell.openExternal(url));
    } finally { signInPending = false; }
  });
  // Serve built renderer files under app://admin-desktop/ so callables see a
  // stable Origin that matches the CORS allowlist.
  protocol.registerFileProtocol(APP_SCHEME, (request, callback) => {
    const url = new URL(request.url);
    const rendererRoot = path.resolve(__dirname, '../dist');
    const requestedPath = decodeURIComponent(url.pathname).replace(/^\/+/, '');
    const file = path.resolve(rendererRoot, requestedPath);
    if (file !== rendererRoot && !file.startsWith(`${rendererRoot}${path.sep}`)) return callback({ error: -10 });
    callback({ path: file });
  });

  // Strict CSP for the renderer.
  session.defaultSession.webRequest.onHeadersReceived((details, cb) => {
    cb({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [DEV_URL ? DEVELOPMENT_CSP : PRODUCTION_CSP],
      },
    });
  });

  createWindow();
});

app.on('window-all-closed', () => app.quit());
