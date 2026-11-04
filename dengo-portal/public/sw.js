// Portal service worker: shows Web Push notifications and opens the right
// page when one is tapped. No offline caching on purpose: the portal always
// needs fresh order data.

self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()))

self.addEventListener('push', event => {
  let data = {}
  try { data = event.data ? event.data.json() : {} } catch { data = { body: event.data ? event.data.text() : '' } }
  const title = data.title || 'Portal de maestros'
  event.waitUntil(self.registration.showNotification(title, {
    body: data.body || '',
    icon: '/api/portal/icon-192.png',
    badge: '/api/portal/icon-96.png',
    tag: data.tag || undefined,
    renotify: !!data.tag,
    data: { url: data.url || '/dashboard' },
  }))
})

self.addEventListener('notificationclick', event => {
  event.notification.close()
  const url = new URL(event.notification.data?.url || '/dashboard', self.location.origin).href
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    for (const w of windows) {
      if (w.url.startsWith(self.location.origin)) {
        await w.focus()
        if ('navigate' in w) return w.navigate(url)
        return
      }
    }
    return self.clients.openWindow(url)
  })())
})
