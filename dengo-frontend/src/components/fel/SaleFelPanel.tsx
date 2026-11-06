import { useCallback, useEffect, useState } from 'react'
import { FileText, RefreshCw, ExternalLink, AlertTriangle, CheckCircle2, Clock, Undo2, X, Eye } from 'lucide-react'
import { toast } from 'sonner'
import { api } from '../../lib/api'
import { usePermissions } from '../../hooks/usePermissions'

// Factura (FEL) of a sale: SAT certification data, manual retry, the official
// PDF, failed annulments, and notas de crédito (partial returns of a
// certified factura). The certifier lives behind /api/fel (backend lib/fel).

interface CreditLine {
  saleItemId: string
  description: string
  quantity: number
  paid: number
  unitNet: number
  creditedQty: number
  remainingQty: number
  remainingAmount: number
}

interface CreditNote {
  id: string
  number: number
  reason: string
  total: string | number
  returnStock: boolean
  isCancelled: boolean
  createdAt: string
  felStatus: string
  felSatSerie: string | null
  felSatNumber: string | null
  felAuthNumber: string | null
  felPdfUrl: string | null
  felError: string | null
  felEnvironment: string | null
  createdBy?: { name: string }
}

export interface SaleFel {
  id: string
  isVoided: boolean
  buyerNit?: string | null
  buyerName?: string | null
  invoiceSeries?: string | null
  invoiceSeqNumber?: number | null
  felStatus: string
  felError?: string | null
  felSatSerie?: string | null
  felSatNumber?: string | null
  felAuthNumber?: string | null
  felCertifiedAt?: string | null
  felCertifierName?: string | null
  felPdfUrl?: string | null
  felEnvironment?: string | null
  felAttempts?: number
  felLastAttemptAt?: string | null
  felVoidStatus?: string
  felVoidError?: string | null
}

interface DtePreview {
  type: string
  issuedAt: string
  receiver: { kind: string; taxId: string; name: string }
  lines: { description: string; qty: number; unitPrice: number; discount: number }[]
  total: number
  totalTax: number
}

interface CertifyOut { status?: string; error?: string }

const money = (n: number | string) => `Q${Number(n).toFixed(2)}`

export default function SaleFelPanel({ sale, onChanged }: { sale: SaleFel; onChanged: () => void }) {
  const { hasPermission } = usePermissions()
  const canRetry = hasPermission('sales.edit')
  const canCredit = hasPermission('sales.cancel')
  const [busy, setBusy] = useState(false)
  const [notes, setNotes] = useState<CreditNote[]>([])
  const [lines, setLines] = useState<CreditLine[]>([])
  const [showNote, setShowNote] = useState(false)
  const [preview, setPreview] = useState<DtePreview | null>(null)

  const certified = sale.felStatus === 'CERTIFIED'
  const test = certified && sale.felEnvironment && sale.felEnvironment !== 'production'

  const loadNotes = useCallback(() => {
    if (!certified) return
    api.get<{ notes: CreditNote[]; lines: CreditLine[] }>(`/api/fel/sales/${sale.id}/credit-notes`)
      .then(r => { setNotes(r.notes); setLines(r.lines) })
      .catch(() => {})
  }, [sale.id, certified])
  useEffect(loadNotes, [loadNotes])

  const act = async (fn: () => Promise<CertifyOut | undefined>, ok: string) => {
    setBusy(true)
    try {
      const r = await fn()
      if (r?.status && r.status !== 'CERTIFIED' && r.status !== 'SKIPPED') toast.error(r.error ?? 'No se pudo certificar')
      else if (r?.status === 'SKIPPED') toast(r.error ?? 'Sin cambios')
      else toast.success(ok)
      onChanged(); loadNotes()
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const status = sale.isVoided && sale.felVoidStatus === 'VOIDED'
    ? { label: 'Anulada en la SAT', cls: 'bg-gray-100 text-gray-700', icon: Undo2 }
    : certified ? { label: 'Certificada', cls: 'bg-green-100 text-green-700', icon: CheckCircle2 }
    : sale.felStatus === 'FAILED' ? { label: 'Error de certificación', cls: 'bg-red-100 text-red-700', icon: AlertTriangle }
    : { label: 'Pendiente de certificación', cls: 'bg-amber-100 text-amber-700', icon: Clock }
  const Icon = status.icon

  return (
    <div className="bg-white rounded-lg shadow-sm border border-purple-200 overflow-hidden">
      <div className="px-4 py-3 bg-purple-50 border-b border-purple-200 flex flex-wrap items-center gap-3">
        <FileText size={18} className="text-purple-600" />
        <h2 className="text-sm font-semibold text-purple-900">Factura electrónica</h2>
        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${status.cls}`}><Icon size={13} /> {status.label}</span>
        {test && <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-orange-100 text-orange-700">Prueba · sin validez fiscal</span>}
        <div className="ml-auto flex flex-wrap gap-2">
          {certified && sale.felPdfUrl && (
            <a href={sale.felPdfUrl} target="_blank" rel="noopener" className="btn-outline btn-sm flex items-center gap-1.5"><ExternalLink size={14} /> PDF oficial</a>
          )}
          {!certified && !sale.isVoided && canRetry && (
            <button disabled={busy} onClick={() => {
              if (sale.felStatus === 'FAILED' && /podría duplicarse/.test(sale.felError ?? '') && !confirm('El certificador no respondió la vez anterior. Revisa en FELplex que no se haya certificado antes de reintentar. ¿Reintentar ahora?')) return
              act(() => api.post<CertifyOut>(`/api/fel/sales/${sale.id}/certify`, {}), 'Factura certificada')
            }} className="btn-primary btn-sm flex items-center gap-1.5">
              <RefreshCw size={14} className={busy ? 'animate-spin' : ''} /> Certificar ahora
            </button>
          )}
          {!certified && canRetry && (
            <button onClick={() => api.get<{ doc: DtePreview }>(`/api/fel/sales/${sale.id}/preview`).then(r => setPreview(r.doc)).catch(e => toast.error(e.message))}
              className="btn-outline btn-sm flex items-center gap-1.5"><Eye size={14} /> Ver lo que se envía</button>
          )}
          {sale.isVoided && sale.felVoidStatus === 'FAILED' && canCredit && (
            <button disabled={busy} onClick={() => act(() => api.post<CertifyOut>(`/api/fel/sales/${sale.id}/void-retry`, {}), 'Factura anulada en la SAT')}
              className="btn-sm bg-red-50 text-red-600 border border-red-200 rounded-lg px-3 flex items-center gap-1.5"><Undo2 size={14} /> Reintentar anulación</button>
          )}
          {certified && !sale.isVoided && canCredit && lines.some(l => l.remainingQty > 0) && (
            <button onClick={() => setShowNote(true)} className="btn-outline btn-sm flex items-center gap-1.5"><Undo2 size={14} /> Nota de crédito</button>
          )}
        </div>
      </div>

      <div className="p-4 grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
        <Field label="Comprador" value={`${sale.buyerName ?? '—'}`} sub={`NIT ${sale.buyerNit ?? 'CF'}`} />
        {certified ? (
          <>
            <Field label="Serie / Número SAT" value={`${sale.felSatSerie ?? '—'} · ${sale.felSatNumber ?? '—'}`} mono />
            <Field label="No. de autorización" value={sale.felAuthNumber ?? '—'} mono small />
            <Field label="Certificada" value={sale.felCertifiedAt ? new Date(sale.felCertifiedAt).toLocaleString('es-GT') : '—'} sub={sale.felCertifierName ?? undefined} />
          </>
        ) : (
          <>
            <Field label="Correlativo interno" value={`${sale.invoiceSeries ?? ''}-${sale.invoiceSeqNumber ?? ''}`} mono />
            <Field label="Intentos" value={String(sale.felAttempts ?? 0)} sub={sale.felLastAttemptAt ? `Último: ${new Date(sale.felLastAttemptAt).toLocaleString('es-GT')}` : undefined} />
          </>
        )}
      </div>
      {sale.felError && !certified && (
        <p className="mx-4 mb-4 text-xs text-red-700 bg-red-50 border border-red-100 rounded-lg p-3">{sale.felError}</p>
      )}
      {sale.felVoidError && sale.felVoidStatus === 'FAILED' && (
        <p className="mx-4 mb-4 text-xs text-red-700 bg-red-50 border border-red-100 rounded-lg p-3">Anulación en la SAT: {sale.felVoidError}</p>
      )}

      {notes.length > 0 && (
        <div className="border-t">
          <p className="px-4 pt-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Notas de crédito</p>
          <ul className="divide-y">
            {notes.map(n => (
              <li key={n.id} className="px-4 py-3 flex flex-wrap items-center gap-3 text-sm">
                <span className="font-semibold text-gray-800">NC-{n.number}</span>
                <span className="text-gray-600">{n.reason}</span>
                <span className="font-semibold text-gray-800">−{money(n.total)}</span>
                {n.isCancelled ? <span className="text-xs text-gray-500">Cancelada</span>
                  : n.felStatus === 'CERTIFIED' ? <span className="text-xs text-green-700">Certificada {n.felSatSerie ? `· ${n.felSatSerie}-${n.felSatNumber}` : ''}</span>
                  : <span className="text-xs text-red-700">{n.felStatus === 'FAILED' ? 'Error' : 'Pendiente'}{n.felError ? `: ${n.felError}` : ''}</span>}
                <div className="ml-auto flex gap-2">
                  {n.felPdfUrl && <a href={n.felPdfUrl} target="_blank" rel="noopener" className="text-xs text-primary-600 font-medium">PDF</a>}
                  {!n.isCancelled && n.felStatus !== 'CERTIFIED' && canCredit && (
                    <>
                      <button disabled={busy} onClick={() => act(() => api.post<CertifyOut>(`/api/fel/credit-notes/${n.id}/certify`, {}), 'Nota de crédito certificada')} className="text-xs text-primary-600 font-medium">Reintentar</button>
                      <button disabled={busy} onClick={() => confirm('¿Cancelar esta nota? Si se devolvió inventario, se vuelve a descontar.') && act(() => api.post<CertifyOut>(`/api/fel/credit-notes/${n.id}/cancel`, {}), 'Nota cancelada')} className="text-xs text-red-600 font-medium">Cancelar</button>
                    </>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {showNote && <CreditNoteModal saleId={sale.id} lines={lines} onClose={() => setShowNote(false)} onDone={() => { setShowNote(false); onChanged(); loadNotes() }} />}
      {preview && <PreviewModal doc={preview} onClose={() => setPreview(null)} />}
    </div>
  )
}

function Field({ label, value, sub, mono, small }: { label: string; value: string; sub?: string | undefined; mono?: boolean; small?: boolean }) {
  return (
    <div className="min-w-0">
      <p className="text-xs text-gray-400">{label}</p>
      <p className={`${small ? 'text-xs' : 'text-sm'} font-medium text-gray-800 break-all ${mono ? 'font-mono' : ''}`}>{value}</p>
      {sub && <p className="text-xs text-gray-500">{sub}</p>}
    </div>
  )
}

function CreditNoteModal({ saleId, lines, onClose, onDone }: { saleId: string; lines: CreditLine[]; onClose: () => void; onDone: () => void }) {
  const [qty, setQty] = useState<Record<string, string>>({})
  const [reason, setReason] = useState('')
  const [returnStock, setReturnStock] = useState(true)
  const [busy, setBusy] = useState(false)
  const chosen = lines.map(l => ({ l, q: Math.min(Number(qty[l.saleItemId] || 0), l.remainingQty) })).filter(c => c.q > 0)
  const total = chosen.reduce((s, c) => s + (Math.abs(c.q - c.l.remainingQty) < 1e-9 ? c.l.remainingAmount : Math.round(c.l.unitNet * c.q * 100) / 100), 0)

  const submit = async () => {
    if (!chosen.length) return toast.error('Elige qué productos se devuelven')
    if (reason.trim().length < 3) return toast.error('Escribe el motivo')
    setBusy(true)
    try {
      const r = await api.post<{ note: { number: number }; fel?: CertifyOut }>(`/api/fel/sales/${saleId}/credit-notes`, {
        reason: reason.trim(), returnStock, items: chosen.map(c => ({ saleItemId: c.l.saleItemId, quantity: c.q })),
      })
      if (r.fel?.status === 'CERTIFIED') toast.success(`Nota de crédito NC-${r.note.number} certificada`)
      else toast.error(`Nota NC-${r.note.number} guardada pero no certificada: ${r.fel?.error ?? 'pendiente'}`)
      onDone()
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="p-5 border-b flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-gray-800">Nota de crédito</h2>
            <p className="text-xs text-gray-500">Devuelve parte de lo facturado. La factura original sigue vigente y la nota se certifica en la SAT.</p>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded"><X size={18} /></button>
        </div>
        <div className="p-5 space-y-4">
          <table className="w-full text-sm">
            <thead><tr className="text-xs text-gray-500 text-left"><th className="pb-2">Producto</th><th className="pb-2 text-right">Vendido</th><th className="pb-2 text-right">Ya acreditado</th><th className="pb-2 text-right w-28">Devolver</th></tr></thead>
            <tbody className="divide-y">
              {lines.map(l => (
                <tr key={l.saleItemId}>
                  <td className="py-2 pr-2">{l.description}<span className="block text-xs text-gray-400">{money(l.unitNet)} c/u pagado</span></td>
                  <td className="py-2 text-right">{l.quantity}</td>
                  <td className="py-2 text-right">{l.creditedQty || '—'}</td>
                  <td className="py-2 text-right">
                    <input type="number" min={0} max={l.remainingQty} step="1" disabled={l.remainingQty <= 0}
                      value={qty[l.saleItemId] ?? ''} onChange={e => setQty({ ...qty, [l.saleItemId]: e.target.value })}
                      placeholder="0" className="input w-24 text-right" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div>
            <label className="label">Motivo *</label>
            <input className="input w-full" value={reason} onChange={e => setReason(e.target.value)} placeholder="Ej: Devolución de 2 cuadernos en mal estado" />
          </div>
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input type="checkbox" checked={returnStock} onChange={e => setReturnStock(e.target.checked)} className="w-4 h-4" />
            Regresar estos productos al inventario
          </label>
          <div className="flex items-center justify-between bg-gray-50 rounded-lg p-3">
            <span className="text-sm text-gray-600">Total a acreditar</span>
            <span className="text-lg font-bold text-gray-900">{money(total)}</span>
          </div>
        </div>
        <div className="p-5 border-t flex justify-end gap-2">
          <button onClick={onClose} className="btn-outline btn-md">Cancelar</button>
          <button onClick={submit} disabled={busy || !chosen.length} className="btn-primary btn-md">{busy ? 'Certificando…' : 'Emitir nota de crédito'}</button>
        </div>
      </div>
    </div>
  )
}

function PreviewModal({ doc, onClose }: { doc: DtePreview; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="p-5 border-b flex items-center justify-between">
          <h2 className="text-lg font-bold text-gray-800">Factura que se enviará al certificador</h2>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded"><X size={18} /></button>
        </div>
        <div className="p-5 space-y-3 text-sm">
          <p><strong>{doc.type}</strong> · {doc.issuedAt} · {doc.receiver.kind} {doc.receiver.taxId} — {doc.receiver.name}</p>
          <table className="w-full text-xs">
            <thead><tr className="text-gray-500 text-left"><th>Descripción</th><th className="text-right">Cant.</th><th className="text-right">Precio</th><th className="text-right">Descuento</th><th className="text-right">Total</th></tr></thead>
            <tbody className="divide-y">
              {doc.lines.map((l, i) => (
                <tr key={i}><td className="py-1">{l.description}</td><td className="text-right">{l.qty}</td><td className="text-right">{money(l.unitPrice)}</td><td className="text-right">{money(l.discount)}</td><td className="text-right">{money(l.qty * l.unitPrice - l.discount)}</td></tr>
              ))}
            </tbody>
          </table>
          <p className="text-right">Total <strong>{money(doc.total)}</strong> · IVA incluido {money(doc.totalTax)}</p>
        </div>
      </div>
    </div>
  )
}
