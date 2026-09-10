import type { FastifyRequest } from 'fastify'

/** A user's home branch plus any additional branches assigned via UserBranch (JWT-embedded, see auth.ts). */
function allowedBranchIds(request: FastifyRequest): string[] {
  return request.user.branchIds?.length ? request.user.branchIds : [request.user.branchId]
}

/**
 * Resolves the branchId a request is allowed to query.
 * ADMIN: whatever was requested (or none = all branches).
 * Non-admin: the requested branch if it's one they're assigned to (home
 * branch or an additional one via UserBranch); otherwise falls back to their
 * home branch, ignoring what was requested — never trusts the client to
 * request a branch outside what this user is actually assigned to.
 */
export function resolveBranchScope(request: FastifyRequest, requestedBranchId?: string): string | undefined {
  if (request.user.role === 'ADMIN') return requestedBranchId ?? undefined
  if (requestedBranchId && allowedBranchIds(request).includes(requestedBranchId)) return requestedBranchId
  return request.user.branchId
}

/** True if the user is allowed to touch a resource that belongs to resourceBranchId (home branch, an assigned extra branch, or ADMIN). */
export function canAccessBranch(request: FastifyRequest, resourceBranchId: string): boolean {
  return request.user.role === 'ADMIN' || allowedBranchIds(request).includes(resourceBranchId)
}
