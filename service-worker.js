const CACHE = 'training-v2.5.1-text-free-exercises';
const VERSION = '2.5.1';

const CORE_FILES = [
  'styles.css', 'app.js', 'features.js', 'ui.js', 'exercise-demos.js',
  'weekly-weights.js', 'cindy.js', 'streak.js', 'curriculum.json', 'jszip.min.js'
];

const CORE_ASSETS = [
  './', './index.html', './FitWeek-Streak.js', './manifest.json',
  './icon.svg', './icon-192.png', './icon-512.png', './apple-touch-icon.png',
  ...CORE_FILES.map(file => './' + file + '?v=' + VERSION)
];

const IMAGE_ASSETS = [
  'neutral-db-shoulder-press', 'incline-db-press', 'lateral-raise',
  'db-overhead-triceps-extension', 'chest-supported-row',
  'chest-supported-reverse-fly', 'hammer-curl', 'dead-bug',
  'goblet-squat', 'db-rdl', 'db-hip-thrust', 'standing-calf-raise',
  'band-assisted-pull-up', 'cindy-push-up', 'cindy-air-squat'
].map(name => './images/exercises/' + name + '.png');

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await cache.addAll(CORE_ASSETS.map(url => new Request(url, { cache: 'reload' })));

    // 圖片分別下載，單張失敗不影響其他檔案。
    for (const url of IMAGE_ASSETS) {
      try {
        await cache.add(new Request(url, { cache: 'reload' }));
      } catch (error) {
        // 下次開啟該動作時，再嘗試下載圖片。
      }
    }
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys
      .filter(key => key.startsWith('training-') && key !== CACHE)
      .map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  const scope = new URL(self.registration.scope);
  if (url.origin !== scope.origin || !url.pathname.startsWith(scope.pathname)) return;

  const relativePath = url.pathname.slice(scope.pathname.length);
  const isExerciseImage = IMAGE_ASSETS.some(asset => relativePath === asset.slice(2));
  let cacheKey = request;

  if (CORE_FILES.includes(relativePath)) {
    // 舊分頁的版本參數也對應到目前的核心快取。
    const canonicalURL = new URL(url.href);
    canonicalURL.searchParams.set('v', VERSION);
    cacheKey = canonicalURL.href;
  }

  event.respondWith((async () => {
    const cache = await caches.open(CACHE).catch(() => null);
    const cached = cache ? await cache.match(cacheKey).catch(() => undefined) : undefined;
    if (isExerciseImage && cached) return cached;

    try {
      const response = await fetch(new Request(request, { cache: 'no-cache' }));
      if (response.ok) {
        if (cache) {
          try {
            await cache.put(cacheKey, response.clone());
          } catch (error) {
            // 快取無法寫入時，仍回傳已下載的內容。
          }
        }
        return response;
      }
      return cached || response;
    } catch (error) {
      if (cached) return cached;
      if (cache && request.mode === 'navigate') {
        const page = await cache.match('./index.html').catch(() => undefined);
        if (page) return page;
      }
      return Response.error();
    }
  })().catch(() => Response.error()));
});
