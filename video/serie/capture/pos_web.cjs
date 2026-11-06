// POS "Página web" module screens (admin).
const L = require('./lib.cjs')
;(async () => {
  const b = await L.launch(L.DESKTOP), p = await b.newPage()
  await L.loginPos(p)
  for (const [tab, name] of [['reportes', 'pw_reportes'], ['ofertas', 'pw_ofertas'], ['cupones', 'pw_cupones'], ['sitio', 'pw_sitio']]) {
    await p.goto(L.POS + '/website?tab=' + tab, { waitUntil: 'networkidle0' }); await L.sleep(3500)
    await L.shot(p, name)
    if (tab === 'sitio' || tab === 'reportes') {
      await L.shot(p, name + '_full', { fullPage: true })
    }
    if (tab === 'ofertas') {
      const edit = await p.$$('button[aria-label="Editar oferta"]')
      if (edit[0]) { await edit[0].click(); await L.sleep(2500); await L.shot(p, 'pw_oferta_editor') ; await p.keyboard.press('Escape'); await L.sleep(800) }
      await L.clickText(p, 'Nueva oferta', 'button'); await L.sleep(2000); await L.shot(p, 'pw_oferta_nueva')
      await p.keyboard.press('Escape'); await L.sleep(800)
    }
  }
  await b.close()
})().catch(e => { console.error(e); process.exit(1) })
