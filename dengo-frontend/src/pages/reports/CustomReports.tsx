import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowLeft, Sparkles, Send, Loader, Save, Trash2, BookOpen, Lightbulb,
  AlertCircle, RotateCcw, MessageSquarePlus, User, BarChart3, X, Lock,
} from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { toast } from 'sonner'
import { api } from '../../lib/api'
import { useAuthStore, useLicenseStore } from '../../store'
import { useStore } from '../../contexts/StoreContext'
import { AnalystReportView, type AnalystReportData } from '../../components/ai/AnalystReport'
import { useAiUsage, formatResetDate, type AiUsageDetails, type AiUsageStatus } from '../../services/aiUsage'

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

function UsageBadge({ usage, onClick }: { usage: AiUsageStatus; onClick?: () => void }) {
  const low = usage.limit !== null && usage.remaining !== null && usage.remaining <= Math.max(3, usage.limit * 0.1)
  const tone = usage.remaining === 0
    ? 'bg-red-50 text-red-700 border-red-200'
    : low ? 'bg-orange-50 text-orange-700 border-orange-200' : 'bg-gray-50 text-gray-600 border-gray-200'
  const content = (
    <>
      <BarChart3 size={13} />
      <span className="tabular-nums">
        {usage.limit === null ? `${usage.used} consultas este mes` : `${usage.used} / ${usage.limit} consultas este mes`}
      </span>
    </>
  )
  const title = usage.limit === null
    ? 'Consultas de IA usadas este mes (sin límite)'
    : `Te quedan ${usage.remaining} — se renueva el ${formatResetDate(usage.resetsOn)}`
  const cls = `flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border shrink-0 ${tone}`
  return onClick
    ? <button onClick={onClick} title={`${title}. Clic para ver el detalle de uso.`} className={`${cls} hover:brightness-95`}>{content}</button>
    : <span title={title} className={cls}>{content}</span>
}

const KIND_LABELS: Record<string, string> = { ANALYST: 'Analista', RECOMMENDATION: 'Recomendaciones', QUERY: 'Consulta' }

function UsageDetailsModal({ onClose }: { onClose: () => void }) {
  const [details, setDetails] = useState<AiUsageDetails | null>(null)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    api.get<AiUsageDetails>('/api/ai/usage/details').then(setDetails).catch(() => setFailed(true))
  }, [])
  const status = details?.status
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }}
        className="bg-white rounded-xl p-6 max-w-2xl w-full max-h-[85vh] overflow-y-auto shadow-xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold text-gray-800 flex items-center gap-2"><BarChart3 size={20} className="text-primary-600" /> Uso de la IA este mes</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
        </div>
        {failed ? (
          <p className="text-sm text-red-600">No se pudo cargar el detalle de uso.</p>
        ) : !details || !status ? (
          <div className="flex justify-center py-10"><Loader className="animate-spin text-primary-600" size={24} /></div>
        ) : (
          <div className="space-y-5">
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-lg bg-gray-50 p-3">
                <p className="text-xs text-gray-500">Usadas</p>
                <p className="text-xl font-bold text-gray-800 tabular-nums">{status.used}</p>
              </div>
              <div className="rounded-lg bg-gray-50 p-3">
                <p className="text-xs text-gray-500">Límite del plan</p>
                <p className="text-xl font-bold text-gray-800 tabular-nums">{status.limit ?? 'Sin límite'}</p>
              </div>
              <div className="rounded-lg bg-gray-50 p-3">
                <p className="text-xs text-gray-500">Se renueva</p>
                <p className="text-xl font-bold text-gray-800 tabular-nums">{formatResetDate(status.resetsOn)}</p>
              </div>
            </div>
            {status.limit !== null && status.limit > 0 && (
              <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
                <div className={`h-full ${status.remaining === 0 ? 'bg-red-500' : 'bg-primary-600'}`}
                  style={{ width: `${Math.min(100, (status.used / status.limit) * 100)}%` }} />
              </div>
            )}
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <p className="text-sm font-semibold text-gray-700 mb-2">Por usuario</p>
                {details.byUser.length === 0 ? <p className="text-xs text-gray-400">Nadie ha usado la IA este mes.</p> : (
                  <ul className="space-y-1">
                    {details.byUser.map(u => (
                      <li key={u.userId} className="flex justify-between text-sm"><span className="text-gray-700 truncate">{u.userName}</span><span className="tabular-nums text-gray-500">{u.count}</span></li>
                    ))}
                  </ul>
                )}
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-700 mb-2">Por tipo</p>
                <ul className="space-y-1">
                  {Object.entries(details.byKind).map(([k, n]) => (
                    <li key={k} className="flex justify-between text-sm"><span className="text-gray-700">{KIND_LABELS[k] ?? k}</span><span className="tabular-nums text-gray-500">{n}</span></li>
                  ))}
                </ul>
              </div>
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-700 mb-2">Últimas consultas</p>
              {details.recent.length === 0 ? <p className="text-xs text-gray-400">Sin consultas este mes.</p> : (
                <div className="divide-y divide-gray-100 border rounded-lg">
                  {details.recent.map(r => (
                    <div key={r.id} className="px-3 py-2 text-sm">
                      <p className="text-gray-800">{r.question}</p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {r.userName} · {KIND_LABELS[r.kind] ?? r.kind} · {new Date(r.createdAt).toLocaleString('es-GT', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })} · {Math.round(r.durationMs / 1000)}s
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </motion.div>
    </motion.div>
  )
}

export default function CustomReports() {
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const { currentStore } = useStore()
  const branchId = currentStore?.id ?? user?.branchId ?? ''
  const { aiEnabled, loaded: licenseLoaded } = useLicenseStore()
  const { usage, refresh: refreshUsage } = useAiUsage()
  const [showUsage, setShowUsage] = useState(false)
  const quotaExhausted = usage?.remaining === 0

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
    if (quotaExhausted) {
      toast.error(`Llegaste al límite de consultas de IA de este mes. Se renueva el ${formatResetDate(usage!.resetsOn)}.`)
      return
    }
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
      refreshUsage()
    }
  }

  const handleSaveReport = () => {
    if (!saveName.trim() || !saveModalMsg?.question) return
    persistSaved([{ id: Math.random().toString(36).slice(2), name: saveName.trim(), question: saveModalMsg.question, savedAt: new Date().toISOString() }, ...savedReports])
    setSaveModalMsg(null)
    setSaveName('')
    toast.success('Pregunta guardada — vuelve a correrla cuando quieras con datos actualizados')
  }

  if (licenseLoaded && !aiEnabled) {
    return (
      <div className="max-w-lg mx-auto mt-16 bg-white rounded-xl shadow-sm p-8 text-center">
        <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-4">
          <Lock size={22} className="text-gray-500" />
        </div>
        <h1 className="text-lg font-bold text-gray-800 mb-2">El Analista de Datos con IA no está activado</h1>
        <p className="text-sm text-gray-600 mb-6">
          Es un complemento de tu plan: le preguntas lo que quieras sobre tu negocio y te responde con reportes, gráficas y análisis de tus datos reales.
          Contacta a tu proveedor para activarlo.
        </p>
        <button onClick={() => navigate('/reports')} className="btn-outline btn-md">Volver a reportes</button>
      </div>
    )
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
        {usage && <UsageBadge usage={usage} {...(user?.role === 'ADMIN' ? { onClick: () => setShowUsage(true) } : {})} />}
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
            {quotaExhausted && usage && (
              <p className="mb-2 text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2 flex items-center gap-1.5">
                <AlertCircle size={13} className="shrink-0" />
                Llegaste al límite de {usage.limit} consultas de IA de este mes. Se renueva el {formatResetDate(usage.resetsOn)}; si necesitas más, contacta a tu proveedor.
              </p>
            )}
            <form onSubmit={e => { e.preventDefault(); handleQuery(input) }} className="flex gap-2">
              <input
                value={input}
                onChange={e => setInput(e.target.value)}
                placeholder="Ej: ¿Cuánto debo vender por día para llegar a la meta de este mes en cada sucursal?"
                className="flex-1 input text-sm"
                disabled={loading || quotaExhausted}
                maxLength={1000}
                autoFocus
              />
              <button type="submit" disabled={loading || quotaExhausted || !input.trim()} className="btn-primary btn-md px-3 flex items-center gap-1 disabled:opacity-50">
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
        {showUsage && <UsageDetailsModal onClose={() => setShowUsage(false)} />}
      </AnimatePresence>

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
