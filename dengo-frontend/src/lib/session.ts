import type { User } from '../types'

// The user the POS keeps after a login, from the backend's session payload
// (POST /api/auth/login and /api/auth/handoff answer the same shape).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function toSessionUser(u: any): User {
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    role: u.role,
    branchId: u.branchId,
    branchIds: u.branchIds,
    permissions: u.permissions,
    branch: {
      id: u.branch.id,
      name: u.branch.name,
      code: u.branch.code,
      type: u.branch.type,
      address: u.branch.address,
      city: u.branch.city,
      phone: u.branch.phone,
      email: u.branch.email,
      manager: u.branch.manager,
      status: u.branch.status,
      openTime: u.branch.openTime,
      closeTime: u.branch.closeTime,
      config: {
        currency: u.branch.currency,
        timezone: u.branch.timezone,
        taxRate: Number(u.branch.taxRate),
        printerEnabled: u.branch.printerEnabled,
      },
      createdAt: u.branch.createdAt,
      updatedAt: u.branch.updatedAt,
    },
    createdAt: u.createdAt,
    updatedAt: u.updatedAt,
  }
}
