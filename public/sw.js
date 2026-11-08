// Seer's service worker: makes the app installable, shows a friendly page when offline, and shows
// push notifications. It never caches private data: pages and API calls always go to the network.
const OFFLINE = "/offline.html";
self.addEventListener("install", event => {
  event.waitUntil(caches.open("seer-shell-v1").then(cache => cache.add(OFFLINE)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", event => { event.waitUntil(self.clients.claim()); });
self.addEventListener("fetch", event => {
  if (event.request.mode !== "navigate") return;
  event.respondWith(fetch(event.request).catch(() => caches.match(OFFLINE)));
});
self.addEventListener("push", event => {
  let data = { title: "سِير", body: "", url: "/dashboard" };
  try { data = { ...data, ...event.data.json() }; } catch { /* keep the default */ }
  event.waitUntil(self.registration.showNotification(data.title, { body: data.body, dir: "rtl", lang: "ar", icon: "/icons/path-light-192.png", badge: "/icons/path-light-192.png", data: { url: data.url }, tag: data.url }));
});
self.addEventListener("notificationclick", event => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || "/dashboard", self.location.origin).href;
  event.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(list => {
    const open = list.find(client => client.url.startsWith(self.location.origin));
    if (open) { open.focus(); return open.navigate(url); }
    return self.clients.openWindow(url);
  }));
});
