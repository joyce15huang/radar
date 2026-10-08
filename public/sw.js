// Minimal PWA service worker: makes the app installable and gives a graceful
// offline page. HTML/navigations are network-first (never serve stale SSR);
// content-hashed static assets are cached-first.
const CACHE = "pdd-v2";
const OFFLINE_URL = "/offline.html";
const PRECACHE = [OFFLINE_URL, "/icon-192.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  if (req.mode === "navigate") {
    event.respondWith(fetch(req).catch(() => caches.match(OFFLINE_URL)));
    return;
  }

  const url = new URL(req.url);
  const isStatic =
    url.origin === self.location.origin && /\.(png|svg|ico|woff2?|css|js)$/.test(url.pathname);
  if (isStatic) {
    event.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req)
            .then((res) => {
              const copy = res.clone();
              caches.open(CACHE).then((c) => c.put(req, copy));
              return res;
            })
            .catch(() => hit),
      ),
    );
  }
});
