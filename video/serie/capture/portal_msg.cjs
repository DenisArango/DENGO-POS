// Gabriela writes a real message to the librería from the portal (phone). Records it.
const path = require('path')
const L = require('./lib.cjs')
;(async () => {
  const b = await L.launch(L.MOBILE), p = await b.newPage()
  await L.loginPortal(p)
  await p.goto(L.PORTAL + '/messages', { waitUntil: 'networkidle0' }); await L.sleep(2500)
  const rec = await p.screencast({ path: path.join(L.OUT, 'm_portal_msg.webm') })
  await L.sleep(1000)
  const box = 'textarea'
  await p.type(box, '¡Hola! ¿Podemos cambiar los marcadores azules por negros? Gracias 😊'.replace(' 😊', ''), { delay: 55 })
  await L.sleep(600)
  await p.keyboard.press('Enter'); await L.sleep(2500)
  await rec.stop()
  await L.shot(p, 'm_t_mensaje_enviado')
  await b.close()
})().catch(e => { console.error(e); process.exit(1) })
