'use strict';

const BUILD = 'c4b0b14ab5a304606253';
const SCOPE = new URL('./', self.location.href);
const PREFIX = 'vd-ct-pwa:' + SCOPE.pathname + ':';
const CACHE = PREFIX + BUILD;
const ASSETS = [
  {
    "path": "./Manrope-OFL.txt",
    "sha256": "58172e0c0fac2cda8a37b348164bb55e44b0e69051e557e92b1d3f6910141f7b"
  },
  {
    "path": "./app.js",
    "sha256": "3d624f8c171cfc8a5e2ad86945cc12b8f4523d5b89ca43ebc353042e03667105"
  },
  {
    "path": "./core.js",
    "sha256": "93f67a27a671cbba166de45e10cde8cc4df68bd0468c93de1574f5d4857f2def"
  },
  {
    "path": "./icons/apple-touch-icon.png",
    "sha256": "8e0889e267f17d92dbce15bf56974e5d2f4e54ccddcef4a6ecf2f089362e5514"
  },
  {
    "path": "./icons/icon-192.png",
    "sha256": "1fecc7da820b9c0ce345a013bb0fe638f2414a7851b270e50e8992d5ec632f34"
  },
  {
    "path": "./icons/icon-512.png",
    "sha256": "4d52118148b873e858cbd3c67e67f48c297e4580277854f1cd7a920e36faef07"
  },
  {
    "path": "./icons/icon-maskable-512.png",
    "sha256": "b0dad9b56dfc674e8b2de00ac30d6f48c2e9a7d8090df15f4313e9f0843f018b"
  },
  {
    "path": "./index.html",
    "sha256": "634fb164b4830848a2274eb65ad9a790343dd65cb0c6b67c257c472894e8fb6c"
  },
  {
    "path": "./logo.svg",
    "sha256": "5bf152c27aa279b40c495f06dcc0eab4fa6fce810b40092e3c337ae28103b8bf"
  },
  {
    "path": "./manifest.webmanifest",
    "sha256": "3723e0481861dd5978f3a6bc16ace8bc66634656042dcef75cbf25fe22ce46d3"
  },
  {
    "path": "./manrope.ttf",
    "sha256": "3ae11c49db0455a3cc33e37d380f20fdb8c7f8b41dc07625c177e3d87a9d6ae6"
  },
  {
    "path": "./media/3757eaf0735e606ac4c5.png",
    "sha256": "3757eaf0735e606ac4c59e04375562b76868145f6479d794e9a70c288b478d86"
  },
  {
    "path": "./media/6a7e8d0fc5db2f903f8e.png",
    "sha256": "6a7e8d0fc5db2f903f8ee8297315c3359d02c63b475987774587fbd2b832b058"
  },
  {
    "path": "./media/d799ffd861a463045d49.png",
    "sha256": "d799ffd861a463045d492111509b846f93052709c576b5919217d4386ca0f661"
  },
  {
    "path": "./pwa.css",
    "sha256": "33e17f0c1a6ed03a724372c30c616fda9729bc38fa874f38a86fe8823b474de1"
  },
  {
    "path": "./pwa.js",
    "sha256": "d056411bc9d5e6172ab126ec1c8758a41369ca16e6359b042913338927f6bdd9"
  },
  {
    "path": "./questions.json",
    "sha256": "aee121108c7bd22ad100a3337d6d8057e070933b01642e4a3414356dd0719686"
  },
  {
    "path": "./styles.css",
    "sha256": "3360d6c3fc683dfad5ba635480ca91ca525c5a9b85c105f5cca7bae617d7a6b1"
  }
];
const byPath = new Map(ASSETS.map(function (asset) {
  return [new URL(asset.path, SCOPE).pathname, asset];
}));
let preparation;

async function verifiedResponse(asset) {
  const controller = new AbortController();
  const timeout = setTimeout(function () { controller.abort(); }, 20000);
  try {
    const response = await fetch(new URL(asset.path, SCOPE).href, { cache: 'reload', credentials: 'same-origin', signal: controller.signal });
    if (!response.ok || response.type === 'opaque') throw new Error('Asset unavailable: ' + asset.path);
    const digest = await crypto.subtle.digest('SHA-256', await response.clone().arrayBuffer());
    const actual = Array.from(new Uint8Array(digest), function (value) { return value.toString(16).padStart(2, '0'); }).join('');
    if (actual !== asset.sha256) throw new Error('Asset version mismatch: ' + asset.path);
    return response;
  } finally {
    clearTimeout(timeout);
  }
}

function prepareCache() {
  if (preparation) return preparation;
  preparation = (async function () {
    const cache = await caches.open(CACHE);
    const results = await Promise.allSettled(ASSETS.map(async function (asset) {
      const url = new URL(asset.path, SCOPE).href;
      if (!await cache.match(url)) await cache.put(url, await verifiedResponse(asset));
    }));
    if (results.some(function (result) { return result.status === 'rejected'; })) throw new Error('Offline installation incomplete');
  })().finally(function () { preparation = null; });
  return preparation;
}

self.addEventListener('install', function (event) {
  event.waitUntil(prepareCache().catch(async function (error) {
    // A failed worker may have its writes rolled back later by WebKit.
    // Remove its partial cache now so a retry downloads a complete fresh set.
    await caches.delete(CACHE);
    throw error;
  }));
  // Updates wait until the existing app is closed; an attempt is never reloaded.
});

self.addEventListener('activate', function (event) {
  event.waitUntil((async function () {
    const names = await caches.keys();
    await Promise.all(names.filter(function (name) { return name.startsWith(PREFIX) && name !== CACHE; }).map(function (name) { return caches.delete(name); }));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', function (event) {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== SCOPE.origin) return;
  const path = request.mode === 'navigate' && url.pathname === SCOPE.pathname ? new URL('index.html', SCOPE).pathname : url.pathname;
  const asset = byPath.get(path);
  if (!asset) return;
  event.respondWith((async function () {
    const cache = await caches.open(CACHE);
    const key = new URL(asset.path, SCOPE).href;
    const saved = await cache.match(key);
    if (saved) return saved;
    const response = await verifiedResponse(asset);
    await cache.put(key, response.clone());
    return response;
  })());
});

self.addEventListener('message', function (event) {
  if (!event.data || event.data.type !== 'PREPARE_OFFLINE' || !event.ports[0]) return;
  const port = event.ports[0];
  event.waitUntil(prepareCache().then(function () {
    port.postMessage({ ok: true, build: BUILD });
  }, function () {
    port.postMessage({ ok: false, build: BUILD });
  }));
});
