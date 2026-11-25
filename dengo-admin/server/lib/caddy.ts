import { existsSync } from 'node:fs'
import { readFile, writeFile, rm, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import type { Config } from '../config.js'
import type { Sh } from './shell.js'

const T = '\t'

/** POS of one client: its API to the backend, everything else the shared frontend build. */
export function renderCaddyPos(domain: string, apiPort: number, frontendDist: string): string {
  return [
    `pos.${domain} {`,
    `${T}encode zstd gzip`,
    `${T}handle /api/* {`,
    `${T}${T}reverse_proxy 127.0.0.1:${apiPort}`,
    `${T}}`,
    `${T}handle {`,
    `${T}${T}root * ${frontendDist}`,
    `${T}${T}try_files {path} /index.html`,
    `${T}${T}file_server`,
    `${T}}`,
    `}`,
  ].join('\n')
}

/** Public website of one client (dengo-web), with its /api to the same backend. */
export function renderCaddyWeb(domain: string, apiPort: number, webPort: number): string {
  return [
    `${domain}, www.${domain} {`,
    `${T}encode zstd gzip`,
    `${T}handle /api/* {`,
    `${T}${T}reverse_proxy 127.0.0.1:${apiPort}`,
    `${T}}`,
    `${T}handle {`,
    `${T}${T}reverse_proxy 127.0.0.1:${webPort}`,
    `${T}}`,
    `}`,
  ].join('\n')
}

export function renderClientCaddy(name: string, o: { domain: string; apiPort: number; web: boolean; webPort: number | null; frontendDist: string }) {
  const parts = [`# ${name} — escrito por dengo-admin; los cambios a mano se pierden al volver a aplicar desde el panel`, renderCaddyPos(o.domain, o.apiPort, o.frontendDist)]
  if (o.web && o.webPort) parts.push(renderCaddyWeb(o.domain, o.apiPort, o.webPort))
  return parts.join('\n\n') + '\n'
}

export const caddyFile = (c: Config, name: string) => join(c.caddyDir, `${name}.caddy`)

/**
 * Writes (or with null, removes) a client's Caddy file, validates the whole config and
 * reloads. If validation fails the previous file is put back and nothing is reloaded.
 */
export async function applyCaddy(c: Config, sh: Sh, name: string, content: string | null, log: (l: string) => void = () => {}) {
  await mkdir(c.caddyDir, { recursive: true })
  const file = caddyFile(c, name)
  const before = existsSync(file) ? await readFile(file, 'utf8') : null
  if (content === null) await rm(file, { force: true })
  else await writeFile(file, content)

  const v = await sh('sudo', ['-n', 'caddy', 'validate', '--config', '/etc/caddy/Caddyfile'], { onLine: log })
  if (v.code !== 0) {
    if (before === null) await rm(file, { force: true })
    else await writeFile(file, before)
    throw new Error('Caddy rechazó la configuración; se dejó como estaba')
  }
  const r = await sh('sudo', ['-n', 'systemctl', 'reload', 'caddy'], { onLine: log })
  if (r.code !== 0) throw new Error('No se pudo recargar Caddy (revisa el permiso de sudo en «Servidor»)')
}
