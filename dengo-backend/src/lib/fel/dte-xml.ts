// Reads a certified SAT DTE (XSD GT_Documento, "dte:" namespace) into a plain
// model for our printable invoice. The XML is the same whatever the certifier,
// so this works for Digifact and FELplex alike. Deliberately tolerant: it
// matches on local element names and ignores namespace prefixes.

export interface DteAddressModel { street: string; zip: string; municipio: string; departamento: string; country: string }

export interface DteModel {
  type: string
  issuedAt: string
  currency: string
  accessNumber: string | null
  emisor: {
    nit: string; name: string; commercialName: string; establishment: string; afiliacionIva: string; email: string
    address: DteAddressModel | null
  }
  receptor: { id: string; name: string; specialType: string | null; email: string; address: DteAddressModel | null }
  phrases: { tipo: string; escenario: string; resolution?: string; resolutionDate?: string }[]
  items: {
    line: number; kind: 'B' | 'S'; qty: number; unit: string; description: string
    unitPrice: number; price: number; discount: number; taxes: { name: string; taxable: number; amount: number }[]; total: number
  }[]
  totals: { taxes: { name: string; amount: number }[]; grandTotal: number }
  certification: { certifierNit: string; certifierName: string; uuid: string; serie: string; numero: string; certifiedAt: string } | null
  /** Credit / debit notes: the document they modify. */
  reference: { uuid: string; serie: string; numero: string; date: string; reason: string } | null
  /** Our own adenda fields (REFERENCIA_INTERNA, VENTA, …). */
  adenda: Record<string, string>
}

const decode = (s: string) => s
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n))).replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
  .replace(/&amp;/g, '&')

/** First element with this local name: its attributes and inner XML. */
function el(xml: string, name: string): { attrs: Record<string, string>; inner: string } | null {
  const re = new RegExp(`<(?:[\\w.-]+:)?${name}\\b([^>]*?)(?:/>|>([\\s\\S]*?)</(?:[\\w.-]+:)?${name}>)`)
  const m = xml.match(re)
  return m ? { attrs: attrsOf(m[1] ?? ''), inner: m[2] ?? '' } : null
}

function all(xml: string, name: string): { attrs: Record<string, string>; inner: string }[] {
  const re = new RegExp(`<(?:[\\w.-]+:)?${name}\\b([^>]*?)(?:/>|>([\\s\\S]*?)</(?:[\\w.-]+:)?${name}>)`, 'g')
  return [...xml.matchAll(re)].map(m => ({ attrs: attrsOf(m[1] ?? ''), inner: m[2] ?? '' }))
}

function attrsOf(s: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const m of s.matchAll(/([\w:.-]+)\s*=\s*"([^"]*)"/g)) {
    const key = (m[1] ?? '').replace(/^[\w.-]+:/, '')
    out[key] = decode(m[2] ?? '')
  }
  return out
}

const text = (xml: string | undefined, name: string) => {
  if (!xml) return ''
  const e = el(xml, name)
  return e ? decode(e.inner.replace(/<[^>]+>/g, '').trim()) : ''
}
const num = (s: string | undefined) => (s ? Number(s) : 0)

function address(inner: string | undefined): DteAddressModel | null {
  if (!inner) return null
  return {
    street: text(inner, 'Direccion'),
    zip: text(inner, 'CodigoPostal'),
    municipio: text(inner, 'Municipio'),
    departamento: text(inner, 'Departamento'),
    country: text(inner, 'Pais'),
  }
}

export function parseDte(xml: string): DteModel {
  const general = el(xml, 'DatosGenerales')?.attrs ?? {}
  const emisorEl = el(xml, 'Emisor')
  const receptorEl = el(xml, 'Receptor')
  const cert = el(xml, 'Certificacion')
  const auth = cert ? el(cert.inner, 'NumeroAutorizacion') : null

  const items = all(el(xml, 'Items')?.inner ?? '', 'Item').map((it, k) => ({
    line: Number(it.attrs.NumeroLinea ?? k + 1),
    kind: (it.attrs.BienOServicio === 'S' ? 'S' : 'B') as 'B' | 'S',
    qty: num(text(it.inner, 'Cantidad')),
    unit: text(it.inner, 'UnidadMedida'),
    description: text(it.inner, 'Descripcion'),
    unitPrice: num(text(it.inner, 'PrecioUnitario')),
    price: num(text(it.inner, 'Precio')),
    discount: num(text(it.inner, 'Descuento')),
    taxes: all(it.inner, 'Impuesto').map(t => ({
      name: text(t.inner, 'NombreCorto'),
      taxable: num(text(t.inner, 'MontoGravable')),
      amount: num(text(t.inner, 'MontoImpuesto')),
    })),
    total: num(text(it.inner, 'Total')),
  }))

  const totalesEl = el(xml, 'Totales')
  const taxes = all(totalesEl?.inner ?? '', 'TotalImpuesto').map(t => ({ name: t.attrs.NombreCorto ?? '', amount: num(t.attrs.TotalMontoImpuesto) }))

  const ref = el(xml, 'ReferenciasNota')?.attrs
  const adenda: Record<string, string> = {}
  const adendaEl = el(xml, 'Adenda')
  if (adendaEl) {
    for (const m of adendaEl.inner.matchAll(/<(?:[\w.-]+:)?([A-Za-z_][\w.-]*)\b[^>]*>([^<]*)<\/(?:[\w.-]+:)?\1>/g)) {
      const v = decode((m[2] ?? '').trim())
      if (v) adenda[(m[1] ?? '').toUpperCase()] = v
    }
    for (const info of all(adendaEl.inner, 'Info')) if (info.attrs.Name && info.attrs.Value) adenda[info.attrs.Name.toUpperCase()] = info.attrs.Value
  }

  return {
    type: general.Tipo ?? 'FACT',
    issuedAt: general.FechaHoraEmision ?? '',
    currency: general.CodigoMoneda ?? 'GTQ',
    accessNumber: general.NumeroAcceso ?? null,
    emisor: {
      nit: emisorEl?.attrs.NITEmisor ?? '',
      name: emisorEl?.attrs.NombreEmisor ?? '',
      commercialName: emisorEl?.attrs.NombreComercial ?? '',
      establishment: emisorEl?.attrs.CodigoEstablecimiento ?? '',
      afiliacionIva: emisorEl?.attrs.AfiliacionIVA ?? '',
      email: emisorEl?.attrs.CorreoEmisor ?? '',
      address: address(el(emisorEl?.inner ?? '', 'DireccionEmisor')?.inner),
    },
    receptor: {
      id: receptorEl?.attrs.IDReceptor ?? 'CF',
      name: receptorEl?.attrs.NombreReceptor ?? '',
      specialType: receptorEl?.attrs.TipoEspecial ?? null,
      email: receptorEl?.attrs.CorreoReceptor ?? '',
      address: address(el(receptorEl?.inner ?? '', 'DireccionReceptor')?.inner),
    },
    phrases: all(el(xml, 'Frases')?.inner ?? '', 'Frase').map(f => ({
      tipo: f.attrs.TipoFrase ?? '', escenario: f.attrs.CodigoEscenario ?? '',
      ...(f.attrs.NumeroResolucion ? { resolution: f.attrs.NumeroResolucion } : {}),
      ...(f.attrs.FechaResolucion ? { resolutionDate: f.attrs.FechaResolucion } : {}),
    })),
    items,
    totals: { taxes, grandTotal: num(text(totalesEl?.inner, 'GranTotal')) },
    certification: auth ? {
      certifierNit: text(cert?.inner, 'NITCertificador'),
      certifierName: text(cert?.inner, 'NombreCertificador'),
      uuid: decode(auth.inner.trim()),
      serie: auth.attrs.Serie ?? '',
      numero: auth.attrs.Numero ?? '',
      certifiedAt: text(cert?.inner, 'FechaHoraCertificacion'),
    } : null,
    reference: ref ? {
      uuid: ref.NumeroAutorizacionDocumentoOrigen ?? '',
      serie: ref.SerieDocumentoOrigen ?? '',
      numero: ref.NumeroDocumentoOrigen ?? '',
      date: ref.FechaEmisionDocumentoOrigen ?? '',
      reason: ref.MotivoAjuste ?? '',
    } : null,
    adenda,
  }
}
