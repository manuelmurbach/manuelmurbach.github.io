// Offline support for the landing page and the tools that work without internet.
// The landing page and the small apps (/speedometer/, /speedtest/, /tuner/, /dmc-scanner/) register this worker.
// Strategy: network first (so updates show up as soon as you're online),
// falling back to the cached copy when offline or the network is too slow.

const CACHE = 'nolo-offline-v4';
const NETWORK_TIMEOUT_MS = 3000;

// Only these paths are handled; everything else (Visible From, Places I've
// Walked, external sites) goes straight to the network as before.
const OFFLINE_PREFIXES = ['/speedometer/', '/speedtest/', '/tuner/', '/dmc-scanner/', '/assets/', '/icons/'];
const OFFLINE_FILES = ['/', '/index.html', '/manifest.webmanifest', '/apple-touch-icon.png'];

const PRECACHE = [
  ...OFFLINE_FILES,
  '/assets/preview-visible-from.jpg',
  '/assets/preview-places-i-walked.jpg',
  '/assets/preview-swissmap.jpg',
  '/icons/nolo.svg',
  '/icons/dmc-scanner.svg',
  '/icons/speedometer.svg',
  '/icons/visible-from.svg',
  '/icons/places-i-walked.svg',
  '/icons/swissmap.svg',
  '/icons/speedtest.svg',
  '/icons/tuner.svg',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/speedometer/',
  '/speedometer/manifest.webmanifest',
  '/speedometer/apple-touch-icon.png',
  '/speedometer/icon-192.png',
  '/speedometer/icon-512.png',
  '/speedtest/',
  '/speedtest/manifest.webmanifest',
  '/speedtest/apple-touch-icon.png',
  '/speedtest/icon-192.png',
  '/speedtest/icon-512.png',
  '/tuner/',
  '/tuner/manifest.webmanifest',
  '/tuner/apple-touch-icon.png',
  '/tuner/icon-192.png',
  '/tuner/icon-512.png',
  '/dmc-scanner/',
  '/dmc-scanner/vendor/zxing-0.20.0.min.js',
  '/dmc-scanner/manifest.json',
  '/dmc-scanner/apple-touch-icon.png',
  '/dmc-scanner/icons/icon-192.png',
  '/dmc-scanner/icons/icon-512.png',
];

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    // Cache each file on its own so one missing file doesn't block the rest.
    await Promise.allSettled(PRECACHE.map(async path => {
      const res = await fetch(path, { cache: 'reload' });
      if (res.ok && !res.redirected) await cache.put(path, res);
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k.startsWith('nolo-offline-') && k !== CACHE).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

function handled(url) {
  if (url.origin !== self.location.origin) return false;
  return OFFLINE_FILES.includes(url.pathname) || OFFLINE_PREFIXES.some(p => url.pathname.startsWith(p));
}

async function networkFirst(request) {
  const cache = await caches.open(CACHE);
  const url = new URL(request.url);
  // index.html and / are the same page; the query string (e.g. ?demo) doesn't change the file.
  const key = url.pathname.endsWith('/index.html') ? url.pathname.slice(0, -'index.html'.length) : url.pathname;

  const fromNetwork = fetch(request).then(res => {
    if (res.ok && !res.redirected) cache.put(key, res.clone());
    return res;
  });
  const timeout = new Promise(resolve => setTimeout(resolve, NETWORK_TIMEOUT_MS, null));

  try {
    const res = await Promise.race([fromNetwork, timeout]);
    if (res) return res;
  } catch {}

  const cached = await cache.match(key);
  if (cached) return cached;
  return fromNetwork; // nothing cached: keep waiting for the network (or fail)
}

self.addEventListener('fetch', event => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (!handled(url)) return;
  event.respondWith(networkFirst(request));
});
