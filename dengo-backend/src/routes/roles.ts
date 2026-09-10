import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { log } from '../services/audit.service.js'
import { PERMISSION_CATALOG, ALL_PERMISSION_KEYS, requirePermission } from '../lib/permissions.js'

const roleInclude = { permissions: { select: { permissionKey: true } }, _count: { select: { users: true } } }

function serializeRole(role: { id: string; name: string; description: string | null; isSystem: boolean; permissions: { permissionKey: string }[]; _count: { users: number } }) {
  return {
    id: role.id,
    name: role.name,
    description: role.description,
    isSystem: role.isSystem,
    userCount: role._count.users,
    permissions: role.permissions.map(p => p.permissionKey),
  }
}

const permissionsSchema = z.array(z.enum(ALL_PERMISSION_KEYS as [string, ...string[]]))

export default async function roleRoutes(fastify: FastifyInstance) {
  // GET /api/roles/catalog — the fixed list of gate-able permission keys, for the admin UI
  fastify.get('/catalog', { preHandler: [fastify.authenticate, requirePermission('settings.roles')] }, async (_request, reply) => {
    return reply.send(PERMISSION_CATALOG)
  })

  fastify.get('/', { preHandler: [fastify.authenticate, requirePermission('settings.roles')] }, async (_request, reply) => {
    const roles = await prisma.role.findMany({ include: roleInclude, orderBy: { createdAt: 'asc' } })
    return reply.send(roles.map(serializeRole))
  })

  fastify.post('/', { preHandler: [fastify.authenticate, requirePermission('settings.roles')] }, async (request, reply) => {
    const body = z.object({
      name: z.string().min(2).max(60),
      description: z.string().max(300).optional(),
      permissions: permissionsSchema.default([]),
    }).safeParse(request.body)
    if (!body.success) return reply.status(400).send({ error: body.error.flatten() })

    try {
      const role = await prisma.role.create({
        data: {
          name: body.data.name,
          ...(body.data.description !== undefined ? { description: body.data.description } : {}),
          isSystem: false,
          permissions: { create: body.data.permissions.map(permissionKey => ({ permissionKey })) },
        },
        include: roleInclude,
      })
      await log({ userId: request.user.id, action: 'CREATE', entity: 'Role', entityId: role.id })
      return reply.status(201).send(serializeRole(role))
    } catch (err: any) {
      if (err.code === 'P2002') return reply.status(409).send({ error: 'Ya existe un rol con ese nombre' })
      throw err
    }
  })

  // PUT /api/roles/:id — rename (custom roles only) and/or replace the permission set (any role, including system ones)
  fastify.put('/:id', { preHandler: [fastify.authenticate, requirePermission('settings.roles')] }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const body = z.object({
      name: z.string().min(2).max(60).optional(),
      description: z.string().max(300).optional(),
      permissions: permissionsSchema.optional(),
    }).safeParse(request.body)
    if (!body.success) return reply.status(400).send({ error: body.error.flatten() })

    const existing = await prisma.role.findUnique({ where: { id } })
    if (!existing) return reply.status(404).send({ error: 'Rol no encontrado' })
    if (existing.isSystem && body.data.name && body.data.name !== existing.name) {
      return reply.status(400).send({ error: 'No se puede renombrar un rol del sistema' })
    }

    const role = await prisma.$transaction(async (tx) => {
      if (body.data.permissions) {
        await tx.rolePermission.deleteMany({ where: { roleId: id } })
        await tx.rolePermission.createMany({ data: body.data.permissions.map(permissionKey => ({ roleId: id, permissionKey })) })
      }
      return tx.role.update({
        where: { id },
        data: {
          ...(body.data.name ? { name: body.data.name } : {}),
          ...(body.data.description !== undefined ? { description: body.data.description } : {}),
        },
        include: roleInclude,
      })
    })

    await log({ userId: request.user.id, action: 'UPDATE', entity: 'Role', entityId: id })
    return reply.send(serializeRole(role))
  })

  fastify.delete('/:id', { preHandler: [fastify.authenticate, requirePermission('settings.roles')] }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const existing = await prisma.role.findUnique({ where: { id }, include: { _count: { select: { users: true } } } })
    if (!existing) return reply.status(404).send({ error: 'Rol no encontrado' })
    if (existing.isSystem) return reply.status(400).send({ error: 'No se puede eliminar un rol del sistema' })
    if (existing._count.users > 0) return reply.status(400).send({ error: 'Reasigna a los usuarios de este rol antes de eliminarlo' })

    // RolePermission has onDelete: NoAction, so its rows must go first or
    // the FK constraint rejects the role delete outright.
    await prisma.$transaction([
      prisma.rolePermission.deleteMany({ where: { roleId: id } }),
      prisma.role.delete({ where: { id } }),
    ])
    await log({ userId: request.user.id, action: 'DELETE', entity: 'Role', entityId: id })
    return reply.send({ message: 'Rol eliminado' })
  })
}
