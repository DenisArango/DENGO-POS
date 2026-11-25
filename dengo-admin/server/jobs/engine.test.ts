import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, existsSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { JobManager, waitJob, type Step } from './engine.js'
import { loadConfig } from '../config.js'
import { makeShell } from '../lib/shell.js'

const config = loadConfig({ ADMIN_MODE: 'simulate', ADMIN_PASSWORD_HASH: 'x', SESSION_SECRET: 'y', DENGO_ROOT: mkdtempSync(join(tmpdir(), 'dadm-job-')) })
const sh = makeShell('simulate')

test('si el paso 3 falla, se deshacen 2 y 1 en ese orden', async () => {
  const m = new JobManager(config, sh)
  const order: string[] = []
  const step = (id: string, fail = false): Step => ({
    id, title: id,
    run: async (ctx) => { if (fail) throw new Error(`falló ${id}`); ctx.data[id] = true; order.push(`run ${id}`) },
    undo: async () => { order.push(`undo ${id}`) },
  })
  const job = m.start({ kind: 'test', title: 'prueba', client: 'A', steps: [step('uno'), step('dos'), step('tres', true), step('cuatro')] })
  const end = await waitJob(m, job.id)
  assert.equal(end.status, 'rolled_back')
  assert.deepEqual(order, ['run uno', 'run dos', 'undo dos', 'undo uno'])
  assert.deepEqual(end.steps.map(s => s.status), ['undone', 'undone', 'failed', 'pending'])
  assert.equal(end.error, 'falló tres')
})

test('candado: un segundo trabajo del mismo cliente se rechaza; otro cliente sí entra', async () => {
  const m = new JobManager(config, sh)
  let release!: () => void
  const gate = new Promise<void>(r => { release = r })
  const a = m.start({ kind: 't', title: 't', client: 'A', steps: [{ id: 'x', title: 'x', run: () => gate }] })
  assert.throws(() => m.start({ kind: 't', title: 't', client: 'A', steps: [] }), /trabajo en curso/)
  assert.throws(() => m.start({ kind: 't', title: 't', client: null, steps: [] }), /trabajo en curso/)
  const b = m.start({ kind: 't', title: 't', client: 'B', steps: [] })
  await waitJob(m, b.id)
  release()
  assert.equal((await waitJob(m, a.id)).status, 'ok')
})

test('el resultado (contraseñas) no se guarda en disco; el aviso marca warning', async () => {
  const m = new JobManager(config, sh)
  const job = m.start({ kind: 't', title: 't', client: 'C', steps: [
    { id: 'a', title: 'a', run: async (ctx) => { ctx.result.password = 'secreta-123'; ctx.warn('DNS pendiente') } },
  ] })
  const end = await waitJob(m, job.id)
  assert.equal(end.result?.password, 'secreta-123')
  assert.equal(end.steps[0]!.status, 'warning')
  const file = join(config.adminDir, 'jobs', `${job.id}.json`)
  assert.ok(existsSync(file))
  assert.ok(!readFileSync(file, 'utf8').includes('secreta-123'))
})
