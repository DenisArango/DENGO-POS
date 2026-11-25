import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, readFileSync, existsSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { applyCaddy, caddyFile, renderClientCaddy } from './caddy.js'
import { makeShell } from './shell.js'
import { loadConfig } from '../config.js'

const cfg = () => loadConfig({ ADMIN_MODE: 'simulate', ADMIN_PASSWORD_HASH: 'x', SESSION_SECRET: 'y', DENGO_ROOT: mkdtempSync(join(tmpdir(), 'dadm-caddy-')) })
const failingValidate = makeShell('simulate', (cmd, args) => (cmd === 'sudo' && args.includes('validate') ? { code: 1, out: 'Error: bad' } : undefined))

test('bloques: POS siempre, web solo si tiene página', () => {
  const only = renderClientCaddy('Cli', { domain: 'cli.com', apiPort: 3002, web: false, webPort: null, frontendDist: '/d' })
  assert.match(only, /^pos\.cli\.com \{/m)
  assert.match(only, /reverse_proxy 127\.0\.0\.1:3002/)
  assert.doesNotMatch(only, /www\.cli\.com/)
  const both = renderClientCaddy('Cli', { domain: 'cli.com', apiPort: 3002, web: true, webPort: 4402, frontendDist: '/d' })
  assert.match(both, /^cli\.com, www\.cli\.com \{/m)
  assert.match(both, /reverse_proxy 127\.0\.0\.1:4402/)
})

test('si Caddy rechaza el archivo nuevo, se restaura el anterior y no se recarga', async () => {
  const c = cfg()
  mkdirSync(c.caddyDir, { recursive: true })
  writeFileSync(caddyFile(c, 'Cli'), 'ANTERIOR')
  const lines: string[] = []
  await assert.rejects(applyCaddy(c, failingValidate, 'Cli', 'NUEVO', l => lines.push(l)), /Caddy rechazó/)
  assert.equal(readFileSync(caddyFile(c, 'Cli'), 'utf8'), 'ANTERIOR')
  assert.ok(!lines.some(l => l.includes('reload')))
})

test('archivo nuevo rechazado sin anterior: no queda archivo', async () => {
  const c = cfg()
  await assert.rejects(applyCaddy(c, failingValidate, 'Nuevo', 'X'))
  assert.equal(existsSync(caddyFile(c, 'Nuevo')), false)
})

test('válido: escribe y recarga', async () => {
  const c = cfg()
  const lines: string[] = []
  await applyCaddy(c, makeShell('simulate'), 'Ok', 'BLOQUE', l => lines.push(l))
  assert.equal(readFileSync(caddyFile(c, 'Ok'), 'utf8'), 'BLOQUE')
  assert.ok(lines.some(l => l.includes('systemctl reload caddy')))
})
