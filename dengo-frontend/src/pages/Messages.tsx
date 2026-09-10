import { useCallback, useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { toast } from 'sonner'
import { MessageSquare, Send, User2, Search } from 'lucide-react'
import { api } from '../lib/api'

interface StaffUser {
  id: string
  name: string
  email: string
  role: string
}

interface ThreadEntry {
  user: StaffUser
  lastMessage: { body: string; fromUserId: string; createdAt: string } | null
  unread: number
  hasHistory: boolean
}

interface Message {
  id: string
  fromUserId: string
  toUserId: string
  body: string
  isRead: boolean
  createdAt: string
}

const ROLE_LABELS: Record<string, string> = {
  ADMIN: 'Administrador',
  OPERATOR: 'Operador',
  AUDITOR: 'Auditor',
  INVENTORY_CONTROL: 'Control de Inventario',
}

function getStoredUserId(): string | null {
  try {
    const raw = localStorage.getItem('auth-storage')
    if (!raw) return null
    return JSON.parse(raw)?.state?.user?.id ?? null
  } catch { return null }
}

export default function Messages() {
  const [threads, setThreads] = useState<ThreadEntry[]>([])
  const [selected, setSelected] = useState<StaffUser | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [msgInput, setMsgInput] = useState('')
  const [sending, setSending] = useState(false)
  const [loadingThreads, setLoadingThreads] = useState(true)
  const [loadingMsgs, setLoadingMsgs] = useState(false)
  const [search, setSearch] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)
  const myId = getStoredUserId()

  const fetchThreads = useCallback(() => {
    setLoadingThreads(true)
    api.get<{ data: ThreadEntry[] }>('/api/messages/threads')
      .then(r => setThreads(r.data))
      .catch(e => toast.error(e.message))
      .finally(() => setLoadingThreads(false))
  }, [])

  useEffect(() => { fetchThreads() }, [fetchThreads])

  const openThread = (user: StaffUser) => {
    setSelected(user)
    setMessages([])
    setLoadingMsgs(true)
    api.get<{ data: Message[]; user: StaffUser }>(`/api/messages/threads/${user.id}`)
      .then(r => {
        setMessages(r.data)
        setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 50)
        // Refresh threads to clear unread badge
        fetchThreads()
      })
      .catch(e => toast.error(e.message))
      .finally(() => setLoadingMsgs(false))
  }

  const sendMessage = async () => {
    if (!selected || !msgInput.trim()) return
    setSending(true)
    try {
      const msg = await api.post<Message>(`/api/messages/threads/${selected.id}`, { body: msgInput.trim() })
      setMessages(prev => [...prev, msg])
      setMsgInput('')
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 50)
      fetchThreads()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al enviar mensaje')
    } finally {
      setSending(false)
    }
  }

  const filtered = threads.filter(t =>
    !search ||
    t.user.name.toLowerCase().includes(search.toLowerCase()) ||
    t.user.role.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="h-[calc(100vh-4rem)] flex flex-col">
      <div className="mb-4 flex-shrink-0">
        <h1 className="text-3xl font-bold text-gray-800 flex items-center gap-3">
          <MessageSquare size={28} className="text-primary-600" /> Mensajes Internos
        </h1>
        <p className="text-gray-600 mt-1">Comunicación entre el personal de la empresa</p>
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
                placeholder="Buscar empleado…"
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
              <p className="text-center text-gray-400 text-sm py-8">No hay usuarios disponibles.</p>
            ) : filtered.map(entry => {
              const isActive = selected?.id === entry.user.id
              return (
                <button
                  key={entry.user.id}
                  onClick={() => openThread(entry.user)}
                  className={`w-full text-left px-4 py-3 border-b border-gray-100 transition-colors hover:bg-gray-50 flex items-start gap-3 ${isActive ? 'bg-primary-50 border-l-4 border-l-primary-500' : ''}`}
                >
                  <div className="w-9 h-9 rounded-full bg-primary-100 flex items-center justify-center flex-shrink-0">
                    <span className="text-sm font-bold text-primary-700">{entry.user.name.charAt(0).toUpperCase()}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <p className="font-semibold text-gray-800 text-sm truncate">{entry.user.name}</p>
                      {entry.unread > 0 && (
                        <span className="min-w-[20px] h-5 px-1.5 bg-red-500 text-white text-xs font-bold rounded-full flex items-center justify-center flex-shrink-0 ml-1">
                          {entry.unread}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-500">{ROLE_LABELS[entry.user.role] ?? entry.user.role}</p>
                    {entry.lastMessage && (
                      <p className="text-xs text-gray-400 truncate mt-0.5">{entry.lastMessage.body}</p>
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
                <User2 size={32} className="text-gray-400" />
              </div>
              <p className="text-gray-600 font-medium">Selecciona una conversación</p>
              <p className="text-gray-400 text-sm mt-1">Elige un empleado de la lista para ver o iniciar un chat</p>
            </div>
          ) : (
            <>
              {/* Thread header */}
              <div className="p-4 border-b border-gray-100 flex items-center gap-3 flex-shrink-0">
                <div className="w-9 h-9 rounded-full bg-primary-100 flex items-center justify-center">
                  <span className="text-sm font-bold text-primary-700">{selected.name.charAt(0).toUpperCase()}</span>
                </div>
                <div>
                  <p className="font-bold text-gray-800">{selected.name}</p>
                  <p className="text-xs text-gray-500">{ROLE_LABELS[selected.role] ?? selected.role}</p>
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
                    <p className="text-gray-400 text-sm">Aún no hay mensajes. ¡Envía el primero!</p>
                  </motion.div>
                ) : messages.map(msg => {
                  const isMe = msg.fromUserId === myId
                  return (
                    <motion.div
                      key={msg.id}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}
                    >
                      <div className={`max-w-[75%] px-4 py-2.5 rounded-2xl text-sm shadow-sm ${
                        isMe
                          ? 'bg-primary-600 text-white rounded-br-sm'
                          : 'bg-white border border-gray-200 text-gray-800 rounded-bl-sm'
                      }`}>
                        <p>{msg.body}</p>
                        <p className={`text-[10px] mt-1 ${isMe ? 'text-primary-200' : 'text-gray-400'}`}>
                          {new Date(msg.createdAt).toLocaleString('es-GT', {
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
                <input
                  value={msgInput}
                  onChange={e => setMsgInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendMessage()}
                  placeholder={`Mensaje para ${selected.name}…`}
                  className="flex-1 input py-2.5 text-sm"
                />
                <button
                  onClick={sendMessage}
                  disabled={sending || !msgInput.trim()}
                  className="btn-primary btn-md flex items-center gap-1.5 px-4"
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
