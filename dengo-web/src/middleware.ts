import { defineMiddleware } from 'astro:middleware'

const KEY = /^[a-z0-9-]{2,60}$/

// Demos only (WEB_ALLOW_SWITCH=1): ?diseno=<key> picks a design and a cookie
// keeps it while the visitor clicks around; ?diseno= with no value clears it.
export const onRequest = defineMiddleware(async (ctx, next) => {
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
