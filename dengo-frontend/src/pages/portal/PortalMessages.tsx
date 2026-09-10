import { useCallback, useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import { toast } from 'sonner'
import { MessageSquare, Send, Search, RefreshCw } from 'lucide-react'
import { api } from '../../lib/api'

interface Teacher {
  id: string
  user: { id: string; name: string; email: string }
}

interface ThreadEntry {
  teacher: Teacher
  lastMessage: { body: string; senderRole: string; createdAt: string; portalOrder?: { orderNumber: string } | null } | null
  unread: number
  hasHistory: boolean
}

interface PortalMsg {
  id: string
  senderRole: 'TEACHER' | 'ADMIN'
  body: string
  isRead: boolean
  createdAt: string
  portalOrder?: { orderNumber: string } | null
}

export default function PortalMessages() {
  const [searchParams, setSearchParams] = useSearchParams()
  const initialTeacherId = searchParams.get('teacherId') ?? null

  const [threads, setThreads] = useState<ThreadEntry[]>([])
  const [selected, setSelected] = useState<Teacher | null>(null)
  const [messages, setMessages] = useState<PortalMsg[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [loadingThreads, setLoadingThreads] = useState(true)
  const [loadingMsgs, setLoadingMsgs] = useState(false)
  const [search, setSearch] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)
  const didAutoOpen = useRef(false)

  const fetchThreads = useCallback(() => {
    setLoadingThreads(true)
    api.get<{ data: ThreadEntry[] }>('/api/portal-admin/teacher-messages')
      .then(r => setThreads(r.data))
      .catch(e => toast.error(e.message))
      .finally(() => setLoadingThreads(false))
  }, [])

  useEffect(() => { fetchThreads() }, [fetchThreads])

  // Auto-open if teacherId is in URL (only once, prevents loop with fetchThreads)
  useEffect(() => {
    if (didAutoOpen.current || !initialTeacherId || threads.length === 0) return
    const entry = threads.find(t => t.teacher.id === initialTeacherId)
    if (entry) {
      didAutoOpen.current = true
      openThread(entry.teacher)
    }
  }, [initialTeacherId, threads])

  const openThread = (teacher: Teacher) => {
    setSelected(teacher)
    setMessages([])
    setInput('')
    setLoadingMsgs(true)
    setSearchParams(p => { p.set('teacherId', teacher.id); return p })
    api.get<{ data: PortalMsg[] }>(`/api/portal-admin/teacher-messages/${teacher.id}`)
      .then(r => {
        setMessages(r.data)
        setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 50)
        fetchThreads()
      })
      .catch(e => toast.error(e.message))
      .finally(() => setLoadingMsgs(false))
  }

  const sendMessage = async () => {
    if (!selected || !input.trim()) return
    setSending(true)
    try {
      const msg = await api.post<PortalMsg>(
        `/api/portal-admin/teacher-messages/${selected.id}`,
        { body: input.trim() },
      )
      setMessages(prev => [...prev, msg])
      setInput('')
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 50)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al enviar mensaje')
    } finally {
      setSending(false)
    }
  }

  const filtered = threads.filter(t =>
    !search ||
    t.teacher.user.name.toLowerCase().includes(search.toLowerCase()) ||
    t.teacher.user.email.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="h-[calc(100vh-4rem)] flex flex-col">
      {/* Header */}
      <div className="mb-4 flex items-center justify-between flex-shrink-0">
        <div>
          <h1 className="text-3xl font-bold text-gray-800 flex items-center gap-3">
            <MessageSquare size={28} className="text-primary-600" /> Mensajes con Maestros
          </h1>
          <p className="text-gray-600 mt-1">Conversaciones con los maestros del portal escolar</p>
        </div>
        <button onClick={fetchThreads} className="btn-secondary btn-md flex items-center gap-2">
          <RefreshCw size={16} /> Actualizar
        </button>
      </div>

      <div className="flex-1 flex gap-4 min-h-0">
        {/* Left: thread list */}
        <div className="w-72 flex-shrink-0 bg-white rounded-xl border border-gray-200 flex flex-col overflow-hidden">
          <div className="p-3 border-b border-gray-100">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Buscar maestro…"
                className="input pl-9 py-2 text-sm w-full"
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto">
            {loadingThreads ? (
              <div className="flex justify-center py-12">
                <div className="w-6 h-6 border-4 border-primary-600 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : filtered.length === 0 ? (
              <p className="text-center text-gray-400 text-sm py-8">No hay maestros registrados.</p>
            ) : filtered.map(entry => {
              const isActive = selected?.id === entry.teacher.id
              return (
                <button
                  key={entry.teacher.id}
                  onClick={() => openThread(entry.teacher)}
                  className={`w-full text-left px-4 py-3 border-b border-gray-100 transition-colors hover:bg-gray-50 flex items-start gap-3 ${isActive ? 'bg-primary-50 border-l-4 border-l-primary-500' : ''}`}
                >
                  <div className="w-9 h-9 rounded-full bg-primary-100 flex items-center justify-center flex-shrink-0">
                    <span className="text-sm font-bold text-primary-700">
                      {entry.teacher.user.name.charAt(0).toUpperCase()}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <p className="font-semibold text-gray-800 text-sm truncate">{entry.teacher.user.name}</p>
                      {entry.unread > 0 && (
                        <span className="min-w-[20px] h-5 px-1.5 bg-red-500 text-white text-xs font-bold rounded-full flex items-center justify-center flex-shrink-0 ml-1">
                          {entry.unread}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-400 truncate mt-0.5">{entry.teacher.user.email}</p>
                    {entry.lastMessage ? (
                      <p className="text-xs text-gray-400 truncate mt-0.5">
                        {entry.lastMessage.senderRole === 'ADMIN' ? 'Tú: ' : ''}{entry.lastMessage.body}
                      </p>
                    ) : (
                      <p className="text-xs text-gray-300 mt-0.5 italic">Sin mensajes aún</p>
                    )}
                  </div>
                </button>
              )
            })}
          </div>
        </div>

        {/* Right: conversation */}
        <div className="flex-1 bg-white rounded-xl border border-gray-200 flex flex-col overflow-hidden min-w-0">
          {!selected ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
              <div className="w-16 h-16 rounded-2xl bg-gray-100 flex items-center justify-center mb-4">
                <MessageSquare size={32} className="text-gray-300" />
              </div>
              <p className="text-gray-600 font-medium">Selecciona un maestro</p>
              <p className="text-gray-400 text-sm mt-1">Elige un maestro de la lista para ver o iniciar la conversación</p>
            </div>
          ) : (
            <>
              {/* Thread header */}
              <div className="p-4 border-b border-gray-100 flex items-center gap-3 flex-shrink-0">
                <div className="w-9 h-9 rounded-full bg-primary-100 flex items-center justify-center">
                  <span className="text-sm font-bold text-primary-700">{selected.user.name.charAt(0).toUpperCase()}</span>
                </div>
                <div>
                  <p className="font-bold text-gray-800">{selected.user.name}</p>
                  <p className="text-xs text-gray-500">{selected.user.email}</p>
                </div>
              </div>

              {/* Messages */}
              <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-gray-50">
                {loadingMsgs ? (
                  <div className="flex justify-center py-12">
                    <div className="w-6 h-6 border-4 border-primary-600 border-t-transparent rounded-full animate-spin" />
                  </div>
                ) : messages.length === 0 ? (
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col items-center justify-center h-full text-center py-12">
                    <MessageSquare size={36} className="text-gray-300 mb-3" />
                    <p className="text-gray-400 text-sm">Sin mensajes aún con este maestro.</p>
                  </motion.div>
                ) : messages.map(msg => {
                  const isAdmin = msg.senderRole === 'ADMIN'
                  return (
                    <motion.div
                      key={msg.id}
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      className={`flex ${isAdmin ? 'justify-end' : 'justify-start'}`}
                    >
                      <div className={`max-w-[75%] px-4 py-2.5 rounded-2xl text-sm shadow-sm ${
                        isAdmin
                          ? 'bg-primary-600 text-white rounded-br-sm'
                          : 'bg-white border border-gray-200 text-gray-800 rounded-bl-sm'
                      }`}>
                        {msg.portalOrder && (
                          <p className={`text-[10px] font-semibold mb-1 ${isAdmin ? 'text-primary-200' : 'text-gray-500'}`}>
                            📋 Pedido {msg.portalOrder.orderNumber}
                          </p>
                        )}
                        <p>{msg.body}</p>
                        <p className={`text-[10px] mt-1 ${isAdmin ? 'text-primary-200' : 'text-gray-400'}`}>
                          {isAdmin ? 'Tú' : selected.user.name} · {new Date(msg.createdAt).toLocaleString('es-GT', {
                            day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
                          })}
                        </p>
                      </div>
                    </motion.div>
                  )
                })}
                <div ref={bottomRef} />
              </div>

              {/* Input */}
              <div className="p-4 border-t border-gray-100 flex gap-2 flex-shrink-0">
                <textarea
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() } }}
                  placeholder={`Mensaje para ${selected.user.name}… (Enter para enviar)`}
                  rows={2}
                  className="flex-1 input py-2.5 text-sm resize-none"
                />
                <button
                  onClick={sendMessage}
                  disabled={sending || !input.trim()}
                  className="self-end btn-primary btn-md flex items-center gap-1.5 px-4"
                >
                  {sending
                    ? <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    : <Send size={16} />}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
