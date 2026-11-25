// Finds a certified document by its authorization number (a sale's factura or
// a credit note), makes sure we hold its XML, and renders our branded PDF.

import { prisma } from '../prisma.js'
import { felConfig } from './config.js'
import { getProvider, contextFor, felBranchSelect, schoolReceiver, saveDteXml } from './service.js'
import { parseDte, type DteModel } from './dte-xml.js'
import { renderInvoicePdf, type InvoiceBranding } from './invoice-pdf.js'
import { buildDteForSale, type BuildSaleInput } from './build.js'

const brandingSelect = {
  ...felBranchSelect,
  logo: true, companyName: true, companyTaxId: true, companyTagline: true, companyWebsite: true,
  phone: true, email: true, invoiceColor: true, invoiceFooter: true,
} as const

type BrandRow = { [K in keyof typeof brandingSelect]: any }

function brandingOf(b: BrandRow): InvoiceBranding {
  return {
    logo: b.logo ?? null,
    companyName: b.companyName?.trim() || null,
    tagline: b.companyTagline?.trim() || null,
    website: b.companyWebsite?.trim() || null,
    phone: b.phone?.trim() || null,
    email: b.email?.trim() || null,
    color: b.invoiceColor ?? null,
    footer: b.invoiceFooter?.trim() || null,
  }
}

export async function renderDocumentPdf(uuid: string): Promise<Buffer | null> {
  const id = uuid.toUpperCase()
  const sale = await prisma.sale.findFirst({
    where: { felUuid: { equals: id, mode: 'insensitive' } },
    select: { id: true, felEnvironment: true, felVoidStatus: true, branch: { select: brandingSelect } },
  })
  const note = sale ? null : await prisma.creditNote.findFirst({
    where: { felUuid: { equals: id, mode: 'insensitive' } },
    select: { id: true, felEnvironment: true, sale: { select: { branch: { select: brandingSelect } } } },
  })
  const row = sale ?? note
  if (!row) return null
  const branch = (sale ? sale.branch : note!.sale.branch) as BrandRow

  let xml = (await prisma.felDocumentXml.findUnique({ where: { uuid: id } }))?.xml ?? null
  if (!xml) {
    // Documents certified before we kept the XML: fetch it once and archive it.
    const cfg = felConfig()
    const provider = getProvider(cfg)
    const ctx = contextFor(branch, cfg)
    if (provider?.xml && ctx) {
      xml = await provider.xml(id, ctx).catch(() => null)
      await saveDteXml(id, xml)
    }
  }

  let dte: DteModel | null = xml ? parseDte(xml) : null
  // The offline simulator issues no XML: draw it from our own data so demos still get a PDF.
  if (!dte && sale && row.felEnvironment === 'mock') dte = await mockModel(sale.id)
  if (!dte) return null

  return renderInvoicePdf(dte, brandingOf(branch), {
    test: row.felEnvironment !== 'production',
    voided: !!sale && sale.felVoidStatus === 'VOIDED',
  })
}

async function mockModel(saleId: string): Promise<DteModel | null> {
  const sale = await prisma.sale.findUnique({
    where: { id: saleId },
    include: {
      customer: { select: { nit: true, name: true, email: true, address: true } },
      branch: { select: { ...felBranchSelect, companyName: true, companyTaxId: true } },
      items: { include: { product: { select: { name: true } }, variation: { select: { name: true, isDefault: true } } } },
      quotation: { select: { portalOrder: { select: { school: { select: { name: true, nit: true, invoiceName: true, address: true } } } } } },
    },
  })
  if (!sale) return null
  const cfg = felConfig()
  const override = schoolReceiver(sale)
  const doc = buildDteForSale(sale as unknown as BuildSaleInput, { ...cfg, allowCf: true }, { issuedAt: sale.felIssuedAt ?? sale.createdAt, ...(override ? { receiverOverride: override } : {}) })
  return {
    type: sale.felDocType ?? doc.type,
    issuedAt: doc.issuedAt,
    currency: doc.currency,
    accessNumber: sale.felAccessNumber,
    emisor: {
      nit: sale.branch.companyTaxId ?? '', name: sale.branch.companyName ?? sale.branch.name, commercialName: sale.branch.name,
      establishment: sale.branch.felEstablishmentCode ?? '1', afiliacionIva: 'GEN', email: '',
      address: { street: sale.branch.address, zip: '01001', municipio: sale.branch.city, departamento: '', country: 'GT' },
    },
    receptor: { id: doc.receiver.taxId, name: doc.receiver.name, specialType: doc.receiver.kind === 'CUI' ? 'CUI' : null, email: '', address: null },
    phrases: cfg.digifact.frases.map(([tipo, escenario]) => ({ tipo, escenario })),
    items: doc.lines.map((l, k) => {
      const total = Math.round((l.qty * l.unitPrice - l.discount) * 100) / 100
      const tax = Math.round((total - total / (1 + cfg.ivaRate)) * 1e6) / 1e6
      return { line: k + 1, kind: l.type, qty: l.qty, unit: 'UNI', description: l.description, unitPrice: l.unitPrice, price: l.qty * l.unitPrice, discount: l.discount, taxes: [{ name: 'IVA', taxable: total - tax, amount: tax }], total }
    }),
    totals: { taxes: [{ name: 'IVA', amount: doc.totalTax }], grandTotal: doc.total },
    certification: sale.felAuthNumber ? {
      certifierNit: sale.felCertifierNit ?? '', certifierName: sale.felCertifierName ?? 'Simulador', uuid: sale.felAuthNumber,
      serie: sale.felSatSerie ?? '', numero: sale.felSatNumber ?? '', certifiedAt: sale.felCertifiedAt?.toISOString() ?? '',
    } : null,
    reference: null,
    adenda: {},
  }
}
