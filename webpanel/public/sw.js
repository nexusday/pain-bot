self.addEventListener('install',(event)=>event.waitUntil(self.skipWaiting()))
self.addEventListener('activate',(event)=>event.waitUntil(self.clients.claim()))
self.addEventListener('push', (event) => {
  let data = {}
  try {
    data = event.data?.json() || {}
  } catch {}
  const url =
    typeof data.url === 'string' &&
    data.url.startsWith('/') &&
    !data.url.startsWith('//') &&
    !data.url.includes('\\')
      ? data.url
      : '/#/dashboard'
  event.waitUntil(
    self.registration.showNotification(String(data.title || 'PAIN BOT MD'), {
      body: String(data.body || ''),
      icon: '/assets/logo.webp',
      badge: '/assets/favicon.png',
      tag: String(data.tag || 'pain-panel'),
      data: { url },
    })
  )
})
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const target = new URL(
    event.notification.data?.url || '/#/dashboard',
    self.location.origin
  )
  if (target.origin !== self.location.origin) return
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({
        type: 'window',
        includeUncontrolled: true,
      })
      const client = windows.find(
        (item) => new URL(item.url).origin === target.origin
      )
      if (client) {
        await client.navigate(target.href)
        return client.focus()
      }
      return self.clients.openWindow(target.href)
    })()
  )
})
self.addEventListener('pushsubscriptionchange', (event) => {
  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((clients) => {
        clients.forEach((client) =>
          client.postMessage({ type: 'push-subscription-changed' })
        )
      })
  )
})
