#!/usr/bin/env node
// Vigilante del servidor DENGO — corre cada minuto por cron y avisa por
// Telegram cuando algo pasa de su límite. Sin dependencias: solo Node.
//
//   node monitor-servidor.mjs            revisa y avisa (lo que corre el cron)
//   node monitor-servidor.mjs --estado   imprime el estado actual con los límites
//   node monitor-servidor.mjs --prueba   manda un mensaje de prueba a Telegram
//
// Qué vigila:
//   • cada proceso de pm2: caído, reiniciado (con la causa si fue falta de
//     memoria y las últimas líneas de su log de errores), memoria sobre el límite
//   • cada backend: que /api/health conteste (y en cuánto tiempo)
//   • el servidor: RAM disponible, disco, carga de CPU
// Avisa una vez al empezar un problema, lo recuerda cada REPETIR_MIN minutos
// si sigue, y avisa cuando se resuelve.
//
// Configuración: ~/dengo/monitor.env (ver monitor.env.ejemplo junto a este archivo).

import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { homedir, hostname, cpus } from 'node:os'
import { join, dirname } from 'node:path'

// ── Configuración ───────────────────────────────────────────────────────
const CONFIG_FILE = process.env.DENGO_MONITOR_ENV ?? join(homedir(), 'dengo', 'monitor.env')
const STATE_FILE = join(homedir(), '.dengo-monitor-estado.json')

function readEnvFile(path) {
  const out = {}
  if (!existsSync(path)) return out
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/.exec(line)
    if (m && !line.trim().startsWith('#')) out[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
  return out
}

const cfg = { ...readEnvFile(CONFIG_FILE), ...process.env }
const num = (k, d) => (cfg[k] !== undefined && cfg[k] !== '' && !Number.isNaN(Number(cfg[k])) ? Number(cfg[k]) : d)
const LIMITS = {
  memProcesoMB: num('MEMORIA_PROCESO_MB', 1200),   // un proceso de pm2 usando más que esto
  ramLibreMinPct: num('RAM_DISPONIBLE_MIN_PCT', 20), // RAM disponible del servidor por debajo de esto
  discoMaxPct: num('DISCO_MAX_PCT', 85),
  cargaMaxPorCpu: num('CARGA_MAX_POR_CPU', 1.5),    // load average de 5 min / núcleos
  healthMaxMs: num('HEALTH_LENTO_MS', 3000),
  repetirMin: num('REPETIR_MIN', 30),
}
const SERVER = cfg.NOMBRE_SERVIDOR || hostname()

// pm2 vive junto a node (nvm / npm -g); cron no trae ese PATH.
const PATH = `${dirname(process.execPath)}:${process.env.PATH ?? '/usr/bin:/bin'}`
const run = (cmd, args) => execFileSync(cmd, args, { encoding: 'utf8', env: { ...process.env, PATH }, stdio: ['ignore', 'pipe', 'ignore'], timeout: 20_000 })

// ── Telegram ────────────────────────────────────────────────────────────
async function send(text) {
  const token = cfg.TELEGRAM_TOKEN, chat = cfg.TELEGRAM_CHAT_ID
  if (!token || !chat) { console.log(`[sin Telegram configurado]\n${text}\n`); return }
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chat, text: text.slice(0, 4000), disable_web_page_preview: true }),
      signal: AbortSignal.timeout(15_000),
    })
    if (!res.ok) console.error('Telegram respondió', res.status, await res.text())
  } catch (e) {
    console.error('No se pudo enviar a Telegram:', e.message)
  }
}

// ── Mediciones ──────────────────────────────────────────────────────────
function pm2List() {
  try {
    return JSON.parse(run('pm2', ['jlist'])).map(p => ({
      name: p.name,
      status: p.pm2_env?.status,
      restarts: p.pm2_env?.restart_time ?? 0,
      memMB: Math.round((p.monit?.memory ?? 0) / 1048576),
      cpu: p.monit?.cpu ?? 0,
      cwd: p.pm2_env?.pm_cwd,
      script: p.pm2_env?.pm_exec_path ?? '',
      errLog: p.pm2_env?.pm_err_log_path,
    }))
  } catch (e) {
    return null
  }
}

function meminfo() {
  const t = readFileSync('/proc/meminfo', 'utf8')
  const kb = k => Number(new RegExp(`^${k}:\\s+(\\d+)`, 'm').exec(t)?.[1] ?? 0)
  const total = kb('MemTotal'), avail = kb('MemAvailable')
  return { totalMB: Math.round(total / 1024), dispMB: Math.round(avail / 1024), dispPct: Math.round((avail / total) * 100) }
}

function disco() {
  try {
    const line = run('df', ['-P', '/']).trim().split('\n')[1].split(/\s+/)
    return { usoPct: Number(line[4].replace('%', '')), libreGB: Math.round(Number(line[3]) / 1048576) }
  } catch { return null }
}

function carga() {
  const [, five] = readFileSync('/proc/loadavg', 'utf8').split(' ').map(Number)
  const n = cpus().length || 1
  return { carga5: five, nucleos: n, porCpu: five / n }
}

/** Backend port: from the .env in the process's folder (that's where the app
 * reads it). The website processes («…-web») have no /api/health. */
function backendPort(p) {
  if (/-web$/i.test(p.name) || !p.cwd) return null
  const env = readEnvFile(join(p.cwd, '.env'))
  return env.PORT ? Number(env.PORT) : null
}

async function health(port) {
  const started = Date.now()
  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/health`, { signal: AbortSignal.timeout(10_000) })
    return { ok: res.ok, ms: Date.now() - started, status: res.status }
  } catch (e) {
    return { ok: false, ms: Date.now() - started, err: e.name === 'TimeoutError' ? 'no contestó en 10 s' : (e.cause?.code ?? e.message) }
  }
}

/** Kernel OOM kills in the last few minutes (needs read access to the kernel log; skipped if not). */
function oomRecientes() {
  try {
    return run('journalctl', ['-k', '--since', '-3min', '--no-pager', '-q']).split('\n').filter(l => /Out of memory: Killed process/i.test(l))
  } catch { return [] }
}

function tail(path, n) {
  try { return readFileSync(path, 'utf8').trimEnd().split('\n').slice(-n).join('\n') } catch { return '' }
}

// ── Revisión ────────────────────────────────────────────────────────────
async function collect() {
  const procs = pm2List()
  const mem = meminfo()
  const disk = disco()
  const load = carga()
  const healths = {}
  for (const p of procs ?? []) {
    const port = backendPort(p)
    if (port && p.status === 'online') healths[p.name] = { port, ...(await health(port)) }
  }
  return { procs, mem, disk, load, healths }
}

/** Every problem currently present, keyed so the same one isn't re-sent each minute. */
function problems(d) {
  const out = {} // key → message
  if (!d.procs) out['pm2'] = '❌ No se pudo leer pm2 (¿pm2 caído o no instalado para este usuario?)'
  for (const p of d.procs ?? []) {
    if (p.status !== 'online') out[`caido:${p.name}`] = `❌ ${p.name} está «${p.status}» (no está corriendo)`
    if (p.memMB >= LIMITS.memProcesoMB) out[`mem:${p.name}`] = `🧠 ${p.name} usa ${p.memMB} MB de memoria (límite ${LIMITS.memProcesoMB} MB)`
  }
  for (const [name, h] of Object.entries(d.healths)) {
    if (!h.ok) out[`health:${name}`] = `❌ ${name} no responde en el puerto ${h.port}: ${h.err ?? `HTTP ${h.status}`}`
    else if (h.ms >= LIMITS.healthMaxMs) out[`lento:${name}`] = `🐢 ${name} responde lento: ${h.ms} ms (límite ${LIMITS.healthMaxMs} ms)`
  }
  if (d.mem.dispPct < LIMITS.ramLibreMinPct) out['ram'] = `🧠 RAM disponible del servidor: ${d.mem.dispMB} MB de ${d.mem.totalMB} MB (${d.mem.dispPct}%, mínimo ${LIMITS.ramLibreMinPct}%)`
  if (d.disk && d.disk.usoPct >= LIMITS.discoMaxPct) out['disco'] = `💾 Disco al ${d.disk.usoPct}% (quedan ${d.disk.libreGB} GB)`
  if (d.load.porCpu >= LIMITS.cargaMaxPorCpu) out['carga'] = `🔥 Carga de CPU alta: ${d.load.carga5.toFixed(2)} en ${d.load.nucleos} núcleo(s)`
  return out
}

function restartEvents(d, prevState) {
  const msgs = []
  const prev = prevState.restarts ?? {}
  const ooms = oomRecientes()
  for (const p of d.procs ?? []) {
    const before = prev[p.name]
    if (before !== undefined && p.restarts > before) {
      const n = p.restarts - before
      const causa = ooms.length ? `\nCausa probable: el sistema lo mató por FALTA DE MEMORIA (OOM, ${ooms.length} vez/veces en 3 min).` : ''
      const log = p.errLog ? tail(p.errLog, 12) : ''
      msgs.push(`🔄 ${p.name} se reinició ${n} ${n === 1 ? 'vez' : 'veces'} desde la última revisión (total ${p.restarts}).${causa}${log ? `\n\nÚltimas líneas de su log de errores:\n${log}` : ''}`)
    }
  }
  return msgs
}

function estadoTexto(d) {
  const lines = [`Servidor ${SERVER} — ${new Date().toLocaleString('es-GT', { hour12: false })}`, '']
  lines.push(`RAM disponible: ${d.mem.dispMB} MB de ${d.mem.totalMB} MB (${d.mem.dispPct}%)   [avisa bajo ${LIMITS.ramLibreMinPct}%]`)
  if (d.disk) lines.push(`Disco: ${d.disk.usoPct}% usado, ${d.disk.libreGB} GB libres   [avisa desde ${LIMITS.discoMaxPct}%]`)
  lines.push(`Carga CPU (5 min): ${d.load.carga5.toFixed(2)} en ${d.load.nucleos} núcleo(s)   [avisa desde ${(LIMITS.cargaMaxPorCpu * d.load.nucleos).toFixed(1)}]`, '')
  lines.push(`Procesos pm2   [avisa si pasan de ${LIMITS.memProcesoMB} MB o se reinician]`)
  for (const p of d.procs ?? []) {
    const h = d.healths[p.name]
    const hs = h ? (h.ok ? `health ${h.ms} ms` : `health FALLA: ${h.err ?? h.status}`) : ''
    lines.push(`  ${p.status === 'online' ? '✅' : '❌'} ${p.name.padEnd(24)} ${String(p.memMB).padStart(5)} MB  cpu ${String(p.cpu).padStart(3)}%  reinicios ${p.restarts}  ${hs}`)
  }
  if (!d.procs) lines.push('  ❌ no se pudo leer pm2')
  return lines.join('\n')
}

// ── Main ────────────────────────────────────────────────────────────────
const args = process.argv.slice(2)
const d = await collect()

if (args.includes('--estado')) {
  console.log(estadoTexto(d))
  console.log(`\nTelegram: ${cfg.TELEGRAM_TOKEN && cfg.TELEGRAM_CHAT_ID ? 'configurado' : `NO configurado (${CONFIG_FILE})`}`)
  process.exit(0)
}
if (args.includes('--prueba')) {
  await send(`✅ Prueba del monitor de ${SERVER}. Si lees esto, los avisos llegan.\n\n${estadoTexto(d)}`)
  process.exit(0)
}

let state = {}
try { state = JSON.parse(readFileSync(STATE_FILE, 'utf8')) } catch { /* first run */ }
const now = Date.now()
const active = state.active ?? {} // key → { since, lastSent, msg }
const current = problems(d)
const outgoing = []

for (const [key, msg] of Object.entries(current)) {
  const a = active[key]
  if (!a) { active[key] = { since: now, lastSent: now, msg }; outgoing.push(`⚠️ ${msg}`) }
  else if (now - a.lastSent >= LIMITS.repetirMin * 60_000) {
    a.lastSent = now; a.msg = msg
    outgoing.push(`⚠️ Sigue: ${msg} (desde hace ${Math.round((now - a.since) / 60_000)} min)`)
  }
}
for (const key of Object.keys(active)) {
  if (!current[key]) {
    outgoing.push(`✅ Resuelto: ${active[key].msg.replace(/^\S+\s/, '')} (duró ${Math.max(1, Math.round((now - active[key].since) / 60_000))} min)`)
    delete active[key]
  }
}
outgoing.push(...restartEvents(d, state))

if (outgoing.length) await send(`[${SERVER}]\n${outgoing.join('\n\n')}`)

writeFileSync(STATE_FILE, JSON.stringify({
  active,
  // pm2 unreadable this minute: keep the old counts so a restart isn't missed
  restarts: d.procs ? Object.fromEntries(d.procs.map(p => [p.name, p.restarts])) : (state.restarts ?? {}),
  at: new Date(now).toISOString(),
}))
