// Credit account pieces for Clientes:
//  - ChargeModal: "Cargar saldo" — raises a customer's balance with no sale
//    behind it (debt from the previous system that the import didn't bring,
//    or a correction). Needs customers.addCharge.
//  - AccountStatement: the account's movements (credit sales, charges,
//    abonos) with the running balance; charges can be voided from here.
import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { FilePlus2, Ban } from 'lucide-react'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { toast } from 'sonner'
import { api } from '../../lib/api'

export interface ChargeCustomer {
  id: string
  name: string
  creditUsed?: number
  creditEnabled?: boolean
  creditLimitEnabled?: boolean
  creditLimit?: number
}

const q = (n: number) => `Q${n.toLocaleString('es-GT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
// Today in Guatemala (UTC-6), as YYYY-MM-DD for the date inputs.
const todayGT = () => new Date(Date.now() - 6 * 3_600_000).toISOString().slice(0, 10)

export function ChargeModal({ customer, onClose, onSaved }: { customer: ChargeCustomer; onClose: () => void; onSaved: () => void }) {
  const [amount, setAmount] = useState('')
  const [concept, setConcept] = useState('Saldo anterior')
  const [reference, setReference] = useState('')
  const [chargeDate, setChargeDate] = useState(todayGT())
  const [dueDate, setDueDate] = useState('')
  const [saving, setSaving] = useState(false)

  const current = Number(customer.creditUsed ?? 0)
  const value = Math.round((parseFloat(amount) || 0) * 100) / 100
  const after = current + value
  const capped = !!customer.creditEnabled && customer.creditLimitEnabled !== false
  const limit = Number(customer.creditLimit ?? 0)

  const save = () => {
    if (!value || value <= 0) { toast.error('Ingresa el monto del cargo'); return }
    if (concept.trim().length < 3) { toast.error('Escribe el concepto del cargo'); return }
    if (dueDate && dueDate < chargeDate) { toast.error('El vencimiento no puede ser antes de la fecha del cargo'); return }
    setSaving(true)
    api.post<{ overLimit: boolean }>(`/api/customers/${customer.id}/credit-charge`, {
      amount: value,
      concept: concept.trim(),
      reference: reference.trim() || undefined,
      chargeDate,
      dueDate: dueDate || undefined,
    })
      .then(res => {
        toast.success(`Cargo de ${q(value)} registrado. Saldo nuevo: ${q(after)}`)
        if (res.overLimit) toast.warning('El saldo quedó arriba del límite de crédito del cliente', { duration: 6000 })
        onSaved()
      })
      .catch(e => toast.error(e instanceof Error ? e.message : 'No se pudo registrar el cargo'))
      .finally(() => setSaving(false))
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
        className="bg-white rounded-lg shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b">
          <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
            <FilePlus2 size={20} className="text-orange-600" /> Cargar saldo
          </h2>
          <p className="text-sm text-gray-500 mt-1">{customer.name}</p>
        </div>
        <div className="p-6 space-y-4">
          <p className="text-xs text-gray-500 bg-orange-50 border border-orange-100 rounded-lg px-3 py-2">
            Suma una deuda a la cuenta del cliente sin hacer una venta: por ejemplo, el saldo que traía del sistema anterior.
            No mueve inventario ni caja, y se paga con abonos como cualquier crédito.
          </p>
          <div>
            <label className="label">Monto (Q) *</label>
            <input type="number" min={0.01} step={0.01} value={amount} onChange={e => setAmount(e.target.value)}
              className="input w-full" placeholder="0.00" autoFocus />
          </div>
          <div>
            <label className="label">Concepto *</label>
            <input type="text" maxLength={200} value={concept} onChange={e => setConcept(e.target.value)} className="input w-full" />
          </div>
          <div>
            <label className="label">Referencia</label>
            <input type="text" maxLength={100} value={reference} onChange={e => setReference(e.target.value)}
              className="input w-full" placeholder="N.º de factura o vale del sistema anterior (opcional)" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Fecha de la deuda</label>
              <input type="date" max={todayGT()} value={chargeDate} onChange={e => setChargeDate(e.target.value)} className="input w-full" />
            </div>
            <div>
              <label className="label">Vence</label>
              <input type="date" min={chargeDate} value={dueDate} onChange={e => setDueDate(e.target.value)} className="input w-full" />
            </div>
          </div>
          <div className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-2.5 text-sm space-y-1">
            <div className="flex justify-between text-gray-600"><span>Saldo actual</span><span>{q(current)}</span></div>
            <div className="flex justify-between font-semibold text-gray-800"><span>Saldo después del cargo</span><span>{q(after)}</span></div>
            {capped && limit > 0 && after > limit + 0.001 && (
              <p className="text-xs text-orange-600">Queda arriba del límite de crédito ({q(limit)}). Se registra igual, porque la deuda ya existe.</p>
            )}
            {!customer.creditEnabled && (
              <p className="text-xs text-gray-500">Este cliente no tiene crédito activado para comprar fiado; el saldo se registra y se puede abonar igual.</p>
            )}
          </div>
        </div>
        <div className="flex gap-3 justify-end p-6 border-t">
          <button type="button" onClick={onClose} className="btn-secondary btn-md">Cancelar</button>
          <button type="button" onClick={save} disabled={saving}
            className="btn-primary btn-md flex items-center gap-2 disabled:opacity-50">
            {saving && <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />}
            Registrar cargo
          </button>
        </div>
      </motion.div>
    </div>
  )
}

interface Movement {
  type: 'SALE' | 'CHARGE' | 'PAYMENT' | 'OPENING'
  id: string
  date: string
  description: string
  reference: string | null
  debit: number
  credit: number
  balance: number
  by?: string | null
  voided?: boolean
  voidReason?: string | null
  voidedBy?: string | null
  dueDate?: string | null
}

const TAG: Record<Movement['type'], { label: string; cls: string }> = {
  SALE: { label: 'Venta', cls: 'bg-blue-100 text-blue-700' },
  CHARGE: { label: 'Cargo', cls: 'bg-orange-100 text-orange-700' },
  PAYMENT: { label: 'Abono', cls: 'bg-green-100 text-green-700' },
  OPENING: { label: 'Inicial', cls: 'bg-gray-100 text-gray-600' },
}

export function AccountStatement({ customerId, canVoid, onChanged }: { customerId: string; canVoid: boolean; onChanged: () => void }) {
  const [data, setData] = useState<{ balance: number; movements: Movement[] } | null>(null)
  const [loading, setLoading] = useState(true)
  const [voiding, setVoiding] = useState<Movement | null>(null)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)

  const load = () => {
    setLoading(true)
    api.get<{ balance: number; movements: Movement[] }>(`/api/customers/${customerId}/account`)
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false))
  }
  useEffect(load, [customerId])

  const confirmVoid = () => {
    if (!voiding) return
    if (reason.trim().length < 3) { toast.error('Escribe el motivo de la anulación'); return }
    setBusy(true)
    api.post(`/api/customers/${customerId}/credit-charge/${voiding.id}/void`, { reason: reason.trim() })
      .then(() => { toast.success('Cargo anulado'); setVoiding(null); setReason(''); load(); onChanged() })
      .catch(e => toast.error(e instanceof Error ? e.message : 'No se pudo anular'))
      .finally(() => setBusy(false))
  }

  if (loading) return <div className="flex justify-center py-10"><div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary-600" /></div>
  if (!data) return <p className="text-sm text-gray-400 text-center py-10">No se pudo cargar el estado de cuenta.</p>

  const rows = [...data.movements].reverse() // newest first
  return (
    <div className="p-4 space-y-3">
      <div className="flex items-center justify-between bg-gray-50 border border-gray-200 rounded-lg px-4 py-3">
        <span className="text-sm text-gray-600">Saldo pendiente</span>
        <span className={`text-lg font-bold ${data.balance > 0 ? 'text-orange-600' : 'text-gray-800'}`}>{q(data.balance)}</span>
      </div>
      {rows.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-8">Sin movimientos de crédito.</p>
      ) : (
        <ul className="divide-y divide-gray-100">
          {rows.map(m => (
            <li key={`${m.type}-${m.id}`} className={`py-3 flex items-start gap-3 ${m.voided ? 'opacity-60' : ''}`}>
              <span className={`mt-0.5 shrink-0 px-2 py-0.5 rounded-full text-[11px] font-medium ${TAG[m.type].cls}`}>{TAG[m.type].label}</span>
              <div className="flex-1 min-w-0">
                <p className={`text-sm font-medium text-gray-800 ${m.voided ? 'line-through' : ''}`}>{m.description}</p>
                <p className="text-xs text-gray-400">
                  {m.type === 'OPENING' ? 'Saldo que el cliente ya traía, sin movimientos registrados' : format(new Date(m.date), "d MMM yyyy", { locale: es })}
                  {m.reference && <> · {m.reference}</>}
                  {m.by && <> · {m.by}</>}
                  {m.dueDate && !m.voided && <> · vence {format(new Date(m.dueDate), 'd MMM yyyy', { locale: es })}</>}
                </p>
                {m.voided && <p className="text-xs text-red-500">Anulado{m.voidedBy ? ` por ${m.voidedBy}` : ''}: {m.voidReason}</p>}
              </div>
              <div className="text-right shrink-0">
                <p className={`text-sm font-semibold ${m.credit > 0 ? 'text-green-600' : 'text-gray-800'} ${m.voided ? 'line-through' : ''}`}>
                  {m.credit > 0 ? `−${q(m.credit)}` : `+${q(m.debit)}`}
                </p>
                <p className="text-[11px] text-gray-400">saldo {q(m.balance)}</p>
                {canVoid && m.type === 'CHARGE' && !m.voided && (
                  <button onClick={() => { setVoiding(m); setReason('') }} className="mt-1 inline-flex items-center gap-1 text-[11px] text-red-600 hover:underline">
                    <Ban size={11} /> Anular
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {voiding && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-sm p-6 space-y-4">
            <div>
              <h3 className="text-lg font-semibold text-gray-800">Anular cargo</h3>
              <p className="text-sm text-gray-500 mt-1">{voiding.description} · {q(voiding.debit)}. El monto se resta del saldo y el cargo queda en el historial como anulado.</p>
            </div>
            <div>
              <label className="label">Motivo *</label>
              <input type="text" maxLength={500} value={reason} onChange={e => setReason(e.target.value)} className="input w-full" placeholder="Ej.: se cargó por error" autoFocus />
            </div>
            <div className="flex gap-3 justify-end">
              <button onClick={() => setVoiding(null)} className="btn-secondary btn-md">Cancelar</button>
              <button onClick={confirmVoid} disabled={busy} className="btn-danger btn-md disabled:opacity-50">Anular cargo</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
