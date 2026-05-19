const CACHE_NAME = 'chat-pwa-v1';
const urlsToCache = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icon98-192.png',
  '/icon98-512.png'
];

// Установка сервис-воркера и кэширование базовых ресурсов
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(urlsToCache))
      .then(() => self.skipWaiting())
  );
});

// Очистка старых кэшей при активации
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(name => {
          if (name !== CACHE_NAME) {
            return caches.delete(name);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Стратегия: сначала сеть, при ошибке — кэш (для API не кэшируем)
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  // Не кэшируем API, WebSocket и загрузку файлов
  if (url.pathname.startsWith('/api/') || 
      url.pathname === '/ws' || 
      url.pathname === '/upload') {
    event.respondWith(fetch(event.request));
    return;
  }
  // Для всего остального (статика) — кэш или сеть
  event.respondWith(
    caches.match(event.request)
      .then(response => response || fetch(event.request))
  );
});

// Обработка push-уведомлений
self.addEventListener('push', event => {
  let data = {};
  try {
    data = event.data.json();
  } catch (e) {
    data = { title: 'Новое сообщение', body: 'У вас новое сообщение' };
  }
  const title = data.title || 'Новое сообщение';
  const options = {
    body: data.body || '',
    icon: '/icon98-192.png',
    badge: '/icon98-192.png',
    vibrate: [200, 100, 200],
    data: { url: '/' }
  };
  event.waitUntil(
    self.registration.showNotification(title, options)
  );
});

// Обработка клика по уведомлению
self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then(windowClients => {
        // Если окно чата уже открыто, переключаем фокус на него
        for (let client of windowClients) {
          if (client.url === '/' && 'focus' in client) {
            return client.focus();
          }
        }
        // Иначе открываем новое окно
        if (clients.openWindow) {
          return clients.openWindow('/');
        }
      })
  );
});