import '@fastify/jwt'

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: {
      id: string
      role: string
      branchId: string
      branchIds: string[]
      email: string
      permissions: string[]
    }
    user: {
      id: string
      role: string
      branchId: string
      branchIds: string[]
      email: string
      permissions: string[]
    }
  }
}

declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (request: import('fastify').FastifyRequest, reply: import('fastify').FastifyReply) => Promise<void>
  }
}
