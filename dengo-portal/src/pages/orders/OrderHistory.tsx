import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { toast } from 'sonner'
import { ClipboardList, Eye, Plus, Inbox } from 'lucide-react'
import PortalLayout from '../../components/layout/PortalLayout'
import { api } from '../../lib/api'
import type { PortalOrder } from '../../types'
import { programLabel, programIcon, statusStyle, money, formatDate } from '../../lib/labels'

export default function OrderHistory() {
  const [orders, setOrders] = useState<PortalOrder[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.getOrders()
      .then(setOrders)
      .catch(e => toast.error(e instanceof Error ? e.message : 'Error al cargar pedidos'))
      .finally(() => setLoading(false))
  }, [])

  return (
    <PortalLayout>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-extrabold text-gray-900 flex items-center gap-2">
          <ClipboardList size={24} className="text-brand-500" /> Mis Pedidos
        </h1>
        <Link to="/orders/new" className="px-4 py-2.5 rounded-xl bg-brand-500 text-white font-semibold hover:bg-brand-600 flex items-center gap-1.5">
          <Plus size={18} /> Nuevo Pedido
        </Link>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="w-8 h-8 border-4 border-brand-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : orders.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center">
          <Inbox size={48} className="mx-auto text-gray-300 mb-4" />
          <p className="text-gray-500">Aún no has realizado ningún pedido.</p>
          <Link to="/orders/new" className="mt-5 inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-brand-500 text-white font-semibold hover:bg-brand-600">
            <Plus size={16} /> Crear primer pedido
          </Link>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500">
              <tr>
                {['Pedido', 'Escuela', 'Programa', 'Estado', 'Total', 'Fecha', ''].map(h => (
                  <th key={h} className="text-left px-4 py-3 font-semibold whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {orders.map((o, i) => {
                const st = statusStyle(o.status)
                return (
                  <motion.tr
                    key={o.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: i * 0.03 }}
                    className="hover:bg-gray-50"
                  >
                    <td className="px-4 py-3 font-mono text-xs text-gray-700 whitespace-nowrap">{o.orderNumber}</td>
                    <td className="px-4 py-3 text-gray-700">{o.school?.name ?? '—'}</td>
                    <td className="px-4 py-3 whitespace-nowrap">{programIcon(o.programType)} {programLabel(o.programType)}</td>
                    <td className="px-4 py-3"><span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${st.className}`}>{st.label}</span></td>
                    <td className="px-4 py-3 font-semibold text-gray-800 whitespace-nowrap">{money(o.totalAmount)}</td>
                    <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{formatDate(o.createdAt)}</td>
                    <td className="px-4 py-3">
                      <Link to={`/orders/${o.id}`} className="inline-flex items-center gap-1 text-brand-600 hover:text-brand-700 font-medium">
                        <Eye size={15} /> Ver detalle
                      </Link>
                    </td>
                  </motion.tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </PortalLayout>
  )
}
