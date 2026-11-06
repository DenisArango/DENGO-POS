// Web captures: aurora desktop stills + scroll, plantilla home (current theme), mobile coupon flow (recording).
// Usage: node web.cjs [desktop|plantilla <tag>|coupon]
const path = require('path')
const L = require('./lib.cjs')
const OFFER = 'regreso-a-clases-15-en-cuadernos'

async function desktop() {
  const b = await L.launch(L.DESKTOP), p = await b.newPage()
  await p.goto(L.WEB + '/?diseno=aurora', { waitUntil: 'networkidle0' }); await L.sleep(3500)
  await L.shot(p, 'web_aurora_home')
  const rec = await p.screencast({ path: path.join(L.OUT, 'web_aurora_scroll.webm') })
  await L.sleep(800)
  const h = await p.evaluate(() => document.body.scrollHeight - innerHeight)
  await L.smoothScrollTo(p, Math.min(h, 2600), 9000); await L.sleep(800)
  await rec.stop()
  await p.goto(L.WEB + '/ofertas', { waitUntil: 'networkidle0' }); await L.sleep(3000); await L.shot(p, 'web_aurora_ofertas')
  await p.goto(L.WEB + '/ofertas/' + OFFER, { waitUntil: 'networkidle0' }); await L.sleep(3000); await L.shot(p, 'web_aurora_oferta')
  await p.goto(L.WEB + '/ingresar', { waitUntil: 'networkidle0' }); await L.sleep(3000); await L.shot(p, 'web_aurora_ingresar')
  await p.goto(L.WEB + '/', { waitUntil: 'networkidle0' }); await L.sleep(2500)
  // header with the «Ingresar» button
  await L.shot(p, 'web_aurora_header', { clip: { x: 0, y: 0, width: 1600, height: 140 } })
  await b.close()
}

async function plantilla(tag) {
  const b = await L.launch(L.DESKTOP), p = await b.newPage()
  await p.goto(L.WEB + '/?diseno=plantilla', { waitUntil: 'networkidle0' }); await p.mouse.move(800, 450); await L.sleep(7000)
  await p.evaluate(() => window.scrollTo(0, 900)); await L.sleep(2500); await p.evaluate(() => window.scrollTo(0, 0)); await L.sleep(1500)
  await L.shot(p, 'web_plantilla_' + tag, { clip: { x: 0, y: 0, width: 1600, height: 1800 }, captureBeyondViewport: true })
  await b.close()
}

async function coupon() {
  const b = await L.launch(L.MOBILE), p = await b.newPage()
  await p.goto(L.WEB + '/ofertas/' + OFFER + '?diseno=aurora', { waitUntil: 'networkidle0' }); await L.sleep(2500)
  await L.shot(p, 'm_oferta_top')
  const rec = await p.screencast({ path: path.join(L.OUT, 'm_cupon.webm') })
  await L.sleep(1200)
  const y = await p.evaluate(() => { const f = document.querySelector('form [name=name]'); return f.getBoundingClientRect().top + scrollY - innerHeight * 0.35 })
  await L.smoothScrollTo(p, y, 1800); await L.sleep(600)
  await L.typeSlow(p, 'form [name=name]', 'Carmen López', 90); await L.sleep(300)
  await L.typeSlow(p, 'form [name=phone]', '5512 7788', 90); await L.sleep(600)
  await Promise.all([p.click('form button[type=submit]'), p.waitForNavigation({ waitUntil: 'networkidle0', timeout: 20000 }).catch(() => {})])
  await L.sleep(6500)
  await rec.stop()
  await L.shot(p, 'm_cupon_final')
  console.log('coupon url', p.url())
  await b.close()
}

;(async () => {
  const [mode, arg] = process.argv.slice(2)
  if (!mode || mode === 'desktop') await desktop()
  if (mode === 'plantilla') await plantilla(arg)
  if (!mode || mode === 'coupon') await coupon()
})().catch(e => { console.error(e); process.exit(1) })
