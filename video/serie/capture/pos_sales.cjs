// Real sales at Central for the series (cashier Ana). Records each one.
// Usage: node pos_sales.cjs mostrador | cupon <CODE>
const path = require('path')
const L = require('./lib.cjs')
const CENTRAL = 'cmvtxvvzj00007zd5m6bn27p4'
const CALC = '7401000100123', CUADERNO = '7401000100017'
const SCAN = 'input[placeholder^="Escanear"]'

async function open() {
  const b = await L.launch(L.DESKTOP), p = await b.newPage()
  await p.goto(L.POS + '/login', { waitUntil: 'networkidle0' })
  await p.evaluate(id => localStorage.setItem('selectedStoreId', id), CENTRAL)
  await L.loginPos(p, 'ana@libreriaaurora.gt', 'Demo1234!')
  await p.goto(L.POS + '/pos', { waitUntil: 'networkidle0' }); await L.sleep(2500)
  await L.clickText(p, 'Caja principal #1', 'button').catch(() => console.log('no caja modal'))
  await L.sleep(1500)
  return { b, p }
}

async function scan(p, code) {
  await p.click(SCAN, { clickCount: 3 }); await p.type(SCAN, code, { delay: 35 }); await p.keyboard.press('Enter'); await L.sleep(1600)
}

async function pay(p, name) {
  const cash = 'input[placeholder="Q 0.00"]'
  const total = await p.evaluate(() => { const b = [...document.querySelectorAll('button')].find(x => /^Cobrar Q/.test(x.innerText.trim())); return b ? parseFloat(b.innerText.replace(/[^0-9.]/g, '')) : 0 })
  await p.click(cash); await p.type(cash, String(Math.ceil(total / 50) * 50 || 200), { delay: 80 }); await L.sleep(900)
  await L.shot(p, name + '_pago')
  const btn = (await p.$$('xpath/.//button[starts-with(normalize-space(.), "Cobrar Q")]'))[0]
  await btn.click(); await L.sleep(3500)
  await L.shot(p, name + '_hecho')
}

;(async () => {
  const [mode, code] = process.argv.slice(2)
  const { b, p } = await open()
  const rec = await p.screencast({ path: path.join(L.OUT, `pos_${mode}.webm`) })
  await L.sleep(800)
  if (mode === 'mostrador') {
    await scan(p, CALC)
    await L.shot(p, 'pos_mostrador_carrito')
    await pay(p, 'pos_mostrador')
  } else if (mode === 'cupon') {
    await scan(p, CUADERNO); await scan(p, CUADERNO); await scan(p, CALC)
    await L.shot(p, 'pos_cupon_carrito')
    await L.clickText(p, 'Aplicar cupón', 'button')
    const inp = 'input[placeholder="Escanea o escribe el cupón"]'
    await p.waitForSelector(inp); await p.type(inp, code, { delay: 90 }); await p.keyboard.press('Enter'); await L.sleep(2500)
    await L.shot(p, 'pos_cupon_aplicado')
    await pay(p, 'pos_cupon')
  }
  await L.sleep(1500)
  await rec.stop()
  await b.close()
})().catch(e => { console.error(e); process.exit(1) })
