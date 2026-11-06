// Shared helpers for the serie captures (puppeteer-core + local Chrome).
const puppeteer = require('C:/Users/Alejandra Yol/AppData/Local/npm-cache/_npx/702923228c2ce1e6/node_modules/puppeteer-core')
const path = require('path')
const OUT = path.join(__dirname)
const sleep = ms => new Promise(r => setTimeout(r, ms))

const WEB = 'http://127.0.0.1:4321'
const POS = 'http://localhost:5180'
const PORTAL = 'http://localhost:5174'

async function launch(viewport) {
  const b = await puppeteer.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: 'new',
    defaultViewport: viewport,
    args: ['--hide-scrollbars', '--force-color-profile=srgb'],
  })
  const np = b.newPage.bind(b)
  b.newPage = async () => {
    const pg = await np()
    // hide dev-only overlays (Astro toolbar, Vite error overlay) from every capture
    await pg.evaluateOnNewDocument(() => {
      const css = 'astro-dev-toolbar,vite-error-overlay{display:none!important}'
      document.addEventListener('DOMContentLoaded', () => { const s = document.createElement('style'); s.textContent = css; document.head.appendChild(s) })
    })
    return pg
  }
  return b
}

const DESKTOP = { width: 1600, height: 900, deviceScaleFactor: 2 }
const MOBILE = { width: 390, height: 844, deviceScaleFactor: 3, isMobile: true, hasTouch: true }

const shot = (page, name, opts = {}) => page.screenshot({ path: path.join(OUT, name + '.png'), ...opts }).then(() => console.log('shot', name))

async function clickText(page, text, tag = '*', { last = true, wait = 900 } = {}) {
  const els = await page.$$(`xpath/.//${tag}[normalize-space(.)="${text}" or contains(normalize-space(.), "${text}")]`)
  const el = last ? els[els.length - 1] : els[0]
  if (!el) throw new Error('no element with text: ' + text)
  await el.click()
  await sleep(wait)
  return el
}

async function typeSlow(page, sel, text, delay = 70) {
  await page.click(sel)
  await page.type(sel, text, { delay })
}

async function smoothScrollTo(page, y, ms = 1500) {
  await page.evaluate(async (y, ms) => {
    const y0 = window.scrollY, t0 = performance.now()
    await new Promise(res => {
      const step = t => {
        const k = Math.min(1, (t - t0) / ms), e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2
        window.scrollTo(0, y0 + (y - y0) * e)
        k < 1 ? requestAnimationFrame(step) : res()
      }
      requestAnimationFrame(step)
    })
  }, y, ms)
}

async function loginPos(page, email = 'admin@dengo.gt', password = 'Admin1234!') {
  await page.goto(POS + '/login', { waitUntil: 'networkidle0' })
  await page.waitForSelector('input[type=password]', { timeout: 15000 })
  await page.type('input[type=email], input[name=email], input[type=text]', email)
  await page.type('input[type=password]', password)
  await Promise.all([page.keyboard.press('Enter'), page.waitForNavigation({ waitUntil: 'networkidle0' }).catch(() => {})])
  await sleep(1500)
}

async function loginPortal(page, email = 'maestra@libreriaaurora.gt', password = 'Demo1234!') {
  await page.goto(PORTAL + '/login', { waitUntil: 'networkidle0' })
  await page.waitForSelector('input[type=password]', { timeout: 15000 })
  await page.type('input[type=email], input[name=email], input[type=text]', email)
  await page.type('input[type=password]', password)
  await Promise.all([page.keyboard.press('Enter'), page.waitForNavigation({ waitUntil: 'networkidle0' }).catch(() => {})])
  await sleep(1500)
}

module.exports = { launch, sleep, shot, clickText, typeSlow, smoothScrollTo, loginPos, loginPortal, DESKTOP, MOBILE, WEB, POS, PORTAL, OUT }
