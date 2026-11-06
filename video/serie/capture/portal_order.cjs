// Gabriela's real order on her phone: Valija Didáctica with 2 calculadoras fx-82 (+ a few items).
const path = require('path')
const L = require('./lib.cjs')
;(async () => {
  const b = await L.launch(L.MOBILE), p = await b.newPage()
  await L.loginPortal(p)
  await p.evaluate(() => Object.keys(localStorage).filter(k => /draft/i.test(k)).forEach(k => localStorage.removeItem(k)))
  await p.goto(L.PORTAL + '/dashboard', { waitUntil: 'networkidle0' }); await L.sleep(2500)
  await L.shot(p, 'm_portal_dashboard')
  const rec = await p.screencast({ path: path.join(L.OUT, 'm_portal_pedido.webm') })
  await L.sleep(1000)
  await p.goto(L.PORTAL + '/orders/new', { waitUntil: 'networkidle0' }); await L.sleep(2200)
  await L.shot(p, 'm_portal_p1')
  // 1. school
  await L.clickText(p, 'EORM Cantón El Carmen', 'button', { last: false, wait: 1800 })
  await L.shot(p, 'm_portal_p2')
  // 2. program
  await L.clickText(p, 'Valija Didáctica', 'button', { last: false, wait: 1800 })
  await L.shot(p, 'm_portal_p3')
  // 3. students
  // the grade comes prefilled from her school assignment ("Tercero A"); only the count is typed
  const st = 'input[aria-label="Alumnos del grado 1"]'
  await p.focus(st); await p.keyboard.down('Control'); await p.keyboard.press('KeyA'); await p.keyboard.up('Control'); await p.keyboard.press('Backspace')
  await L.typeSlow(p, st, '28', 160)
  await L.sleep(700)
  await L.shot(p, 'm_portal_p3b')
  await L.clickText(p, 'Continuar', 'button', { wait: 1800 })
  await L.shot(p, 'm_portal_p4')
  // 4. products
  const search = 'input[placeholder="Buscar productos…"]'
  for (const [q, n] of [['fx-82', 2], ['marcador', 3], ['papel construcción', 2]]) {
    await p.focus(search)
    await p.keyboard.down('Control'); await p.keyboard.press('KeyA'); await p.keyboard.up('Control'); await p.keyboard.press('Backspace')
    await p.type(search, q, { delay: 70 }); await L.sleep(1800)
    const first = (await p.$$('xpath/.//button[normalize-space(.)="Agregar"]'))[0]
    if (!first) { console.log('no product for', q); continue }
    await first.click(); await L.sleep(700)
    for (let i = 1; i < n; i++) {
      const add = (await p.$$('button[aria-label="Agregar uno"]'))[0]
      if (!add) break
      await add.click(); await L.sleep(600)
    }
  }
  await L.sleep(800)
  await L.shot(p, 'm_portal_p4b')
  await L.clickText(p, 'Continuar', 'button', { wait: 2000 })
  await L.shot(p, 'm_portal_p5')
  await L.clickText(p, 'Enviar pedido', 'button', { wait: 3500 })
  await L.shot(p, 'm_portal_enviado')
  await rec.stop()
  console.log(await p.evaluate(() => document.body.innerText.slice(0, 600)))
  await b.close()
})().catch(async e => { console.error(e); process.exit(1) })
