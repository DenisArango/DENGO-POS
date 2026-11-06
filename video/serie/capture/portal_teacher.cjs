// Gabriela's side after the librería quoted: dashboard, order status, messages, notifications, quotation.
const L = require('./lib.cjs')
const ORDER_ID = 'cmw3c704j004v11h1u86ubkob'
;(async () => {
  const b = await L.launch(L.MOBILE), p = await b.newPage()
  await L.loginPortal(p)
  const go = async (u, name, full = false) => { await p.goto(L.PORTAL + u, { waitUntil: 'networkidle0' }); await L.sleep(2500); await L.shot(p, name, full ? { fullPage: true } : {}) }
  await go('/dashboard', 'm_t_dashboard', true)
  await go('/orders/' + ORDER_ID, 'm_t_pedido', true)
  await go('/messages', 'm_t_mensajes', true)
  await go('/notifications', 'm_t_avisos', true)
  // open the quotation document from messages if a link is there
  await p.goto(L.PORTAL + '/messages', { waitUntil: 'networkidle0' }); await L.sleep(2000)
  const links = await p.$$('a[href*="/documents/"]'); const link = links[links.length - 1]
  if (link) { await link.click(); await L.sleep(3000); await L.shot(p, 'm_t_cotizacion', { fullPage: true }) } else console.log('no document link')
  await b.close()
})().catch(e => { console.error(e); process.exit(1) })
