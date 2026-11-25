import { defineMiddleware } from 'astro:middleware'
import { getSuspension } from './core/api'

const KEY = /^[a-z0-9-]{2,60}$/

// Demos only (WEB_ALLOW_SWITCH=1): ?diseno=<key> picks a design and a cookie
// keeps it while the visitor clicks around; ?diseno= with no value clears it.
const esc = (t: string) => t.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)
const suspendedPage = (message: string | null) => `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Servicio suspendido</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;font-family:system-ui,sans-serif;background:linear-gradient(135deg,#f8fafc,#fff,#fff7ed);color:#0f172a;padding:24px}
.c{max-width:420px;background:#fff;border-radius:24px;padding:32px;text-align:center;box-shadow:0 24px 60px -20px rgba(30,77,104,.35),0 0 0 1px rgba(15,23,42,.05)}
.i{width:64px;height:64px;margin:0 auto 20px;border-radius:16px;background:linear-gradient(135deg,#E07A5F,#c4553a);display:grid;place-items:center;color:#fff;font-size:28px}
h1{margin:0;font-size:24px}p{color:#475569}small{color:#64748b}</style></head>
<body><div class="c"><div class="i">❚❚</div><h1>Servicio suspendido</h1><p>${esc(message || 'Este sitio no está disponible temporalmente.')}</p><small>Vuelve a visitarnos pronto.</small></div></body></html>`

export const onRequest = defineMiddleware(async (ctx, next) => {
  // The vendor suspended this client (dengo-admin): every page shows the notice.
  const suspended = await getSuspension()
  if (suspended) return new Response(suspendedPage(suspended.message), { status: 503, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'retry-after': '3600' } })

  if (process.env.WEB_ALLOW_SWITCH !== '1') return next()

  const q = ctx.url.searchParams.get('diseno')
  if (q !== null) {
    if (KEY.test(q)) ctx.cookies.set('diseno', q, { path: '/', httpOnly: true, sameSite: 'lax', maxAge: 60 * 60 * 12 })
    else ctx.cookies.delete('diseno', { path: '/' })
  }
  const v = q !== null ? q : ctx.cookies.get('diseno')?.value
  if (v && KEY.test(v)) ctx.locals.diseno = v

  // The page now depends on a cookie: don't let a cache serve it to someone else.
  const res = await next()
  res.headers.set('Cache-Control', 'no-store')
  return res
})
