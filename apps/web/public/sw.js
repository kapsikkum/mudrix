self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const roomUrl = event.notification.data?.url;
  const targetUrl = roomUrl ? new URL(roomUrl, self.location.origin).href : null;

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      if (clientList.length > 0) {
        const client = clientList[0];
        if (targetUrl) client.postMessage({ type: 'navigateTo', url: targetUrl });
        return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow(targetUrl ?? '/');
      return undefined;
    })
  );
});
