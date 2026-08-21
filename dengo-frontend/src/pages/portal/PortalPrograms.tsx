import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { toast } from 'sonner'
import { Plus, Edit2, X, CheckCircle, XCircle, BookOpen } from 'lucide-react'
import { api } from '../../lib/api'

interface Program {
  id: string
  type: string
  name: string
  description?: string
  maxAmountPerTeacher?: number | null
  limitPerStudent?: number | null
  allowedCategoryIds?: string[]
  isActive: boolean
}
interface Category { id: string; name: string }

const PROGRAM_TYPES = [
  { value: 'TEACHING_KIT', label: 'Valija Didáctica', icon: '🎒' },
  { value: 'SCHOOL_SUPPLIES', label: 'Útiles Escolares', icon: '✏️' },
  { value: 'FOOD_PACKAGE', label: 'Alimentación Escolar', icon: '🍽️' },
  { value: 'GRATUITY', label: 'Gratuidades', icon: '📚' },
]
const typeMeta = (t: string) => PROGRAM_TYPES.find(p => p.value === t) ?? { value: t, label: t, icon: '📦' }
const money = (v: number) => `Q${Number(v).toLocaleString('es-GT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

const EMPTY = { type: 'TEACHING_KIT', name: '', description: '', maxAmountPerTeacher: '', limitPerStudent: '', allowedCategoryIds: [] as string[], isActive: true }

export default function PortalPrograms() {
  const [programs, setPrograms] = useState<Program[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState<Program | null>(null)
  const [form, setForm] = useState(EMPTY)
  const [busy, setBusy] = useState(false)

  const fetchPrograms = () => {
    setLoading(true)
    api.get<Program[]>('/api/portal-admin/programs')
      .then(setPrograms)
      .catch(e => toast.error(e.message))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    fetchPrograms()
    api.get<Category[]>('/api/categories').then(setCategories).catch(() => {})
  }, [])

  const openCreate = () => { setEditing(null); setForm(EMPTY); setShowModal(true) }
  const openEdit = (p: Program) => {
    setEditing(p)
    setForm({
      type: p.type,
      name: p.name,
      description: p.description ?? '',
      maxAmountPerTeacher: p.maxAmountPerTeacher != null ? String(p.maxAmountPerTeacher) : '',
      limitPerStudent: p.limitPerStudent != null ? String(p.limitPerStudent) : '',
      allowedCategoryIds: p.allowedCategoryIds ?? [],
      isActive: p.isActive,
    })
    setShowModal(true)
  }

  const toggleCategory = (id: string) => {
    setForm(f => ({
      ...f,
      allowedCategoryIds: f.allowedCategoryIds.includes(id)
        ? f.allowedCategoryIds.filter(c => c !== id)
        : [...f.allowedCategoryIds, id],
    }))
  }

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.name) return toast.error('El nombre es requerido')
    setBusy(true)
    const payload = {
      type: form.type,
      name: form.name,
      description: form.description || undefined,
      maxAmountPerTeacher: form.maxAmountPerTeacher ? Number(form.maxAmountPerTeacher) : null,
      limitPerStudent: form.limitPerStudent ? Number(form.limitPerStudent) : null,
      allowedCategoryIds: form.allowedCategoryIds,
      isActive: form.isActive,
    }
    const req = editing
      ? api.put(`/api/portal-admin/programs/${editing.id}`, payload)
      : api.post('/api/portal-admin/programs', payload)
    req
      .then(() => { toast.success(editing ? 'Programa actualizado' : 'Programa creado'); setShowModal(false); fetchPrograms() })
      .catch(e => toast.error(e.message))
      .finally(() => setBusy(false))
  }

  const catName = (id: string) => categories.find(c => c.id === id)?.name ?? id

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-800">Programas Educativos</h1>
          <p className="text-gray-600 mt-1">Configura los programas disponibles para los maestros</p>
        </div>
        <button onClick={openCreate} className="btn-primary btn-md flex items-center gap-2"><Plus size={20} /> Nuevo Programa</button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-64"><div className="w-8 h-8 border-4 border-primary-600 border-t-transparent rounded-full animate-spin" /></div>
      ) : programs.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-12 text-center">
          <BookOpen size={48} className="mx-auto text-gray-400 mb-4" />
          <p className="text-gray-600">No hay programas configurados.</p>
          <button onClick={openCreate} className="btn-primary btn-md mt-4">Crear primer programa</button>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {programs.map(p => {
            const meta = typeMeta(p.type)
            return (
              <motion.div key={p.id} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 flex flex-col">
                <div className="flex items-start justify-between">
                  <div className="text-4xl">{meta.icon}</div>
                  <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${p.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
                    {p.isActive ? <CheckCircle size={11} /> : <XCircle size={11} />}{p.isActive ? 'Activo' : 'Inactivo'}
                  </span>
                </div>
                <h3 className="mt-3 font-bold text-gray-800 text-lg">{p.name}</h3>
                <p className="text-xs text-gray-400">{meta.label}</p>
                {p.description && <p className="mt-2 text-sm text-gray-600">{p.description}</p>}

                <div className="mt-4 space-y-1.5 text-sm">
                  <p className="text-gray-600">Límite total: <span className="font-semibold text-gray-800">{p.maxAmountPerTeacher != null ? money(p.maxAmountPerTeacher) : 'Sin límite'}</span></p>
                  {p.limitPerStudent != null && (
                    <p className="text-gray-600">Límite por alumno: <span className="font-semibold text-emerald-700">{money(p.limitPerStudent)}</span></p>
                  )}
                  <p className="text-gray-600">
                    Categorías:{' '}
                    <span className="font-medium text-gray-800">
                      {p.allowedCategoryIds && p.allowedCategoryIds.length > 0
                        ? p.allowedCategoryIds.map(catName).join(', ')
                        : 'Todas las categorías'}
                    </span>
                  </p>
                </div>

                <button onClick={() => openEdit(p)} className="mt-auto pt-4 text-primary-600 hover:text-primary-700 text-sm font-semibold flex items-center gap-1.5"><Edit2 size={15} /> Editar</button>
              </motion.div>
            )
          })}
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b flex items-center justify-between">
              <h2 className="text-xl font-bold text-gray-800">{editing ? 'Editar Programa' : 'Nuevo Programa'}</h2>
              <button onClick={() => setShowModal(false)} className="p-1 hover:bg-gray-100 rounded"><X size={18} /></button>
            </div>
            <form onSubmit={submit} className="p-6 space-y-4">
              <div><label className="label">Tipo de programa</label>
                <select className="input w-full" value={form.type} onChange={e => setForm({ ...form, type: e.target.value })}>
                  {PROGRAM_TYPES.map(t => <option key={t.value} value={t.value}>{t.icon} {t.label}</option>)}
                </select>
              </div>
              <div><label className="label">Nombre *</label><input className="input w-full" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required /></div>
              <div><label className="label">Descripción</label><textarea rows={2} className="input w-full resize-none" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} /></div>
              <div><label className="label">Monto máximo por maestro (Q)</label><input type="number" min={0} step="0.01" className="input w-full" value={form.maxAmountPerTeacher} onChange={e => setForm({ ...form, maxAmountPerTeacher: e.target.value })} placeholder="Vacío = sin límite" /></div>
              <div>
                <label className="label">Límite por alumno (Q)</label>
                <input type="number" min={0} step="0.01" className="input w-full" value={form.limitPerStudent} onChange={e => setForm({ ...form, limitPerStudent: e.target.value })} placeholder="Vacío = sin límite" />
                <p className="text-xs text-gray-400 mt-1">El máximo del pedido = límite × número de alumnos ingresados</p>
              </div>
              <div>
                <label className="label">Categorías permitidas</label>
                <p className="text-xs text-gray-400 mb-2">Si no seleccionas ninguna, se permitirán todas.</p>
                <div className="max-h-40 overflow-y-auto border border-gray-200 rounded-lg p-2 space-y-1">
                  {categories.length === 0 ? (
                    <p className="text-sm text-gray-400 p-2">No hay categorías.</p>
                  ) : categories.map(c => (
                    <label key={c.id} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-gray-50 cursor-pointer">
                      <input type="checkbox" checked={form.allowedCategoryIds.includes(c.id)} onChange={() => toggleCategory(c.id)} className="w-4 h-4 text-primary-600 rounded" />
                      <span className="text-sm text-gray-700">{c.name}</span>
                    </label>
                  ))}
                </div>
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={form.isActive} onChange={e => setForm({ ...form, isActive: e.target.checked })} className="w-4 h-4 text-primary-600 rounded" />
                <span className="text-sm text-gray-700">Programa activo</span>
              </label>
              <div className="flex gap-3 justify-end pt-2 border-t">
                <button type="button" onClick={() => setShowModal(false)} className="btn-secondary btn-md">Cancelar</button>
                <button type="submit" disabled={busy} className="btn-primary btn-md">{editing ? 'Guardar' : 'Crear'}</button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </div>
  )
}
