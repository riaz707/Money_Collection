// Service worker for offline app-shell support.
//
// IMPORTANT — this app uses Firebase Firestore for real data (accounts,
// transactions, auth). This service worker only caches the static APP
// SHELL (HTML/CSS/JS/images) so the app *opens* instantly and offline.
// It does NOT cache Firestore reads/writes or the Firebase/Google Auth
// network calls — those are left alone so Firestore's own SDK can manage
// its own sync and offline persistence correctly (offline persistence is
// enabled separately in app.js via initializeFirestore + persistentLocalCache).
// Mixing the two would risk showing stale financial data as if it were current.
//
// Bump CACHE_VERSION whenever index.html/style.css/app.js/icons change
// so returning visitors get the fresh shell instead of a stale one.
const CACHE_VERSION = "v1";
const CACHE_NAME = "taka-manager-" + CACHE_VERSION;

const CORE_ASSETS = [
  "./",
  "./index.html",
  "./style.css",
  "./app.js",
  "./manifest.json",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./image/BKash2.png",
  "./image/Nagad-Logo.svg",
  "./image/rocket.png",
];

// Domains we never want to touch — let the browser handle these as if no
// service worker existed at all. Firestore/Auth manage their own caching
// and retry logic; CDN libraries (Chart.js, jsPDF) should always resolve
// normally to avoid version drift or CORS surprises.
const NEVER_INTERCEPT = [
  "firestore.googleapis.com",
  "firebaseapp.com",
  "googleapis.com",
  "gstatic.com",
  "cdn.jsdelivr.net",
  "cdnjs.cloudflare.com",
];

function shouldBypass(url) {
  return NEVER_INTERCEPT.some((host) => url.hostname.includes(host));
}

// Install: pre-cache the core app shell so it works offline immediately.
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(CORE_ASSETS)),
  );
  self.skipWaiting();
});

// Activate: remove old caches from previous versions.
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key.startsWith("taka-manager-") && key !== CACHE_NAME)
          .map((key) => caches.delete(key)),
      ),
    ),
  );
  self.clients.claim();
});

// Fetch strategy:
// - Firebase/Firestore/Auth/CDN requests: bypassed entirely, network as usual.
// - Our own app-shell files: stale-while-revalidate. Serve the cached copy
//   instantly (fast load, works offline), and refresh the cache in the
//   background so the *next* load already has any update — no need to
//   remember to bump CACHE_VERSION for every small change.
self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  if (shouldBypass(url)) return; // let the browser handle it normally

  const isSameOrigin = url.origin === self.location.origin;
  if (!isSameOrigin) return; // any other third-party request: leave alone too

  event.respondWith(
    caches.open(CACHE_NAME).then((cache) =>
      cache.match(req).then((cached) => {
        const networkFetch = fetch(req)
          .then((res) => {
            cache.put(req, res.clone());
            return res;
          })
          .catch(() => cached || caches.match("./index.html"));
        return cached || networkFetch;
      }),
    ),
  );
});
