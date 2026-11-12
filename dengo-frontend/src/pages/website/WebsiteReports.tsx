import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Info, Ticket, Store, DollarSign, TrendingUp, Receipt, Timer, Repeat, UserRoundX, type LucideIcon } from 'lucide-react'
import { STAT_TILE, type StatColor } from '../../components/common/StatStrip'
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Legend } from 'recharts'
import { api } from '../../lib/api'
import { money } from './types'

interface Summary {
  kpis: {
    issued: number; redeemed: number; conversion: number; revenue: number; discount: number
    avgTicketCoupon: number; avgTicketAll: number; returnPerQ: number; uniquePeople: number
    repeatPeople: number; avgHoursToRedeem: number; pending: number; fromWeb: number
  }
  byPromotion: { id: string; name: string; summary: string; live: boolean; issued: number; redeemed: number; conversion: number; revenue: number; discount: number; avgTicket: number; returnPerQ: number }[]
  byDay: { date: string; issued: number; redeemed: number; revenue: number }[]
  byBranch: { id: string; name: string; redeemed: number; revenue: number; discount: number }[]
  topProducts: { name: string; quantity: number; revenue: number; discount: number }[]
}

const day = (d: Date) => new Date(d.getTime() - 6 * 3_600_000).toISOString().slice(0, 10)
const RANGES = [
  { id: '7', label: '7 días' }, { id: '30', label: '30 días' }, { id: '90', label: '90 días' }, { id: '365', label: 'Año' },
] as const

export default function WebsiteReports() {
  const [range, setRange] = useState<string>('30')
  const [data, setData] = useState<Summary | null>(null)

  useEffect(() => {
    const to = new Date(), from = new Date(Date.now() - (Number(range) - 1) * 86_400_000)
    setData(null)
    api.get<Summary>(`/api/website/reports/summary?from=${day(from)}&to=${day(to)}`).then(setData).catch(e => toast.error(e.message))
  }, [range])

  const k = data?.kpis
  const lift = k && k.avgTicketAll > 0 ? Math.round(((k.avgTicketCoupon - k.avgTicketAll) / k.avgTicketAll) * 100) : 0

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-gray-500">Cuántas personas toman cupón, cuántas compran y cuánto te deja cada oferta.</p>
        <div className="flex gap-1 p-1 bg-gray-100 rounded-lg">
          {RANGES.map(r => (
            <button key={r.id} type="button" onClick={() => setRange(r.id)} className={`px-3 py-1.5 rounded-md text-sm font-medium ${range === r.id ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500'}`}>{r.label}</button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi icon={Ticket} color="violet" label="Cupones obtenidos" value={k?.issued} sub={k ? `${k.uniquePeople} personas · ${k.fromWeb} desde la página` : ''} />
        <Kpi icon={Store} color="emerald" label="Canjeados en tienda" value={k?.redeemed} sub={k ? `${k.conversion}% de conversión · ${k.pending} pendientes` : ''} />
        <Kpi icon={DollarSign} color="blue" label="Ventas con cupón" value={k ? money(k.revenue) : undefined} sub={k ? `${money(k.discount)} en descuentos` : ''} />
        <Kpi icon={TrendingUp} color="teal" label="Retorno por quetzal" value={k ? `Q${k.returnPerQ.toFixed(2)}` : undefined} sub="vendido por cada Q1 de descuento" tip="Ventas con cupón ÷ descuento entregado. Más alto = la oferta trae más venta de la que regala." />
        <Kpi icon={Receipt} color="sky" label="Ticket con cupón" value={k ? money(k.avgTicketCoupon) : undefined} sub={k ? `${lift >= 0 ? '+' : ''}${lift}% vs. ticket promedio (${money(k.avgTicketAll)})` : ''} />
        <Kpi icon={Timer} color="amber" label="Tiempo hasta canjear" value={k ? (k.avgHoursToRedeem < 48 ? `${k.avgHoursToRedeem.toFixed(1)} h` : `${(k.avgHoursToRedeem / 24).toFixed(1)} días`) : undefined} sub="promedio desde que lo obtienen" />
        <Kpi icon={Repeat} color="pink" label="Clientes que repiten" value={k?.repeatPeople} sub="canjearon más de un cupón" />
        <Kpi icon={UserRoundX} color="orange" label="Sin canjear" value={k?.pending} sub="personas para darles seguimiento" tip="Exporta la lista en Cupones → Exportar y escríbeles por WhatsApp." />
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <h3 className="font-semibold text-gray-800 mb-3">Cupones por día</h3>
        <div className="h-64">
          {data ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.byDay} margin={{ left: -18, right: 4 }}>
                <CartesianGrid vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="date" tickFormatter={d => d.slice(8, 10) + '/' + d.slice(5, 7)} tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} minTickGap={16} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
                <Tooltip cursor={{ fill: '#f8fafc' }} labelFormatter={d => String(d).split('-').reverse().join('/')} formatter={(v: number, n: string) => [v, n === 'issued' ? 'Obtenidos' : 'Canjeados']} />
                <Legend formatter={v => (v === 'issued' ? 'Obtenidos' : 'Canjeados')} iconType="circle" wrapperStyle={{ fontSize: 12 }} />
                <Bar isAnimationActive={false} dataKey="issued" fill="#93c5fd" radius={[3, 3, 0, 0]} maxBarSize={18} />
                <Bar isAnimationActive={false} dataKey="redeemed" fill="#2563eb" radius={[3, 3, 0, 0]} maxBarSize={18} />
              </BarChart>
            </ResponsiveContainer>
          ) : <div className="h-full rounded-lg bg-gray-50 animate-pulse" />}
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
        <h3 className="font-semibold text-gray-800 px-4 pt-4">Por oferta</h3>
        <table className="w-full text-sm min-w-[760px] mt-2">
          <thead className="text-xs uppercase tracking-wide text-gray-500 bg-gray-50">
            <tr>
              <th className="text-left px-4 py-2 font-semibold">Oferta</th>
              <th className="text-right px-3 py-2 font-semibold">Obtenidos</th>
              <th className="text-right px-3 py-2 font-semibold">Canjeados</th>
              <th className="text-right px-3 py-2 font-semibold">Conversión</th>
              <th className="text-right px-3 py-2 font-semibold">Ventas</th>
              <th className="text-right px-3 py-2 font-semibold">Descuento</th>
              <th className="text-right px-3 py-2 font-semibold">Ticket</th>
              <th className="text-right px-4 py-2 font-semibold">Retorno</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {(data?.byPromotion ?? []).map(p => (
              <tr key={p.id}>
                <td className="px-4 py-2.5"><p className="font-medium text-gray-900">{p.name}</p><p className="text-xs text-gray-500">{p.summary}{!p.live && ' · no vigente'}</p></td>
                <td className="px-3 py-2.5 text-right tabular-nums">{p.issued}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{p.redeemed}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">
                  <span className="inline-flex items-center gap-2 justify-end">
                    <span className="w-14 h-1.5 rounded-full bg-gray-100 overflow-hidden"><span className="block h-full bg-primary-500 rounded-full" style={{ width: `${Math.min(100, p.conversion)}%` }} /></span>
                    {p.conversion}%
                  </span>
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums">{money(p.revenue)}</td>
                <td className="px-3 py-2.5 text-right tabular-nums text-gray-600">{money(p.discount)}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{money(p.avgTicket)}</td>
                <td className="px-4 py-2.5 text-right tabular-nums font-medium">{p.returnPerQ ? `Q${p.returnPerQ.toFixed(2)}` : '—'}</td>
              </tr>
            ))}
            {data && data.byPromotion.length === 0 && <tr><td colSpan={8} className="px-4 py-8 text-center text-gray-500">Sin actividad en este periodo.</td></tr>}
          </tbody>
        </table>
      </div>

      <div className="grid lg:grid-cols-2 gap-3">
        <SmallTable title="Por sucursal" cols={['Sucursal', 'Canjes', 'Ventas', 'Descuento']}
          rows={(data?.byBranch ?? []).map(b => [b.name, b.redeemed, money(b.revenue), money(b.discount)])} />
        <SmallTable title="Productos que más se vendieron con oferta" cols={['Producto', 'Cant.', 'Ventas', 'Descuento']}
          rows={(data?.topProducts ?? []).map(p => [p.name, p.quantity, money(p.revenue), money(p.discount)])} />
      </div>
    </div>
  )
}

function Kpi({ label, value, sub, tip, icon: Icon, color }: { label: string; value: number | string | undefined; sub?: string; tip?: string; icon: LucideIcon; color: StatColor }) {
  return (
    <div className="group bg-white rounded-xl border border-gray-200 p-4 shadow-sm transition-[transform,box-shadow] duration-200 hover:shadow-md motion-safe:hover:-translate-y-0.5">
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-medium text-gray-500 flex items-center gap-1">{label}{tip && <span title={tip}><Info size={12} className="text-gray-400" /></span>}</p>
        <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br ring-1 ring-inset transition-transform duration-300 motion-safe:group-hover:scale-110 ${STAT_TILE[color]}`}>
          <Icon size={16} className="motion-safe:group-hover:animate-wiggle" aria-hidden />
        </span>
      </div>
      {value === undefined ? <div className="h-7 w-20 bg-gray-100 rounded mt-1 animate-pulse" /> : <p className="text-2xl font-bold text-gray-900 tabular-nums -mt-1">{value}</p>}
      {sub && <p className="text-xs text-gray-500 mt-0.5">{sub}</p>}
    </div>
  )
}

function SmallTable({ title, cols, rows }: { title: string; cols: string[]; rows: (string | number)[][] }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <h3 className="font-semibold text-gray-800 px-4 pt-4 pb-2">{title}</h3>
      <table className="w-full text-sm">
        <thead className="text-xs uppercase tracking-wide text-gray-500 bg-gray-50"><tr>{cols.map((c, i) => <th key={c} className={`px-4 py-2 font-semibold ${i ? 'text-right' : 'text-left'}`}>{c}</th>)}</tr></thead>
        <tbody className="divide-y divide-gray-100">
          {rows.length === 0 ? <tr><td colSpan={cols.length} className="px-4 py-6 text-center text-gray-400">Sin datos</td></tr>
            : rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j} className={`px-4 py-2 ${j ? 'text-right tabular-nums' : 'text-gray-800'}`}>{c}</td>)}</tr>)}
        </tbody>
      </table>
    </div>
  )
}
