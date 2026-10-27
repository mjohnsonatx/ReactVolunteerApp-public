// Push-only service worker: renders notifications sent by the notification
// Functions and opens the linked page when one is clicked. It caches nothing.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

const safeLink = (link) => (typeof link === 'string' && /^\/(?!\/)[A-Za-z0-9/_?=&%.-]*$/.test(link) ? link : '/');

self.addEventListener('push', (event) => {
  let payload = {};
  try { payload = event.data ? event.data.json() : {}; } catch { payload = {}; }
  const data = payload.data || payload.notification || {};
  const title = String(data.title || 'WatershedCrew').slice(0, 120);
  event.waitUntil(self.registration.showNotification(title, {
    body: String(data.body || '').slice(0, 240),
    icon: '/icons/icon-192.png?v=leaf-creek-1',
    badge: '/icons/badge-96.png?v=leaf-creek-1',
    tag: data.topic ? `${data.topic}:${safeLink(data.link)}` : undefined,
    data: { link: safeLink(data.link) },
  }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = new URL(safeLink(event.notification.data && event.notification.data.link), self.location.origin).href;
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const open = windows.find((client) => new URL(client.url).origin === self.location.origin);
    if (open) {
      await open.focus();
      return open.navigate(url).catch(() => self.clients.openWindow(url));
    }
    return self.clients.openWindow(url);
  })());
});
