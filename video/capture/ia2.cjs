const puppeteer = require('C:/Users/Alejandra Yol/AppData/Local/npm-cache/_npx/702923228c2ce1e6/node_modules/puppeteer-core')
const sleep = ms => new Promise(r => setTimeout(r, ms))
;(async () => {
  const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', defaultViewport: { width: 1600, height: 900, deviceScaleFactor: 2 } })
  const page = await browser.newPage()
  await page.goto('http://127.0.0.1:5173/login', { waitUntil: 'networkidle0' })
  await page.waitForSelector('input[type=password]')
  await page.type('input[type=email], input[name=email], input[type=text]', 'admin@dengo.gt')
  await page.type('input[type=password]', 'Admin1234!')
  await Promise.all([page.keyboard.press('Enter'), page.waitForNavigation({ waitUntil: 'networkidle0' }).catch(() => {})])
  await page.goto('http://127.0.0.1:5173/reports/custom', { waitUntil: 'networkidle0' }); await sleep(2000)
  const sel = 'input[placeholder^="Ej:"], textarea[placeholder^="Ej:"]'
  await page.type(sel, '¿Cuánto tengo que vender por día para llegar a la meta de este mes en cada sucursal?')
  await page.screenshot({ path: 'ia2_pregunta.png' })
  await page.keyboard.press('Enter')
  for (let i = 0; i < 60; i++) { await sleep(3000); const busy = await page.$('.animate-spin'); if (!busy && i > 2) break }
  await sleep(2500)
  await page.screenshot({ path: 'ia2_respuesta.png' })
  const scroller = await page.evaluateHandle(() => [...document.querySelectorAll('*')].filter(e => e.scrollHeight > e.clientHeight + 50 && getComputedStyle(e).overflowY.match(/auto|scroll/)).sort((a, b) => b.scrollHeight - a.scrollHeight)[0])
  const h = await page.evaluate(e => e.scrollHeight, scroller)
  for (let i = 0, y = 0; y < h && i < 8; i++, y += 700) { await page.evaluate((e, y) => { e.scrollTop = y }, scroller, y); await sleep(700); await page.screenshot({ path: `ia2_scroll_${i}.png` }) }
  await browser.close()
})().catch(e => { console.error(e); process.exit(1) })
