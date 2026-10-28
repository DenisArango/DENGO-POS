import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowLeft, Sparkles, Send, Loader, Save, Trash2, BookOpen, Lightbulb,
  AlertCircle, RotateCcw, MessageSquarePlus, User,
} from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { toast } from 'sonner'
import { api } from '../../lib/api'
import { useAuthStore } from '../../store'
import { useStore } from '../../contexts/StoreContext'
import { AnalystReportView, type AnalystReportData } from '../../components/ai/AnalystReport'

interface SavedReport {
  id: string
  name: string
  question: string
  savedAt: string
}

interface Message {
  role: 'user' | 'assistant'
  content: string
  question?: string
  report?: AnalystReportData
  loading?: boolean
  error?: boolean
  timestamp: number
}

const MAX_HISTORY_TURNS = 4
const SAVED_KEY = 'dengo-ai-saved-questions'
const WELCOME_MESSAGE = 'Soy tu analista de datos. Pregúntame lo que quieras sobre tu negocio — ventas, ganancias, inventario, clientes, cajas, compras, traslados — y lo calculo con tus datos reales: comparaciones, tendencias, proyecciones, metas, lo que necesites.'

const SUGGESTIONS = [
  '¿Cómo van las ventas de este mes comparadas con el mes pasado, y a este ritmo llego a la meta?',
  '¿Qué productos me dejan más ganancia y cuáles se venden mucho pero con poco margen?',
  '¿Qué productos llevan más de 30 días sin venderse y cuánto dinero tengo inmovilizado en ellos?',
  '¿A qué horas y qué días de la semana vendo más?',
  '¿Qué productos se me van a acabar en los próximos 7 días al ritmo actual?',
  '¿Qué clientes me deben más y desde cuándo?',
]

// What the model is doing at each moment isn't streamed, so the wait shows
// the usual stages of an analysis instead of a frozen spinner.
const STAGES = ['Entendiendo la pregunta…', 'Consultando tus datos…', 'Calculando…', 'Verificando los números…', 'Armando el reporte…']

function timeLabel(ts: number): string {
  return new Date(ts).toLocaleTimeString('es-GT', { hour: '2-digit', minute: '2-digit' })
}

function LoadingBubble() {
  const [elapsed, setElapsed] = useState(0)
  useEffect(() => {
    const t = setInterval(() => setElapsed(s => s + 1), 1000)
    return () => clearInterval(t)
  }, [])
  const stage = STAGES[Math.min(STAGES.length - 1, Math.floor(elapsed / 7))]
  return (
    <div className="flex items-center gap-2 text-gray-500">
      <Loader size={14} className="animate-spin" />
      <span>{stage}</span>
      <span className="text-xs text-gray-400 tabular-nums">{elapsed}s</span>
    </div>
  )
}

export default function CustomReports() {
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const { currentStore } = useStore()
  const branchId = currentStore?.id ?? user?.branchId ?? ''

  const [messages, setMessages] = useState<Message[]>([
    { role: 'assistant', content: WELCOME_MESSAGE, timestamp: Date.now() },
  ])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [savedReports, setSavedReports] = useState<SavedReport[]>([])
  const [saveModalMsg, setSaveModalMsg] = useState<Message | null>(null)
  const [saveName, setSaveName] = useState('')
  const chatEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    try {
      const stored = localStorage.getItem(SAVED_KEY)
      if (stored) setSavedReports(JSON.parse(stored))
    } catch {
      // Unreadable saved list — start empty.
    }
  }, [])

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const persistSaved = (list: SavedReport[]) => {
    setSavedReports(list)
    try { localStorage.setItem(SAVED_KEY, JSON.stringify(list)) } catch { /* storage full/blocked */ }
  }

  const handleQuery = async (question: string) => {
    if (!question.trim() || loading) return
    setInput('')

    // Previous answers (and the SQL behind them) let follow-ups like
    // "¿y por sucursal?" or "agrégale cuánto debo vender por día" build on
    // what was already found instead of starting over.
    const history = messages
      .filter(m => m.role === 'assistant' && m.question && m.report)
      .slice(-MAX_HISTORY_TURNS)
      .map(m => ({
        question: m.question!,
        summary: m.report!.summary,
        queries: m.report!.queries.filter(q => !q.error).slice(-8).map(q => ({ purpose: q.purpose, sql: q.sql })),
      }))

    setMessages(prev => [...prev,
      { role: 'user', content: question, timestamp: Date.now() },
      { role: 'assistant', content: '', loading: true, timestamp: Date.now() },
    ])
    setLoading(true)

    try {
      const report = await api.post<AnalystReportData>('/api/ai/analyst', { question, branchId, history })
      setMessages(prev => prev.slice(0, -1).concat({
        role: 'assistant', content: '', question, report, timestamp: Date.now(),
      }))
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'No se pudo generar el análisis.'
      setMessages(prev => prev.slice(0, -1).concat({
        role: 'assistant', content: message, question, error: true, timestamp: Date.now(),
      }))
    } finally {
      setLoading(false)
    }
  }

  const handleSaveReport = () => {
    if (!saveName.trim() || !saveModalMsg?.question) return
    persistSaved([{ id: Math.random().toString(36).slice(2), name: saveName.trim(), question: saveModalMsg.question, savedAt: new Date().toISOString() }, ...savedReports])
    setSaveModalMsg(null)
    setSaveName('')
    toast.success('Pregunta guardada — vuelve a correrla cuando quieras con datos actualizados')
  }

  return (
    <div className="flex flex-col h-[calc(100vh-7rem)] gap-3">
      <div className="bg-white rounded-lg shadow-sm px-4 py-3 flex items-center gap-3">
        <button onClick={() => navigate('/reports')} className="p-2 hover:bg-gray-100 rounded-lg text-gray-500">
          <ArrowLeft size={20} />
        </button>
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <div className="p-2 bg-gradient-to-r from-primary-600 to-purple-600 rounded-lg shrink-0">
            <Sparkles size={18} className="text-white" />
          </div>
          <div className="min-w-0">
            <h1 className="text-lg font-bold text-gray-800 truncate">Analista de Datos con IA</h1>
            <p className="text-xs text-gray-500 truncate">Pregunta cualquier cosa sobre tu negocio — consulta tus datos reales y razona los números</p>
          </div>
        </div>
        {messages.length > 1 && (
          <button
            onClick={() => setMessages([{ role: 'assistant', content: WELCOME_MESSAGE, timestamp: Date.now() }])}
            disabled={loading}
            className="btn-outline btn-sm flex items-center gap-1.5 shrink-0 disabled:opacity-50"
            title="Empezar una conversación nueva"
          >
            <MessageSquarePlus size={15} />
            <span className="hidden sm:inline">Nueva conversación</span>
          </button>
        )}
      </div>

      <div className="flex gap-3 flex-1 min-h-0">
        <div className="flex-1 flex flex-col bg-white rounded-lg shadow-sm min-h-0 min-w-0">
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {messages.map((msg, i) => (
              <div key={i} className={`flex items-start gap-2 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                {msg.role === 'assistant' && (
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${msg.error ? 'bg-red-100' : 'bg-gradient-to-br from-primary-600 to-purple-600'}`}>
                    {msg.error ? <AlertCircle size={14} className="text-red-600" /> : <Sparkles size={14} className="text-white" />}
                  </div>
                )}
                <div className={msg.report ? 'flex-1 min-w-0' : 'max-w-[85%]'}>
                  {msg.report ? (
                    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="bg-gray-50 rounded-2xl rounded-tl-sm p-3">
                      <AnalystReportView report={msg.report} onAsk={loading ? undefined : handleQuery} />
                      <div className="flex justify-end mt-2">
                        <button
                          onClick={() => { setSaveModalMsg(msg); setSaveName(msg.report!.title) }}
                          className="flex items-center gap-1 px-2 py-1 text-xs bg-primary-50 text-primary-700 rounded-lg hover:bg-primary-100 transition-colors"
                        >
                          <Save size={12} /> Guardar pregunta
                        </button>
                      </div>
                    </motion.div>
                  ) : (
                    <div className={`rounded-2xl px-4 py-3 text-sm ${
                      msg.role === 'user'
                        ? 'bg-primary-600 text-white rounded-br-sm'
                        : msg.error
                          ? 'bg-red-50 text-red-800 border border-red-200 rounded-tl-sm'
                          : 'bg-gray-100 text-gray-800 rounded-tl-sm'
                    }`}>
                      {msg.loading ? <LoadingBubble /> : msg.content}
                      {msg.error && msg.question && (
                        <button onClick={() => handleQuery(msg.question!)} disabled={loading}
                          className="mt-2 flex items-center gap-1 text-xs font-medium text-red-700 hover:text-red-900 disabled:opacity-50">
                          <RotateCcw size={12} /> Reintentar
                        </button>
                      )}
                    </div>
                  )}
                  <p className={`text-[11px] text-gray-400 mt-1 px-1 ${msg.role === 'user' ? 'text-right' : 'text-left'}`}>
                    {timeLabel(msg.timestamp)}
                  </p>
                </div>
                {msg.role === 'user' && (
                  <div className="w-7 h-7 rounded-full bg-gray-200 flex items-center justify-center shrink-0">
                    <User size={14} className="text-gray-600" />
                  </div>
                )}
              </div>
            ))}
            <div ref={chatEndRef} />
          </div>

          {messages.length === 1 && (
            <div className="px-4 pb-2">
              <p className="text-xs text-gray-400 mb-2 flex items-center gap-1"><Lightbulb size={12} /> Ejemplos:</p>
              <div className="flex flex-wrap gap-2">
                {SUGGESTIONS.map((s, i) => (
                  <button key={i} onClick={() => handleQuery(s)}
                    className="text-xs px-3 py-1.5 bg-gray-50 hover:bg-primary-50 hover:text-primary-700 text-gray-600 rounded-full border border-gray-200 transition-colors text-left">
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="border-t p-3">
            <form onSubmit={e => { e.preventDefault(); handleQuery(input) }} className="flex gap-2">
              <input
                value={input}
                onChange={e => setInput(e.target.value)}
                placeholder="Ej: ¿Cuánto debo vender por día para llegar a la meta de este mes en cada sucursal?"
                className="flex-1 input text-sm"
                disabled={loading}
                maxLength={1000}
                autoFocus
              />
              <button type="submit" disabled={loading || !input.trim()} className="btn-primary btn-md px-3 flex items-center gap-1 disabled:opacity-50">
                {loading ? <Loader size={16} className="animate-spin" /> : <Send size={16} />}
              </button>
            </form>
          </div>
        </div>

        <div className="hidden lg:flex w-64 flex-col bg-white rounded-lg shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b bg-gray-50 flex items-center gap-2">
            <BookOpen size={15} className="text-gray-500" />
            <span className="text-sm font-semibold text-gray-700">Preguntas Guardadas</span>
          </div>
          <div className="flex-1 overflow-y-auto divide-y divide-gray-100">
            {savedReports.length === 0 ? (
              <div className="text-center py-10 text-gray-400 text-xs px-4">
                <Save size={28} className="mx-auto mb-2 opacity-30" />
                Guarda preguntas que haces seguido para volver a correrlas con datos actualizados
              </div>
            ) : (
              savedReports.map(r => (
                <div key={r.id} className="p-3 hover:bg-gray-50 group">
                  <div className="flex items-start justify-between gap-2">
                    <button onClick={() => handleQuery(r.question)} disabled={loading} className="text-left flex-1 min-w-0 disabled:opacity-50">
                      <p className="text-sm font-medium text-gray-800 truncate">{r.name}</p>
                      <p className="text-xs text-gray-400 line-clamp-2 mt-0.5">{r.question}</p>
                    </button>
                    <button onClick={() => persistSaved(savedReports.filter(s => s.id !== r.id))}
                      className="p-1 opacity-0 group-hover:opacity-100 text-gray-300 hover:text-red-500 transition-all">
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      <AnimatePresence>
        {saveModalMsg && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }}
              className="bg-white rounded-xl p-6 max-w-sm w-full shadow-xl" onClick={e => e.stopPropagation()}>
              <div className="flex items-center gap-2 mb-4">
                <Save size={20} className="text-primary-600" />
                <h3 className="font-bold text-gray-800">Guardar pregunta</h3>
              </div>
              <label className="text-sm font-medium text-gray-700 block mb-2">Nombre</label>
              <input autoFocus value={saveName} onChange={e => setSaveName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSaveReport()} className="input w-full mb-4" />
              <div className="flex gap-2">
                <button onClick={() => { setSaveModalMsg(null); setSaveName('') }} className="btn-outline btn-md flex-1">Cancelar</button>
                <button onClick={handleSaveReport} disabled={!saveName.trim()} className="btn-primary btn-md flex-1 disabled:opacity-50">Guardar</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
