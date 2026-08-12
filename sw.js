/* Service worker — Web Push for YouCanSmile */
self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  let data = { title: 'YouCanSmile', body: 'Новое уведомление', url: '/' };
  try {
    if (event.data) {
      const parsed = event.data.json();
      data = Object.assign(data, parsed);
    }
  } catch (_) {
    try {
      data.body = event.data ? event.data.text() : data.body;
    } catch (__) {}
  }
  const title = data.title || 'YouCanSmile';
  const options = {
    body: data.body || '',
    icon: '/img/chat-fab-cat.svg',
    badge: '/img/chat-fab-cat.svg',
    tag: data.tag || 'ycs',
    data: { url: data.url || '/' },
    renotify: true,
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) {
          client.navigate(url);
          return client.focus();
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(url);
    })
  );
});
