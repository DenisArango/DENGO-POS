import { useState, useEffect } from 'react'
import { ArrowLeft, Tag, Lock, Plus, Trash2, Pencil, Check, X, GitMerge } from 'lucide-react'
import { toast } from 'sonner'
import { useNavigate } from 'react-router-dom'
import { api } from '../../lib/api'
import { useAuthStore } from '../../store'
import { usePermissions } from '../../hooks/usePermissions'

interface Category {
  id: string
  name: string
  productCount: number
}

export default function Categories() {
  const navigate = useNavigate()
  const isAdmin = useAuthStore(s => s.user?.role === 'ADMIN')
  const { hasPermission } = usePermissions()
  const canEdit = hasPermission('inventory.edit')
  const canDelete = hasPermission('inventory.delete')

  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)

  const [newName, setNewName] = useState('')
  const [creating, setCreating] = useState(false)

  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')

  // The one action behind both "Fusionar" and "Eliminar con productos" —
  // deleting a category with products open this same picker instead of a
  // dead-end error, since both need the same destination choice.
  const [mergingId, setMergingId] = useState<string | null>(null)
  const [mergeTargetId, setMergeTargetId] = useState('')
  const [merging, setMerging] = useState(false)

  function fetchCategories() {
    setLoading(true)
    api.get<Category[]>('/api/categories?withCounts=true')
      .then(data => setCategories(data ?? []))
      .catch(e => toast.error(e instanceof Error ? e.message : 'Error al cargar categorías'))
      .finally(() => setLoading(false))
  }

  useEffect(() => { fetchCategories() }, [])

  async function handleCreate() {
    if (!newName.trim()) return
    setCreating(true)
    try {
      await api.post('/api/categories', { name: newName.trim() })
      setNewName('')
      toast.success('Categoría creada')
      fetchCategories()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al crear categoría')
    } finally {
      setCreating(false)
    }
  }

  function startEdit(c: Category) {
    setEditingId(c.id)
    setEditName(c.name)
  }

  async function submitEdit(id: string) {
    if (!editName.trim()) return
    try {
      await api.put(`/api/categories/${id}`, { name: editName.trim() })
      setEditingId(null)
      toast.success('Categoría actualizada')
      fetchCategories()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al actualizar')
    }
  }

  function startMerge(id: string) {
    setMergingId(id)
    setMergeTargetId('')
  }

  async function submitMerge() {
    if (!mergingId || !mergeTargetId) return
    setMerging(true)
    try {
      const res = await api.post<{ message: string }>(`/api/categories/${mergingId}/merge`, { targetCategoryId: mergeTargetId })
      toast.success(res.message)
      setMergingId(null)
      fetchCategories()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al fusionar')
    } finally {
      setMerging(false)
    }
  }

  async function handleDelete(c: Category) {
    if (c.productCount > 0) {
      // Can't just deactivate — Product.categoryId is required, so a category
      // with products needs somewhere for them to go first.
      startMerge(c.id)
      toast.info(`"${c.name}" todavía tiene ${c.productCount} producto(s) — elige a qué categoría moverlos para poder eliminarla`)
      return
    }
    if (!window.confirm(`¿Eliminar la categoría "${c.name}"?`)) return
    try {
      await api.delete(`/api/categories/${c.id}`)
      toast.success('Categoría eliminada')
      fetchCategories()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al eliminar')
    }
  }

  if (!canEdit) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <button onClick={() => navigate('/settings')} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
            <ArrowLeft size={20} />
          </button>
          <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
            <Tag size={28} /> Categorías
          </h1>
        </div>
        <div className="bg-white rounded-lg shadow-sm p-8 text-center">
          <Lock className="mx-auto text-gray-400 mb-3" size={32} />
          <p className="text-gray-600">No tienes permiso para gestionar categorías.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <button onClick={() => navigate('/settings')} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
          <ArrowLeft size={20} />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
            <Tag size={28} /> Categorías
          </h1>
          <p className="text-gray-600 text-sm mt-1">
            Categorías de productos — renómbralas, fusiona duplicadas (ej. una mal escrita) en una sola, o elimínalas.
          </p>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-sm p-6">
        {isAdmin && (
          <div className="flex gap-2 mb-5 pb-5 border-b border-gray-100">
            <input
              value={newName}
              onChange={e => setNewName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleCreate()}
              placeholder="Nombre de la nueva categoría"
              className="input flex-1 text-sm"
            />
            <button onClick={handleCreate} disabled={!newName.trim() || creating} className="btn-primary btn-sm flex items-center gap-1 disabled:opacity-50">
              <Plus size={14} /> {creating ? 'Creando...' : 'Crear'}
            </button>
          </div>
        )}

        {loading ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
          </div>
        ) : categories.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-8">No hay categorías todavía.</p>
        ) : (
          <div className="space-y-2">
            {categories.map(c => (
              <div key={c.id} className="bg-gray-50 rounded-lg px-3 py-2.5">
                <div className="flex items-center gap-2">
                  {editingId === c.id ? (
                    <>
                      <input
                        value={editName}
                        onChange={e => setEditName(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && submitEdit(c.id)}
                        className="input flex-1 text-sm py-1"
                        autoFocus
                      />
                      <button onClick={() => submitEdit(c.id)} className="p-1 text-green-600 hover:bg-green-100 rounded"><Check size={16} /></button>
                      <button onClick={() => setEditingId(null)} className="p-1 text-gray-400 hover:bg-gray-200 rounded"><X size={16} /></button>
                    </>
                  ) : (
                    <>
                      <span className="flex-1 text-sm text-gray-700">{c.name}</span>
                      <span className="text-xs text-gray-400">{c.productCount} producto{c.productCount === 1 ? '' : 's'}</span>
                      {canEdit && (
                        <button onClick={() => startEdit(c)} className="p-1 text-gray-400 hover:text-primary-600 hover:bg-primary-50 rounded" title="Renombrar"><Pencil size={14} /></button>
                      )}
                      {canDelete && categories.length > 1 && (
                        <button onClick={() => startMerge(c.id)} className="p-1 text-gray-400 hover:text-purple-600 hover:bg-purple-50 rounded" title="Fusionar con otra categoría"><GitMerge size={14} /></button>
                      )}
                      {canDelete && (
                        <button onClick={() => handleDelete(c)} className="p-1 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded" title="Eliminar"><Trash2 size={14} /></button>
                      )}
                    </>
                  )}
                </div>

                {mergingId === c.id && (
                  <div className="flex items-center gap-2 mt-2 pt-2 border-t border-gray-200">
                    <span className="text-xs text-gray-500 flex-shrink-0">Mover sus productos a:</span>
                    <select value={mergeTargetId} onChange={e => setMergeTargetId(e.target.value)} className="input text-sm py-1 flex-1">
                      <option value="">Elige la categoría destino...</option>
                      {categories.filter(other => other.id !== c.id).map(other => (
                        <option key={other.id} value={other.id}>{other.name}</option>
                      ))}
                    </select>
                    <button onClick={submitMerge} disabled={!mergeTargetId || merging} className="btn-primary btn-sm disabled:opacity-50">
                      {merging ? 'Fusionando...' : 'Fusionar'}
                    </button>
                    <button onClick={() => setMergingId(null)} className="text-xs text-gray-500 hover:text-gray-700">Cancelar</button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
