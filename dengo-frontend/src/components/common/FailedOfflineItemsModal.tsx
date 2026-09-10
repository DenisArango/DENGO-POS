// Shows sales/register ops that were queued offline and genuinely REJECTED
// by the server once synced (not a connectivity issue — see
// lib/offlineSync.ts's trySync, which marks these 'failed' instead of
// retrying forever). Without this they sit invisible in IndexedDB — a real
// sale the cashier rang up and handed a receipt for, gone from the business
// with nobody knowing. "Reintentar" is for when whatever the backend
// rejected has since been fixed elsewhere (e.g. the customer's credit was
// re-enabled); "Descartar" permanently drops it, acknowledging it has to be
// re-entered by hand if it still needs to happen.
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { X, AlertTriangle, RotateCcw, Trash2 } from 'lucide-react'
import {
  getPendingSales, updatePendingSale, removePendingSale, type PendingSale,
  getPendingRegisterOps, updatePendingRegisterOp, removePendingRegisterOp, type PendingRegisterOp,
  getCache,
} from '../../lib/offlineDb'
import { trySync, refreshPendingCount } from '../../lib/offlineSync'

interface CustomerLite { id: string; name?: string; fullName?: string }

export default function FailedOfflineItemsModal({ onClose }: { onClose: () => void }) {
  const [failedSales, setFailedSales] = useState<PendingSale[]>([])
  const [failedOps, setFailedOps] = useState<PendingRegisterOp[]>([])
  const [customerNames, setCustomerNames] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)

  const load = async () => {
    setLoading(true)
    const [sales, ops, customers] = await Promise.all([
      getPendingSales(),
      getPendingRegisterOps(),
      getCache<CustomerLite[]>('customers'),
    ])
    setFailedSales(sales.filter(s => s.status === 'failed'))
    setFailedOps(ops.filter(o => o.status === 'failed'))
    if (customers) {
      const map: Record<string, string> = {}
      customers.forEach(c => { map[c.id] = c.fullName ?? c.name ?? 'Cliente' })
      setCustomerNames(map)
    }
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const retrySale = async (s: PendingSale) => {
    setBusyId(s.localId)
    await updatePendingSale(s.localId, { status: 'pending' })
    await refreshPendingCount()
    toast.success('Se reintentará en el próximo ciclo de sincronización')
    trySync()
    await load()
    setBusyId(null)
  }

  const discardSale = async (s: PendingSale) => {
    if (!confirm('¿Descartar esta venta? No se podrá recuperar — si todavía corresponde, tendrás que registrarla de nuevo a mano.')) return
    setBusyId(s.localId)
    await removePendingSale(s.localId)
    await refreshPendingCount()
    toast.success('Venta descartada')
    await load()
    setBusyId(null)
  }

  const retryOp = async (o: PendingRegisterOp) => {
    setBusyId(o.localId)
    await updatePendingRegisterOp(o.localId, { status: 'pending' })
    await refreshPendingCount()
    toast.success('Se reintentará en el próximo ciclo de sincronización')
    trySync()
    await load()
    setBusyId(null)
  }

  const discardOp = async (o: PendingRegisterOp) => {
    if (!confirm('¿Descartar esto? No se podrá recuperar.')) return
    setBusyId(o.localId)
    await removePendingRegisterOp(o.localId)
    await refreshPendingCount()
    toast.success('Descartado')
    await load()
    setBusyId(null)
  }

  const total = failedSales.length + failedOps.length

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50" onClick={onClose}>
      <div className="bg-white rounded-lg p-6 max-w-2xl w-full max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2">
            <AlertTriangle size={20} className="text-red-600" /> Ventas y movimientos rechazados
          </h3>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded"><X size={18} /></button>
        </div>

        {loading ? (
          <p className="text-sm text-gray-500">Cargando...</p>
        ) : total === 0 ? (
          <p className="text-sm text-gray-500">No hay ventas ni movimientos rechazados.</p>
        ) : (
          <div className="space-y-3">
            {failedSales.map(s => (
              <div key={s.localId} className="border border-red-200 bg-red-50 rounded-lg p-3">
                <div className="flex justify-between items-start gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-gray-800">
                      Venta — Q{Number(s.payload.total ?? 0).toFixed(2)}
                      {Array.isArray(s.payload.items) && ` (${s.payload.items.length} artículo${s.payload.items.length === 1 ? '' : 's'})`}
                    </p>
                    <p className="text-xs text-gray-500">
                      Cliente: {customerNames[s.payload.customerId as string] ?? (s.payload.customerId as string) ?? '—'}
                    </p>
                    <p className="text-xs text-gray-400">{new Date(s.createdAt).toLocaleString('es-GT')}</p>
                    <p className="text-sm text-red-700 font-medium mt-1">Motivo: {s.lastError ?? 'Desconocido'}</p>
                  </div>
                  <div className="flex flex-col gap-1 shrink-0">
                    <button disabled={busyId === s.localId} onClick={() => retrySale(s)} className="btn-outline btn-sm flex items-center gap-1 whitespace-nowrap">
                      <RotateCcw size={13} /> Reintentar
                    </button>
                    <button disabled={busyId === s.localId} onClick={() => discardSale(s)} className="btn-outline btn-sm text-red-600 flex items-center gap-1 whitespace-nowrap">
                      <Trash2 size={13} /> Descartar
                    </button>
                  </div>
                </div>
              </div>
            ))}

            {failedOps.map(o => {
              const amount = Number((o.payload as Record<string, unknown>).finalAmount ?? (o.payload as Record<string, unknown>).amount ?? 0)
              return (
                <div key={o.localId} className="border border-red-200 bg-red-50 rounded-lg p-3">
                  <div className="flex justify-between items-start gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-gray-800">
                        {o.kind === 'close' ? 'Cierre de caja' : (o.payload as Record<string, unknown>).type === 'INCOME' ? 'Entrada de caja' : 'Salida de caja'} — Q{amount.toFixed(2)}
                      </p>
                      <p className="text-xs text-gray-400">{new Date(o.createdAt).toLocaleString('es-GT')}</p>
                      <p className="text-sm text-red-700 font-medium mt-1">Motivo: {o.lastError ?? 'Desconocido'}</p>
                    </div>
                    <div className="flex flex-col gap-1 shrink-0">
                      <button disabled={busyId === o.localId} onClick={() => retryOp(o)} className="btn-outline btn-sm flex items-center gap-1 whitespace-nowrap">
                        <RotateCcw size={13} /> Reintentar
                      </button>
                      <button disabled={busyId === o.localId} onClick={() => discardOp(o)} className="btn-outline btn-sm text-red-600 flex items-center gap-1 whitespace-nowrap">
                        <Trash2 size={13} /> Descartar
                      </button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
