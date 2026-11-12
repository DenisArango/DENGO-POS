import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { toast } from 'sonner'
import {
  Plus, School, Clock, Bell, CheckCircle2, ClipboardList, ArrowRight, Eye, BookOpen,
} from 'lucide-react'
import PortalLayout from '../components/layout/PortalLayout'
import { api } from '../lib/api'
import { useAuthStore } from '../store/authStore'
import type { Program, PortalOrder, TeacherSchoolAssignment } from '../types'
import { programLabel, statusStyle, money, formatDate } from '../lib/labels'
import ProgramIcon, { ProgramTile, programColor } from '../lib/ProgramIcon'
import OrderCards from '../components/OrderCards'
import { getPushState, type PushState } from '../lib/push'

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

  // Only the first letter — CSS `capitalize` turned "de" into "De".
  const todayRaw = new Date().toLocaleDateString('es-GT', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
  const today = todayRaw.charAt(0).toUpperCase() + todayRaw.slice(1)
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
        <PushNudge />
        {/* Welcome — the client's colour as a gradient, with two soft light spots */}
        <motion.section
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
          className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-brand-500 via-brand-600 to-brand-800 px-6 py-7 sm:px-8 sm:py-8 text-white shadow-lg shadow-brand-900/20"
        >
          <span aria-hidden className="pointer-events-none absolute -right-16 -top-20 h-64 w-64 rounded-full bg-sky-300/25 blur-3xl motion-safe:animate-float" />
          <span aria-hidden className="pointer-events-none absolute -bottom-24 right-1/3 h-56 w-56 rounded-full bg-violet-300/20 blur-3xl" />
          <div className="relative flex flex-wrap items-end justify-between gap-5">
            <div>
              <p className="text-sm font-medium text-white/75">{today}</p>
              <h1 className="mt-1 text-2xl sm:text-3xl font-extrabold tracking-tight">
                ¡Bienvenido/a, {user?.name?.split(' ')[0] ?? 'Maestro'}!
              </h1>
              <p className="mt-2 max-w-md text-white/80">
                {stats.pending > 0
                  ? `Tienes ${stats.pending} ${stats.pending === 1 ? 'pedido' : 'pedidos'} en revisión. Te avisamos cuando cambien.`
                  : 'Arma tu próximo pedido en pocos pasos.'}
              </p>
            </div>
            <Link
              to="/orders/new"
              className="group hidden sm:inline-flex items-center gap-2 rounded-xl bg-white px-5 py-3 text-sm font-semibold text-brand-700 shadow-md transition-transform motion-safe:hover:-translate-y-0.5"
            >
              <Plus size={18} className="transition-transform duration-300 motion-safe:group-hover:rotate-90" /> Nuevo Pedido
            </Link>
          </div>
        </motion.section>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3 sm:gap-4">
          {[
            { label: 'En revisión', value: stats.pending, Icon: Clock, tile: 'from-amber-100 to-orange-50 text-amber-600 ring-amber-200/70', bar: 'from-amber-400 to-orange-400' },
            { label: 'Aprobados', value: stats.approved, Icon: CheckCircle2, tile: 'from-emerald-100 to-teal-50 text-emerald-600 ring-emerald-200/70', bar: 'from-emerald-400 to-teal-400' },
            { label: 'Total de pedidos', value: stats.total, Icon: ClipboardList, tile: 'from-sky-100 to-cyan-50 text-sky-600 ring-sky-200/70', bar: 'from-sky-400 to-cyan-400' },
          ].map(({ label, value, Icon, tile, bar }, i) => (
            <motion.div
              key={label}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1], delay: 0.08 + i * 0.06 }}
              className="group relative overflow-hidden rounded-2xl border border-gray-200/80 bg-white p-4 sm:p-5 shadow-sm transition-[transform,box-shadow] duration-200 hover:shadow-md motion-safe:hover:-translate-y-0.5"
            >
              <span aria-hidden className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${bar}`} />
              <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-xs sm:text-sm font-medium text-gray-600">{label}</p>
                  <p className="mt-1 text-2xl sm:text-3xl font-bold tracking-tight text-gray-900">{value}</p>
                </div>
                <span className={`flex h-10 w-10 sm:h-12 sm:w-12 items-center justify-center rounded-xl bg-gradient-to-br ring-1 ring-inset transition-transform duration-300 motion-safe:group-hover:scale-110 ${tile}`}>
                  <Icon size={22} className="motion-safe:group-hover:animate-wiggle" aria-hidden />
                </span>
              </div>
            </motion.div>
          ))}
        </div>

        {/* Mis Escuelas */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2"><School size={19} className="text-brand-500" aria-hidden /> Mis Escuelas</h2>
          </div>
          {schools.length === 0 ? (
            <div className="bg-white rounded-2xl border border-gray-200/80 p-8 text-center text-gray-600">
              No tienes escuelas asignadas. Contacta al proveedor.
            </div>
          ) : (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {schools.map(s => (
                <button
                  key={s.id}
                  onClick={() => navigate(`/orders/new?school=${s.id}`)}
                  className="group relative overflow-hidden text-left bg-white rounded-2xl border border-gray-200/80 shadow-sm p-5 flex flex-col transition-[border-color,box-shadow,transform] duration-200 hover:border-brand-200 hover:shadow-lg motion-safe:hover:-translate-y-1"
                >
                  <span aria-hidden className="pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full bg-gradient-to-br from-sky-100 to-violet-100 opacity-80 transition-transform duration-500 motion-safe:group-hover:scale-125" />
                  <span className="relative flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 text-white shadow-sm transition-transform duration-300 motion-safe:group-hover:-rotate-6 motion-safe:group-hover:scale-110">
                    <School size={20} aria-hidden />
                  </span>
                  <p className="relative mt-4 font-semibold text-gray-900 leading-snug">{s.school.name}</p>
                  <p className="relative text-sm text-gray-600 mt-1">
                    {[s.grade, s.section && `Sección ${s.section}`].filter(Boolean).join(' · ') || 'Sin grado asignado'}
                  </p>
                  {s.school.municipio && <p className="relative text-xs text-gray-500 mt-0.5">{s.school.municipio}</p>}
                  <span className="relative mt-5 pt-4 border-t border-gray-100 text-sm font-semibold text-brand-600 flex items-center gap-1.5">
                    Hacer Pedido
                    <ArrowRight size={15} className="motion-safe:group-hover:animate-bounce-x" aria-hidden />
                  </span>
                </button>
              ))}
            </div>
          )}
        </section>

        {/* Pedidos Recientes */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2"><ClipboardList size={19} className="text-brand-500" aria-hidden /> Pedidos Recientes</h2>
            <Link to="/orders" className="text-sm font-medium text-brand-600 hover:text-brand-700 inline-flex items-center gap-1">Ver todos <ArrowRight size={14} aria-hidden /></Link>
          </div>
          {recent.length === 0 ? (
            <div className="bg-white rounded-2xl border border-gray-200/80 p-8 text-center text-gray-600">
              Aún no has realizado pedidos.
              <div>
                <Link to="/orders/new" className="mt-4 inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-brand-500 text-white text-sm font-semibold hover:bg-brand-600">
                  <Plus size={16} /> Crear primer pedido
                </Link>
              </div>
            </div>
          ) : (
            <>
            <OrderCards orders={recent} />
            <div className="hidden md:block bg-white rounded-2xl border border-gray-200/80 shadow-sm overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-gray-200/80 text-xs text-gray-500">
                  <tr>
                    {['Pedido', 'Escuela', 'Programa', 'Estado', 'Monto', 'Fecha', ''].map(h => (
                      <th key={h} className={`px-4 py-3 font-medium whitespace-nowrap ${h === 'Monto' ? 'text-right' : 'text-left'}`}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {recent.map(o => {
                    const st = statusStyle(o.status)
                    return (
                      <tr key={o.id} className="hover:bg-gray-50/80">
                        <td className="px-4 py-3 font-mono text-xs text-gray-600 whitespace-nowrap">{o.orderNumber}</td>
                        <td className="px-4 py-3 text-gray-800">{o.school?.name ?? '—'}</td>
                        <td className="px-4 py-3 whitespace-nowrap text-gray-700"><span className="inline-flex items-center gap-1.5"><ProgramIcon type={o.programType} size={15} />{programLabel(o.programType)}</span></td>
                        <td className="px-4 py-3"><span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap ${st.className}`}>{st.label}</span></td>
                        <td className="px-4 py-3 font-semibold text-gray-900 whitespace-nowrap text-right">{money(o.totalAmount)}</td>
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
            </>
          )}
        </section>

        {/* Programas Disponibles */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2"><BookOpen size={19} className="text-brand-500" aria-hidden /> Programas Disponibles</h2>
          </div>
          {programs.length === 0 ? (
            <div className="bg-white rounded-2xl border border-gray-200/80 p-8 text-center text-gray-600">
              No hay programas activos por el momento.
            </div>
          ) : (
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {programs.map(p => (
                <div key={p.id} className="group relative overflow-hidden bg-white rounded-2xl border border-gray-200/80 shadow-sm p-5 flex flex-col transition-[transform,box-shadow] duration-200 hover:shadow-md motion-safe:hover:-translate-y-0.5">
                  <span aria-hidden className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${programColor(p.type).bar}`} />
                  <ProgramTile type={p.type} className="mb-4" />
                  <p className="font-semibold text-gray-900">{p.name || programLabel(p.type)}</p>
                  {p.description && <p className="text-sm text-gray-600 mt-1 leading-relaxed">{p.description}</p>}
                  {p.maxAmountPerTeacher != null && (
                    <p className="mt-auto pt-4 text-xs font-medium text-gray-600">
                      Límite <span className="font-semibold text-gray-900">{money(p.maxAmountPerTeacher)}</span> por maestro
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

    </PortalLayout>
  )
}

// Small, dismissible invitation to turn on phone notifications.
function PushNudge() {
  const [state, setState] = useState<PushState | null>(null)
  const [hidden, setHidden] = useState(() => {
    try { return localStorage.getItem('portal-push-nudge') === 'hidden' } catch { return false }
  })
  useEffect(() => { getPushState().then(setState).catch(() => setState(null)) }, [])
  if (hidden || state === null || state === 'on' || state === 'unsupported') return null
  const hide = () => {
    setHidden(true)
    try { localStorage.setItem('portal-push-nudge', 'hidden') } catch { /* storage blocked */ }
  }
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-sky-200/70 bg-gradient-to-r from-sky-50 via-white to-violet-50 px-4 py-3 text-sm text-gray-800 shadow-sm">
      <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-sky-400 to-violet-500 text-white shadow-sm" aria-hidden>
        <Bell size={17} className="motion-safe:animate-wiggle" />
      </span>
      <span className="flex-1 min-w-[14rem]">
        <strong>¿Quieres que te avisemos en tu celular?</strong> Te llega una notificación cuando tu pedido cambia o te envían la cotización o factura.
      </span>
      <Link to="/notifications" className="px-4 py-2 rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 text-white font-semibold shadow-sm hover:brightness-110">Ver cómo activarlas</Link>
      <button onClick={hide} className="text-gray-600 hover:text-gray-900 hover:underline">Ahora no</button>
    </div>
  )
}
