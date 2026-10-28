import { Fragment, useMemo, useState, type ReactNode } from 'react'
import {
  BarChart, Bar, LineChart, Line, AreaChart, Area, PieChart, Pie, Cell, Legend,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'
import { AlertTriangle, CheckCircle2, ChevronDown, Code2, Download, Info } from 'lucide-react'
import { SortableTh, sortRows, type SortState } from '../common/SortableTh'

// Mirrors the backend's AnalystReport (dengo-backend/src/lib/aiAnalyst.ts).
export type ValueFormat = 'moneda' | 'numero' | 'porcentaje' | 'texto' | 'fecha'
export interface ReportColumn { key: string; label: string; format: ValueFormat }
export type ReportBlock =
  | { type: 'kpis'; items: { label: string; value: number | string; format: ValueFormat; note?: string }[] }
  | { type: 'chart'; title?: string; chart: 'barras' | 'barras_horizontales' | 'lineas' | 'area' | 'pastel' | 'barras_apiladas'; x: string; series: { key: string; label: string }[]; format: ValueFormat; rows: Record<string, unknown>[] }
  | { type: 'table'; title?: string; columns: ReportColumn[]; rows: Record<string, unknown>[]; totalRows: number }
  | { type: 'note'; text: string; tone: 'info' | 'alerta' | 'exito' }
export interface AnalystReportData {
  title: string
  summary: string
  blocks: ReportBlock[]
  suggestions: string[]
  queries: { id: string; purpose: string; sql: string; rowCount: number; error?: string }[]
}

const COLORS = ['#6366F1', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#06B6D4', '#F97316', '#84CC16', '#EC4899', '#64748B']

function formatValue(value: unknown, format: ValueFormat): string {
  if (value === null || value === undefined || value === '') return '—'
  if (typeof value === 'boolean') return value ? 'Sí' : 'No'
  const n = typeof value === 'number' ? value : Number(value)
  switch (format) {
    case 'moneda':
      return Number.isFinite(n) ? `Q${n.toLocaleString('es-GT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : String(value)
    case 'porcentaje':
      return Number.isFinite(n) ? `${n.toLocaleString('es-GT', { maximumFractionDigits: 1 })}%` : String(value)
    case 'numero':
      return Number.isFinite(n) ? n.toLocaleString('es-GT', { maximumFractionDigits: 2 }) : String(value)
    case 'fecha': {
      const s = String(value)
      const m = s.match(/^(\d{4})-(\d{2})-(\d{2})(?: (\d{2}:\d{2}))?/)
      return m ? `${m[3]}/${m[2]}/${m[1]}${m[4] ? ' ' + m[4] : ''}` : s
    }
    default:
      return String(value)
  }
}

// Compact axis labels: Q12.5k instead of Q12,500.00.
function axisFormat(format: ValueFormat) {
  return (v: number) => {
    const abs = Math.abs(v)
    const short = abs >= 1_000_000 ? `${(v / 1_000_000).toFixed(1)}M` : abs >= 1_000 ? `${(v / 1_000).toFixed(1)}k` : `${+v.toFixed(2)}`
    return format === 'moneda' ? `Q${short}` : format === 'porcentaje' ? `${short}%` : short
  }
}

// ── Minimal, safe markdown (no HTML injection: builds React elements) ──────
function inline(text: string): ReactNode[] {
  const out: ReactNode[] = []
  const re = /(\*\*[^*]+\*\*|`[^`]+`|\*[^*\s][^*]*\*)/g
  let last = 0
  let m: RegExpExecArray | null
  let i = 0
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index))
    const tok = m[0]
    if (tok.startsWith('**')) out.push(<strong key={i++} className="font-semibold text-gray-900">{tok.slice(2, -2)}</strong>)
    else if (tok.startsWith('`')) out.push(<code key={i++} className="px-1 py-0.5 rounded bg-gray-100 text-[0.85em]">{tok.slice(1, -1)}</code>)
    else out.push(<em key={i++}>{tok.slice(1, -1)}</em>)
    last = m.index + tok.length
  }
  if (last < text.length) out.push(text.slice(last))
  return out
}

export function MiniMarkdown({ text }: { text: string }) {
  const lines = text.replace(/\r/g, '').split('\n')
  const nodes: ReactNode[] = []
  let list: { ordered: boolean; items: string[] } | null = null
  let para: string[] = []
  const flushPara = () => {
    if (para.length) nodes.push(<p key={nodes.length} className="leading-relaxed">{inline(para.join(' '))}</p>)
    para = []
  }
  const flushList = () => {
    if (!list) return
    const items = list.items.map((it, i) => <li key={i}>{inline(it)}</li>)
    nodes.push(list.ordered
      ? <ol key={nodes.length} className="list-decimal pl-5 space-y-1">{items}</ol>
      : <ul key={nodes.length} className="list-disc pl-5 space-y-1">{items}</ul>)
    list = null
  }
  for (const raw of lines) {
    const line = raw.trimEnd()
    const heading = line.match(/^(#{1,4})\s+(.*)$/)
    const bullet = line.match(/^\s*[-*•]\s+(.*)$/)
    const numbered = line.match(/^\s*\d+[.)]\s+(.*)$/)
    if (!line.trim()) { flushPara(); flushList(); continue }
    if (heading) {
      flushPara(); flushList()
      nodes.push(<p key={nodes.length} className="font-semibold text-gray-900 mt-1">{inline(heading[2]!)}</p>)
    } else if (bullet || numbered) {
      flushPara()
      const ordered = !!numbered
      if (!list || list.ordered !== ordered) { flushList(); list = { ordered, items: [] } }
      list.items.push((bullet ?? numbered)![1]!)
    } else {
      flushList()
      para.push(line.trim())
    }
  }
  flushPara(); flushList()
  return <div className="space-y-2 text-sm text-gray-700">{nodes}</div>
}

// ── Blocks ───────────────────────────────────────────────────────────────────
function KpiBlock({ block }: { block: Extract<ReportBlock, { type: 'kpis' }> }) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {block.items.map((k, i) => (
        <div key={i} className="rounded-xl border border-gray-200 bg-white p-3">
          <p className="text-xs text-gray-500 truncate" title={k.label}>{k.label}</p>
          <p className="text-xl font-bold text-gray-900 mt-0.5 break-words">{formatValue(k.value, k.format)}</p>
          {k.note && <p className="text-[11px] text-gray-500 mt-0.5">{k.note}</p>}
        </div>
      ))}
    </div>
  )
}

function ChartBlock({ block }: { block: Extract<ReportBlock, { type: 'chart' }> }) {
  const data = block.rows.map(r => {
    const row: Record<string, unknown> = { __x: block.x in r ? formatValue(r[block.x], typeof r[block.x] === 'string' && /^\d{4}-\d{2}-\d{2}/.test(String(r[block.x])) ? 'fecha' : 'texto') : '' }
    for (const s of block.series) row[s.key] = Number(r[s.key] ?? 0)
    return row
  })
  const tip = (v: number | string) => formatValue(v, block.format)
  const yFmt = axisFormat(block.format)
  const height = block.chart === 'barras_horizontales' ? Math.max(220, data.length * 28) : 280

  let chart: ReactNode
  if (block.chart === 'pastel') {
    const s = block.series[0]!
    const pie = data.slice(0, 10).map(d => ({ name: String(d.__x).slice(0, 28), value: Number(d[s.key]) }))
    chart = (
      <PieChart>
        <Pie data={pie} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={95}
          label={({ percent }) => `${(percent * 100).toFixed(0)}%`}>
          {pie.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
        </Pie>
        <Tooltip formatter={tip} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
      </PieChart>
    )
  } else if (block.chart === 'lineas' || block.chart === 'area') {
    const Chart = block.chart === 'lineas' ? LineChart : AreaChart
    chart = (
      <Chart data={data} margin={{ left: 8, right: 8, top: 8 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
        <XAxis dataKey="__x" tick={{ fontSize: 11 }} minTickGap={16} />
        <YAxis tick={{ fontSize: 11 }} tickFormatter={yFmt} width={64} />
        <Tooltip formatter={tip} />
        {block.series.length > 1 && <Legend wrapperStyle={{ fontSize: 12 }} />}
        {block.series.map((s, i) => block.chart === 'lineas'
          ? <Line key={s.key} type="monotone" dataKey={s.key} name={s.label} stroke={COLORS[i % COLORS.length]} strokeWidth={2} dot={data.length <= 31} />
          : <Area key={s.key} type="monotone" dataKey={s.key} name={s.label} stroke={COLORS[i % COLORS.length]} fill={COLORS[i % COLORS.length]} fillOpacity={0.15} />)}
      </Chart>
    )
  } else if (block.chart === 'barras_horizontales') {
    chart = (
      <BarChart data={data} layout="vertical" margin={{ left: 8, right: 16 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" horizontal={false} />
        <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={yFmt} />
        <YAxis dataKey="__x" type="category" width={150} tick={{ fontSize: 11 }} />
        <Tooltip formatter={tip} />
        {block.series.length > 1 && <Legend wrapperStyle={{ fontSize: 12 }} />}
        {block.series.map((s, i) => (
          <Bar key={s.key} dataKey={s.key} name={s.label} fill={COLORS[i % COLORS.length]} radius={[0, 4, 4, 0]}>
            {block.series.length === 1 && data.map((_, j) => <Cell key={j} fill={COLORS[j % COLORS.length]} />)}
          </Bar>
        ))}
      </BarChart>
    )
  } else {
    const stacked = block.chart === 'barras_apiladas'
    chart = (
      <BarChart data={data} margin={{ left: 8, right: 8, top: 8 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
        <XAxis dataKey="__x" tick={{ fontSize: 11 }} minTickGap={8} />
        <YAxis tick={{ fontSize: 11 }} tickFormatter={yFmt} width={64} />
        <Tooltip formatter={tip} />
        {block.series.length > 1 && <Legend wrapperStyle={{ fontSize: 12 }} />}
        {block.series.map((s, i) => (
          <Bar key={s.key} dataKey={s.key} name={s.label} fill={COLORS[i % COLORS.length]}
            {...(stacked ? { stackId: 'a' } : {})} radius={stacked ? undefined : [4, 4, 0, 0]} />
        ))}
      </BarChart>
    )
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-3">
      {block.title && <p className="text-sm font-semibold text-gray-800 mb-2">{block.title}</p>}
      <ResponsiveContainer width="100%" height={height}>{chart as React.ReactElement}</ResponsiveContainer>
    </div>
  )
}

function downloadCsv(title: string, columns: ReportColumn[], rows: Record<string, unknown>[]) {
  const esc = (v: unknown) => {
    const s = v === null || v === undefined ? '' : String(v)
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const csv = '﻿' + [columns.map(c => esc(c.label)).join(','), ...rows.map(r => columns.map(c => esc(r[c.key])).join(','))].join('\n')
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }))
  const a = document.createElement('a')
  a.href = url
  a.download = `${(title || 'reporte').replace(/[^\w-]+/g, '_')}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

function TableBlock({ block, reportTitle }: { block: Extract<ReportBlock, { type: 'table' }>; reportTitle: string }) {
  const [sort, setSort] = useState<SortState | null>(null)
  const rows = useMemo(() => sortRows(block.rows, sort, (r, k) => r[k] as unknown), [block.rows, sort])
  const numeric = (f: ValueFormat) => f === 'moneda' || f === 'numero' || f === 'porcentaje'
  return (
    <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
      <div className="flex items-center justify-between gap-2 px-3 py-2 border-b bg-gray-50">
        <p className="text-sm font-semibold text-gray-800 truncate">
          {block.title ?? 'Detalle'}
          <span className="ml-2 text-xs font-normal text-gray-400">
            {block.rows.length < block.totalRows ? `${block.rows.length} de ${block.totalRows}` : block.totalRows} registros
          </span>
        </p>
        <button onClick={() => downloadCsv(block.title ?? reportTitle, block.columns, rows)}
          className="flex items-center gap-1 px-2 py-1 text-xs bg-white border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-100">
          <Download size={12} /> CSV
        </button>
      </div>
      <div className="overflow-x-auto max-h-[420px] overflow-y-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 sticky top-0 text-xs">
            <tr>
              {block.columns.map(c => (
                <SortableTh key={c.key} label={c.label} sortKey={c.key} sort={sort} onSort={setSort}
                  align={numeric(c.format) ? 'right' : 'left'} firstDir={numeric(c.format) ? 'desc' : 'asc'} className="!py-2 !px-3 whitespace-nowrap" />
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.map((r, i) => (
              <tr key={i} className="hover:bg-gray-50">
                {block.columns.map(c => (
                  <td key={c.key} className={`px-3 py-1.5 text-gray-700 ${numeric(c.format) ? 'text-right tabular-nums whitespace-nowrap' : ''}`}>
                    {formatValue(r[c.key], c.format)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function NoteBlock({ block }: { block: Extract<ReportBlock, { type: 'note' }> }) {
  const style = block.tone === 'alerta'
    ? { box: 'bg-amber-50 border-amber-200 text-amber-900', Icon: AlertTriangle }
    : block.tone === 'exito'
      ? { box: 'bg-green-50 border-green-200 text-green-900', Icon: CheckCircle2 }
      : { box: 'bg-blue-50 border-blue-200 text-blue-900', Icon: Info }
  return (
    <div className={`rounded-xl border p-3 flex gap-2 ${style.box}`}>
      <style.Icon size={16} className="shrink-0 mt-0.5" />
      <MiniMarkdown text={block.text} />
    </div>
  )
}

export function AnalystReportView({ report, onAsk }: { report: AnalystReportData; onAsk?: (q: string) => void }) {
  const [showSql, setShowSql] = useState(false)
  return (
    <div className="space-y-3">
      {report.summary && (
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="font-semibold text-gray-900 mb-2">{report.title}</p>
          <MiniMarkdown text={report.summary} />
        </div>
      )}
      {report.blocks.map((b, i) => (
        <Fragment key={i}>
          {b.type === 'kpis' && <KpiBlock block={b} />}
          {b.type === 'chart' && <ChartBlock block={b} />}
          {b.type === 'table' && <TableBlock block={b} reportTitle={report.title} />}
          {b.type === 'note' && <NoteBlock block={b} />}
        </Fragment>
      ))}
      {report.suggestions.length > 0 && onAsk && (
        <div className="flex flex-wrap gap-2">
          {report.suggestions.map((s, i) => (
            <button key={i} onClick={() => onAsk(s)}
              className="text-xs px-3 py-1.5 bg-primary-50 hover:bg-primary-100 text-primary-700 rounded-full border border-primary-100 transition-colors text-left">
              {s}
            </button>
          ))}
        </div>
      )}
      {report.queries.length > 0 && (
        <div>
          <button onClick={() => setShowSql(v => !v)} className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600">
            <Code2 size={12} /> {showSql ? 'Ocultar' : 'Ver'} cómo lo calculé ({report.queries.filter(q => !q.error).length} consultas)
            <ChevronDown size={12} className={`transition-transform ${showSql ? 'rotate-180' : ''}`} />
          </button>
          {showSql && (
            <div className="mt-2 space-y-2">
              {report.queries.map(q => (
                <div key={q.id} className="rounded-lg bg-gray-900 text-gray-100 p-3 text-xs">
                  <p className="text-gray-400 mb-1">{q.id} · {q.purpose} · {q.error ? <span className="text-red-300">error (corregido después)</span> : `${q.rowCount} filas`}</p>
                  <pre className="whitespace-pre-wrap break-words font-mono">{q.sql}</pre>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
