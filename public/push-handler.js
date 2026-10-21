// Web Push handler, imported into the generated service worker via
// workbox importScripts. Shows genuine message notifications and focuses
// the right conversation on click. Never fabricates content — the payload
// comes from the server when a character actually sent something.

self.addEventListener("push", (event) => {
  if (!event.data) return;
  let payload;
  try {
    payload = event.data.json();
  } catch {
    return;
  }
  const title = payload.title || "Chats";
  event.waitUntil(
    self.registration.showNotification(title, {
      body: payload.body || "New message",
      tag: payload.tag || "chats",
      renotify: false,
      icon: "/icon-512.png",
      badge: "/icon-512.png",
      data: { url: payload.url || "/inbox" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/inbox";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ("focus" in client) {
          client.navigate(url);
          return client.focus();
        }
      }
      return self.clients.openWindow(url);
    }),
  );
});
