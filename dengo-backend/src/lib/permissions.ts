import type { FastifyReply, FastifyRequest } from 'fastify'
import { prisma } from './prisma.js'

/**
 * The full catalog of permission keys the system understands, grouped by
 * module for the "Roles y Permisos" admin screen. Adding a new gated action
 * means adding its key here AND to a DEFAULT_PERMISSIONS set below (or
 * leaving it out of every default so only a custom role can grant it).
 */
export const PERMISSION_CATALOG = {
  sales: ['sales.view', 'sales.create', 'sales.cancel', 'sales.edit', 'sales.discount'],
  inventory: ['inventory.view', 'inventory.create', 'inventory.edit', 'inventory.delete', 'inventory.editPrice', 'inventory.adjust', 'inventory.transfer'],
  customers: ['customers.view', 'customers.create', 'customers.edit', 'customers.delete', 'customers.editCredit', 'customers.registerPayment'],
  suppliers: ['suppliers.view', 'suppliers.create', 'suppliers.edit', 'suppliers.delete'],
  cash: ['cash.open', 'cash.close', 'cash.movements'],
  // Just one key: this business receives merchandise directly into stock
  // (POST /api/inventory/intake), no formal purchase-order document to
  // create/view/cancel against — that fuller PurchaseOrder API existed at
  // one point but was never wired to any screen, and was removed.
  purchases: ['purchases.receive'],
  transfers: ['transfers.view', 'transfers.create', 'transfers.approve', 'transfers.receive', 'transfers.reject'],
  quotations: ['quotations.view', 'quotations.create', 'quotations.convert'],
  reports: ['reports.sales', 'reports.inventory', 'reports.financial', 'reports.audit'],
  settings: ['settings.users', 'settings.roles', 'settings.stores', 'settings.system', 'settings.cashRegisters'],
  goals: ['goals.manage'],
} as const

export type PermissionKey =
  (typeof PERMISSION_CATALOG)[keyof typeof PERMISSION_CATALOG][number]

export const ALL_PERMISSION_KEYS: readonly string[] = Object.values(PERMISSION_CATALOG).flat()

/** Permission keys the previous catalog used that no longer exist — ensureSystemRoles() migrates any system role still holding one of these. */
const RENAMED_PERMISSIONS: Record<string, readonly string[]> = {
  'inventory.manage': ['inventory.create', 'inventory.edit', 'inventory.delete', 'inventory.editPrice'],
}

/**
 * Default permission set for each of the 4 legacy roles (User.role), chosen
 * to exactly reproduce the access every non-ADMIN role already had in code
 * before permissions existed: everything day-to-day, nothing that was
 * previously hardcoded to `role !== 'ADMIN'`. The one deliberate exception is
 * `customers.editCredit` — limit de crédito y comentarios quedan fuera de los
 * 3 roles no-admin a propósito (pedido explícito, no comportamiento previo).
 * ADMIN is not listed — it always bypasses permission checks entirely (see
 * hasPermission below), so it can never be locked out regardless of what
 * roles exist.
 */
const DEFAULT_ROLE_PERMISSIONS: Record<string, readonly string[]> = {
  AUDITOR: [
    'sales.view', 'sales.create',
    'inventory.view', 'inventory.create', 'inventory.edit', 'inventory.delete', 'inventory.editPrice', 'inventory.adjust', 'inventory.transfer',
    'customers.view', 'customers.create', 'customers.edit', 'customers.registerPayment',
    'suppliers.view', 'suppliers.create', 'suppliers.edit',
    'cash.open', 'cash.close', 'cash.movements',
    'purchases.receive',
    'transfers.view', 'transfers.create', 'transfers.receive',
    'quotations.view', 'quotations.create', 'quotations.convert',
    'reports.sales', 'reports.inventory', 'reports.financial', 'reports.audit',
  ],
  INVENTORY_CONTROL: [
    'sales.view', 'sales.create',
    'inventory.view', 'inventory.create', 'inventory.edit', 'inventory.delete', 'inventory.editPrice', 'inventory.adjust', 'inventory.transfer',
    'customers.view', 'customers.create', 'customers.edit', 'customers.registerPayment',
    'suppliers.view', 'suppliers.create', 'suppliers.edit',
    'cash.open', 'cash.close', 'cash.movements',
    'purchases.receive',
    'transfers.view', 'transfers.create', 'transfers.receive',
    'quotations.view', 'quotations.create', 'quotations.convert',
    'reports.sales', 'reports.inventory', 'reports.financial',
  ],
  OPERATOR: [
    'sales.view', 'sales.create',
    'inventory.view', 'inventory.create', 'inventory.edit', 'inventory.delete', 'inventory.editPrice', 'inventory.adjust', 'inventory.transfer',
    'customers.view', 'customers.create', 'customers.edit', 'customers.registerPayment',
    'suppliers.view', 'suppliers.create', 'suppliers.edit',
    'cash.open', 'cash.close', 'cash.movements',
    'purchases.receive',
    'transfers.view', 'transfers.create', 'transfers.receive',
    'quotations.view', 'quotations.create', 'quotations.convert',
    'reports.sales', 'reports.inventory', 'reports.financial',
  ],
}

/**
 * The permission set to embed in a user's JWT at login. If the user has a
 * custom role assigned (User.customRoleId), that role's permissions win;
 * otherwise fall back to the legacy role's built-in default above.
 */
export async function resolveUserPermissions(user: { role: string; customRoleId?: string | null }): Promise<string[]> {
  if (user.customRoleId) {
    const rows = await prisma.rolePermission.findMany({
      where: { roleId: user.customRoleId },
      select: { permissionKey: true },
    })
    return rows.map(r => r.permissionKey)
  }
  return [...(DEFAULT_ROLE_PERMISSIONS[user.role] ?? [])]
}

/** True if the request's user may perform `key` — ADMIN always bypasses. */
export function hasPermission(request: FastifyRequest, key: PermissionKey): boolean {
  return request.user.role === 'ADMIN' || (request.user.permissions ?? []).includes(key)
}

/** Fastify preHandler: 403s unless the user has `key` (ADMIN always passes). */
export function requirePermission(key: PermissionKey) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    if (!hasPermission(request, key)) {
      return reply.status(403).send({ error: 'No tienes permiso para esta acción' })
    }
  }
}

/**
 * Creates the 4 legacy roles as real, editable Role rows if they don't exist
 * yet (idempotent — safe to call on every boot), and migrates any system
 * role still holding a renamed/retired permission key (RENAMED_PERMISSIONS)
 * to its replacement(s). Never touches a custom (isSystem: false) role's
 * permissions — those are the admin's own choice and are left alone even if
 * they happen to reference an old key.
 */
export async function ensureSystemRoles(): Promise<void> {
  const systemRoles: { name: string; description: string; permissions: readonly string[] }[] = [
    { name: 'ADMIN', description: 'Acceso completo a todas las funciones del sistema', permissions: ALL_PERMISSION_KEYS },
    { name: 'AUDITOR', description: 'Solo lectura y generación de reportes, incluida auditoría', permissions: DEFAULT_ROLE_PERMISSIONS.AUDITOR ?? [] },
    { name: 'INVENTORY_CONTROL', description: 'Control y gestión de inventario', permissions: DEFAULT_ROLE_PERMISSIONS.INVENTORY_CONTROL ?? [] },
    { name: 'OPERATOR', description: 'Operaciones de venta y caja', permissions: DEFAULT_ROLE_PERMISSIONS.OPERATOR ?? [] },
  ]

  for (const role of systemRoles) {
    const existing = await prisma.role.findUnique({ where: { name: role.name }, include: { permissions: true } })
    if (!existing) {
      await prisma.role.create({
        data: {
          name: role.name,
          description: role.description,
          isSystem: true,
          permissions: { create: role.permissions.map(permissionKey => ({ permissionKey })) },
        },
      })
      continue
    }

    // Migrate renamed keys on an existing system role (see RENAMED_PERMISSIONS).
    for (const row of existing.permissions) {
      const replacement = RENAMED_PERMISSIONS[row.permissionKey]
      if (!replacement) continue
      await prisma.$transaction([
        prisma.rolePermission.delete({ where: { id: row.id } }),
        ...replacement
          .filter(key => !existing.permissions.some(p => p.permissionKey === key))
          .map(permissionKey => prisma.rolePermission.create({ data: { roleId: existing.id, permissionKey } })),
      ])
    }
  }
}
