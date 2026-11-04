const puppeteer = require('C:/Users/Alejandra Yol/AppData/Local/npm-cache/_npx/702923228c2ce1e6/node_modules/puppeteer-core')
const [,, email, password, ...routes] = process.argv
;(async () => {
  const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', defaultViewport: { width: 1600, height: 900, deviceScaleFactor: 2 } })
  const page = await browser.newPage()
  await page.goto('http://127.0.0.1:5173/login', { waitUntil: 'networkidle0' })
  await page.type('input[type=email], input[name=email]', email)
  await page.type('input[type=password]', password)
  await Promise.all([page.keyboard.press('Enter'), page.waitForNavigation({ waitUntil: 'networkidle0' }).catch(() => {})])
  for (const r of routes) {
    const [path, name] = r.split('=')
    await page.goto('http://127.0.0.1:5173' + path, { waitUntil: 'networkidle0' })
    await new Promise(r => setTimeout(r, 5000))
    await page.screenshot({ path: `C:/denis/DENGO-POS/video/capture/${name}.png` })
    console.log('shot', name)
  }
  await browser.close()
})().catch(e => { console.error(e); process.exit(1) })
