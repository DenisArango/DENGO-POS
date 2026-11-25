import type { FastifyInstance } from 'fastify'
import type { Config } from '../config.js'
import { services } from '../lib/services.js'
import { provisionSchema, provisionSteps, planClient } from '../jobs/provision.js'

const issues = (e: { issues: { path: (string | number)[]; message: string }[] }) =>
  e.issues.map(i => ({ path: i.path.join('.'), message: i.message }))

export async function provisionRoutes(app: FastifyInstance, { config }: { config: Config }) {
  const { jobs } = services(config)

  // What the wizard needs to know about the panel itself.
  app.get('/api/provision/defaults', async () => ({
    mode: config.mode,
    hasAnthropicKey: !!config.globals.anthropicKey,
    hasDigifact: !!config.globals.digifactUser && !!config.globals.digifactPassword,
    serverIp: config.serverIp,
  }))

  // Preview: folder, database and ports the new client would get.
  app.post('/api/clients/plan', async (req, reply) => {
    const body = provisionSchema.safeParse(req.body)
    if (!body.success) return reply.status(400).send({ error: 'Revisa los datos', issues: issues(body.error) })
    return planClient(config, body.data)
  })

  app.post('/api/clients', async (req, reply) => {
    const body = provisionSchema.safeParse(req.body)
    if (!body.success) return reply.status(400).send({ error: 'Revisa los datos', issues: issues(body.error) })
    try {
      const job = jobs.start({ kind: 'provision', title: `Alta de ${body.data.displayName}`, client: 'alta', steps: provisionSteps(config, body.data) })
      // client 'alta' = one alta at a time: ports are only reserved when cliente.json is written at the end
      return reply.status(202).send({ jobId: job.id })
    } catch (e: any) {
      return reply.status(e.statusCode ?? 500).send({ error: e.message, jobId: e.jobId })
    }
  })
}
