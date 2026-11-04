// Loaded into the POS service worker (vite-plugin-pwa → workbox.importScripts).
// Shows Web Push notifications and opens the right screen when one is tapped.

self.addEventListener('push', event => {
  let data = {}
  try { data = event.data ? event.data.json() : {} } catch { data = { body: event.data ? event.data.text() : '' } }
  event.waitUntil(self.registration.showNotification(data.title || 'Punto de venta', {
    body: data.body || '',
    // The client's logo (Configuración → Empresa), not DENGO's.
    icon: '/api/app/icon-192.png',
    badge: '/api/app/badge.png',
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
