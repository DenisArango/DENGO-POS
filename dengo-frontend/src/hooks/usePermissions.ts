import { useAuthStore } from '../store'
import type { User } from '../types'

// Mirrors dengo-backend/src/lib/permissions.ts hasPermission() — ADMIN always
// passes, everyone else needs the key in their JWT-derived permission list.
export function userHasPermission(user: User | null, key: string): boolean {
  if (!user) return false
  return user.role === 'ADMIN' || (user.permissions ?? []).includes(key)
}

export function usePermissions() {
  const { user } = useAuthStore()
  return { hasPermission: (key: string) => userHasPermission(user, key) }
}
