// Service worker for web push notifications.
self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  let data = { title: "5th Element", body: "You have a new notification." };
  try {
    if (event.data) data = { ...data, ...event.data.json() };
  } catch (_e) {
    // keep defaults
  }
  // Update the app icon badge with the unread count (where supported).
  const tasks = [];
  const badgeCount = Number(data.badge);
  if (Number.isFinite(badgeCount) && badgeCount >= 0 && navigator.setAppBadge) {
    tasks.push(
      (badgeCount > 0
        ? navigator.setAppBadge(Math.floor(badgeCount))
        : navigator.clearAppBadge()
      ).catch(() => {}),
    );
  }
  tasks.push(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: "/icon-192.png",
      badge: "/icon-192.png",
    }),
  );
  event.waitUntil(Promise.all(tasks));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clients) => {
        for (const client of clients) {
          if ("focus" in client) return client.focus();
        }
        return self.clients.openWindow("/");
      }),
  );
});
