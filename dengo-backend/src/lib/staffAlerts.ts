// Push notifications for POS staff: who gets which alert, and whether the
// business turned that alert on (Configuración → Notificaciones, "push").
//
// Everything here is fire-and-forget: an alert must never slow down or fail
// the sale/transfer/message that triggered it.

import { prisma } from './prisma.js'
import { resolveUserPermissions, type PermissionKey } from './permissions.js'
import { notifyUsers, type PushPayload } from './webPush.js'

export type StaffEvent =
  | 'internal_message' | 'transfer_pending' | 'transfer_incoming'
  | 'low_stock' | 'out_of_stock' | 'new_sale' | 'new_user'

/** Defaults until the business saves its own preferences. */
export const DEFAULT_NOTIFICATIONS: { event: StaffEvent; email: boolean; push: boolean; sms: boolean }[] = [
  { event: 'internal_message', email: false, push: true, sms: false },
  { event: 'transfer_pending', email: false, push: true, sms: false },
  { event: 'transfer_incoming', email: false, push: true, sms: false },
  { event: 'low_stock', email: true, push: true, sms: false },
  { event: 'out_of_stock', email: true, push: true, sms: true },
  { event: 'new_sale', email: false, push: false, sms: false },
  { event: 'new_user', email: true, push: false, sms: false },
]

async function pushEnabled(event: StaffEvent): Promise<boolean> {
  const row = await prisma.notificationPreference.findUnique({ where: { event } }).catch(() => null)
  if (row) return row.push
  return DEFAULT_NOTIFICATIONS.find(d => d.event === event)?.push ?? false
}

/**
 * Active staff with at least one subscribed device who may act on `branchId`
 * and hold `permission` (ADMIN always). Starts from the subscriptions, which
 * are few, instead of from every user.
 */
async function recipients(opts: { branchId?: string; permission?: PermissionKey; adminsOnly?: boolean; exclude?: string }): Promise<string[]> {
  const users = await prisma.user.findMany({
    where: { isActive: true, role: { not: 'TEACHER' }, pushSubscriptions: { some: {} } },
    select: { id: true, role: true, branchId: true, customRoleId: true, additionalBranches: { select: { branchId: true } } },
  })
  const out: string[] = []
  for (const u of users) {
    if (u.id === opts.exclude) continue
    const isAdmin = u.role === 'ADMIN'
    if (opts.adminsOnly && !isAdmin) continue
    if (!isAdmin && opts.branchId && u.branchId !== opts.branchId && !u.additionalBranches.some(b => b.branchId === opts.branchId)) continue
    if (!isAdmin && opts.permission) {
      const perms = await resolveUserPermissions(u)
      if (!perms.includes(opts.permission)) continue
    }
    out.push(u.id)
  }
  return out
}

async function alert(event: StaffEvent, who: Parameters<typeof recipients>[0], payload: PushPayload) {
  try {
    if (!(await pushEnabled(event))) return
    const ids = await recipients(who)
    if (ids.length) await notifyUsers(ids, payload)
  } catch (err) {
    console.warn('[push] alerta falló', event, err)
  }
}

const later = (p: Promise<unknown>) => { void p }

// ── The alerts ───────────────────────────────────────────────────────────────

export function alertInternalMessage(toUserId: string, fromName: string, body: string, fromUserId: string) {
  later((async () => {
    if (!(await pushEnabled('internal_message'))) return
    await notifyUsers([toUserId], {
      title: `Mensaje de ${fromName}`,
      body: body.length > 140 ? body.slice(0, 137) + '…' : body,
      url: `/messages?user=${fromUserId}`,
      tag: `msg-${fromUserId}`,
    })
  })())
}

export function alertTransferPending(t: { id: string; fromBranchId: string; fromBranch?: { name: string } | null; toBranch?: { name: string } | null; items?: unknown[] }, requestedById: string) {
  later(alert('transfer_pending', { branchId: t.fromBranchId, permission: 'transfers.approve', exclude: requestedById }, {
    title: 'Traslado por aprobar',
    body: `${t.fromBranch?.name ?? 'Origen'} → ${t.toBranch?.name ?? 'Destino'}${t.items ? ` · ${t.items.length} producto(s)` : ''}`,
    url: '/transfers',
    tag: `transfer-${t.id}`,
  }))
}

export function alertTransferIncoming(t: { id: string; toBranchId: string; fromBranch?: { name: string } | null; toBranch?: { name: string } | null }, approvedById: string) {
  later(alert('transfer_incoming', { branchId: t.toBranchId, permission: 'transfers.receive', exclude: approvedById }, {
    title: 'Traslado en camino',
    body: `De ${t.fromBranch?.name ?? 'otra sucursal'} hacia ${t.toBranch?.name ?? 'tu sucursal'}. Recíbelo al llegar.`,
    url: '/transfers',
    tag: `transfer-${t.id}`,
  }))
}

export function alertNewSale(sale: { id: string; branchId: string; total: unknown; invoiceNumber?: string | null }, cashierId: string) {
  later(alert('new_sale', { adminsOnly: true, exclude: cashierId }, {
    title: 'Nueva venta',
    body: `${sale.invoiceNumber ?? ''} · Q${Number(sale.total).toFixed(2)}`.replace(/^ · /, ''),
    url: `/reports/sales/${sale.id}`,
    tag: 'new-sale',
  }))
}

export function alertNewUser(name: string, createdById: string) {
  later(alert('new_user', { adminsOnly: true, exclude: createdById }, {
    title: 'Nuevo usuario',
    body: `Se creó la cuenta de ${name}`,
    url: '/settings/users',
  }))
}

/**
 * Called after every stock change. Alerts only when the quantity CROSSES the
 * line (from above the minimum to at/below it, or from >0 to 0), so a
 * product that stays low doesn't notify on every sale.
 */
export function alertStockChange(productId: string, branchId: string, before: number, after: number) {
  if (after >= before) return
  later((async () => {
    const product = await prisma.product.findUnique({ where: { id: productId }, select: { name: true, minStock: true, isActive: true } })
    if (!product?.isActive) return
    const min = Number(product.minStock ?? 0)
    const branch = await prisma.branch.findUnique({ where: { id: branchId }, select: { name: true } })
    const who = { branchId, permission: 'inventory.view' as PermissionKey }
    if (before > 0 && after <= 0) {
      await alert('out_of_stock', who, {
        title: 'Producto agotado',
        body: `${product.name} se quedó sin existencias en ${branch?.name ?? 'la sucursal'}`,
        url: '/inventory',
        tag: `stock-${productId}-${branchId}`,
      })
    } else if (min > 0 && before > min && after <= min && after > 0) {
      await alert('low_stock', who, {
        title: 'Stock bajo',
        body: `${product.name}: quedan ${after} en ${branch?.name ?? 'la sucursal'} (mínimo ${min})`,
        url: '/inventory',
        tag: `stock-${productId}-${branchId}`,
      })
    }
  })())
}
