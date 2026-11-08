// Seer's service worker: makes the app installable and shows a friendly page when offline.
// It never caches private data: pages and API calls always go to the network.
const OFFLINE = "/offline.html";
self.addEventListener("install", event => {
  event.waitUntil(caches.open("seer-shell-v1").then(cache => cache.add(OFFLINE)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", event => { event.waitUntil(self.clients.claim()); });
self.addEventListener("fetch", event => {
  if (event.request.mode !== "navigate") return;
  event.respondWith(fetch(event.request).catch(() => caches.match(OFFLINE)));
});
