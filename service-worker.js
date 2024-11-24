
const CACHE_NAME = 'gathurup-v1';

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll([
        '/',
        '/notification-test.html',
        '/styles_vote.css',
        '/gathurup.ico',
        '/icon-192.png',
        '/icon-512.png'
      ]);
    })
  );
});

self.addEventListener('push', event => {
  const options = {
    body: event.data.text(),
    icon: 'icon-192.png',
    badge: 'icon-192.png'
  };

  event.waitUntil(
    self.registration.showNotification('gathurUP', options)
  );
});