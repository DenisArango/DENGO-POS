import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowLeft, Sparkles, Send, Loader, Save, Trash2,
  BarChart3, Table, BookOpen, Lightbulb, X
} from 'lucide-react'
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from 'recharts'
import { motion, AnimatePresence } from 'framer-motion'
import { toast } from 'sonner'
import { api } from '../../lib/api'
import { useAuthStore } from '../../store'
import { useStore } from '../../contexts/StoreContext'

interface ReportConfig {
  intent: string
  endpoint: string
  params: Record<string, string>
  visualization: 'bar' | 'line' | 'pie' | 'table'
  title: string
  description: string
  xKey?: string
  yKey?: string
  columns?: string[]
}

interface SavedReport {
  id: string
  name: string
  question: string
  config: ReportConfig
  savedAt: string
}

interface Message {
  role: 'user' | 'assistant'
  content: string
  config?: ReportConfig
  data?: any[]
  loading?: boolean
}

const CHART_COLORS = ['#6366F1','#10B981','#F59E0B','#EF4444','#8B5CF6','#06B6D4','#F97316']

const SUGGESTIONS = [
  '¿Cuáles son mis 10 productos más vendidos este mes?',
  '¿Cómo están los márgenes de ganancia por producto?',
  '¿Qué clientes compran más frecuentemente?',
  '¿Qué productos llevan más de 30 días sin venderse?',
  '¿Cuál es el nivel de inventario actual?',
  '¿Cuánta ganancia generamos los últimos 30 días?',
]

function formatKey(key: string): string {
  const map: Record<string, string> = {
    name: 'Producto', productName: 'Producto', quantitySold: 'Cant. Vendida',
    revenue: 'Ingresos (Q)', cost: 'Costo (Q)', profit: 'Ganancia (Q)',
    marginPercent: 'Margen (%)', stock: 'Stock', rotationDays: 'Días Rotación',
    sold: 'Vendidos', quantity: 'Cantidad', minStock: 'Stock Mín.',
    value: 'Valor (Q)', status: 'Estado', totalPurchases: 'Total Compras',
    purchasesCount: 'Compras', lastPurchase: 'Última Compra', nit: 'NIT',
  }
  return map[key] ?? key.replace(/([A-Z])/g, ' $1').trim()
}

function formatValue(key: string, value: any): string {
  if (value === null || value === undefined) return '—'
  if (typeof value === 'number') {
    if (['revenue','cost','profit','totalPurchases','value'].includes(key))
      return `Q${Number(value).toFixed(2)}`
    if (key === 'marginPercent') return `${Number(value).toFixed(1)}%`
    return Number(value) % 1 === 0 ? String(value) : Number(value).toFixed(2)
  }
  if (key === 'lastPurchase' && typeof value === 'string') {
    try { return new Date(value).toLocaleDateString('es-GT') } catch { return value }
  }
  return String(value)
}

function ReportVisualizer({ config, data }: { config: ReportConfig; data: any[] }) {
  if (!data || data.length === 0) {
    return <div className="text-center py-12 text-gray-400 text-sm">Sin datos para mostrar</div>
  }

  const xKey = config.xKey ?? Object.keys(data[0])[0]
  const yKey = config.yKey ?? Object.keys(data[0]).find(k => typeof data[0][k] === 'number') ?? Object.keys(data[0])[1]
  const columns = config.columns ?? Object.keys(data[0]).slice(0, 6)

  if (config.visualization === 'table' || data.length > 20) {
    return (
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr>{columns.map(c => <th key={c} className="text-left px-3 py-2 font-medium text-gray-600">{formatKey(c)}</th>)}</tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {data.slice(0, 50).map((row, i) => (
              <tr key={i} className="hover:bg-gray-50">
                {columns.map(c => (
                  <td key={c} className="px-3 py-2 text-gray-700">{formatValue(c, row[c])}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {data.length > 50 && <p className="text-xs text-gray-400 text-center mt-2">Mostrando 50 de {data.length} registros</p>}
      </div>
    )
  }

  if (config.visualization === 'pie') {
    const pieData = data.slice(0, 8).map(row => ({
      name: String(row[xKey] ?? '').slice(0, 25),
      value: Number(row[yKey] ?? 0),
    }))
    return (
      <ResponsiveContainer width="100%" height={280}>
        <PieChart>
          <Pie data={pieData} cx="50%" cy="50%" outerRadius={100} dataKey="value" label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}>
            {pieData.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
          </Pie>
          <Tooltip formatter={(v: any) => [`Q${Number(v).toFixed(2)}`]} />
        </PieChart>
      </ResponsiveContainer>
    )
  }

  const chartData = data.slice(0, 15).map(row => ({
    name: String(row[xKey] ?? '').slice(0, 20),
    value: Number(row[yKey] ?? 0),
  }))

  if (config.visualization === 'line') {
    return (
      <ResponsiveContainer width="100%" height={260}>
        <LineChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis dataKey="name" tick={{ fontSize: 11 }} />
          <YAxis tick={{ fontSize: 11 }} />
          <Tooltip formatter={(v: any) => [`Q${Number(v).toFixed(2)}`]} />
          <Line type="monotone" dataKey="value" stroke="#6366F1" strokeWidth={2} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    )
  }

  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={chartData} layout="vertical">
        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" horizontal={false} />
        <XAxis type="number" tick={{ fontSize: 11 }} />
        <YAxis dataKey="name" type="category" width={130} tick={{ fontSize: 11 }} />
        <Tooltip formatter={(v: any) => [`Q${Number(v).toFixed(2)}`]} />
        <Bar dataKey="value" radius={[0, 4, 4, 0]}>
          {chartData.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}

export default function CustomReports() {
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const { currentStore } = useStore()
  const branchId = currentStore?.id ?? user?.branchId ?? ''

  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'assistant',
      content: '¡Hola! Soy tu asistente de reportes con IA. Puedes pedirme cualquier análisis de tu negocio en lenguaje natural y generaré el reporte al instante. ¿Qué te gustaría analizar hoy?',
    }
  ])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [savedReports, setSavedReports] = useState<SavedReport[]>([])
  const [saveModalMsg, setSaveModalMsg] = useState<Message | null>(null)
  const [saveName, setSaveName] = useState('')
  const chatEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const stored = localStorage.getItem('dengo-custom-reports')
    if (stored) setSavedReports(JSON.parse(stored))
  }, [])

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const handleQuery = async (question: string) => {
    if (!question.trim() || loading) return
    setInput('')

    const userMsg: Message = { role: 'user', content: question }
    const loadingMsg: Message = { role: 'assistant', content: '', loading: true }
    setMessages(prev => [...prev, userMsg, loadingMsg])
    setLoading(true)

    try {
      const result = await api.post<{ config: ReportConfig; data: any[] }>('/api/ai/query-report', {
        question,
        branchId,
      })

      const assistantMsg: Message = {
        role: 'assistant',
        content: result.config.description,
        config: result.config,
        data: Array.isArray(result.data) ? result.data : (result.data?.items ?? result.data?.products ?? result.data?.customers ?? []),
      }

      setMessages(prev => prev.slice(0, -1).concat(assistantMsg))
    } catch (e: any) {
      setMessages(prev => prev.slice(0, -1).concat({
        role: 'assistant',
        content: `Lo siento, no pude generar ese reporte. Error: ${e.message}`,
      }))
    } finally {
      setLoading(false)
    }
  }

  const handleSaveReport = () => {
    if (!saveName.trim() || !saveModalMsg) return
    const newReport: SavedReport = {
      id: crypto.randomUUID(),
      name: saveName.trim(),
      question: messages[messages.findIndex(m => m === saveModalMsg) - 1]?.content ?? '',
      config: saveModalMsg.config!,
      savedAt: new Date().toISOString(),
    }
    const updated = [newReport, ...savedReports]
    setSavedReports(updated)
    localStorage.setItem('dengo-custom-reports', JSON.stringify(updated))
    setSaveModalMsg(null)
    setSaveName('')
    toast.success('Reporte guardado exitosamente')
  }

  const handleDeleteSaved = (id: string) => {
    const updated = savedReports.filter(r => r.id !== id)
    setSavedReports(updated)
    localStorage.setItem('dengo-custom-reports', JSON.stringify(updated))
  }

  const handleRunSaved = (report: SavedReport) => {
    handleQuery(report.question || report.config.title)
  }

  return (
    <div className="flex flex-col h-[calc(100vh-7rem)] gap-3">

      {/* Header */}
      <div className="bg-white rounded-lg shadow-sm px-4 py-3 flex items-center gap-3">
        <button onClick={() => navigate('/reports')} className="p-2 hover:bg-gray-100 rounded-lg text-gray-500">
          <ArrowLeft size={20} />
        </button>
        <div className="flex items-center gap-2">
          <div className="p-2 bg-gradient-to-r from-primary-600 to-purple-600 rounded-lg">
            <Sparkles size={18} className="text-white" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-gray-800">Consultas Personalizadas con IA</h1>
            <p className="text-xs text-gray-500">Pregúntale a la IA cualquier análisis de tu negocio</p>
          </div>
        </div>
      </div>

      <div className="flex gap-3 flex-1 min-h-0">

        {/* LEFT: Chat */}
        <div className="flex-1 flex flex-col bg-white rounded-lg shadow-sm min-h-0">

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {messages.map((msg, i) => (
              <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] ${msg.role === 'user' ? 'order-1' : 'order-2'}`}>

                  {/* Bubble */}
                  <div className={`rounded-2xl px-4 py-3 text-sm ${
                    msg.role === 'user'
                      ? 'bg-primary-600 text-white rounded-br-sm'
                      : 'bg-gray-100 text-gray-800 rounded-bl-sm'
                  }`}>
                    {msg.loading ? (
                      <div className="flex items-center gap-2 text-gray-500">
                        <Loader size={14} className="animate-spin" />
                        Generando reporte…
                      </div>
                    ) : msg.content}
                  </div>

                  {/* Report visualization */}
                  {msg.config && msg.data && (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="mt-2 bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm"
                    >
                      <div className="px-4 py-3 border-b bg-gray-50 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          {msg.config.visualization === 'table' ? <Table size={15} className="text-primary-600" /> : <BarChart3 size={15} className="text-primary-600" />}
                          <span className="font-semibold text-sm text-gray-800">{msg.config.title}</span>
                          <span className="text-xs text-gray-400">({msg.data.length} registros)</span>
                        </div>
                        <button
                          onClick={() => { setSaveModalMsg(msg); setSaveName(msg.config!.title) }}
                          className="flex items-center gap-1 px-2 py-1 text-xs bg-primary-50 text-primary-700 rounded-lg hover:bg-primary-100 transition-colors"
                        >
                          <Save size={12} /> Guardar
                        </button>
                      </div>
                      <div className="p-4">
                        <ReportVisualizer config={msg.config} data={msg.data} />
                      </div>
                    </motion.div>
                  )}
                </div>
              </div>
            ))}
            <div ref={chatEndRef} />
          </div>

          {/* Suggestions */}
          {messages.length === 1 && (
            <div className="px-4 pb-2">
              <p className="text-xs text-gray-400 mb-2 flex items-center gap-1">
                <Lightbulb size={12} /> Sugerencias:
              </p>
              <div className="flex flex-wrap gap-2">
                {SUGGESTIONS.map((s, i) => (
                  <button
                    key={i}
                    onClick={() => handleQuery(s)}
                    className="text-xs px-3 py-1.5 bg-gray-50 hover:bg-primary-50 hover:text-primary-700 text-gray-600 rounded-full border border-gray-200 transition-colors"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Input */}
          <div className="border-t p-3">
            <form onSubmit={e => { e.preventDefault(); handleQuery(input) }} className="flex gap-2">
              <input
                value={input}
                onChange={e => setInput(e.target.value)}
                placeholder="Ej: ¿Cuáles son mis productos con mayor margen de ganancia?"
                className="flex-1 input text-sm"
                disabled={loading}
                autoFocus
              />
              <button
                type="submit"
                disabled={loading || !input.trim()}
                className="btn-primary btn-md px-3 flex items-center gap-1 disabled:opacity-50"
              >
                {loading ? <Loader size={16} className="animate-spin" /> : <Send size={16} />}
              </button>
            </form>
          </div>
        </div>

        {/* RIGHT: Saved reports */}
        <div className="w-64 flex flex-col bg-white rounded-lg shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b bg-gray-50 flex items-center gap-2">
            <BookOpen size={15} className="text-gray-500" />
            <span className="text-sm font-semibold text-gray-700">Reportes Guardados</span>
          </div>
          <div className="flex-1 overflow-y-auto divide-y divide-gray-100">
            {savedReports.length === 0 ? (
              <div className="text-center py-10 text-gray-400 text-xs px-4">
                <Save size={28} className="mx-auto mb-2 opacity-30" />
                Guarda reportes aquí para acceder rápidamente
              </div>
            ) : (
              savedReports.map(r => (
                <div key={r.id} className="p-3 hover:bg-gray-50 group">
                  <div className="flex items-start justify-between gap-2">
                    <button
                      onClick={() => handleRunSaved(r)}
                      className="text-left flex-1 min-w-0"
                    >
                      <p className="text-sm font-medium text-gray-800 truncate">{r.name}</p>
                      <p className="text-xs text-gray-400 truncate mt-0.5">{r.config.description}</p>
                      <p className="text-xs text-primary-500 mt-1 flex items-center gap-1">
                        {r.config.visualization === 'table' ? <Table size={10} /> : <BarChart3 size={10} />}
                        {r.config.visualization}
                      </p>
                    </button>
                    <button
                      onClick={() => handleDeleteSaved(r.id)}
                      className="p-1 opacity-0 group-hover:opacity-100 text-gray-300 hover:text-red-500 transition-all"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Save modal */}
      <AnimatePresence>
        {saveModalMsg && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
          >
            <motion.div
              initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }}
              className="bg-white rounded-xl p-6 max-w-sm w-full shadow-xl"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center gap-2 mb-4">
                <Save size={20} className="text-primary-600" />
                <h3 className="font-bold text-gray-800">Guardar Reporte</h3>
              </div>
              <label className="text-sm font-medium text-gray-700 block mb-2">Nombre del reporte</label>
              <input
                autoFocus
                value={saveName}
                onChange={e => setSaveName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSaveReport()}
                className="input w-full mb-4"
                placeholder="Ej: Top productos mayo 2026"
              />
              <div className="flex gap-2">
                <button onClick={() => { setSaveModalMsg(null); setSaveName('') }} className="btn-outline btn-md flex-1">
                  Cancelar
                </button>
                <button onClick={handleSaveReport} disabled={!saveName.trim()} className="btn-primary btn-md flex-1 disabled:opacity-50">
                  <Save size={15} className="mr-1" /> Guardar
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
