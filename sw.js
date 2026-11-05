/**
 * sw.js — service worker for offline use.
 *
 * The whole app is static and small, so everything is precached on install and
 * served cache-first. That makes the app work on the tram with no signal, and
 * makes it instant even when there is one.
 *
 * Bump CACHE whenever any precached file changes — the old cache is deleted on
 * activate, so a stale version can never linger.
 */

const CACHE = 'czs-v4';

const PRECACHE = [
  './',
  'index.html',
  'manifest.webmanifest',

  'css/app.css',
  'css/print.css',

  'js/app.js',
  'js/router.js',
  'js/store.js',
  'js/dict.js',
  'js/tokenizer.js',
  'js/tts.js',
  'js/ui.js',
  'js/content.js',
  'js/home.js',
  'js/reader.js',
  'js/wordpanel.js',
  'js/wordtap.js',
  'js/saved.js',
  'js/flashcards.js',
  'js/worksheets.js',
  'js/adventure.js',
  'js/settings.js',
  'js/placement.js',

  'fonts/literata-latin.woff2',
  'fonts/literata-latin-ext.woff2',
  'fonts/bricolage-latin.woff2',
  'fonts/bricolage-latin-ext.woff2',

  'icons/icon-192.png',
  'icons/icon-512.png',

  'data/dictionary.json',
  'data/placement.json',
  'data/dict/01-function.json',
  'data/dict/02-adverbs-numbers.json',
  'data/dict/03-verbs-a.json',
  'data/dict/04-verbs-b.json',
  'data/dict/05-nouns-a.json',
  'data/dict/06-nouns-b.json',
  'data/dict/07-adjectives.json',
  'data/dict/08-names.json',
  'data/adventure/karel-iv.json',

  'data/stories/index.json',
  'data/stories/a1/01-michal-kuchar.json',
  'data/stories/a1/02-eva-v-obchode.json',
  'data/stories/a1/03-tramvaji-do-centra.json',
  'data/stories/a2/04-vikend-na-chate.json',
  'data/stories/a2/05-u-doktora.json',
  'data/stories/a2/06-vylet-do-brna.json',
  'data/stories/b1/07-golem.json',
  'data/stories/b1/08-hledame-byt.json',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      // addAll is atomic: one bad URL fails the whole install, which is what we
      // want — a half-cached app that breaks offline is worse than no cache.
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    caches.match(request, { ignoreSearch: true }).then((hit) => {
      if (hit) return hit;

      return fetch(request)
        .then((response) => {
          // Cache anything new we fetched successfully, so content added after
          // install (a new story) becomes available offline once visited.
          if (response.ok && response.type === 'basic') {
            const copy = response.clone();
            caches.open(CACHE).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => {
          // Offline and uncached: for a navigation, fall back to the app shell
          // so hash routes still resolve.
          if (request.mode === 'navigate') return caches.match('index.html');
          throw new Error('offline and not cached');
        });
    })
  );
});
