/**
 * sw.js — Cultural Games service worker (PWA offline support).
 *
 * Strategy, deliberately conservative so nothing online can break:
 *
 *   • Cross-origin (Supabase, Google Analytics, Google Fonts CSS): NEVER touched.
 *     Auth, rooms, realtime and coin RPCs must always hit the network, and a
 *     stale cached response there would be a correctness bug, not a nicety.
 *   • Non-GET: never touched.
 *   • Navigations (HTML): network-first → cache → offline page. So you always
 *     get the freshest page when online, and a played-before game still opens
 *     on a plane.
 *   • Same-origin static assets (css/js/svg/png/woff): stale-while-revalidate —
 *     instant from cache, refreshed in the background.
 *
 * Games are cached AS YOU PLAY THEM (runtime), not all 30 up front — precaching
 * ~1.6MB of game JS on first visit would be a rude download for someone who
 * plays one game.
 *
 * Bump VERSION to invalidate every cache after a deploy.
 */
var VERSION = 'cg-v18';   // bump on every deploy that changes CSS/JS
var SHELL   = VERSION + '-shell';
var RUNTIME = VERSION + '-runtime';

/* The minimum needed to boot the site offline. Kept small on purpose. */
var PRECACHE = [
  '/',
  '/index.html',
  '/pages/browse.html',
  '/pages/offline.html',
  '/css/global.css',
  '/css/components.css',
  '/css/games.css',
  '/shared/theme.css',
  '/shared/theme.js',
  '/shared/mobile.css',
  '/shared/mobile.js',
  '/shared/mobile-nav.css',
  '/shared/mobile-nav.js',
  '/shared/mobile-zoom.js',
  '/shared/icons.js',
  '/js/utils/games-data.js',
  '/favicon.svg',
  '/assets/pwa/icon-192.png',
  '/site.webmanifest'
];

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(SHELL).then(function (c) {
      // Add individually: one 404 must not abort the whole install.
      return Promise.all(PRECACHE.map(function (url) {
        return c.add(new Request(url, { cache: 'reload' })).catch(function () {});
      }));
    }).then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (k) {
        if (k !== SHELL && k !== RUNTIME) return caches.delete(k);
      }));
    }).then(function () { return self.clients.claim(); })
  );
});

// Code has to MATCH the HTML that references it. Navigations are network-first,
// so serving js/css stale-while-revalidate guaranteed exactly one broken load
// after every deploy: the new HTML paired with the PREVIOUS version's JS and
// CSS, silently corrected only on the visit after that. That is why a change
// could look like it had not shipped.
function isCodeAsset(url) {
  return /\.(css|js)$/i.test(url.pathname);
}

// Media is safe a version behind, and it is most of the bytes — it keeps the
// instant cache-first response.
function isMediaAsset(url) {
  return /\.(svg|png|jpg|jpeg|webp|woff2?|ttf)$/i.test(url.pathname);
}

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;                       // never touch writes

  var url;
  try { url = new URL(req.url); } catch (err) { return; }
  if (url.origin !== self.location.origin) return;        // Supabase/GA/fonts → network

  // HTML navigations: network-first so content is fresh, cache as a fallback.
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req).then(function (res) {
        var copy = res.clone();
        caches.open(RUNTIME).then(function (c) { c.put(req, copy); }).catch(function(){});
        return res;
      }).catch(function () {
        return caches.match(req).then(function (hit) {
          return hit || caches.match('/pages/offline.html');
        });
      })
    );
    return;
  }

  // Code: network-first, cache only as the offline fallback. Costs one
  // same-origin round trip for js/css; buys never running a mismatched pair.
  if (isCodeAsset(url)) {
    e.respondWith(
      fetch(req).then(function (res) {
        if (res && res.status === 200) {
          var copy = res.clone();
          caches.open(RUNTIME).then(function (c) { c.put(req, copy); }).catch(function () {});
        }
        return res;
      }).catch(function () {
        return caches.match(req).then(function (hit) {
          return hit || Response.error();
        });
      })
    );
    return;
  }

  // Media: stale-while-revalidate.
  if (isMediaAsset(url)) {
    e.respondWith(
      caches.match(req).then(function (hit) {
        var net = fetch(req).then(function (res) {
          if (res && res.status === 200) {
            var copy = res.clone();
            caches.open(RUNTIME).then(function (c) { c.put(req, copy); }).catch(function(){});
          }
          return res;
        }).catch(function () { return hit; });
        return hit || net;
      })
    );
  }
});

/* Let the page trigger an immediate update (see shared/pwa.js). */
self.addEventListener('message', function (e) {
  if (e.data === 'skipWaiting') self.skipWaiting();
});
