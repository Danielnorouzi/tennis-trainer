// Rally AI service worker: offline-capable app shell + cached on-device CV runtime.
// - Static build assets and the MediaPipe runtime/models: cache-first (immutable).
// - Page navigations: network-first, falling back to the last cached copy (offline practice).
// - API calls, auth and anything cross-origin except the MediaPipe model CDN: never cached.
const VERSION = "rally-v1";
const SHELL = ["/dashboard", "/coach/live", "/analyze", "/training/drills"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(VERSION).then((c) => Promise.allSettled(SHELL.map((u) => c.add(u)))).then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  const sameOrigin = url.origin === self.location.origin;
  const isModelCdn = url.hostname === "storage.googleapis.com" && url.pathname.startsWith("/mediapipe-models/");

  if (sameOrigin && (url.pathname.startsWith("/api/") || url.pathname.startsWith("/auth/"))) return;
  if (!sameOrigin && !isModelCdn) return;

  const immutable = isModelCdn || url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/mediapipe/");
  if (immutable) {
    event.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            if (res.ok) {
              const copy = res.clone();
              caches.open(VERSION).then((c) => c.put(req, copy));
            }
            return res;
          }),
      ),
    );
    return;
  }

  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          if (res.ok) caches.open(VERSION).then((c) => c.put(req, copy));
          return res;
        })
        .catch(() => caches.match(req).then((hit) => hit || caches.match("/dashboard"))),
    );
  }
});
