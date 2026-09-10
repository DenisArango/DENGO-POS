import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Calendar, Activity, Shield, Package, DollarSign, Settings, Eye, Search, User, UserCheck, AlertTriangle, Clock } from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts'
import { format, subDays } from 'date-fns'
import { es } from 'date-fns/locale'
import { api } from '../../lib/api'
import AIRecommendations from '../../components/reports/AIRecommendations'

const ENTITY_ICON: Record<string, React.ReactNode> = {
  Sale: <DollarSign size={15} />,
  Product: <Package size={15} />,
  Inventory: <Package size={15} />,
  User: <User size={15} />,
  Report: <Eye size={15} />,
  Settings: <Settings size={15} />,
}

const ENTITY_COLOR: Record<string, string> = {
  Sale: 'text-green-600 bg-green-100',
  Product: 'text-blue-600 bg-blue-100',
  Inventory: 'text-purple-600 bg-purple-100',
  User: 'text-yellow-600 bg-yellow-100',
  Settings: 'text-red-600 bg-red-100',
}

const PIE_COLORS = ['#10B981', '#3B82F6', '#8B5CF6', '#F59E0B', '#EF4444', '#6B7280']

export default function UserActivityReport() {
  const navigate = useNavigate()
  const [from, setFrom] = useState(format(subDays(new Date(), 6), 'yyyy-MM-dd'))
  const [to, setTo] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [loading, setLoading] = useState(false)
  const [logs, setLogs] = useState<any[]>([])
  const [loginHistory, setLoginHistory] = useState<any[]>([])
  const [search, setSearch] = useState('')
  const [filterAction, setFilterAction] = useState('')

  useEffect(() => { fetchData() }, [from, to])

  async function fetchData() {
    setLoading(true)
    try {
      const [auditLogs, logins] = await Promise.all([
        api.get<any[]>(`/api/audit/logs?from=${from}T00:00:00&to=${to}T23:59:59`),
        api.get<any[]>(`/api/audit/login-history?from=${from}T00:00:00&to=${to}T23:59:59`),
      ])
      setLogs(auditLogs ?? [])
      setLoginHistory(logins ?? [])
    } catch { setLogs([]); setLoginHistory([]) } finally { setLoading(false) }
  }

  const failedLogins = loginHistory.filter(l => !l.success)

  const uniqueActions = useMemo(() => [...new Set(logs.map(l => l.action))].sort(), [logs])

  const filtered = logs.filter(l => {
    const matchSearch = !search || (l.user?.name ?? l.userId ?? '').toLowerCase().includes(search.toLowerCase()) ||
      l.action.toLowerCase().includes(search.toLowerCase()) || l.entity.toLowerCase().includes(search.toLowerCase())
    const matchAction = !filterAction || l.action === filterAction
    return matchSearch && matchAction
  })

  // By-entity distribution for pie chart
  const entityCounts = useMemo(() => {
    const map: Record<string, number> = {}
    for (const l of logs) { map[l.entity] = (map[l.entity] ?? 0) + 1 }
    return Object.entries(map).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value)
  }, [logs])

  // Hourly distribution
  const hourlyData = useMemo(() => {
    const map: Record<number, number> = {}
    for (const l of logs) {
      const h = new Date(l.createdAt).getHours()
      map[h] = (map[h] ?? 0) + 1
    }
    return Array.from({ length: 24 }, (_, h) => ({ hour: `${String(h).padStart(2, '0')}:00`, acciones: map[h] ?? 0 }))
      .filter(d => d.acciones > 0 || (d.hour >= '07:00' && d.hour <= '21:00'))
  }, [logs])

  // Per-user summary
  const userSummary = useMemo(() => {
    const map: Record<string, { name: string; count: number; actions: Set<string>; lastAt: string }> = {}
    for (const l of logs) {
      const uid = l.userId ?? 'unknown'
      if (!map[uid]) map[uid] = { name: l.user?.name ?? uid, count: 0, actions: new Set(), lastAt: l.createdAt }
      map[uid]!.count++
      map[uid]!.actions.add(l.action)
      if (l.createdAt > map[uid]!.lastAt) map[uid]!.lastAt = l.createdAt
    }
    return Object.values(map).sort((a, b) => b.count - a.count)
  }, [logs])

  const peakHour = hourlyData.reduce((best, d) => d.acciones > best.acciones ? d : best, { hour: '–', acciones: 0 })

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <button onClick={() => navigate('/reports')} className="p-2 hover:bg-gray-100 rounded-lg transition-colors"><ArrowLeft size={20} /></button>
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Actividad de Usuarios</h1>
          <p className="text-gray-600 text-sm mt-0.5">Auditoría de acciones en el sistema</p>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-sm p-4 flex flex-wrap items-center gap-3">
        <Calendar size={16} className="text-gray-400" />
        <input type="date" value={from} onChange={e => setFrom(e.target.value)} className="input" />
        <span className="text-gray-400">–</span>
        <input type="date" value={to} onChange={e => setTo(e.target.value)} className="input" />
        {loading && <span className="text-sm text-gray-400">Cargando...</span>}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Acciones totales', value: String(logs.length), icon: Activity, color: 'text-blue-600 bg-blue-100' },
          { label: 'Usuarios activos', value: String(userSummary.length), icon: UserCheck, color: 'text-green-600 bg-green-100' },
          { label: 'Hora pico', value: peakHour.hour, icon: Clock, color: 'text-orange-600 bg-orange-100' },
          { label: 'Logins fallidos', value: String(failedLogins.length), icon: AlertTriangle, color: failedLogins.length > 0 ? 'text-red-600 bg-red-100' : 'text-gray-600 bg-gray-100' },
        ].map(s => (
          <div key={s.label} className="bg-white rounded-xl shadow-sm p-4 flex items-center gap-3">
            <div className={`p-2.5 rounded-lg ${s.color}`}><s.icon size={20} /></div>
            <div><p className="text-xs text-gray-400">{s.label}</p><p className="text-xl font-bold text-gray-800">{s.value}</p></div>
          </div>
        ))}
      </div>

      {(hourlyData.length > 0 || entityCounts.length > 0) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {hourlyData.length > 0 && (
            <div className="bg-white rounded-xl shadow-sm p-5">
              <h2 className="text-sm font-semibold text-gray-700 mb-4 flex items-center gap-2"><Clock size={16} />Actividad por hora</h2>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={hourlyData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="hour" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Bar dataKey="acciones" fill="#3B82F6" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {entityCounts.length > 0 && (
            <div className="bg-white rounded-xl shadow-sm p-5">
              <h2 className="text-sm font-semibold text-gray-700 mb-4 flex items-center gap-2"><Activity size={16} />Acciones por entidad</h2>
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie data={entityCounts} cx="50%" cy="50%" outerRadius={80} dataKey="value"
                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={false}>
                    {entityCounts.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      )}

      {userSummary.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
          <div className="px-5 py-3 border-b"><h2 className="text-sm font-semibold text-gray-700 flex items-center gap-2"><UserCheck size={16} />Resumen por usuario</h2></div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="text-left px-4 py-2 text-xs text-gray-500 font-medium">Usuario</th>
                  <th className="text-right px-4 py-2 text-xs text-gray-500 font-medium">Acciones</th>
                  <th className="text-left px-4 py-2 text-xs text-gray-500 font-medium">Tipos de acción</th>
                  <th className="text-left px-4 py-2 text-xs text-gray-500 font-medium">Última actividad</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {userSummary.map((u, i) => (
                  <tr key={i} className="hover:bg-gray-50">
                    <td className="px-4 py-2.5 font-medium text-gray-800">{u.name}</td>
                    <td className="px-4 py-2.5 text-right font-semibold text-blue-600">{u.count}</td>
                    <td className="px-4 py-2.5 text-xs text-gray-500">{[...u.actions].join(', ')}</td>
                    <td className="px-4 py-2.5 text-xs text-gray-400">{format(new Date(u.lastAt), "dd/MM/yyyy HH:mm", { locale: es })}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        <div className="px-5 py-3 border-b flex items-center gap-3">
          <h2 className="text-sm font-semibold text-gray-700 flex items-center gap-2"><Activity size={16} />Registro de auditoría</h2>
          <div className="flex-1 relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar usuario, acción..." className="input pl-8 w-full text-sm py-1.5" />
          </div>
          <select value={filterAction} onChange={e => setFilterAction(e.target.value)} className="input text-sm py-1.5">
            <option value="">Todas las acciones</option>
            {uniqueActions.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left px-4 py-3 text-xs text-gray-500 font-medium">Fecha y hora</th>
                <th className="text-left px-4 py-3 text-xs text-gray-500 font-medium">Usuario</th>
                <th className="text-left px-4 py-3 text-xs text-gray-500 font-medium">Acción</th>
                <th className="text-left px-4 py-3 text-xs text-gray-500 font-medium">Entidad</th>
                <th className="text-left px-4 py-3 text-xs text-gray-500 font-medium">IP</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.length === 0
                ? <tr><td colSpan={5} className="text-center py-12 text-gray-400">{logs.length === 0 ? 'Sin registros de auditoría en el período' : 'Sin resultados para la búsqueda'}</td></tr>
                : filtered.map(l => (
                    <tr key={l.id} className="hover:bg-gray-50">
                      <td className="px-4 py-2.5 text-xs text-gray-500 whitespace-nowrap">{format(new Date(l.createdAt), "dd/MM/yyyy HH:mm:ss", { locale: es })}</td>
                      <td className="px-4 py-2.5 font-medium text-gray-800">{l.user?.name ?? l.userId ?? '–'}</td>
                      <td className="px-4 py-2.5">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700">{l.action}</span>
                      </td>
                      <td className="px-4 py-2.5">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${ENTITY_COLOR[l.entity] ?? 'bg-gray-100 text-gray-600'}`}>
                          {ENTITY_ICON[l.entity] ?? null}{l.entity}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-xs text-gray-400 font-mono">{l.ipAddress ?? '–'}</td>
                    </tr>
                  ))
              }
            </tbody>
          </table>
        </div>
      </div>

      {failedLogins.length > 0 && (
        <div className="bg-red-50 rounded-xl p-5">
          <h2 className="text-sm font-semibold text-red-800 mb-3 flex items-center gap-2"><Shield size={16} />Intentos de login fallidos ({failedLogins.length})</h2>
          <div className="space-y-2">
            {failedLogins.slice(0, 10).map(l => (
              <div key={l.id} className="bg-white rounded-lg border border-red-200 px-4 py-2.5 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-800">{l.email}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{l.failReason ?? 'Credenciales incorrectas'} · IP: {l.ipAddress ?? '–'}</p>
                </div>
                <p className="text-xs text-gray-400">{format(new Date(l.createdAt), "dd/MM HH:mm", { locale: es })}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      <AIRecommendations
        reportData={{ type: 'user_activity', data: { totalActions: logs.length, activeUsers: userSummary.length, failedLogins: failedLogins.length, users: userSummary } }}
      />
    </div>
  )
}
