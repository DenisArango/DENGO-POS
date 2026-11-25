// Our own printable invoice (representación gráfica) of a certified DTE,
// drawn from the SAT XML and dressed in the client's brand: logo, accent
// colour, company details and a free footer line (Configuración → Tiendas).
// Letter size. Everything the SAT requires on the graphic representation comes
// from the XML itself, so the document always matches what the SAT has.

import PDFDocument from 'pdfkit'
import QRCode from 'qrcode'
import sharp from 'sharp'
import type { DteModel } from './dte-xml.js'
import { amountInWords, certifiedQrUrl, DTE_TYPE_NAMES, phraseText } from './sat-rules.js'

export interface InvoiceBranding {
  /** data: URL or base64 image (any format sharp reads). */
  logo: string | null
  companyName: string | null
  tagline: string | null
  website: string | null
  phone: string | null
  email: string | null
  /** #RRGGBB */
  color: string | null
  footer: string | null
}

export interface InvoiceRenderOptions {
  /** Anything but production: printed as a test document. */
  test: boolean
  voided: boolean
}

const DEFAULT_COLOR = '#1E3A8A'
const INK = '#1F2937'
const MUTED = '#6B7280'
const LINE = '#E5E7EB'

const money = (n: number, currency = 'GTQ') =>
  `${currency === 'USD' ? '$' : 'Q'}${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

const qtyFmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toLocaleString('en-US', { maximumFractionDigits: 4 }))

function gtDateTime(iso: string): string {
  if (!iso) return ''
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/)
  return m ? `${m[3]}/${m[2]}/${m[1]}${m[4] ? ` ${m[4]}:${m[5]}` : ''}` : iso
}

function validColor(c: string | null | undefined): string {
  return c && /^#[0-9a-f]{6}$/i.test(c) ? c : DEFAULT_COLOR
}

/** A light tint of the accent for panels (mix with white). */
function tint(hex: string, amount: number): string {
  const n = parseInt(hex.slice(1), 16)
  const mix = (v: number) => Math.round(v + (255 - v) * amount)
  const r = mix((n >> 16) & 255), g = mix((n >> 8) & 255), b = mix(n & 255)
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`
}

async function logoPng(logo: string | null): Promise<{ png: Buffer; width: number; height: number } | null> {
  if (!logo) return null
  try {
    const b64 = logo.includes(',') ? logo.slice(logo.indexOf(',') + 1) : logo
    const { data, info } = await sharp(Buffer.from(b64, 'base64')).resize({ width: 600, height: 300, fit: 'inside', withoutEnlargement: true }).png().toBuffer({ resolveWithObject: true })
    return { png: data, width: info.width, height: info.height }
  } catch {
    return null // a logo we can't read never blocks the invoice
  }
}

function fullAddress(a: DteModel['emisor']['address']): string {
  if (!a) return ''
  return [a.street, a.municipio, a.departamento].filter(Boolean).join(', ')
}

export async function renderInvoicePdf(dte: DteModel, brand: InvoiceBranding, opts: InvoiceRenderOptions): Promise<Buffer> {
  const color = validColor(brand.color)
  const soft = tint(color, 0.9)
  const logo = await logoPng(brand.logo)
  const qr = dte.certification
    ? await QRCode.toBuffer(certifiedQrUrl(dte.emisor.nit, dte.certification.serie, dte.certification.numero), { margin: 0, width: 220, errorCorrectionLevel: 'M' })
    : null

  const doc = new PDFDocument({
    size: 'LETTER', margins: { top: 36, bottom: 40, left: 40, right: 40 }, bufferPages: true,
    info: {
      Title: `${DTE_TYPE_NAMES[dte.type] ?? dte.type} ${dte.certification ? `${dte.certification.serie}-${dte.certification.numero}` : ''}`.trim(),
      Author: dte.emisor.commercialName || dte.emisor.name,
      Creator: 'DENGO POS',
    },
  })
  const chunks: Buffer[] = []
  doc.on('data', c => chunks.push(c as Buffer))
  const done = new Promise<Buffer>(resolve => doc.on('end', () => resolve(Buffer.concat(chunks))))

  const W = doc.page.width
  const L = doc.page.margins.left
  const R = W - doc.page.margins.right
  const CW = R - L
  const cur = dte.currency

  // ── Accent bar ────────────────────────────────────────────────────────────
  doc.rect(0, 0, W, 8).fill(color)

  // ── Header: brand (left) + document box (right) ───────────────────────────
  const boxW = 210
  const boxX = R - boxW
  let y = 30
  let leftY = y
  if (logo) {
    const h = Math.min(64, (logo.height / logo.width) * 170)
    const w = (logo.width / logo.height) * h
    doc.image(logo.png, L, leftY, { width: w, height: h })
    leftY += h + 8
  }
  const brandName = brand.companyName || dte.emisor.commercialName || dte.emisor.name
  const leftW = boxX - L - 16
  doc.fillColor(INK).font('Helvetica-Bold').fontSize(15).text(brandName, L, leftY, { width: leftW })
  leftY = doc.y + 1
  doc.font('Helvetica').fontSize(8.5).fillColor(MUTED)
  const legal = [
    dte.emisor.name && dte.emisor.name !== brandName ? dte.emisor.name : null,
    `NIT ${dte.emisor.nit}`,
    dte.emisor.commercialName && dte.emisor.commercialName !== brandName ? `${dte.emisor.commercialName} · Establecimiento ${dte.emisor.establishment}` : `Establecimiento ${dte.emisor.establishment}`,
    fullAddress(dte.emisor.address),
    [brand.phone ? `Tel. ${brand.phone}` : null, brand.email || dte.emisor.email || null].filter(Boolean).join(' · ') || null,
    brand.website || null,
  ].filter(Boolean) as string[]
  doc.text(legal.join('\n'), L, leftY, { width: leftW, lineGap: 1.5 })
  leftY = doc.y

  // Document box
  const typeName = (DTE_TYPE_NAMES[dte.type] ?? dte.type).toUpperCase()
  doc.roundedRect(boxX, y, boxW, 26, 5).fill(color)
  doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(typeName.length > 22 ? 9.5 : 12).text(typeName, boxX, y + (typeName.length > 22 ? 9 : 8), { width: boxW, align: 'center' })
  let by = y + 34
  const kv = (k: string, v: string, opts: { mono?: boolean; small?: boolean } = {}) => {
    doc.font('Helvetica').fontSize(7.5).fillColor(MUTED).text(k.toUpperCase(), boxX + 10, by, { width: boxW - 20 })
    by = doc.y + 1
    doc.font(opts.mono ? 'Courier-Bold' : 'Helvetica-Bold').fontSize(opts.small ? 8 : 10).fillColor(INK).text(v, boxX + 10, by, { width: boxW - 20 })
    by = doc.y + 5
  }
  if (dte.certification) {
    kv('Serie', dte.certification.serie)
    kv('Número', dte.certification.numero)
    kv('No. de autorización', dte.certification.uuid, { mono: true, small: true })
  }
  if (dte.accessNumber) kv('No. de acceso (contingencia)', dte.accessNumber)
  kv('Fecha y hora de emisión', gtDateTime(dte.issuedAt))
  const boxBottom = by + 2
  doc.roundedRect(boxX, y, boxW, boxBottom - y, 5).lineWidth(0.8).strokeColor(color).stroke()

  y = Math.max(leftY, boxBottom) + 14

  // ── Receptor ──────────────────────────────────────────────────────────────
  const r = dte.receptor
  const idLabel = r.id === 'CF' ? 'NIT' : r.specialType === 'CUI' ? 'CUI' : r.specialType === 'EXT' ? 'ID extranjero' : 'NIT'
  const recLines: [string, string][] = [
    ['Cliente', r.name || 'Consumidor Final'],
    [idLabel, r.id === 'CF' ? 'CF (Consumidor Final)' : r.id],
  ]
  const recAddr = r.address ? [r.address.street, r.address.municipio, r.address.departamento].filter(Boolean).join(', ') : ''
  if (recAddr) recLines.push(['Dirección', recAddr])
  if (r.email) recLines.push(['Correo', r.email])
  const recH = 16 + recLines.length * 14
  doc.roundedRect(L, y, CW, recH, 5).fill(soft)
  let ry = y + 9
  for (const [k, v] of recLines) {
    doc.font('Helvetica').fontSize(8).fillColor(MUTED).text(k, L + 12, ry, { width: 70 })
    doc.font('Helvetica-Bold').fontSize(9).fillColor(INK).text(v, L + 84, ry - 0.5, { width: CW - 96, lineBreak: false, ellipsis: true })
    ry += 14
  }
  doc.font('Helvetica').fontSize(8).fillColor(MUTED).text(`Moneda: ${cur}`, L, y + 9, { width: CW - 12, align: 'right' })
  y += recH + 12

  // ── Reference (credit / debit notes) ──────────────────────────────────────
  if (dte.reference) {
    const ref = dte.reference
    doc.font('Helvetica-Bold').fontSize(8).fillColor(color).text('DOCUMENTO QUE SE MODIFICA', L, y)
    y = doc.y + 3
    doc.font('Helvetica').fontSize(8.5).fillColor(INK)
      .text(`Serie ${ref.serie} · Número ${ref.numero} · Emitido ${gtDateTime(ref.date)}`, L, y, { width: CW })
      .font('Courier').fontSize(8).text(`Autorización ${ref.uuid}`, { width: CW })
      .font('Helvetica').fontSize(8.5).text(`Motivo: ${ref.reason}`, { width: CW })
    y = doc.y + 10
  }

  // ── Items ─────────────────────────────────────────────────────────────────
  const cols = [
    { key: 'qty', label: 'Cant.', w: 44, align: 'right' as const },
    { key: 'desc', label: 'Descripción', w: CW - 44 - 72 - 64 - 76, align: 'left' as const },
    { key: 'unit', label: 'P. unitario', w: 72, align: 'right' as const },
    { key: 'disc', label: 'Descuento', w: 64, align: 'right' as const },
    { key: 'total', label: 'Total', w: 76, align: 'right' as const },
  ]
  const PAD = 6
  const drawHeader = () => {
    doc.rect(L, y, CW, 20).fill(color)
    let x = L
    doc.font('Helvetica-Bold').fontSize(8.5).fillColor('#FFFFFF')
    for (const c of cols) { doc.text(c.label, x + PAD, y + 6, { width: c.w - PAD * 2, align: c.align }); x += c.w }
    y += 20
  }
  drawHeader()
  const bottomLimit = doc.page.height - doc.page.margins.bottom - 30
  dte.items.forEach((it, k) => {
    doc.font('Helvetica').fontSize(9)
    const descH = doc.heightOfString(it.description, { width: cols[1]!.w - PAD * 2 })
    const rowH = Math.max(18, descH + 9)
    if (y + rowH > bottomLimit) { doc.addPage(); y = doc.page.margins.top; drawHeader() }
    if (k % 2 === 1) doc.rect(L, y, CW, rowH).fill(tint(color, 0.95))
    let x = L
    const cells = [qtyFmt(it.qty), it.description, money(it.unitPrice, cur), it.discount ? money(it.discount, cur) : '—', money(it.total, cur)]
    cells.forEach((v, i) => {
      const c = cols[i]!
      doc.font(i === 4 ? 'Helvetica-Bold' : 'Helvetica').fontSize(9).fillColor(i === 3 && !it.discount ? MUTED : INK)
        .text(v, x + PAD, y + 5, { width: c.w - PAD * 2, align: c.align })
      x += c.w
    })
    y += rowH
  })
  doc.moveTo(L, y).lineTo(R, y).lineWidth(0.8).strokeColor(color).stroke()
  y += 10

  // ── Totals ────────────────────────────────────────────────────────────────
  const needed = 150
  if (y + needed > doc.page.height - doc.page.margins.bottom) { doc.addPage(); y = doc.page.margins.top }
  const totW = 220
  const totX = R - totW
  const discounts = dte.items.reduce((s, i) => s + i.discount, 0)
  const tRows: [string, string][] = []
  if (discounts > 0) tRows.push(['Descuentos aplicados', money(discounts, cur)])
  for (const t of dte.totals.taxes) tRows.push([`${t.name} incluido`, money(t.amount, cur)])
  let ty = y
  for (const [k, v] of tRows) {
    doc.font('Helvetica').fontSize(9).fillColor(MUTED).text(k, totX, ty, { width: totW - 90 })
    doc.fillColor(INK).text(v, totX, ty, { width: totW, align: 'right' })
    ty += 15
  }
  doc.roundedRect(totX, ty + 2, totW, 30, 5).fill(color)
  doc.font('Helvetica-Bold').fontSize(10).fillColor('#FFFFFF').text('TOTAL', totX + 12, ty + 12)
  doc.fontSize(15).text(money(dte.totals.grandTotal, cur), totX, ty + 9, { width: totW - 12, align: 'right' })
  ty += 40

  // Left of totals: amount in words + phrases
  const leftColW = totX - L - 20
  doc.font('Helvetica').fontSize(7.5).fillColor(MUTED).text('TOTAL EN LETRAS', L, y)
  doc.font('Helvetica-Bold').fontSize(9).fillColor(INK).text(amountInWords(dte.totals.grandTotal, cur), L, doc.y + 2, { width: leftColW })
  let ly = doc.y + 8
  if (dte.phrases.length) {
    for (const p of dte.phrases) {
      const extra = p.resolution ? ` (${p.resolution}${p.resolutionDate ? ` - ${gtDateTime(p.resolutionDate)}` : ''})` : ''
      doc.font('Helvetica-Bold').fontSize(8.5).fillColor(color).text(`${phraseText(p.tipo, p.escenario)}${extra}`, L, ly, { width: leftColW })
      ly = doc.y + 2
    }
  }
  y = Math.max(ty, ly) + 16

  // ── Certification + QR ────────────────────────────────────────────────────
  if (y + 90 > doc.page.height - doc.page.margins.bottom) { doc.addPage(); y = doc.page.margins.top }
  doc.moveTo(L, y).lineTo(R, y).lineWidth(0.5).strokeColor(LINE).stroke()
  y += 10
  const qrSize = 72
  if (qr) {
    doc.image(qr, L, y, { width: qrSize, height: qrSize })
  }
  const cx = qr ? L + qrSize + 14 : L
  const cw = R - cx
  doc.font('Helvetica-Bold').fontSize(8).fillColor(INK).text('DOCUMENTO TRIBUTARIO ELECTRÓNICO — RÉGIMEN FEL', cx, y, { width: cw })
  doc.font('Helvetica').fontSize(8).fillColor(MUTED)
  if (dte.certification) {
    doc.text(`Certificador: ${dte.certification.certifierName} · NIT ${dte.certification.certifierNit}`, cx, doc.y + 3, { width: cw })
    doc.text(`Fecha y hora de certificación: ${gtDateTime(dte.certification.certifiedAt)}`, { width: cw })
    if (qr) doc.text('Escanee el código para verificar este documento en el portal de la SAT.', { width: cw })
  }
  y = Math.max(doc.y, y + (qr ? qrSize : 0)) + 12

  // ── Footer: client's own line + tagline ───────────────────────────────────
  const footer = [brand.footer, brand.tagline].filter(Boolean).join('  ·  ')
  if (footer) {
    doc.font('Helvetica-Oblique').fontSize(8.5).fillColor(color).text(footer, L, y, { width: CW, align: 'center' })
  }

  // ── Watermarks and page numbers on every page ─────────────────────────────
  const range = doc.bufferedPageRange()
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i)
    const mark = opts.voided ? 'ANULADO' : opts.test ? 'PRUEBA · SIN VALIDEZ FISCAL' : null
    if (mark) {
      doc.save()
      doc.rotate(-30, { origin: [W / 2, doc.page.height / 2] })
      doc.font('Helvetica-Bold').fontSize(opts.voided ? 90 : 34).fillColor(opts.voided ? '#DC2626' : '#9CA3AF').fillOpacity(0.18)
        .text(mark, 0, doc.page.height / 2 - 30, { width: W, align: 'center', lineBreak: false })
      doc.restore()
      doc.fillOpacity(1)
    }
    const bottom = doc.page.height - 26
    // Writing inside the bottom margin would make pdfkit open a new page.
    const margin = doc.page.margins.bottom
    doc.page.margins.bottom = 0
    doc.font('Helvetica').fontSize(7).fillColor(MUTED)
      .text(`${typeName}${dte.certification ? ` ${dte.certification.serie}-${dte.certification.numero}` : ''}  ·  Página ${i - range.start + 1} de ${range.count}`, L, bottom, { width: CW, align: 'right', lineBreak: false })
    doc.page.margins.bottom = margin
  }

  doc.end()
  return done
}
