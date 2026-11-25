import type { FastifyInstance } from 'fastify'
import type { Config } from '../config.js'
import { services } from '../lib/services.js'

export async function jobRoutes(app: FastifyInstance, { config }: { config: Config }) {
  const { jobs } = services(config)

  app.get('/api/jobs', async () => ({ jobs: jobs.list() }))

  app.get<{ Params: { id: string } }>('/api/jobs/:id', async (req, reply) => {
    const j = jobs.get(req.params.id)
    return j ?? reply.status(404).send({ error: 'No existe ese trabajo' })
  })

  // Server-sent events: the log so far, then each new line/step until the job ends.
  app.get<{ Params: { id: string } }>('/api/jobs/:id/stream', async (req, reply) => {
    const j = jobs.get(req.params.id)
    if (!j) return reply.status(404).send({ error: 'No existe ese trabajo' })
    reply.hijack()
    const res = reply.raw
    res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive', 'x-accel-buffering': 'no' })
    const send = (event: string, data: unknown) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
    send('snapshot', j)
    if (j.status !== 'running') { send('done', j); res.end(); return }
    const ping = setInterval(() => res.write(': ping\n\n'), 15_000)
    const off = jobs.subscribe(j.id, (e) => {
      if (e.type === 'line') send('line', e.line)
      else if (e.type === 'step') send('step', { index: e.index, step: e.step })
      else { send('done', e.job); cleanup(); res.end() }
    })
    const cleanup = () => { clearInterval(ping); off() }
    req.raw.on('close', cleanup)
  })
}
