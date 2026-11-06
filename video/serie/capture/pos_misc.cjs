// Remaining admin screens for the series. Usage: node pos_misc.cjs [pages|inventario|hoja|ia]
const L = require('./lib.cjs')
const CENTRAL = 'cmvtxvvzj00007zd5m6bn27p4'
;(async () => {
  const mode = process.argv[2] || 'pages'
  const b = await L.launch(L.DESKTOP), p = await b.newPage()
  p.on('dialog', d => d.accept())
  await p.goto(L.POS + '/login', { waitUntil: 'networkidle0' })
  await p.evaluate(id => localStorage.setItem('selectedStoreId', id), CENTRAL)
  await L.loginPos(p)
  // the dev backend rate-limits (429) when many pages load in a row: pace them and retry an empty page
  const go = async (u, name, wait = 3500) => {
    for (let k = 0; k < 4; k++) {
      await p.goto(L.POS + u, { waitUntil: 'networkidle0' }); await L.sleep(wait)
      const empty = await p.evaluate(() => /No hay (escuelas|programas|pedidos|maestros|paquetes)|Too Many|429/i.test(document.body.innerText))
      if (!empty || u.includes('program-options')) break
      console.log('empty, retrying', u); await L.sleep(20000)
    }
    await L.shot(p, name); await L.sleep(6000)
  }
  if (mode === 'pages') {
    await go('/dashboard', 'x_dashboard', 5000)
    await go('/portal/teachers', 'x_maestros')
    await go('/portal/schools', 'x_escuelas')
    await go('/portal/programs', 'x_programas')
    await go('/portal/program-options', 'x_paquetes')
    await go('/portal/consolidated', 'x_consolidado', 4500)
    await go('/portal/messages', 'x_mensajes')
    await go('/portal/metrics', 'x_metricas', 4500)
    await go('/reports/goals-compliance', 'x_metas', 4500)
    await go('/website?tab=reportes', 'x_rendimiento', 9000)
  }
  if (mode === 'inventario') {
    await go('/inventory', 'x_inventario')
    const s = 'input[placeholder="Buscar por nombre, SKU o código..."]'
    await p.type(s, 'fx-82', { delay: 60 }); await L.sleep(2500)
    await L.shot(p, 'x_inventario_fx82')
    const row = (await p.$$('xpath/.//tr[.//*[normalize-space(.)="Calculadora científica fx-82"]]'))[0]
    if (row) { await (await row.$('button[title="Ver historial SKU"]')).click(); await L.sleep(3000); await L.shot(p, 'x_inventario_historial') } else console.log('no fx-82 row')
    await p.goto(L.POS + '/reports/inventory-movements', { waitUntil: 'networkidle0' }); await L.sleep(4000)
    await L.shot(p, 'x_movimientos')
  }
  if (mode === 'hoja') {
    await p.goto(L.POS + '/portal/orders', { waitUntil: 'networkidle0' }); await L.sleep(2500)
    const row = (await p.$$('xpath/.//tr[contains(., "PED-2026-006")]'))[0]
    await (await row.$('button[title="Ver detalle"]')).click(); await L.sleep(2000)
    await L.shot(p, 'x_pedido_detalle')
    await p.evaluate(() => { window.print = () => {} })
    await L.clickText(p, 'Hoja de preparación', 'button', { wait: 1500 })
    await p.emulateMediaType('print'); await L.sleep(1200)
    await L.shot(p, 'x_hoja', { fullPage: true })
  }
  if (mode === 'mensajes') {
    await go('/portal/messages', 'x_mensajes', 6000)
    await L.clickText(p, 'Gabriela Castillo', '*', { wait: 3000 }).catch(e => console.log(e.message))
    await L.shot(p, 'x_mensajes_gaby')
  }
  if (mode === 'paquetes') {
    await go('/portal/program-options', 'x_paquetes', 4000)
    await L.clickText(p, 'Útiles Escolares', 'button', { last: false, wait: 3500 }).catch(e => console.log(e.message))
    await L.shot(p, 'x_paquetes')
  }
  if (mode === 'ia') {
    await p.goto(L.POS + '/reports/custom', { waitUntil: 'networkidle0' }); await L.sleep(2000)
    const sel = 'input[placeholder^="Ej:"], textarea[placeholder^="Ej:"]'
    await p.type(sel, '¿Qué tengo que reabastecer antes del regreso a clases?', { delay: 40 })
    await L.shot(p, 'x_ia_pregunta')
    await p.keyboard.press('Enter')
    for (let i = 0; i < 80; i++) { await L.sleep(3000); const busy = await p.$('.animate-spin'); if (!busy && i > 2) break }
    await L.sleep(2500)
    await L.shot(p, 'x_ia_respuesta')
    const scroller = await p.evaluateHandle(() => [...document.querySelectorAll('*')].filter(e => e.scrollHeight > e.clientHeight + 50 && getComputedStyle(e).overflowY.match(/auto|scroll/)).sort((a, b) => b.scrollHeight - a.scrollHeight)[0])
    const h = await p.evaluate(e => e.scrollHeight, scroller)
    for (let i = 0, y = 0; y < h && i < 8; i++, y += 700) { await p.evaluate((e, y) => { e.scrollTop = y }, scroller, y); await L.sleep(700); await L.shot(p, `x_ia_scroll_${i}`) }
  }
  await b.close()
})().catch(e => { console.error(e); process.exit(1) })
