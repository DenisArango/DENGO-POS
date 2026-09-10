import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { toast } from 'sonner'
import {
  Plus, School, Clock, CheckCircle2, ClipboardList, ArrowRight, Eye, BookOpen,
} from 'lucide-react'
import PortalLayout from '../components/layout/PortalLayout'
import { api } from '../lib/api'
import { useAuthStore } from '../store/authStore'
import type { Program, PortalOrder, TeacherSchoolAssignment } from '../types'
import { programLabel, programIcon, statusStyle, money, formatDate } from '../lib/labels'

export default function Dashboard() {
  const navigate = useNavigate()
  const user = useAuthStore(s => s.user)
  const [schools, setSchools] = useState<TeacherSchoolAssignment[]>([])
  const [programs, setPrograms] = useState<Program[]>([])
  const [orders, setOrders] = useState<PortalOrder[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([api.getMe(), api.getOrders()])
      .then(([me, ord]) => {
        setSchools(me.teacher?.schools ?? [])
        setPrograms(me.programs ?? [])
        setOrders(ord)
      })
      .catch(e => toast.error(e instanceof Error ? e.message : 'Error al cargar datos'))
      .finally(() => setLoading(false))
  }, [])

  const stats = {
    pending: orders.filter(o => o.status === 'PENDING').length,
    approved: orders.filter(o => ['APPROVED', 'QUOTED', 'INVOICED'].includes(o.status)).length,
    total: orders.length,
  }

  const today = new Date().toLocaleDateString('es-GT', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
  const recent = orders.slice(0, 5)

  if (loading) {
    return (
      <PortalLayout>
        <div className="flex items-center justify-center h-64">
          <div className="w-8 h-8 border-4 border-brand-500 border-t-transparent rounded-full animate-spin" />
        </div>
      </PortalLayout>
    )
  }

  return (
    <PortalLayout>
      <div className="space-y-8">
        {/* Welcome */}
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-gray-900">
            ¡Bienvenido/a, {user?.name?.split(' ')[0] ?? 'Maestro'}!
          </h1>
          <p className="text-gray-500 mt-1 capitalize">{today}</p>
        </motion.div>

        {/* Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[
            { label: 'Pendientes', value: stats.pending, Icon: Clock, color: 'text-yellow-600', bg: 'bg-yellow-100' },
            { label: 'Aprobados', value: stats.approved, Icon: CheckCircle2, color: 'text-green-600', bg: 'bg-green-100' },
            { label: 'Total de pedidos', value: stats.total, Icon: ClipboardList, color: 'text-brand-600', bg: 'bg-brand-100' },
          ].map(({ label, value, Icon, color, bg }, i) => (
            <motion.div
              key={label}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.08 }}
              className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 flex items-center justify-between"
            >
              <div>
                <p className="text-sm text-gray-500">{label}</p>
                <p className={`text-3xl font-extrabold mt-1 ${color}`}>{value}</p>
              </div>
              <div className={`p-3.5 rounded-2xl ${bg}`}><Icon className={color} size={24} /></div>
            </motion.div>
          ))}
        </div>

        {/* Mis Escuelas */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2"><School size={20} className="text-brand-500" /> Mis Escuelas</h2>
          </div>
          {schools.length === 0 ? (
            <div className="bg-white rounded-2xl border border-gray-100 p-8 text-center text-gray-500">
              No tienes escuelas asignadas. Contacta al proveedor.
            </div>
          ) : (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {schools.map(s => (
                <div key={s.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 flex flex-col">
                  <div className="w-11 h-11 rounded-xl bg-brand-50 text-brand-600 flex items-center justify-center mb-3">
                    <School size={20} />
                  </div>
                  <p className="font-bold text-gray-900 leading-snug">{s.school.name}</p>
                  <p className="text-sm text-gray-500 mt-0.5">
                    {[s.grade, s.section && `Sección ${s.section}`].filter(Boolean).join(' · ') || 'Sin grado asignado'}
                  </p>
                  {s.school.municipio && <p className="text-xs text-gray-400 mt-0.5">{s.school.municipio}</p>}
                  <button
                    onClick={() => navigate('/orders/new')}
                    className="mt-4 px-4 py-2.5 rounded-xl bg-brand-500 text-white text-sm font-semibold hover:bg-brand-600 transition-colors flex items-center justify-center gap-1.5"
                  >
                    Hacer Pedido <ArrowRight size={15} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Pedidos Recientes */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2"><ClipboardList size={20} className="text-brand-500" /> Pedidos Recientes</h2>
            <Link to="/orders" className="text-sm font-medium text-brand-600 hover:text-brand-700">Ver todos →</Link>
          </div>
          {recent.length === 0 ? (
            <div className="bg-white rounded-2xl border border-gray-100 p-8 text-center text-gray-500">
              Aún no has realizado pedidos.
              <div>
                <Link to="/orders/new" className="mt-4 inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-brand-500 text-white text-sm font-semibold hover:bg-brand-600">
                  <Plus size={16} /> Crear primer pedido
                </Link>
              </div>
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-gray-500">
                  <tr>
                    {['Pedido', 'Escuela', 'Programa', 'Estado', 'Monto', 'Fecha', ''].map(h => (
                      <th key={h} className="text-left px-4 py-3 font-semibold whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {recent.map(o => {
                    const st = statusStyle(o.status)
                    return (
                      <tr key={o.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 font-mono text-xs text-gray-700 whitespace-nowrap">{o.orderNumber}</td>
                        <td className="px-4 py-3 text-gray-700">{o.school?.name ?? '—'}</td>
                        <td className="px-4 py-3 whitespace-nowrap">{programIcon(o.programType)} {programLabel(o.programType)}</td>
                        <td className="px-4 py-3"><span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${st.className}`}>{st.label}</span></td>
                        <td className="px-4 py-3 font-semibold text-gray-800 whitespace-nowrap">{money(o.totalAmount)}</td>
                        <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{formatDate(o.createdAt)}</td>
                        <td className="px-4 py-3">
                          <Link to={`/orders/${o.id}`} className="inline-flex items-center gap-1 text-brand-600 hover:text-brand-700 font-medium">
                            <Eye size={15} /> Ver
                          </Link>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* Programas Disponibles */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2"><BookOpen size={20} className="text-brand-500" /> Programas Disponibles</h2>
          </div>
          {programs.length === 0 ? (
            <div className="bg-white rounded-2xl border border-gray-100 p-8 text-center text-gray-500">
              No hay programas activos por el momento.
            </div>
          ) : (
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {programs.map(p => (
                <div key={p.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                  <div className="text-3xl mb-2">{programIcon(p.type)}</div>
                  <p className="font-bold text-gray-900">{p.name || programLabel(p.type)}</p>
                  {p.description && <p className="text-xs text-gray-500 mt-1 leading-relaxed">{p.description}</p>}
                  {p.maxAmountPerTeacher != null && (
                    <p className="mt-3 text-xs font-semibold text-brand-600">Límite: {money(p.maxAmountPerTeacher)} por maestro</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      {/* Floating Action Button */}
      <button
        onClick={() => navigate('/orders/new')}
        className="fixed bottom-6 right-6 z-40 w-14 h-14 rounded-full bg-brand-500 text-white shadow-xl shadow-brand-500/40 hover:bg-brand-600 hover:scale-105 transition-all flex items-center justify-center"
        title="Nuevo pedido"
      >
        <Plus size={26} />
      </button>
    </PortalLayout>
  )
}
