const puppeteer = require('C:/Users/Alejandra Yol/AppData/Local/npm-cache/_npx/702923228c2ce1e6/node_modules/puppeteer-core')
const sleep = ms => new Promise(r => setTimeout(r, ms))
;(async () => {
  const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', defaultViewport: { width: 1600, height: 900, deviceScaleFactor: 2 } })
  const page = await browser.newPage()
  await page.goto('http://127.0.0.1:5173/login', { waitUntil: 'networkidle0' }); await page.evaluate(id => localStorage.setItem('selectedStoreId', id), 'cmvtxvx6v0001pn9wc2mz3rf2')
  await page.reload({ waitUntil: 'networkidle0' }); await page.waitForSelector('input[type=password]', { timeout: 15000 })
  await page.type('input[type=email], input[name=email], input[type=text]', 'carlos@libreriaaurora.gt')
  await page.type('input[type=password]', 'Demo1234!')
  await Promise.all([page.keyboard.press('Enter'), page.waitForNavigation({ waitUntil: 'networkidle0' }).catch(() => {})])
  await page.goto('http://127.0.0.1:5173/pos', { waitUntil: 'networkidle0' }); await sleep(2000)
  const clickText = async (t, tag = '*') => { const els = await page.$$(`xpath/.//${tag}[normalize-space(.)="${t}" or contains(normalize-space(.), "${t}")]`); const el = els[els.length - 1]; if (!el) throw new Error('no ' + t); await el.click(); await sleep(1200) }
  await page.evaluate(id => localStorage.setItem('selectedStoreId', id), 'cmvtxvx6v0001pn9wc2mz3rf2')
  await sleep(1500)
  await clickText('Caja principal #1', 'button').catch(() => console.log('no caja modal'))
  await sleep(1000)
  await page.screenshot({ path: 'pos_empty.png' })
  const sel = 'input[placeholder^="Escanear"]'
  for (const code of ['7401000100001', '7401000100046', '7401000100133', '7401000100070', '7401000100123']) {
    await page.click(sel, { clickCount: 3 }); await page.type(sel, code); await page.keyboard.press('Enter'); await sleep(1500)
  }
  await sleep(1500)
  await page.screenshot({ path: 'pos_cart.png' })
  const btn = await page.$$('xpath/.//button[contains(., "Otras sucursales")]')
  if (btn[0]) { await btn[0].click(); await sleep(2000); await page.screenshot({ path: 'pos_otras.png' }) } else console.log('no otras button')
  await browser.close()
})().catch(e => { console.error(e); process.exit(1) })
