// Web Push on a staff device (POS). Everything degrades quietly: a browser
// without support just says so in the bell menu.

import { api } from './api'

export type PushState =
  | 'unsupported'   // this browser can't (old browser, in-app browser…)
  | 'needs-install' // iPhone/iPad: install the POS on the home screen first
  | 'insecure'      // only works over https (or localhost)
  | 'denied'        // blocked in the browser: must re-enable in its settings
  | 'off'
  | 'on'

const isIOS = () => /iPhone|iPad|iPod/i.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1)
const isStandalone = () => window.matchMedia?.('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone === true
const supported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window

export async function getPushState(): Promise<PushState> {
  if (!window.isSecureContext) return 'insecure'
  if (isIOS() && !isStandalone()) return 'needs-install'
  if (!supported()) return 'unsupported'
  if (Notification.permission === 'denied') return 'denied'
  const reg = await navigator.serviceWorker.getRegistration()
  const sub = await reg?.pushManager.getSubscription()
  return sub && Notification.permission === 'granted' ? 'on' : 'off'
}

function urlBase64ToUint8Array(base64: string) {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4)
  const raw = atob((base64 + padding).replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from(raw, c => c.charCodeAt(0))
}

/** Asks permission and subscribes this device for the logged-in user. */
export async function enablePush(): Promise<PushState> {
  const state = await getPushState()
  if (state !== 'off' && state !== 'on') return state
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') return permission === 'denied' ? 'denied' : 'off'
  // The service worker is registered by vite-plugin-pwa on load.
  const reg = await navigator.serviceWorker.ready
  const { publicKey } = await api.get<{ publicKey: string }>('/api/push/public-key')
  let sub = await reg.pushManager.getSubscription()
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(publicKey) })
  await api.post('/api/push/subscribe', sub.toJSON())
  return 'on'
}

export async function disablePush(): Promise<PushState> {
  try {
    const reg = await navigator.serviceWorker?.getRegistration()
    const sub = await reg?.pushManager.getSubscription()
    if (sub) {
      await api.post('/api/push/unsubscribe', { endpoint: sub.endpoint }).catch(() => {})
      await sub.unsubscribe().catch(() => {})
    }
  } catch { /* best effort */ }
  return 'off'
}

export async function sendTestPush() {
  return api.post<{ sent: number }>('/api/push/test', {})
}

/**
 * After login on a device that already allowed notifications: the device
 * now belongs to whoever is logged in (a shared register changes hands).
 */
export async function resyncPush() {
  try {
    if (!window.isSecureContext || !supported() || Notification.permission !== 'granted') return
    const reg = await navigator.serviceWorker.getRegistration()
    const sub = await reg?.pushManager.getSubscription()
    if (sub) await api.post('/api/push/subscribe', sub.toJSON())
  } catch { /* best effort */ }
}

/**
 * Logout: stop this device's notifications for the user leaving, so the
 * next person at a shared register doesn't get their messages. The browser
 * permission stays; logging in again re-links it (resyncPush).
 */
export async function forgetDeviceOnLogout() {
  try {
    if (!supported()) return
    const reg = await navigator.serviceWorker.getRegistration()
    const sub = await reg?.pushManager.getSubscription()
    if (sub) await api.post('/api/push/unsubscribe', { endpoint: sub.endpoint })
  } catch { /* best effort */ }
}
