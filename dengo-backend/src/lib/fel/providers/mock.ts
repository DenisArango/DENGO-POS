// Offline stand-in for a certifier (FEL_PROVIDER=mock). It accepts any
// well-formed document and answers like FELplex does, so the whole flow —
// checkout, receipt, portal invoice, annulment, credit notes — can be tested
// before there are credentials. Documents it "certifies" are marked
// environment=mock and print as having no fiscal value.
//
// To exercise the failure paths: a receiver name containing "RECHAZAR" gets a
// SAT-style rejection, "SIN CONEXION" an unreachable certifier.

import { randomUUID, createHash } from 'node:crypto'
import type { CertifyResult, DteDocument, FelProvider, TaxIdLookup, VoidResult } from '../types.js'
import { isValidGtNit } from '../../nit.js'

const issued = new Map<string, CertifyResult>()

export function mockProvider(): FelProvider {
  return {
    name: 'mock',
    environment: 'mock',

    async certify(doc: DteDocument): Promise<CertifyResult> {
      const name = doc.receiver.name.toUpperCase()
      if (name.includes('SIN CONEXION')) return { ok: false, errors: ['Simulador: no se pudo conectar con el certificador'], retryable: true }
      if (name.includes('RECHAZAR')) return { ok: false, errors: ['FEL_RCP302 El NIT no existe en la SAT. (simulado)'], retryable: false }
      const sum = round2(doc.lines.reduce((s, l) => s + l.qty * l.unitPrice - l.discount, 0))
      if (Math.abs(sum - doc.total) > 0.001) return { ok: false, errors: [`FEL_RCP348 Total calculado incorrectamente (líneas ${sum} ≠ total ${doc.total}) (simulado)`], retryable: false }
      const uuid = randomUUID().toUpperCase()
      const authorization = randomUUID().toUpperCase()
      const res: CertifyResult = {
        ok: true,
        uuid,
        serie: authorization.slice(0, 8),
        number: String(parseInt(createHash('sha1').update(authorization).digest('hex').slice(0, 8), 16)),
        authorization,
        certifiedAt: new Date(),
        certifierName: 'SIMULADOR DENGO (sin validez fiscal)',
        certifierNit: '0000000',
        errors: [],
        retryable: false,
      }
      issued.set(uuid, res)
      return res
    },

    async void(uuid: string): Promise<VoidResult> {
      return issued.has(uuid) || uuid ? { ok: true, errors: [] } : { ok: false, errors: ['Documento no encontrado'] }
    },

    async get(uuid: string): Promise<CertifyResult> {
      return issued.get(uuid) ?? { ok: false, errors: ['El simulador no conserva documentos entre reinicios'], retryable: false }
    },

    async lookupTaxId(kind, id): Promise<TaxIdLookup> {
      const clean = id.replace(/[\s-]/g, '').toUpperCase()
      if (kind === 'NIT' && !isValidGtNit(clean)) return { found: false, taxId: clean }
      if (kind === 'CUI' && !/^\d{13}$/.test(clean)) return { found: false, taxId: clean }
      return { found: true, taxId: clean, name: `CONTRIBUYENTE DE PRUEBA ${clean}` }
    },

    async credits() {
      return 999
    },
  }
}

const round2 = (n: number) => Math.round(n * 100) / 100
