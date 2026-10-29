// Service worker do Prezenti: notificações push e abrir a app sem rede (sobretudo o kiosk).
// Rede primeiro: com rede vê sempre a versão nova; sem rede usa a última cópia guardada.
// A API (/api) nunca é guardada: os toques sem rede vão para a fila do próprio kiosk.
const CACHE = 'prezenti-v2';
const SHELL = ['/kiosk', '/kiosk.webmanifest', '/manifest.webmanifest', '/icons/icon-192.png', '/icons/icon-512.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).catch(() => {}).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/') || url.pathname.includes('webpack-hmr') || url.pathname.startsWith('/_next/data')) return;
  // Pedidos RSC da navegação do Next mudam a cada página: não vale a pena guardá-los.
  if (req.headers.get('RSC') || url.searchParams.has('_rsc')) return;

  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok && res.type === 'basic') {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
        }
        return res;
      })
      .catch(async () => {
        const hit = await caches.match(req, { ignoreSearch: req.mode === 'navigate' });
        if (hit) return hit;
        // Uma página do kiosk sem cópia ainda abre o kiosk guardado.
        if (req.mode === 'navigate' && url.pathname.startsWith('/kiosk')) return (await caches.match('/kiosk')) ?? Response.error();
        return Response.error();
      }),
  );
});

self.addEventListener('push', (event) => {
  let data = { title: 'Prezenti', body: 'Tem uma nova notificação.', url: '/pais' };
  try { data = { ...data, ...event.data.json() }; } catch {}
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      data: { url: data.url },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/pais';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      const open = list.find((c) => c.url.includes(url));
      return open ? open.focus() : self.clients.openWindow(url);
    }),
  );
});
