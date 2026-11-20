/* Shows push notifications while VibeBook is closed. The app registers this file with its Firebase settings in the address (?k=&p=&s=&a=). */
importScripts("https://www.gstatic.com/firebasejs/9.14.0/firebase-app-compat.js", "https://www.gstatic.com/firebasejs/9.14.0/firebase-messaging-compat.js");

const q = new URL(self.location.href).searchParams;
firebase.initializeApp({ apiKey: q.get("k"), projectId: q.get("p"), messagingSenderId: q.get("s"), appId: q.get("a") });
const messaging = firebase.messaging();

// The server sends data-only messages so this one place decides how they look.
messaging.onBackgroundMessage((payload) => {
  const d = payload.data || {};
  self.registration.showNotification(d.title || "VibeBook", {
    body: d.body || "You have something new.",
    icon: "/icon-192.png", badge: "/icon-192.png", tag: d.tag || "vibebook", data: { url: d.url || "/" },
  });
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
    for (const c of list) if ("focus" in c) { c.navigate(url).catch(() => {}); return c.focus(); }
    return self.clients.openWindow(url);
  }));
});
