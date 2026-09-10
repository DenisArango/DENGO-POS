import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { toast } from 'sonner'
import {
  Plus, GraduationCap, Mail, Edit2, X, School as SchoolIcon, Trash2,
  CheckCircle, XCircle, Phone,
} from 'lucide-react'
import { api } from '../../lib/api'

interface School { id: string; name: string }
interface Assignment { id: string; grade?: string; section?: string; school: { id: string; name: string } }
interface Teacher {
  id: string
  phone?: string
  isActive: boolean
  user: { id: string; name: string; email: string; isActive: boolean; branchId: string }
  schools: Assignment[]
}
interface Branch { id: string; name: string }

export default function PortalTeachers() {
  const [teachers, setTeachers] = useState<Teacher[]>([])
  const [loading, setLoading] = useState(true)
  const [branches, setBranches] = useState<Branch[]>([])
  const [schools, setSchools] = useState<School[]>([])

  const [showCreate, setShowCreate] = useState(false)
  const [editing, setEditing] = useState<Teacher | null>(null)
  const [detail, setDetail] = useState<Teacher | null>(null)
  const [busy, setBusy] = useState(false)

  const [form, setForm] = useState({ name: '', email: '', password: '', phone: '', branchId: '' })
  const [editForm, setEditForm] = useState({ name: '', email: '', phone: '', isActive: true })
  const [assignForm, setAssignForm] = useState({ schoolId: '', grade: '', section: '' })

  const fetchTeachers = () => {
    setLoading(true)
    api.get<Teacher[]>('/api/portal-admin/teachers')
      .then(setTeachers)
      .catch(e => toast.error(e.message))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    fetchTeachers()
    api.get<Branch[]>('/api/branches').then(setBranches).catch(() => {})
    api.get<School[]>('/api/portal-admin/schools').then(setSchools).catch(() => {})
  }, [])

  const openCreate = () => {
    setForm({ name: '', email: '', password: '', phone: '', branchId: branches[0]?.id ?? '' })
    setShowCreate(true)
  }

  const submitCreate = (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.name || !form.email || !form.password || !form.branchId) return toast.error('Completa los campos requeridos')
    setBusy(true)
    api.post('/api/portal-admin/teachers', form)
      .then(() => { toast.success('Maestro creado'); setShowCreate(false); fetchTeachers() })
      .catch(e => toast.error(e.message))
      .finally(() => setBusy(false))
  }

  const openEdit = (t: Teacher) => {
    setEditing(t)
    setEditForm({ name: t.user.name, email: t.user.email, phone: t.phone ?? '', isActive: t.isActive })
  }

  const submitEdit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!editing) return
    setBusy(true)
    api.put(`/api/portal-admin/teachers/${editing.id}`, editForm)
      .then(() => { toast.success('Maestro actualizado'); setEditing(null); fetchTeachers() })
      .catch(e => toast.error(e.message))
      .finally(() => setBusy(false))
  }

  const addAssignment = () => {
    if (!detail) return
    if (!assignForm.schoolId) return toast.error('Selecciona una escuela')
    setBusy(true)
    api.post(`/api/portal-admin/teachers/${detail.id}/schools`, {
      schoolId: assignForm.schoolId,
      grade: assignForm.grade || undefined,
      section: assignForm.section || undefined,
    })
      .then(() => {
        toast.success('Escuela asignada')
        setAssignForm({ schoolId: '', grade: '', section: '' })
        return api.get<Teacher[]>('/api/portal-admin/teachers')
      })
      .then(list => {
        setTeachers(list)
        setDetail(list.find(t => t.id === detail.id) ?? null)
      })
      .catch(e => toast.error(e.message))
      .finally(() => setBusy(false))
  }

  const removeAssignment = (a: Assignment) => {
    if (!detail) return
    const qs = a.grade ? `?grade=${encodeURIComponent(a.grade)}` : ''
    api.delete(`/api/portal-admin/teachers/${detail.id}/schools/${a.school.id}${qs}`)
      .then(() => {
        toast.success('Asignación eliminada')
        return api.get<Teacher[]>('/api/portal-admin/teachers')
      })
      .then(list => {
        setTeachers(list)
        setDetail(list.find(t => t.id === detail.id) ?? null)
      })
      .catch(e => toast.error(e.message))
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-800">Maestros</h1>
          <p className="text-gray-600 mt-1">Gestiona las cuentas de acceso al portal</p>
        </div>
        <button onClick={openCreate} className="btn-primary btn-md flex items-center gap-2"><Plus size={20} /> Nuevo Maestro</button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-64"><div className="w-8 h-8 border-4 border-primary-600 border-t-transparent rounded-full animate-spin" /></div>
      ) : teachers.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-12 text-center">
          <GraduationCap size={48} className="mx-auto text-gray-400 mb-4" />
          <p className="text-gray-600">No hay maestros registrados.</p>
          <button onClick={openCreate} className="btn-primary btn-md mt-4">Agregar primer maestro</button>
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>{['Maestro', 'Contacto', 'Escuelas / Grados', 'Estado', 'Acciones'].map(h => (
                <th key={h} className="text-left px-4 py-3 font-semibold text-gray-600">{h}</th>
              ))}</tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {teachers.map(t => (
                <tr key={t.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-primary-100 text-primary-600 font-semibold flex items-center justify-center">{t.user.name.charAt(0).toUpperCase()}</div>
                      <span className="font-semibold text-gray-800">{t.user.name}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="text-xs text-gray-600 flex items-center gap-1"><Mail size={12} /> {t.user.email}</div>
                    {t.phone && <div className="text-xs text-gray-500 flex items-center gap-1 mt-0.5"><Phone size={12} /> {t.phone}</div>}
                  </td>
                  <td className="px-4 py-3">
                    <button onClick={() => setDetail(t)} className="text-primary-600 hover:underline text-xs font-medium">
                      {t.schools.length} {t.schools.length === 1 ? 'escuela' : 'escuelas'} →
                    </button>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${t.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
                      {t.isActive ? <CheckCircle size={11} /> : <XCircle size={11} />}{t.isActive ? 'Activo' : 'Inactivo'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1">
                      <button onClick={() => setDetail(t)} className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg" title="Escuelas"><SchoolIcon size={16} /></button>
                      <button onClick={() => openEdit(t)} className="p-2 text-gray-600 hover:bg-gray-50 rounded-lg" title="Editar"><Edit2 size={16} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Create modal */}
      {showCreate && (
        <Modal title="Nuevo Maestro" onClose={() => setShowCreate(false)}>
          <form onSubmit={submitCreate} className="p-6 space-y-4">
            <div><label className="label">Nombre completo *</label><input className="input w-full" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required /></div>
            <div><label className="label">Correo electrónico *</label><input type="email" className="input w-full" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} required /></div>
            <div><label className="label">Contraseña temporal *</label><input type="text" className="input w-full" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} required minLength={6} placeholder="Mínimo 6 caracteres" /></div>
            <div><label className="label">Teléfono</label><input className="input w-full" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} /></div>
            <div><label className="label">Sucursal *</label>
              <select className="input w-full" value={form.branchId} onChange={e => setForm({ ...form, branchId: e.target.value })} required>
                <option value="">Selecciona…</option>
                {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </div>
            <div className="flex gap-3 justify-end pt-2 border-t">
              <button type="button" onClick={() => setShowCreate(false)} className="btn-secondary btn-md">Cancelar</button>
              <button type="submit" disabled={busy} className="btn-primary btn-md">Crear Maestro</button>
            </div>
          </form>
        </Modal>
      )}

      {/* Edit modal */}
      {editing && (
        <Modal title="Editar Maestro" onClose={() => setEditing(null)}>
          <form onSubmit={submitEdit} className="p-6 space-y-4">
            <div><label className="label">Nombre completo</label><input className="input w-full" value={editForm.name} onChange={e => setEditForm({ ...editForm, name: e.target.value })} /></div>
            <div><label className="label">Correo electrónico</label><input type="email" className="input w-full" value={editForm.email} onChange={e => setEditForm({ ...editForm, email: e.target.value })} /></div>
            <div><label className="label">Teléfono</label><input className="input w-full" value={editForm.phone} onChange={e => setEditForm({ ...editForm, phone: e.target.value })} /></div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={editForm.isActive} onChange={e => setEditForm({ ...editForm, isActive: e.target.checked })} className="w-4 h-4 text-primary-600 rounded" />
              <span className="text-sm text-gray-700">Maestro activo</span>
            </label>
            <div className="flex gap-3 justify-end pt-2 border-t">
              <button type="button" onClick={() => setEditing(null)} className="btn-secondary btn-md">Cancelar</button>
              <button type="submit" disabled={busy} className="btn-primary btn-md">Guardar</button>
            </div>
          </form>
        </Modal>
      )}

      {/* Detail drawer (school assignments) */}
      {detail && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-black/40" onClick={() => setDetail(null)} />
          <motion.div initial={{ x: '100%' }} animate={{ x: 0 }} transition={{ type: 'spring', damping: 30, stiffness: 300 }} className="relative w-full max-w-md bg-white h-full overflow-y-auto shadow-2xl">
            <div className="sticky top-0 bg-white border-b px-6 py-4 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-gray-800">{detail.user.name}</h2>
                <p className="text-xs text-gray-500">{detail.user.email}</p>
              </div>
              <button onClick={() => setDetail(null)} className="p-2 hover:bg-gray-100 rounded-lg"><X size={20} /></button>
            </div>
            <div className="p-6 space-y-5">
              <p className="text-sm font-semibold text-gray-700">Escuelas asignadas</p>
              {detail.schools.length === 0 ? (
                <p className="text-sm text-gray-400">Sin escuelas asignadas.</p>
              ) : (
                <div className="space-y-2">
                  {detail.schools.map(a => (
                    <div key={a.id} className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2.5">
                      <div>
                        <p className="font-medium text-gray-800 text-sm">{a.school.name}</p>
                        <p className="text-xs text-gray-500">{[a.grade, a.section && `Sección ${a.section}`].filter(Boolean).join(' · ') || 'Sin grado'}</p>
                      </div>
                      <button onClick={() => removeAssignment(a)} className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg" title="Quitar"><Trash2 size={15} /></button>
                    </div>
                  ))}
                </div>
              )}

              <div className="border-t pt-4 space-y-3">
                <p className="text-sm font-semibold text-gray-700">Asignar escuela</p>
                <select className="input w-full" value={assignForm.schoolId} onChange={e => setAssignForm({ ...assignForm, schoolId: e.target.value })}>
                  <option value="">Selecciona escuela…</option>
                  {schools.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
                <div className="grid grid-cols-2 gap-3">
                  <input className="input w-full" placeholder="Grado" value={assignForm.grade} onChange={e => setAssignForm({ ...assignForm, grade: e.target.value })} />
                  <input className="input w-full" placeholder="Sección" value={assignForm.section} onChange={e => setAssignForm({ ...assignForm, section: e.target.value })} />
                </div>
                <button onClick={addAssignment} disabled={busy} className="btn-primary btn-md w-full flex items-center justify-center gap-1.5"><Plus size={16} /> Asignar</button>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  )
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="bg-white rounded-xl shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b flex items-center justify-between">
          <h2 className="text-xl font-bold text-gray-800">{title}</h2>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded"><X size={18} /></button>
        </div>
        {children}
      </motion.div>
    </div>
  )
}
