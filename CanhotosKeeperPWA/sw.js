// Service Worker simples para cache básico (PWA offline das páginas; OCR depende de CDN)
const CACHE = "ck-cache-v1";
const ASSETS = [
  "./",
  "./index.html",
  "./assets/styles.css",
  "./assets/app.js",
  "./manifest.webmanifest",
  "./assets/icons/icon-64.png",
  "./assets/icons/icon-192.png",
  "./assets/icons/icon-512.png"
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
  );
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (ASSETS.includes(url.pathname.replace(self.registration.scope, "./"))) {
    e.respondWith(caches.match(e.request).then(r => r || fetch(e.request)));
  }
});
