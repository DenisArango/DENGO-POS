// Librería side of PED-2026-006: approve, quote, send the quotation to Gabriela. Records it.
// Usage: node portal_admin.cjs [aprobar|lista]
const path = require('path')
const L = require('./lib.cjs')
const ORDER = 'PED-2026-006'
;(async () => {
  const mode = process.argv[2] || 'aprobar'
  const b = await L.launch(L.DESKTOP), p = await b.newPage()
  p.on('dialog', d => d.accept())
  await p.goto(L.POS + '/login', { waitUntil: 'networkidle0' })
  await p.evaluate(id => localStorage.setItem('selectedStoreId', id), 'cmvtxvvzj00007zd5m6bn27p4')
  await L.loginPos(p)
  await p.goto(L.POS + '/portal/orders', { waitUntil: 'networkidle0' }); await L.sleep(3000)
  await L.shot(p, 'pa_pedidos')
  if (mode === 'lista') { await b.close(); return }
  const rec = await p.screencast({ path: path.join(L.OUT, 'pa_aprobar.webm') })
  await L.sleep(800)
  const row = (await p.$$(`xpath/.//tr[contains(., "${ORDER}")]`))[0]
  const eye = await row.$('button[title="Ver detalle"]')
  await eye.click(); await L.sleep(2200)
  await L.shot(p, 'pa_detalle')
  await L.clickText(p, 'Aprobar Pedido', 'button', { wait: 1800 })
  await L.shot(p, 'pa_aprobar_modal')
  // delivery date/time
  const date = await p.$('input[type=date]'), time = await p.$('input[type=time]')
  if (date) await date.type('20112026')
  if (time) { await time.click(); await time.type('0900AM') }
  await L.sleep(700)
  await L.shot(p, 'pa_aprobar_lleno')
  const okBtns = await p.$$('xpath/.//div[contains(@class,"fixed")]//button[contains(., "Aprobar")]')
  await okBtns[okBtns.length - 1].click(); await L.sleep(2500)
  await L.shot(p, 'pa_aprobado')
  await L.clickText(p, 'Crear Cotización', 'button', { wait: 2000 })
  await L.shot(p, 'pa_cotizar_modal')
  const sel = await p.$$('select')
  for (const s of sel) {
    const opts = await s.$$eval('option', os => os.map(o => [o.value, o.textContent]))
    const central = opts.find(o => /Central/.test(o[1]))
    if (central) await s.select(central[0])
    else if (opts.length && !(await s.evaluate(e => e.value))) await s.select(opts.find(o => o[0])?.[0] ?? '')
  }
  await L.sleep(700)
  await L.shot(p, 'pa_cotizar_lleno')
  const qBtns = await p.$$('xpath/.//div[contains(@class,"fixed")]//button[contains(., "Cotiz") or contains(., "Crear")]')
  await qBtns[qBtns.length - 1].click(); await L.sleep(3000)
  await L.shot(p, 'pa_cotizado')
  await L.clickText(p, 'Enviar cotización al maestro', 'button', { wait: 3000 }).catch(e => console.log(e.message))
  await L.shot(p, 'pa_enviada')
  await rec.stop()
  console.log(await p.evaluate(() => document.body.innerText.slice(-900)))
  await b.close()
})().catch(e => { console.error(e); process.exit(1) })
