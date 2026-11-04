// Web Push for the teacher portal: notifications that reach the teacher's
// phone even with the portal closed (Android: Chrome; iPhone: only once the
// portal was added to the home screen, iOS 16.4+).
//
// Keys: VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY from .env when set, otherwise a
// pair generated once and kept in WEB_PUSH_CONFIG — so a fresh deployment
// works without any setup. VAPID_SUBJECT (mailto: or https:) is recommended
// in production: Apple's push service rejects some subjects.

import webpush from 'web-push'
import { prisma } from './prisma.js'

let keysPromise: Promise<{ publicKey: string; privateKey: string }> | null = null

export function getVapidKeys() {
  keysPromise ??= (async () => {
    if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
      return { publicKey: process.env.VAPID_PUBLIC_KEY, privateKey: process.env.VAPID_PRIVATE_KEY }
    }
    const saved = await prisma.webPushConfig.findFirst({ orderBy: { createdAt: 'asc' } })
    if (saved) return { publicKey: saved.publicKey, privateKey: saved.privateKey }
    const generated = webpush.generateVAPIDKeys()
    await prisma.webPushConfig.create({ data: generated })
    return generated
  })().catch(err => { keysPromise = null; throw err })
  return keysPromise
}

async function subject() {
  if (process.env.VAPID_SUBJECT) return process.env.VAPID_SUBJECT
  const cfg = await prisma.portalConfig.findFirst({ where: { isActive: true }, select: { email: true } })
  return cfg?.email ? `mailto:${cfg.email}` : 'mailto:notificaciones@example.com'
}

export type PushPayload = {
  title: string
  body: string
  /** Portal path the notification opens, e.g. /orders/abc or /messages */
  url?: string
  tag?: string
}

type Sub = { id: string; endpoint: string; p256dh: string; auth: string }

// Shared sender. Never throws: a notification is a courtesy on top of the
// in-app badge/inbox, it must not fail the request that triggered it.
// Devices that unsubscribed (404/410) are forgotten via `forget`.
async function sendToSubs(subs: Sub[], payload: PushPayload, touch: (id: string) => Promise<unknown>, forget: (id: string) => Promise<unknown>): Promise<number> {
  if (subs.length === 0) return 0
  const [{ publicKey, privateKey }, sub] = await Promise.all([getVapidKeys(), subject()])
  // timeout: a slow push service must never hold the request that triggered it.
  const options = { vapidDetails: { subject: sub, publicKey, privateKey }, TTL: 3 * 24 * 3600, timeout: 10_000 }
  const body = JSON.stringify(payload)
  let sent = 0
  await Promise.all(subs.map(async s => {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, body, options)
      sent++
      await touch(s.id).catch(() => {})
    } catch (err: any) {
      if (err?.statusCode === 404 || err?.statusCode === 410) {
        await forget(s.id).catch(() => {})
      } else {
        console.warn('[push] envío falló', err?.statusCode ?? '', err?.body ?? err?.message)
      }
    }
  }))
  return sent
}

/** Sends to every device of the teacher (portal). */
export async function notifyTeacher(teacherId: string, payload: PushPayload): Promise<number> {
  try {
    const subs = await prisma.pushSubscription.findMany({ where: { teacherId } })
    return await sendToSubs(subs, payload,
      id => prisma.pushSubscription.update({ where: { id }, data: { lastUsedAt: new Date() } }),
      id => prisma.pushSubscription.delete({ where: { id } }))
  } catch (err) {
    console.warn('[push] no se pudo notificar', err)
    return 0
  }
}

/** Fire-and-forget wrapper for route handlers. */
export function notifyTeacherLater(teacherId: string, payload: PushPayload) {
  void notifyTeacher(teacherId, payload)
}

/** Sends to every device of these POS staff users. */
export async function notifyUsers(userIds: string[], payload: PushPayload): Promise<number> {
  const ids = [...new Set(userIds)]
  if (ids.length === 0) return 0
  try {
    const subs = await prisma.userPushSubscription.findMany({ where: { userId: { in: ids }, user: { isActive: true } } })
    return await sendToSubs(subs, payload,
      id => prisma.userPushSubscription.update({ where: { id }, data: { lastUsedAt: new Date() } }),
      id => prisma.userPushSubscription.delete({ where: { id } }))
  } catch (err) {
    console.warn('[push] no se pudo notificar al personal', err)
    return 0
  }
}

export function notifyUsersLater(userIds: string[], payload: PushPayload) {
  void notifyUsers(userIds, payload)
}
