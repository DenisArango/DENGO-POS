const puppeteer = require('C:/Users/Alejandra Yol/AppData/Local/npm-cache/_npx/702923228c2ce1e6/node_modules/puppeteer-core')
const sleep = ms => new Promise(r => setTimeout(r, ms))
;(async () => {
  const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', defaultViewport: { width: 1600, height: 900, deviceScaleFactor: 2 } })
  const page = await browser.newPage()
  await page.goto('http://127.0.0.1:5173/login', { waitUntil: 'networkidle0' })
  await page.evaluate(id => localStorage.setItem('selectedStoreId', id), 'cmvtxvx6v0001pn9wc2mz3rf2')
  await page.reload({ waitUntil: 'networkidle0' }); await page.waitForSelector('input[type=password]')
  await page.type('input[type=email], input[name=email], input[type=text]', 'carlos@libreriaaurora.gt')
  await page.type('input[type=password]', 'Demo1234!')
  await Promise.all([page.keyboard.press('Enter'), page.waitForNavigation({ waitUntil: 'networkidle0' }).catch(() => {})])
  await page.goto('http://127.0.0.1:5173/pos', { waitUntil: 'networkidle0' }); await sleep(2000)
  const caja = await page.$$('xpath/.//button[contains(., "Caja principal #1")]'); if (caja[0]) { await caja[0].click(); await sleep(1000) }
  const sel = 'input[placeholder^="Escanear"]'
  for (const code of ['7401000100001', '7401000100070', '7401000100133']) { await page.click(sel, { clickCount: 3 }); await page.type(sel, code); await page.keyboard.press('Enter'); await sleep(1300) }
  await page.setOfflineMode(true)
  for (let i = 0; i < 20; i++) { await sleep(1500); const t = await page.evaluate(() => document.body.innerText); if (t.includes('Sin conexión con el servidor')) break }
  await sleep(1000); await page.screenshot({ path: 'off_banner.png' })
  await page.type('input[placeholder="Q 0.00"]', '50'); await sleep(600)
  const cobrar = await page.$$('xpath/.//button[contains(., "Cobrar Q")]'); await cobrar[0].click()
  for (let i = 0; i < 6; i++) { await sleep(500); await page.screenshot({ path: 'off_vendida_' + i + '.png' }) }
  await page.setOfflineMode(false)
  for (let i = 0; i < 12; i++) { await sleep(700); await page.screenshot({ path: 'off_sync_' + i + '.png' }); const t = await page.evaluate(() => document.body.innerText); if (!t.includes('Sin conexión') && !t.includes('Sincronizando')) break }
  await browser.close()
})().catch(e => { console.error(e); process.exit(1) })
