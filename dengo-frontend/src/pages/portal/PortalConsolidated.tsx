import { useEffect, useState, useCallback } from 'react'
import { toast } from 'sonner'
import { BarChart2, Edit2, Check, X, RefreshCw, Package, CheckCircle2, ShoppingCart } from 'lucide-react'
import { api } from '../../lib/api'
import StatStrip from '../../components/common/StatStrip'
import PageIcon from '../../components/common/PageIcon'

const PROGRAM_TYPES = [
  { value: '', label: 'Todos los programas' },
  { value: 'FOOD_PACKAGE', label: '🍽️ Alimentación' },
  { value: 'SCHOOL_SUPPLIES', label: '✏️ Útiles' },
  { value: 'TEACHING_KIT', label: '🎒 Valija' },
  { value: 'GRATUITY', label: '📚 Gratuidades' },
]

const PROGRAM_LABELS: Record<string, string> = {
  FOOD_PACKAGE: 'Alimentación',
  SCHOOL_SUPPLIES: 'Útiles',
  TEACHING_KIT: 'Valija Didáctica',
  GRATUITY: 'Gratuidades',
}

interface ConsolidatedRow {
  productId: string | null // null = typed in by the provider, not in the catalog
  productName: string
  productBrand: string | null
  programType: string
  totalNeeded: number
  purchasedQty: number
  remaining: number
  trackingId: string | null
  notes: string | null
}

interface EditState {
  productId: string
  programType: string
  purchasedQty: string
  notes: string
}

const qty = (n: number) =>
  Number.isInteger(n) ? String(n) : n.toLocaleString('es-GT', { minimumFractionDigits: 0, maximumFractionDigits: 4 })

export default function PortalConsolidated() {
  const [rows, setRows] = useState<ConsolidatedRow[]>([])
  const [year, setYear] = useState(new Date().getFullYear())
  const [programType, setProgramType] = useState('')
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<EditState | null>(null)
  const [saving, setSaving] = useState(false)

  const fetchData = useCallback(() => {
    setLoading(true)
    const qs = new URLSearchParams({ year: String(year) })
    if (programType) qs.set('programType', programType)
    api.get<{ data: ConsolidatedRow[]; year: number }>(`/api/portal-admin/consolidated?${qs}`)
      .then(r => setRows(r.data))
      .catch(e => toast.error(e.message))
      .finally(() => setLoading(false))
  }, [year, programType])

  useEffect(() => { fetchData() }, [fetchData])

  const openEdit = (row: ConsolidatedRow) => {
    if (!row.productId) return // typed-in products have no purchase tracking
    setEditing({
      productId: row.productId,
      programType: row.programType,
      purchasedQty: String(row.purchasedQty),
      notes: row.notes ?? '',
    })
  }

  const cancelEdit = () => setEditing(null)

  const saveEdit = async () => {
    if (!editing) return
    setSaving(true)
    try {
      await api.put('/api/portal-admin/consolidated/tracking', {
        productId: editing.productId,
        programType: editing.programType,
        fiscalYear: year,
        purchasedQty: Number(editing.purchasedQty) || 0,
        notes: editing.notes || null,
      })
      toast.success('Registro actualizado')
      setEditing(null)
      fetchData()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al actualizar')
    } finally {
      setSaving(false)
    }
  }

  const totalNeeded = rows.reduce((s, r) => s + r.totalNeeded, 0)
  const totalPurchased = rows.reduce((s, r) => s + r.purchasedQty, 0)
  const totalRemaining = rows.reduce((s, r) => s + r.remaining, 0)

  const yearOptions = Array.from({ length: 4 }, (_, i) => new Date().getFullYear() - i)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900 flex items-center gap-3">
            <PageIcon icon={BarChart2} color="violet" /> Vista Consolidada
          </h1>
          <p className="text-gray-600 mt-1">
            Total de productos necesarios vs. comprados por programa y año
          </p>
        </div>
        <button onClick={fetchData} className="btn-secondary btn-md flex items-center gap-2">
          <RefreshCw size={16} /> Actualizar
        </button>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 flex flex-wrap gap-4">
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium text-gray-700">Año:</label>
          <select
            value={year}
            onChange={e => setYear(Number(e.target.value))}
            className="input py-1.5 text-sm"
          >
            {yearOptions.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium text-gray-700">Programa:</label>
          <select
            value={programType}
            onChange={e => setProgramType(e.target.value)}
            className="input py-1.5 text-sm"
          >
            {PROGRAM_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </div>
      </div>

      {/* Summary cards */}
      {!loading && rows.length > 0 && (
        <StatStrip
          stats={[
            { label: 'Total Necesario', color: 'blue' as const, icon: Package, value: qty(totalNeeded), hint: `unidades de ${rows.length} productos` },
            {
              label: 'Ya Comprado', color: 'emerald' as const,
              icon: CheckCircle2,
              value: qty(totalPurchased),
              hint: `${totalNeeded > 0 ? Math.round(totalPurchased / totalNeeded * 100) : 0}% del total necesario`,
            },
            {
              label: 'Por Comprar', color: 'orange' as const,
              icon: ShoppingCart,
              value: qty(totalRemaining),
              valueTone: totalRemaining > 0 ? 'warn' : 'good',
              hint: totalRemaining === 0 ? 'Todo comprado' : 'unidades pendientes',
              hintTone: totalRemaining === 0 ? 'good' : 'neutral',
            },
          ]}
        />
      )}

      {/* Table */}
      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="w-8 h-8 border-4 border-primary-600 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : rows.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <span className="empty-tile mb-4"><BarChart2 size={26} aria-hidden /></span>
          <p className="text-gray-600">No hay pedidos activos para el período seleccionado.</p>
          <p className="text-gray-400 text-sm mt-1">Los pedidos en estado Pendiente, Aprobado y Cotizado aparecen aquí.</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Producto</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Programa</th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-gray-500">Necesitado</th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-gray-500">Comprado</th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-gray-500">Faltante</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Notas</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rows.map(row => {
                  const isEditing = !!row.productId && editing?.productId === row.productId && editing?.programType === row.programType
                  const pct = row.totalNeeded > 0 ? Math.round(row.purchasedQty / row.totalNeeded * 100) : 0

                  return (
                    <tr key={`${row.productId ?? row.productName}:${row.programType}`} className={`hover:bg-gray-50 ${isEditing ? 'bg-blue-50' : ''}`}>
                      <td className="px-4 py-3">
                        <p className="font-medium text-gray-900">{row.productName}</p>
                        {row.productBrand && <p className="text-xs text-gray-400">{row.productBrand}</p>}
                        {!row.productId && <p className="text-xs text-amber-700">Fuera del catálogo</p>}
                      </td>
                      <td className="px-4 py-3 text-gray-600">{PROGRAM_LABELS[row.programType] ?? row.programType}</td>
                      <td className="px-4 py-3 text-right font-semibold text-gray-800">{qty(row.totalNeeded)}</td>
                      <td className="px-4 py-3 text-right">
                        {isEditing ? (
                          <input
                            type="number"
                            min={0}
                            step="0.0001"
                            value={editing.purchasedQty}
                            onChange={e => setEditing(prev => prev ? { ...prev, purchasedQty: e.target.value } : null)}
                            className="w-24 px-2 py-1 rounded-lg border border-blue-300 text-center text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
                            autoFocus
                          />
                        ) : (
                          <div>
                            <span className={`font-semibold ${row.purchasedQty > 0 ? 'text-green-700' : 'text-gray-400'}`}>
                              {qty(row.purchasedQty)}
                            </span>
                            {row.purchasedQty > 0 && (
                              <div className="mt-1 h-1 bg-gray-200 rounded-full w-16 ml-auto">
                                <div className="h-1 bg-green-500 rounded-full" style={{ width: `${Math.min(100, pct)}%` }} />
                              </div>
                            )}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className={`font-semibold ${row.remaining > 0 ? 'text-orange-600' : 'text-green-600'}`}>
                          {row.remaining === 0 ? '✓ 0' : qty(row.remaining)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-500 max-w-[200px]">
                        {isEditing ? (
                          <input
                            type="text"
                            value={editing.notes}
                            onChange={e => setEditing(prev => prev ? { ...prev, notes: e.target.value } : null)}
                            placeholder="Notas opcionales…"
                            className="w-full px-2 py-1 rounded-lg border border-blue-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
                          />
                        ) : (
                          <span className="text-xs">{row.notes || '—'}</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {isEditing ? (
                          <div className="flex items-center gap-1">
                            <button
                              onClick={saveEdit}
                              disabled={saving}
                              className="p-1.5 rounded-lg bg-green-600 text-white hover:bg-green-700 disabled:opacity-50"
                              title="Guardar"
                            >
                              {saving
                                ? <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin inline-block" />
                                : <Check size={15} />
                              }
                            </button>
                            <button onClick={cancelEdit} className="p-1.5 rounded-lg bg-gray-200 text-gray-600 hover:bg-gray-300" title="Cancelar">
                              <X size={15} />
                            </button>
                          </div>
                        ) : row.productId && (
                          <button
                            onClick={() => openEdit(row)}
                            className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 hover:text-primary-600"
                            title="Editar comprado"
                          >
                            <Edit2 size={15} />
                          </button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
              {rows.length > 1 && (
                <tfoot className="bg-gray-50 border-t-2 border-gray-200">
                  <tr>
                    <td colSpan={2} className="px-4 py-3 font-bold text-gray-700">Total</td>
                    <td className="px-4 py-3 text-right font-bold text-gray-800">{qty(totalNeeded)}</td>
                    <td className="px-4 py-3 text-right font-bold text-green-700">{qty(totalPurchased)}</td>
                    <td className="px-4 py-3 text-right font-bold text-orange-600">{qty(totalRemaining)}</td>
                    <td colSpan={2} />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
