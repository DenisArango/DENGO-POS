import { useState, useEffect } from 'react'
import { ArrowLeft, PackagePlus, TrendingUp, TrendingDown, Plus, Trash2, Pencil, X, Check } from 'lucide-react'
import { toast } from 'sonner'
import { useNavigate } from 'react-router-dom'
import { api } from '../../lib/api'

interface Reason {
  id: string
  label: string
  direction: 'UP' | 'DOWN'
  isActive: boolean
  sortOrder: number
}

function ReasonColumn({
  title, icon: Icon, colorClass, direction, reasons, onAdd, onEdit, onDelete,
}: {
  title: string
  icon: typeof TrendingUp
  colorClass: string
  direction: 'UP' | 'DOWN'
  reasons: Reason[]
  onAdd: (direction: 'UP' | 'DOWN', label: string) => Promise<void>
  onEdit: (id: string, label: string) => Promise<void>
  onDelete: (id: string) => Promise<void>
}) {
  const [newLabel, setNewLabel] = useState('')
  const [adding, setAdding] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editLabel, setEditLabel] = useState('')

  const submitAdd = async () => {
    if (!newLabel.trim()) return
    setAdding(true)
    await onAdd(direction, newLabel.trim())
    setNewLabel('')
    setAdding(false)
  }

  const startEdit = (r: Reason) => { setEditingId(r.id); setEditLabel(r.label) }
  const submitEdit = async (id: string) => {
    if (!editLabel.trim()) return
    await onEdit(id, editLabel.trim())
    setEditingId(null)
  }

  return (
    <div className="bg-white rounded-lg shadow-sm p-6">
      <div className="flex items-center gap-2 mb-4">
        <div className={`p-2 rounded-lg ${colorClass}`}>
          <Icon size={18} />
        </div>
        <h3 className="font-semibold text-gray-800">{title}</h3>
      </div>

      <div className="space-y-2 mb-4">
        {reasons.length === 0 && <p className="text-sm text-gray-400">Sin motivos configurados todavía.</p>}
        {reasons.map(r => (
          <div key={r.id} className="flex items-center gap-2 bg-gray-50 rounded-lg px-3 py-2">
            {editingId === r.id ? (
              <>
                <input value={editLabel} onChange={e => setEditLabel(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && submitEdit(r.id)}
                  className="input flex-1 text-sm py-1" autoFocus />
                <button onClick={() => submitEdit(r.id)} className="p-1 text-green-600 hover:bg-green-100 rounded"><Check size={16} /></button>
                <button onClick={() => setEditingId(null)} className="p-1 text-gray-400 hover:bg-gray-200 rounded"><X size={16} /></button>
              </>
            ) : (
              <>
                <span className="flex-1 text-sm text-gray-700">{r.label}</span>
                <button onClick={() => startEdit(r)} className="p-1 text-gray-400 hover:text-primary-600 hover:bg-primary-50 rounded"><Pencil size={14} /></button>
                <button onClick={() => onDelete(r.id)} className="p-1 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded"><Trash2 size={14} /></button>
              </>
            )}
          </div>
        ))}
      </div>

      <div className="flex gap-2">
        <input value={newLabel} onChange={e => setNewLabel(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && submitAdd()}
          placeholder={`Nuevo motivo de ${direction === 'UP' ? 'aumento' : 'disminución'}...`}
          className="input flex-1 text-sm" />
        <button onClick={submitAdd} disabled={adding || !newLabel.trim()} className="btn-outline btn-sm flex items-center gap-1 disabled:opacity-50">
          <Plus size={14} /> Agregar
        </button>
      </div>
    </div>
  )
}

export default function InventoryReasons() {
  const navigate = useNavigate()
  const [reasons, setReasons] = useState<Reason[]>([])
  const [loading, setLoading] = useState(true)

  const fetchReasons = () => {
    setLoading(true)
    api.get<Reason[]>('/api/inventory-reasons?includeInactive=false')
      .then(data => setReasons(data ?? []))
      .catch(e => toast.error(e instanceof Error ? e.message : 'Error al cargar'))
      .finally(() => setLoading(false))
  }

  useEffect(() => { fetchReasons() }, [])

  const handleAdd = async (direction: 'UP' | 'DOWN', label: string) => {
    try {
      const created = await api.post<Reason>('/api/inventory-reasons', {
        label, direction, sortOrder: reasons.filter(r => r.direction === direction).length,
      })
      setReasons(prev => [...prev, created])
      toast.success('Motivo agregado')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al agregar')
    }
  }

  const handleEdit = async (id: string, label: string) => {
    try {
      const updated = await api.put<Reason>(`/api/inventory-reasons/${id}`, { label })
      setReasons(prev => prev.map(r => r.id === id ? updated : r))
      toast.success('Motivo actualizado')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al actualizar')
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('¿Eliminar este motivo? Ya no aparecerá como opción, pero los ajustes pasados que lo usaron lo conservan en su historial.')) return
    try {
      await api.delete(`/api/inventory-reasons/${id}`)
      setReasons(prev => prev.filter(r => r.id !== id))
      toast.success('Motivo eliminado')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al eliminar')
    }
  }

  const upReasons = reasons.filter(r => r.direction === 'UP').sort((a, b) => a.sortOrder - b.sortOrder)
  const downReasons = reasons.filter(r => r.direction === 'DOWN').sort((a, b) => a.sortOrder - b.sortOrder)

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <button onClick={() => navigate('/settings')} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
          <ArrowLeft size={20} />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
            <PackagePlus size={28} />
            Motivos de Ajuste de Inventario
          </h1>
          <p className="text-gray-600 text-sm mt-1">
            Los motivos que el cajero o encargado de inventario puede elegir al ajustar stock — separados según si suben o bajan la cantidad.
          </p>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-24">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary-600" />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <ReasonColumn
            title="Motivos de aumento" icon={TrendingUp} colorClass="bg-green-100 text-green-700"
            direction="UP" reasons={upReasons} onAdd={handleAdd} onEdit={handleEdit} onDelete={handleDelete}
          />
          <ReasonColumn
            title="Motivos de disminución" icon={TrendingDown} colorClass="bg-red-100 text-red-700"
            direction="DOWN" reasons={downReasons} onAdd={handleAdd} onEdit={handleEdit} onDelete={handleDelete}
          />
        </div>
      )}
    </div>
  )
}
