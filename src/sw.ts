/// <reference lib="webworker" />
import { precacheAndRoute, cleanupOutdatedCaches } from 'workbox-precaching'
import { SUPABASE_CACHE, CLEAR_SUPABASE_CACHE_MSG } from './sw-cache-policy'
import { clubConfig } from '../piste.config'

declare const self: ServiceWorkerGlobalScope

// The service worker. Three jobs: precache the shell, handle web push, and
// clear the API cache when somebody signs out.
//
// What it deliberately does NOT do is cache Supabase responses. Every row this
// app reads is scoped by RLS to the member who asked for it, and a shared cache
// keyed by URL cannot tell two members' requests apart — so a stale-while-
// revalidate strategy here would serve one fencer another's medical notes. The
// cache name exists only so sign-out can delete anything a future change adds.

precacheAndRoute(self.__WB_MANIFEST)
cleanupOutdatedCaches()

self.addEventListener('message', event => {
  if (event.data === CLEAR_SUPABASE_CACHE_MSG) {
    event.waitUntil(caches.delete(SUPABASE_CACHE))
  }
  if (event.data === 'SKIP_WAITING') {
    void self.skipWaiting()
  }
})

interface PushPayload {
  title?: string
  body?: string
  url?: string
  tag?: string
}

function readPayload(data: PushMessageData | null): PushPayload {
  if (!data) return {}
  try {
    return (data.json() ?? {}) as PushPayload
  } catch {
    // Not JSON — a plain-text push, or a malformed one. Either way the text is
    // the most useful thing left to show.
    return { body: data.text() }
  }
}

self.addEventListener('push', event => {
  // A push with no body still deserves a notification: on several platforms a
  // push event that shows nothing costs the site its permission.
  const payload = readPayload(event.data)

  event.waitUntil(self.registration.showNotification(
    payload.title ?? clubConfig.identity.clubName,
    {
      body: payload.body ?? '',
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      // Tagged so a second reminder for the same session replaces the first
      // rather than stacking three identical rows in the tray.
      tag: payload.tag ?? 'piste',
      data: { url: payload.url ?? '/' },
    },
  ))
})

self.addEventListener('notificationclick', event => {
  event.notification.close()
  const url = (event.notification.data as { url?: string } | undefined)?.url ?? '/'

  // Focus an existing tab rather than opening a fourth copy of the app.
  event.waitUntil((async () => {
    const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    for (const client of clients) {
      if ('focus' in client) {
        await client.focus()
        if ('navigate' in client) await client.navigate(url)
        return
      }
    }
    await self.clients.openWindow(url)
  })())
})
