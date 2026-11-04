// Web Push on the teacher's device. Everything here degrades quietly: a
// browser without support just shows the guide explaining what to do.

import { api } from './api'

export type Platform = 'ios' | 'android' | 'desktop'

export function detectPlatform(): Platform {
  const ua = navigator.userAgent
  // iPadOS 13+ reports itself as a Mac with touch.
  if (/iPhone|iPad|iPod/i.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return 'ios'
  if (/Android/i.test(ua)) return 'android'
  return 'desktop'
}

/** Opened from the home-screen icon (required for notifications on iPhone). */
export function isStandalone(): boolean {
  return window.matchMedia?.('(display-mode: standalone)').matches || (navigator as any).standalone === true
}

export function pushSupported(): boolean {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
}

export type PushState =
  | 'unsupported'      // this browser can't (old iOS, in-app browsers…)
  | 'needs-install'    // iPhone/iPad: add to home screen first
  | 'denied'           // the teacher blocked them: must re-enable in settings
  | 'off'              // can be turned on now
  | 'on'

export async function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return null
  try {
    return await navigator.serviceWorker.register('/sw.js')
  } catch {
    return null
  }
}

export async function getPushState(): Promise<PushState> {
  if (detectPlatform() === 'ios' && !isStandalone()) return 'needs-install'
  if (!pushSupported()) return 'unsupported'
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

/** Asks permission and subscribes this device. Returns the new state. */
export async function enablePush(): Promise<PushState> {
  if (!pushSupported()) return 'unsupported'
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') return permission === 'denied' ? 'denied' : 'off'
  const reg = (await navigator.serviceWorker.getRegistration()) ?? (await registerServiceWorker())
  if (!reg) return 'unsupported'
  await navigator.serviceWorker.ready
  const { publicKey } = await api.getPushPublicKey()
  let sub = await reg.pushManager.getSubscription()
  if (!sub) {
    sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(publicKey) })
  }
  await api.subscribePush(sub.toJSON())
  return 'on'
}

export async function disablePush(): Promise<PushState> {
  const reg = await navigator.serviceWorker?.getRegistration()
  const sub = await reg?.pushManager.getSubscription()
  if (sub) {
    await api.unsubscribePush(sub.endpoint).catch(() => {})
    await sub.unsubscribe().catch(() => {})
  }
  return 'off'
}

/** After login: re-send an existing subscription so it follows this teacher. */
export async function resyncPush() {
  try {
    if (!pushSupported() || Notification.permission !== 'granted') return
    const reg = await navigator.serviceWorker.getRegistration()
    const sub = await reg?.pushManager.getSubscription()
    if (sub) await api.subscribePush(sub.toJSON())
  } catch { /* best effort */ }
}
