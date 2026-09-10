import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import { toast } from 'sonner'
import { Send, MessageSquare, ArrowLeft } from 'lucide-react'
import PortalLayout from '../components/layout/PortalLayout'
import { api } from '../lib/api'
import type { PortalMessage } from '../types'

export default function Messages() {
  const [searchParams] = useSearchParams()
  const refOrderId  = searchParams.get('orderId')  ?? undefined
  const refOrderNum = searchParams.get('orderNum') ?? undefined

  const [messages, setMessages] = useState<PortalMessage[]>([])
  const [loading, setLoading] = useState(true)
  const [input, setInput] = useState(refOrderNum ? `[Pedido ${refOrderNum}] ` : '')
  const [sending, setSending] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  const loadMessages = useCallback(() => {
    api.getMessages()
      .then(r => {
        setMessages(r.data)
        setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 50)
      })
      .catch(e => toast.error(e.message))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { loadMessages() }, [loadMessages])

  const sendMessage = async () => {
    if (!input.trim()) return
    setSending(true)
    try {
      const msg = await api.sendMessage(input.trim(), refOrderId)
      setMessages(prev => [...prev, msg])
      setInput('')
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 50)
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setSending(false)
    }
  }

  return (
    <PortalLayout>
      <div className="max-w-2xl mx-auto flex flex-col" style={{ height: 'calc(100vh - 6rem)' }}>
        {/* Header */}
        <div className="flex items-center gap-3 mb-4 flex-shrink-0">
          <Link to="/dashboard" className="text-gray-400 hover:text-gray-600"><ArrowLeft size={18} /></Link>
          <div>
            <h1 className="text-xl font-bold text-gray-900">Mensajes con el proveedor</h1>
            <p className="text-xs text-gray-500">Variedades Dayana — responde en horario comercial</p>
          </div>
        </div>

        {/* Order context banner */}
        {refOrderNum && (
          <div className="bg-brand-50 border border-brand-200 rounded-xl px-4 py-2.5 mb-3 flex items-center gap-2 text-sm text-brand-700 flex-shrink-0">
            <MessageSquare size={15} />
            Conversación iniciada desde el pedido <strong>{refOrderNum}</strong>
          </div>
        )}

        {/* Messages */}
        <div className="flex-1 overflow-y-auto bg-white rounded-2xl border border-gray-100 shadow-sm p-4 space-y-3">
          {loading ? (
            <div className="flex justify-center pt-12">
              <div className="w-7 h-7 border-4 border-brand-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : messages.length === 0 ? (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col items-center justify-center h-full text-center py-16">
              <div className="w-14 h-14 rounded-2xl bg-brand-50 flex items-center justify-center mb-4">
                <MessageSquare size={28} className="text-brand-400" />
              </div>
              <p className="text-gray-600 font-medium">Sin mensajes todavía</p>
              <p className="text-gray-400 text-sm mt-1">
                Envía un mensaje y el proveedor te responderá.
                {refOrderNum && <><br />Puedes preguntar sobre el pedido <strong>{refOrderNum}</strong>.</>}
              </p>
            </motion.div>
          ) : (
            messages.map(msg => {
              const isMe = msg.senderRole === 'TEACHER'
              return (
                <motion.div
                  key={msg.id}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}
                >
                  <div className={`max-w-[80%] px-4 py-3 rounded-2xl text-sm shadow-sm ${
                    isMe
                      ? 'bg-brand-500 text-white rounded-br-sm'
                      : 'bg-gray-100 text-gray-800 rounded-bl-sm'
                  }`}>
                    {/* Order tag */}
                    {msg.portalOrder && (
                      <p className={`text-[10px] font-semibold mb-1 ${isMe ? 'text-brand-200' : 'text-gray-500'}`}>
                        📋 Pedido {msg.portalOrder.orderNumber}
                      </p>
                    )}
                    <p className="leading-relaxed">{msg.body}</p>
                    <p className={`text-[10px] mt-1.5 ${isMe ? 'text-brand-200' : 'text-gray-400'}`}>
                      {isMe ? 'Tú' : 'Proveedor'} · {new Date(msg.createdAt).toLocaleString('es-GT', {
                        day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
                      })}
                    </p>
                  </div>
                </motion.div>
              )
            })
          )}
          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <div className="flex gap-2 mt-3 flex-shrink-0">
          <textarea
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() } }}
            placeholder="Escribe tu mensaje… (Enter para enviar, Shift+Enter para nueva línea)"
            rows={2}
            className="flex-1 border border-gray-300 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400 resize-none"
          />
          <button
            onClick={sendMessage}
            disabled={sending || !input.trim()}
            className="self-end bg-brand-500 text-white rounded-xl px-4 py-3 hover:bg-brand-600 disabled:opacity-40 flex items-center gap-1.5"
          >
            {sending
              ? <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              : <Send size={16} />}
          </button>
        </div>
      </div>
    </PortalLayout>
  )
}
