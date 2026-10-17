const CACHE = 'time-audit-shell-v108-logo';
const root = self.registration.scope;
const shell = [new URL('manifest.webmanifest', root).href, new URL('logo-v108.svg', root).href, new URL('icon-192.png', root).href, new URL('icon-512.png', root).href, new URL('apple-touch-icon.png', root).href, new URL('copyright.html', root).href];
self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const response = await fetch(root, {cache: 'reload'});
    if (!response.ok) throw new Error(`App shell unavailable (${response.status})`);
    const html = await response.clone().text();
    const assets = [...html.matchAll(/(?:src|href)=["']([^"']*\/assets\/[^"']+\.(?:js|css))["']/gi)]
      .map(match => new URL(match[1], root).href);
    if (!assets.some(url => url.endsWith('.js'))) throw new Error('App JavaScript asset was not found');
    const cache = await caches.open(CACHE);
    // Activate only when the HTML and every referenced bundle are available together.
    await cache.addAll([...shell, ...assets]);
    await cache.put(root, response);
    await self.skipWaiting();
  })());
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;
  // An update probe must read the network; never serve or retain an old HTML copy.
  if (url.searchParams.has('update-check')) return;
  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).then(response => {
      if (response.ok) caches.open(CACHE).then(cache => cache.put(root, response.clone()));
      return response;
    }).catch(() => caches.match(root)));
    return;
  }
  event.respondWith(caches.match(request).then(cached => cached || fetch(request).then(response => {
    if (response.ok) caches.open(CACHE).then(cache => cache.put(request, response.clone()));
    return response;
  })));
});
