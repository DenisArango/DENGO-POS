import { useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { toast } from 'sonner'
import { X, Building2, Printer, Send, Plus, Loader2, Percent } from 'lucide-react'
import { api } from '../../lib/api'
import { useStore } from '../../contexts/StoreContext'

// The same quotation issued by another of the owner's businesses — ej. the
// librería quotes a list and the papelería quotes the same list too. Both are
// real quotations of their own branch (own company name, NIT, logo); the
// second usually costs more because that business buys the products by order,
// so its prices can go up by a % for every line and/or be set line by line.
// Used from Cotizaciones (POS) and from Pedidos del Portal (teachers).

interface SourceItem {
  id: string
  quantity: number | string
  unitPrice: number | string
  discount: number | string
  customName?: string | null
  product?: { name: string } | null
  variation?: { name: string; isDefault?: boolean } | null
}

interface AlternateSummary {
  id: string
  quotationNumber: string
  total: number | string
  status: string
  markupPct?: number | string | null
  branch: { id: string; name: string; companyName?: string | null }
}

interface SourceQuotation {
  id: string
  quotationNumber: string
  branchId?: string
  branch?: { id: string; name: string; companyName?: string | null }
  subtotal: number | string
  discount: number | string
  tax: number | string
  total: number | string
  items: SourceItem[]
  alternates?: AlternateSummary[]
  sourceQuotation?: { id: string } | null
}

interface Props {
  sourceId: string
  onClose: () => void
  /** Receives the full alternate quotation, ready for the print layout. */
  onPrint?: (quotation: any) => void
  /** Portal orders: send this alternate to the teacher's inbox. */
  onSendToTeacher?: (alternateId: string) => Promise<void>
  onChanged?: () => void
}

const money = (n: number) => `Q${n.toLocaleString('es-GT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const round2 = (n: number) => Math.round(n * 100) / 100
const itemName = (it: SourceItem) =>
  it.customName || [it.product?.name, it.variation && !it.variation.isDefault ? it.variation.name : null].filter(Boolean).join(' · ') || '—'

export default function AlternateQuotes({ sourceId, onClose, onPrint, onSendToTeacher, onChanged }: Props) {
  const { availableStores } = useStore()
  const [source, setSource] = useState<SourceQuotation | null>(null)
  const [loading, setLoading] = useState(true)
  const [branchId, setBranchId] = useState('')
  const [markup, setMarkup] = useState('0')
  // Lines whose price was typed by hand (source item id → price as typed).
  const [manual, setManual] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)

  const load = () => {
    setLoading(true)
    api.get<SourceQuotation>(`/api/quotations/${sourceId}`)
      .then(q => setSource(q))
      .catch(e => { toast.error(e.message); onClose() })
      .finally(() => setLoading(false))
  }
  useEffect(load, [sourceId]) // eslint-disable-line react-hooks/exhaustive-deps

  const sourceBranchId = source?.branch?.id ?? source?.branchId
  const branches = useMemo(
    () => availableStores.filter(s => s.status === 'active' && s.id !== sourceBranchId),
    [availableStores, sourceBranchId],
  )
  useEffect(() => {
    if (!branchId && branches.length === 1) setBranchId(branches[0]!.id)
  }, [branches, branchId])

  const pct = Number(markup) || 0
  const lines = (source?.items ?? []).map(it => {
    const qty = Number(it.quantity)
    const base = Number(it.unitPrice)
    const typed = manual[it.id]
    const price = typed !== undefined && typed !== '' ? Math.max(0, Number(typed) || 0) : round2(base * (1 + pct / 100))
    return { it, qty, base, price, isManual: typed !== undefined && typed !== '', total: round2(qty * price * (1 - Number(it.discount))) }
  })
  const newSubtotal = round2(lines.reduce((s, l) => s + l.total, 0))
  const srcSubtotal = Number(source?.subtotal ?? 0)
  const srcTax = Number(source?.tax ?? 0)
  const newTax = srcTax > 0 && srcSubtotal > 0 ? round2(srcTax * newSubtotal / srcSubtotal) : 0
  const newTotal = Math.max(0, round2(Number(source?.total ?? 0) + (newSubtotal - srcSubtotal) + (newTax - srcTax)))

  const create = () => {
    if (!source || !branchId) return
    const prices: Record<string, number> = {}
    for (const l of lines) if (l.isManual) prices[l.it.id] = l.price
    setSaving(true)
    api.post<{ id: string; quotationNumber: string }>(`/api/quotations/${source.id}/alternate`, { branchId, markupPct: pct, prices })
      .then(q => {
        toast.success(`Cotización ${q.quotationNumber} creada en ${branches.find(b => b.id === branchId)?.companyName || branches.find(b => b.id === branchId)?.name}`)
        setManual({})
        load()
        onChanged?.()
      })
      .catch(e => toast.error(e.message))
      .finally(() => setSaving(false))
  }

  const print = (id: string) => {
    if (!onPrint) return
    setBusyId(id)
    api.get<any>(`/api/quotations/${id}`)
      .then(q => onPrint(q))
      .catch(e => toast.error(e.message))
      .finally(() => setBusyId(null))
  }

  const send = (id: string) => {
    if (!onSendToTeacher) return
    setBusyId(id)
    onSendToTeacher(id).finally(() => setBusyId(null))
  }

  const isAlternate = !!source?.sourceQuotation

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-950/40 p-4 backdrop-blur-[2px] print:hidden">
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-xl bg-white shadow-xl"
      >
        <div className="flex items-start justify-between gap-4 border-b p-5">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-violet-100 to-violet-50 text-violet-600 ring-1 ring-inset ring-violet-200/60">
              <Building2 size={20} aria-hidden />
            </span>
            <div>
              <h2 className="text-lg font-bold text-gray-900">Cotización de otra sucursal</h2>
              <p className="text-sm text-gray-500">
                La misma lista cotizada por otro de tus negocios, con sus propios datos y precios.
                {source && <> Original: <span className="font-medium text-gray-700">{source.quotationNumber}</span> · {source.branch?.companyName || source.branch?.name}</>}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="rounded p-1 hover:bg-gray-100" aria-label="Cerrar"><X size={20} /></button>
        </div>

        <div className="flex-1 space-y-6 overflow-y-auto p-5">
          {loading || !source ? (
            <div className="flex justify-center py-12"><Loader2 className="animate-spin text-primary-500" /></div>
          ) : isAlternate ? (
            <p className="rounded-lg bg-amber-50 p-4 text-sm text-amber-800">Esta ya es la cotización de otra sucursal. Ábrela desde la original para crear otra.</p>
          ) : (
            <>
              {(source.alternates?.length ?? 0) > 0 && (
                <section>
                  <h3 className="mb-2 text-sm font-semibold text-gray-900">Ya creadas</h3>
                  <ul className="divide-y divide-gray-100 rounded-lg border border-gray-200">
                    {source.alternates!.map(a => (
                      <li key={a.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                        <div className="min-w-0 flex-1">
                          <p className="font-medium text-gray-900">{a.branch.companyName || a.branch.name} <span className="font-mono text-xs text-gray-500">{a.quotationNumber}</span></p>
                          <p className="text-xs text-gray-500">
                            {money(Number(a.total))}
                            {a.markupPct != null && Number(a.markupPct) !== 0 && <> · {Number(a.markupPct) > 0 ? '+' : ''}{Number(a.markupPct)} % sobre la original</>}
                          </p>
                        </div>
                        {onPrint && (
                          <button onClick={() => print(a.id)} disabled={busyId === a.id} className="btn-outline btn-sm flex items-center gap-1.5">
                            <Printer size={15} /> Imprimir
                          </button>
                        )}
                        {onSendToTeacher && (
                          <button onClick={() => send(a.id)} disabled={busyId === a.id} className="btn-outline btn-sm flex items-center gap-1.5">
                            <Send size={15} /> Enviar al maestro
                          </button>
                        )}
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              <section className="space-y-4">
                <h3 className="text-sm font-semibold text-gray-900">Nueva cotización</h3>
                {branches.length === 0 ? (
                  <p className="rounded-lg bg-gray-50 p-4 text-sm text-gray-600">No hay otra sucursal activa. Agrega tu otro negocio en Configuración → Tiendas, con su nombre comercial y NIT.</p>
                ) : (
                  <>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <label className="block">
                        <span className="mb-1 block text-sm font-medium text-gray-700">Sucursal que cotiza</span>
                        <select value={branchId} onChange={e => setBranchId(e.target.value)} className="input w-full">
                          <option value="">Elige la sucursal…</option>
                          {branches.map(b => <option key={b.id} value={b.id}>{b.companyName ? `${b.companyName} (${b.name})` : b.name}</option>)}
                        </select>
                      </label>
                      <div>
                        <span className="mb-1 block text-sm font-medium text-gray-700">Aumento a todos los precios</span>
                        <div className="flex items-center gap-2">
                          <div className="relative w-28">
                            <input type="number" inputMode="decimal" step="0.5" value={markup} onChange={e => setMarkup(e.target.value)} className="input w-full pr-8 text-right" />
                            <Percent size={14} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" />
                          </div>
                          {[5, 10, 15, 20].map(v => (
                            <button key={v} type="button" onClick={() => setMarkup(String(v))}
                              className={`rounded-md px-2 py-1 text-xs font-medium transition-colors ${pct === v ? 'bg-violet-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-violet-50 hover:text-violet-700'}`}>
                              +{v}%
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>

                    <div className="overflow-x-auto rounded-lg border border-gray-200">
                      <table className="w-full text-sm">
                        <thead className="border-b border-gray-200/80 bg-gray-50/70">
                          <tr>
                            <th className="p-3 text-left text-xs font-medium text-gray-500">Producto</th>
                            <th className="p-3 text-right text-xs font-medium text-gray-500">Cant.</th>
                            <th className="p-3 text-right text-xs font-medium text-gray-500">Precio original</th>
                            <th className="p-3 text-right text-xs font-medium text-gray-500">Precio en esta sucursal</th>
                            <th className="p-3 text-right text-xs font-medium text-gray-500">Total</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {lines.map(l => (
                            <tr key={l.it.id}>
                              <td className="p-3 text-gray-800">{itemName(l.it)}</td>
                              <td className="p-3 text-right tabular-nums">{l.qty}</td>
                              <td className="p-3 text-right tabular-nums text-gray-500">{money(l.base)}</td>
                              <td className="p-3 text-right">
                                <div className="inline-flex items-center gap-1">
                                  <span className="text-xs text-gray-400">Q</span>
                                  <input
                                    type="number" inputMode="decimal" step="0.01" min="0"
                                    value={manual[l.it.id] ?? l.price.toFixed(2)}
                                    onChange={e => setManual(m => ({ ...m, [l.it.id]: e.target.value }))}
                                    className={`input w-24 py-1 text-right ${l.isManual ? 'border-violet-300 bg-violet-50/50' : ''}`}
                                    title={l.isManual ? 'Precio puesto a mano — el % ya no lo cambia' : 'Precio con el aumento — escríbelo para ponerlo a mano'}
                                  />
                                  {l.isManual && (
                                    <button type="button" onClick={() => setManual(m => { const n = { ...m }; delete n[l.it.id]; return n })}
                                      className="rounded p-0.5 text-gray-400 hover:text-gray-700" title="Volver al precio con el %" aria-label="Volver al precio con el porcentaje">
                                      <X size={13} />
                                    </button>
                                  )}
                                </div>
                              </td>
                              <td className="p-3 text-right font-semibold tabular-nums">{money(l.total)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    <div className="flex flex-wrap items-end justify-between gap-4 rounded-lg bg-gray-50 p-4">
                      <div className="text-sm text-gray-600">
                        <p>Original: <span className="font-medium text-gray-800">{money(Number(source.total))}</span></p>
                        {Number(source.discount) > 0 && <p className="text-xs text-gray-500">Se mantiene el descuento de {money(Number(source.discount))}.</p>}
                      </div>
                      <div className="text-right">
                        <p className="text-xs font-medium text-gray-500">Total en esta sucursal</p>
                        <p className="text-2xl font-bold tracking-tight text-violet-700">{money(newTotal)}</p>
                      </div>
                    </div>
                  </>
                )}
              </section>
            </>
          )}
        </div>

        <div className="flex justify-end gap-3 border-t p-5">
          <button onClick={onClose} className="btn-secondary btn-md">Cerrar</button>
          {!isAlternate && branches.length > 0 && (
            <button onClick={create} disabled={!branchId || saving || loading} className="btn-primary btn-md flex items-center gap-2 disabled:cursor-not-allowed disabled:opacity-50">
              {saving ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />} Crear cotización
            </button>
          )}
        </div>
      </motion.div>
    </div>
  )
}
