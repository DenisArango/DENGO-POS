import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { toast } from 'sonner'
import { ArrowLeft, MessageSquare, Package, CalendarClock } from 'lucide-react'
import PortalLayout from '../../components/layout/PortalLayout'
import { api } from '../../lib/api'
import type { PortalOrder } from '../../types'
import { programLabel, programIcon, statusStyle, money, formatDate } from '../../lib/labels'

const TIMELINE = ['PENDING', 'APPROVED', 'QUOTED', 'INVOICED']
const TIMELINE_LABELS: Record<string, string> = {
  PENDING: 'Recibido',
  APPROVED: 'Aprobado',
  QUOTED: 'Cotizado',
  INVOICED: 'Facturado',
}

export default function OrderDetail() {
  const { id } = useParams<{ id: string }>()
  const [order, setOrder] = useState<PortalOrder | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!id) return
    api.getOrder(id)
      .then(setOrder)
      .catch(e => toast.error(e instanceof Error ? e.message : 'Error al cargar el pedido'))
      .finally(() => setLoading(false))
  }, [id])

  if (loading) {
    return (
      <PortalLayout>
        <div className="flex items-center justify-center h-64">
          <div className="w-8 h-8 border-4 border-brand-500 border-t-transparent rounded-full animate-spin" />
        </div>
      </PortalLayout>
    )
  }

  if (!order) {
    return (
      <PortalLayout>
        <div className="text-center py-20">
          <p className="text-gray-500">Pedido no encontrado.</p>
          <Link to="/orders" className="mt-4 inline-flex items-center gap-1.5 text-brand-600 font-medium"><ArrowLeft size={16} /> Volver</Link>
        </div>
      </PortalLayout>
    )
  }

  const st = statusStyle(order.status)
  const rejected = order.status === 'REJECTED'
  const currentIdx = TIMELINE.indexOf(order.status)

  return (
    <PortalLayout>
      <Link to="/orders" className="inline-flex items-center gap-1.5 text-gray-500 hover:text-gray-700 text-sm mb-5">
        <ArrowLeft size={16} /> Volver a mis pedidos
      </Link>

      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
        {/* Header */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="font-mono text-sm text-gray-500">{order.orderNumber}</p>
              <h1 className="text-xl font-extrabold text-gray-900 mt-1">{programIcon(order.programType)} {programLabel(order.programType)}</h1>
              <p className="text-sm text-gray-500 mt-1">{order.school?.name}</p>
              {order.orderGradeSummary && (
                <p className="text-xs text-gray-500 mt-0.5">Grados: {order.orderGradeSummary}</p>
              )}
              {order.studentCount != null && order.studentCount > 0 && (
                <p className="text-xs text-gray-400 mt-0.5">{order.studentCount} alumnos en total</p>
              )}
              <p className="text-xs text-gray-400 mt-0.5">Creado el {formatDate(order.createdAt)}</p>
            </div>
            <span className={`px-3 py-1.5 rounded-full text-sm font-semibold ${st.className}`}>{st.label}</span>
          </div>
        </div>

        {/* Status timeline */}
        {!rejected ? (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
            <h2 className="font-bold text-gray-900 mb-5">Estado del pedido</h2>
            <div className="flex items-center">
              {TIMELINE.map((s, i) => {
                const reached = currentIdx >= i && currentIdx >= 0
                return (
                  <div key={s} className="flex items-center flex-1 last:flex-none">
                    <div className="flex flex-col items-center gap-1.5">
                      <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold ${reached ? 'bg-brand-500 text-white' : 'bg-gray-200 text-gray-400'}`}>
                        {i + 1}
                      </div>
                      <span className={`text-xs ${reached ? 'text-gray-800 font-medium' : 'text-gray-400'}`}>{TIMELINE_LABELS[s]}</span>
                    </div>
                    {i < TIMELINE.length - 1 && <div className={`flex-1 h-0.5 mx-2 mb-5 ${currentIdx > i ? 'bg-brand-500' : 'bg-gray-200'}`} />}
                  </div>
                )
              })}
            </div>
          </div>
        ) : (
          <div className="bg-red-50 border border-red-100 rounded-2xl p-5 text-red-700">
            <p className="font-bold">Pedido rechazado</p>
            {order.adminNotes && <p className="text-sm mt-1">{order.adminNotes}</p>}
          </div>
        )}

        {/* Delivery info (shown when approved) */}
        {!rejected && order.deliveryDate && (
          <div className="bg-green-50 border border-green-200 rounded-2xl p-5">
            <p className="font-semibold text-green-800 flex items-center gap-2 mb-3"><CalendarClock size={18} /> Información de entrega</p>
            <dl className="grid grid-cols-2 gap-y-2 text-sm">
              <dt className="text-green-700">Fecha</dt>
              <dd className="font-semibold text-green-900">
                {new Date(order.deliveryDate).toLocaleDateString('es-GT', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
              </dd>
              {order.deliveryTime && (
                <>
                  <dt className="text-green-700">Hora</dt>
                  <dd className="font-semibold text-green-900">{order.deliveryTime}</dd>
                </>
              )}
              {order.deliveryNotes && (
                <>
                  <dt className="text-green-700 col-span-2 mt-1">Instrucciones</dt>
                  <dd className="text-green-800 col-span-2">{order.deliveryNotes}</dd>
                </>
              )}
            </dl>
          </div>
        )}

        {/* Admin notes */}
        {!rejected && order.adminNotes && (
          <div className="bg-blue-50 border border-blue-100 rounded-2xl p-5">
            <p className="font-semibold text-blue-800 flex items-center gap-2 mb-1"><MessageSquare size={16} /> Notas del proveedor</p>
            <p className="text-sm text-blue-700">{order.adminNotes}</p>
          </div>
        )}

        {/* Items */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="p-5 border-b border-gray-100">
            <h2 className="font-bold text-gray-900 flex items-center gap-2"><Package size={18} className="text-brand-500" /> Productos</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-500">
                <tr>
                  {['Producto', 'Cantidad', 'Precio Unit.', 'Total'].map(h => (
                    <th key={h} className="text-left px-4 py-3 font-semibold whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {(order.items ?? []).map(it => (
                  <tr key={it.id}>
                    <td className="px-4 py-3 text-gray-800 font-medium">{it.productName}</td>
                    <td className="px-4 py-3 text-gray-600">{Number(it.quantity)}</td>
                    <td className="px-4 py-3 text-gray-600">{money(it.unitPrice)}</td>
                    <td className="px-4 py-3 font-semibold text-gray-900">{money(it.total)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-gray-200">
                  <td colSpan={3} className="px-4 py-3 text-right font-bold text-gray-700">Total</td>
                  <td className="px-4 py-3 text-lg font-extrabold text-brand-600">{money(order.totalAmount)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        {/* Teacher notes */}
        {order.notes && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <p className="font-semibold text-gray-700 mb-1">Tus notas</p>
            <p className="text-sm text-gray-600">{order.notes}</p>
          </div>
        )}

        {/* Message shortcut */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 flex items-center justify-between gap-4">
          <div>
            <p className="font-semibold text-gray-800 flex items-center gap-2">
              <MessageSquare size={17} className="text-brand-500" /> ¿Tienes preguntas sobre este pedido?
            </p>
            <p className="text-sm text-gray-500 mt-0.5">Envía un mensaje al proveedor directamente desde tu bandeja de mensajes.</p>
          </div>
          <Link
            to={`/messages?orderId=${order.id}&orderNum=${encodeURIComponent(order.orderNumber)}`}
            className="flex-shrink-0 px-4 py-2 rounded-xl bg-brand-500 text-white text-sm font-semibold hover:bg-brand-600 flex items-center gap-1.5"
          >
            <MessageSquare size={15} /> Enviar mensaje
          </Link>
        </div>
      </motion.div>
    </PortalLayout>
  )
}
