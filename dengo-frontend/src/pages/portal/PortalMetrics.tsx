import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { TrendingUp, Download, Info } from 'lucide-react'
import { api } from '../../lib/api'

const PROGRAM_LABELS: Record<string, string> = {
  FOOD_PACKAGE: 'Alimentación Escolar',
  SCHOOL_SUPPLIES: 'Útiles Escolares',
  TEACHING_KIT: 'Valija Didáctica',
  GRATUITY: 'Gratuidades',
}
const MONTHS = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']
const money = (v: number) => `Q${Number(v).toLocaleString('es-GT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

interface Row {
  key: string; label: string; sub?: string | null
  orders: number; students: number
  revenue: number; cost: number; profit: number; marginPct: number | null; pendingRevenue: number
}
interface ProductRow { name: string; quantity: number; revenue: number; cost: number; profit: number; custom: boolean }
interface Metrics {
  year: number
  totals: Row
  bySchool: Row[]; byProgram: Row[]; byTeacher: Row[]; byMonth: Row[]
  byProduct: ProductRow[]
}

const TABS = [
  { id: 'bySchool', label: 'Por escuela', first: 'Escuela' },
  { id: 'byProgram', label: 'Por programa', first: 'Programa' },
  { id: 'byTeacher', label: 'Por maestro', first: 'Maestro' },
  { id: 'byMonth', label: 'Por mes', first: 'Mes' },
  { id: 'byProduct', label: 'Por producto', first: 'Producto' },
] as const
type TabId = typeof TABS[number]['id']

const rowLabel = (tab: TabId, r: Row) =>
  tab === 'byProgram' ? (PROGRAM_LABELS[r.label] ?? r.label)
    : tab === 'byMonth' ? MONTHS[Number(r.key.slice(5)) - 1] ?? r.key
      : r.label

function downloadCsv(name: string, rows: (string | number)[][]) {
  const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n')
  const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  URL.revokeObjectURL(url)
}

export default function PortalMetrics() {
  const thisYear = new Date().getFullYear()
  const [year, setYear] = useState(thisYear)
  const [programType, setProgramType] = useState('')
  const [tab, setTab] = useState<TabId>('bySchool')
  const [data, setData] = useState<Metrics | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    const qs = new URLSearchParams({ year: String(year), ...(programType ? { programType } : {}) })
    api.get<Metrics>(`/api/portal-admin/metrics?${qs}`)
      .then(setData)
      .catch(e => toast.error(e.message))
      .finally(() => setLoading(false))
  }, [year, programType])

  const t = data?.totals
  const kpis = t ? [
    { label: 'Venta', value: money(t.revenue), hint: 'Pedidos aprobados, cotizados y facturados' },
    { label: 'Costo', value: money(t.cost) },
    { label: 'Ganancia', value: money(t.profit), tone: t.profit < 0 ? 'text-red-600' : 'text-green-700' },
    { label: 'Margen', value: t.marginPct != null ? `${t.marginPct.toFixed(1)}%` : '—' },
    { label: 'Pedidos', value: String(t.orders), hint: `${t.students.toLocaleString('es-GT')} alumnos` },
    { label: 'En revisión', value: money(t.pendingRevenue), hint: 'Aún no cuenta en la venta' },
  ] : []

  const exportCsv = () => {
    if (!data) return
    const first = TABS.find(x => x.id === tab)!.first
    if (tab === 'byProduct') {
      downloadCsv(`rentabilidad-productos-${year}.csv`, [
        [first, 'Cantidad', 'Venta', 'Costo', 'Ganancia'],
        ...data.byProduct.map(p => [p.name, p.quantity, p.revenue, p.cost, p.profit]),
      ])
    } else {
      downloadCsv(`rentabilidad-${tab}-${year}.csv`, [
        [first, 'Pedidos', 'Alumnos', 'Venta', 'Costo', 'Ganancia', 'Margen %', 'En revisión'],
        ...data[tab].map(r => [rowLabel(tab, r), r.orders, r.students, r.revenue, r.cost, r.profit, r.marginPct ?? '', r.pendingRevenue]),
      ])
    }
  }

  const rows = useMemo(() => (data && tab !== 'byProduct' ? data[tab] : []), [data, tab])

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-800">Rentabilidad del Portal</h1>
          <p className="text-gray-600 mt-1">Venta, costo y ganancia de los pedidos escolares, aparte del resto de la tienda.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <select className="input w-auto" value={year} onChange={e => setYear(Number(e.target.value))} aria-label="Año">
            {[thisYear + 1, thisYear, thisYear - 1, thisYear - 2, thisYear - 3].map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          <select className="input w-auto" value={programType} onChange={e => setProgramType(e.target.value)} aria-label="Programa">
            <option value="">Todos los programas</option>
            {Object.entries(PROGRAM_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </div>
      </div>

      <div className="flex items-start gap-2 rounded-xl bg-blue-50 border border-blue-100 p-3 text-sm text-blue-800">
        <Info size={16} className="mt-0.5 flex-shrink-0" />
        <p>El costo es el que se guardó en cada línea del pedido (el del catálogo, o el que escribiste al corregirlo). Los maestros nunca lo ven. Los pedidos rechazados no cuentan, y los que están en revisión se muestran aparte.</p>
      </div>

      {loading && !data ? (
        <div className="flex items-center justify-center h-48"><div className="w-8 h-8 border-4 border-primary-600 border-t-transparent rounded-full animate-spin" /></div>
      ) : data && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
            {kpis.map(k => (
              <div key={k.label} className="bg-white rounded-xl border border-gray-200 p-4">
                <p className="text-xs text-gray-500">{k.label}</p>
                <p className={`text-xl font-bold mt-1 ${k.tone ?? 'text-gray-900'}`}>{k.value}</p>
                {k.hint && <p className="text-xs text-gray-400 mt-0.5">{k.hint}</p>}
              </div>
            ))}
          </div>

          <div className="bg-white rounded-xl border border-gray-200">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-200 p-2">
              <div className="flex gap-1 overflow-x-auto" role="tablist">
                {TABS.map(x => (
                  <button key={x.id} role="tab" aria-selected={tab === x.id} onClick={() => setTab(x.id)}
                    className={`px-3.5 py-2 rounded-lg text-sm font-medium whitespace-nowrap ${tab === x.id ? 'bg-primary-600 text-white' : 'text-gray-600 hover:bg-gray-100'}`}>
                    {x.label}
                  </button>
                ))}
              </div>
              <button onClick={exportCsv} className="btn-secondary btn-sm flex items-center gap-1.5"><Download size={15} /> Excel (CSV)</button>
            </div>

            <div className="overflow-x-auto">
              {tab === 'byProduct' ? (
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-gray-600">
                    <tr>{['Producto', 'Cantidad', 'Venta', 'Costo', 'Ganancia', 'Margen'].map((h, i) => <th key={h} className={`px-4 py-3 font-semibold ${i ? 'text-right' : 'text-left'}`}>{h}</th>)}</tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {data.byProduct.length === 0 && <tr><td colSpan={6} className="px-4 py-10 text-center text-gray-500">Sin pedidos aprobados en este período.</td></tr>}
                    {data.byProduct.map(p => (
                      <tr key={p.name} className="hover:bg-gray-50">
                        <td className="px-4 py-2.5 text-gray-800">{p.name}{p.custom && <span className="ml-2 text-xs text-amber-700">fuera del catálogo</span>}</td>
                        <td className="px-4 py-2.5 text-right">{p.quantity.toLocaleString('es-GT')}</td>
                        <td className="px-4 py-2.5 text-right">{money(p.revenue)}</td>
                        <td className="px-4 py-2.5 text-right text-gray-600">{money(p.cost)}</td>
                        <td className={`px-4 py-2.5 text-right font-semibold ${p.profit < 0 ? 'text-red-600' : 'text-green-700'}`}>{money(p.profit)}</td>
                        <td className="px-4 py-2.5 text-right text-gray-600">{p.revenue > 0 ? `${((p.profit / p.revenue) * 100).toFixed(1)}%` : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-gray-600">
                    <tr>{[TABS.find(x => x.id === tab)!.first, 'Pedidos', 'Alumnos', 'Venta', 'Costo', 'Ganancia', 'Margen', 'En revisión'].map((h, i) => <th key={h} className={`px-4 py-3 font-semibold whitespace-nowrap ${i ? 'text-right' : 'text-left'}`}>{h}</th>)}</tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {rows.length === 0 && <tr><td colSpan={8} className="px-4 py-10 text-center text-gray-500">Sin pedidos en este período.</td></tr>}
                    {rows.map(r => (
                      <tr key={r.key} className="hover:bg-gray-50">
                        <td className="px-4 py-2.5">
                          <p className="text-gray-800 font-medium">{rowLabel(tab, r)}</p>
                          {r.sub && <p className="text-xs text-gray-400">{r.sub}</p>}
                        </td>
                        <td className="px-4 py-2.5 text-right">{r.orders}</td>
                        <td className="px-4 py-2.5 text-right">{r.students.toLocaleString('es-GT')}</td>
                        <td className="px-4 py-2.5 text-right">{money(r.revenue)}</td>
                        <td className="px-4 py-2.5 text-right text-gray-600">{money(r.cost)}</td>
                        <td className={`px-4 py-2.5 text-right font-semibold ${r.profit < 0 ? 'text-red-600' : 'text-green-700'}`}>{money(r.profit)}</td>
                        <td className="px-4 py-2.5 text-right text-gray-600">{r.marginPct != null ? `${r.marginPct.toFixed(1)}%` : '—'}</td>
                        <td className="px-4 py-2.5 text-right text-gray-500">{r.pendingRevenue > 0 ? money(r.pendingRevenue) : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
          {data.totals.orders === 0 && (
            <p className="text-center text-sm text-gray-500 flex items-center justify-center gap-2"><TrendingUp size={16} /> Cuando apruebes pedidos de {year}, aquí verás cuánto deja cada escuela.</p>
          )}
        </>
      )}
    </div>
  )
}
