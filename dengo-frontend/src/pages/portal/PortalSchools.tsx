import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { toast } from 'sonner'
import { Plus, School as SchoolIcon, Edit2, X, CheckCircle, XCircle, MapPin } from 'lucide-react'
import { api } from '../../lib/api'

interface School {
  id: string
  name: string
  code?: string
  address?: string
  municipio?: string
  departamento?: string
  opfContact?: string
  opfPhone?: string
  isActive: boolean
}

const EMPTY = { name: '', code: '', address: '', municipio: '', departamento: '', opfContact: '', opfPhone: '', isActive: true }

export default function PortalSchools() {
  const [schools, setSchools] = useState<School[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState<School | null>(null)
  const [form, setForm] = useState(EMPTY)
  const [busy, setBusy] = useState(false)

  const fetchSchools = () => {
    setLoading(true)
    api.get<School[]>('/api/portal-admin/schools')
      .then(setSchools)
      .catch(e => toast.error(e.message))
      .finally(() => setLoading(false))
  }

  useEffect(fetchSchools, [])

  const openCreate = () => { setEditing(null); setForm(EMPTY); setShowModal(true) }
  const openEdit = (s: School) => {
    setEditing(s)
    setForm({
      name: s.name, code: s.code ?? '', address: s.address ?? '', municipio: s.municipio ?? '',
      departamento: s.departamento ?? '', opfContact: s.opfContact ?? '', opfPhone: s.opfPhone ?? '', isActive: s.isActive,
    })
    setShowModal(true)
  }

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.name) return toast.error('El nombre es requerido')
    setBusy(true)
    const req = editing
      ? api.put(`/api/portal-admin/schools/${editing.id}`, form)
      : api.post('/api/portal-admin/schools', form)
    req
      .then(() => { toast.success(editing ? 'Escuela actualizada' : 'Escuela creada'); setShowModal(false); fetchSchools() })
      .catch(e => toast.error(e.message))
      .finally(() => setBusy(false))
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-800">Escuelas</h1>
          <p className="text-gray-600 mt-1">Establecimientos educativos atendidos</p>
        </div>
        <button onClick={openCreate} className="btn-primary btn-md flex items-center gap-2"><Plus size={20} /> Nueva Escuela</button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-64"><div className="w-8 h-8 border-4 border-primary-600 border-t-transparent rounded-full animate-spin" /></div>
      ) : schools.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-12 text-center">
          <SchoolIcon size={48} className="mx-auto text-gray-400 mb-4" />
          <p className="text-gray-600">No hay escuelas registradas.</p>
          <button onClick={openCreate} className="btn-primary btn-md mt-4">Agregar primera escuela</button>
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>{['Escuela', 'Código', 'Municipio', 'Contacto OPF', 'Estado', 'Acciones'].map(h => (
                <th key={h} className="text-left px-4 py-3 font-semibold text-gray-600">{h}</th>
              ))}</tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {schools.map(s => (
                <tr key={s.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-lg bg-primary-100 text-primary-600 flex items-center justify-center"><SchoolIcon size={18} /></div>
                      <div>
                        <p className="font-semibold text-gray-800">{s.name}</p>
                        {s.address && <p className="text-xs text-gray-400 flex items-center gap-1"><MapPin size={11} /> {s.address}</p>}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-gray-600">{s.code || '—'}</td>
                  <td className="px-4 py-3 text-gray-600">{[s.municipio, s.departamento].filter(Boolean).join(', ') || '—'}</td>
                  <td className="px-4 py-3 text-gray-600">
                    {s.opfContact ? <>{s.opfContact}{s.opfPhone && <span className="text-xs text-gray-400 block">{s.opfPhone}</span>}</> : '—'}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${s.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
                      {s.isActive ? <CheckCircle size={11} /> : <XCircle size={11} />}{s.isActive ? 'Activa' : 'Inactiva'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <button onClick={() => openEdit(s)} className="p-2 text-gray-600 hover:bg-gray-50 rounded-lg" title="Editar"><Edit2 size={16} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b flex items-center justify-between">
              <h2 className="text-xl font-bold text-gray-800">{editing ? 'Editar Escuela' : 'Nueva Escuela'}</h2>
              <button onClick={() => setShowModal(false)} className="p-1 hover:bg-gray-100 rounded"><X size={18} /></button>
            </div>
            <form onSubmit={submit} className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2"><label className="label">Nombre *</label><input className="input w-full" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required /></div>
                <div><label className="label">Código</label><input className="input w-full" value={form.code} onChange={e => setForm({ ...form, code: e.target.value })} /></div>
                <div><label className="label">Municipio</label><input className="input w-full" value={form.municipio} onChange={e => setForm({ ...form, municipio: e.target.value })} /></div>
                <div className="col-span-2"><label className="label">Dirección</label><input className="input w-full" value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} /></div>
                <div><label className="label">Departamento</label><input className="input w-full" value={form.departamento} onChange={e => setForm({ ...form, departamento: e.target.value })} /></div>
                <div></div>
                <div><label className="label">Contacto OPF</label><input className="input w-full" value={form.opfContact} onChange={e => setForm({ ...form, opfContact: e.target.value })} /></div>
                <div><label className="label">Teléfono OPF</label><input className="input w-full" value={form.opfPhone} onChange={e => setForm({ ...form, opfPhone: e.target.value })} /></div>
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={form.isActive} onChange={e => setForm({ ...form, isActive: e.target.checked })} className="w-4 h-4 text-primary-600 rounded" />
                <span className="text-sm text-gray-700">Escuela activa</span>
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
