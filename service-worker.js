// Crumb Service Worker
// =====================
// Handles Web Push notifications (Phase 2) and message-driven notifications
// from the page (Phase 1: immediate notifications when the PWA is backgrounded).
//
// Lives at the origin root (`/service-worker.js`) so its scope covers all paths.

const SW_VERSION = '1.0.0';

// Install: activate immediately rather than waiting for tabs to close
self.addEventListener('install', (event) => {
  self.skipWaiting();
});

// Activate: claim all open clients so they use this worker right away
self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// Push event: fires when Apple Push Service delivers a notification to this device.
// Phase 2 wires this up. Payload format: { title, body, tag, url, data }.
self.addEventListener('push', (event) => {
  let data = {};
  try {
    if (event.data) data = event.data.json();
  } catch (e) {
    data = { title: 'Crumb', body: event.data?.text() || '' };
  }
  event.waitUntil(
    self.registration.showNotification(data.title || 'Crumb', {
      body: data.body || '',
      icon: data.icon || '/crumb/icon.png',
      badge: data.badge || '/crumb/icon.png',
      tag: data.tag, // de-dupes / replaces previous notif with same tag
      data: { url: data.url || '/', ...(data.data || {}) },
      requireInteraction: false,
      // Vibrate pattern when supported (iOS ignores)
      vibrate: [80, 40, 80],
    })
  );
});

// Notification tap: focus the existing PWA window or open one.
// Posts a message to the page so it can navigate to the relevant view.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((wins) => {
      // Prefer focusing an existing window over opening a new one
      const existing = wins.find((w) => w.url.includes(self.location.origin));
      if (existing) {
        existing.focus();
        existing.postMessage({ type: 'notif-open', url: targetUrl, data: event.notification.data });
      } else {
        // No window open — launch a new one
        self.clients.openWindow(targetUrl);
      }
    })
  );
});

// Message from page to SW. Phase 1 uses this for immediate notifications:
// the page can't reliably call showNotification() from a hidden tab on iOS,
// but it CAN postMessage to the service worker, which can.
self.addEventListener('message', (event) => {
  const data = event.data || {};
  if (data.type === 'show-notification') {
    // Page is asking SW to show a notification right now (Phase 1 path).
    // The page already decided this is appropriate (page is hidden, permission
    // granted, etc.) — SW just relays.
    self.registration.showNotification(data.title || 'Crumb', data.options || {});
  } else if (data.type === 'sw-version') {
    // Diagnostic: page can ask "what version are you running"
    event.source?.postMessage({ type: 'sw-version-reply', version: SW_VERSION });
  }
});
