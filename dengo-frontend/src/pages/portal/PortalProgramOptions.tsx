import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { toast } from 'sonner'
import { Plus, Trash2, X, ChevronDown, ChevronUp, Package, Edit2, Search } from 'lucide-react'
import { api } from '../../lib/api'

const PROGRAM_TYPES = [
  { value: 'FOOD_PACKAGE', label: 'Alimentación Escolar', icon: '🍽️', mandatory: true },
  { value: 'SCHOOL_SUPPLIES', label: 'Útiles Escolares', icon: '✏️', mandatory: true },
  { value: 'TEACHING_KIT', label: 'Valija Didáctica', icon: '🎒', mandatory: false },
  { value: 'GRATUITY', label: 'Gratuidades', icon: '📚', mandatory: false },
]

const money = (v: number | string) =>
  `Q${Number(v).toLocaleString('es-GT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

interface OptionItem { id: string; productId: string; productName: string; quantity: number; basePrice: number; imageUrl?: string | null }
interface ProgramOption { id: string; programType: string; name: string; description?: string | null; isActive: boolean; sortOrder: number; levels: string[]; items: OptionItem[] }
interface Product { id: string; name: string; brand?: string; basePrice: number; imageUrl?: string | null }

const LEVELS = [
  { value: 'CEIN_PAIN', label: 'CEIN / PAIN' },
  { value: 'PREPRIMARIA', label: 'Pre-primaria' },
  { value: 'PRIMARIA', label: 'Primaria' },
  { value: 'BASICO', label: 'Básico' },
  { value: 'DIVERSIFICADO', label: 'Diversificado' },
]

const EMPTY_FORM = { programType: 'FOOD_PACKAGE', name: '', description: '', isActive: true, sortOrder: 0, levels: [] as string[] }

export default function PortalProgramOptions() {
  const [activeType, setActiveType] = useState('FOOD_PACKAGE')
  const [options, setOptions] = useState<ProgramOption[]>([])
  const [loading, setLoading] = useState(true)

  // Option form modal
  const [showOptionModal, setShowOptionModal] = useState(false)
  const [editingOption, setEditingOption] = useState<ProgramOption | null>(null)
  const [optionForm, setOptionForm] = useState(EMPTY_FORM)
  const [optionBusy, setOptionBusy] = useState(false)

  // Items management (expanded option)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [addItemOptionId, setAddItemOptionId] = useState<string | null>(null)
  const [products, setProducts] = useState<Product[]>([])
  const [productSearch, setProductSearch] = useState('')
  const [loadingProducts, setLoadingProducts] = useState(false)
  const [addingProductId, setAddingProductId] = useState<string | null>(null)
  const [itemQty, setItemQty] = useState<Record<string, string>>({})
  const [removingItemId, setRemovingItemId] = useState<string | null>(null)

  const fetchOptions = () => {
    setLoading(true)
    api.get<ProgramOption[]>(`/api/portal-admin/program-options?programType=${activeType}`)
      .then(setOptions)
      .catch(e => toast.error(e.message))
      .finally(() => setLoading(false))
  }

  useEffect(() => { fetchOptions() }, [activeType])

  // Product search when adding items
  useEffect(() => {
    if (!addItemOptionId) return
    setLoadingProducts(true)
    const qs = productSearch ? `?search=${encodeURIComponent(productSearch)}` : ''
    api.get<Product[]>(`/api/products${qs}`)
      .then(setProducts)
      .catch(() => setProducts([]))
      .finally(() => setLoadingProducts(false))
  }, [addItemOptionId, productSearch])

  const openCreate = () => {
    setEditingOption(null)
    setOptionForm({ ...EMPTY_FORM, programType: activeType, levels: [] })
    setShowOptionModal(true)
  }
  const openEdit = (opt: ProgramOption) => {
    setEditingOption(opt)
    setOptionForm({ programType: opt.programType, name: opt.name, description: opt.description ?? '', isActive: opt.isActive, sortOrder: opt.sortOrder, levels: opt.levels ?? [] })
    setShowOptionModal(true)
  }

  const toggleLevel = (level: string) => {
    setOptionForm(f => ({
      ...f,
      levels: f.levels.includes(level) ? f.levels.filter(l => l !== level) : [...f.levels, level],
    }))
  }

  const submitOption = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!optionForm.name.trim()) return toast.error('El nombre es requerido')
    setOptionBusy(true)
    try {
      const payload = { ...optionForm, description: optionForm.description || undefined }
      if (editingOption) {
        await api.put(`/api/portal-admin/program-options/${editingOption.id}`, payload)
        toast.success('Opción actualizada')
      } else {
        await api.post('/api/portal-admin/program-options', payload)
        toast.success('Opción creada')
      }
      setShowOptionModal(false)
      fetchOptions()
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setOptionBusy(false)
    }
  }

  const deleteOption = async (opt: ProgramOption) => {
    if (!confirm(`¿Eliminar la opción "${opt.name}"? Esta acción no se puede deshacer.`)) return
    try {
      await api.delete(`/api/portal-admin/program-options/${opt.id}`)
      toast.success('Opción eliminada')
      fetchOptions()
    } catch (e: any) {
      toast.error(e.message)
    }
  }

  const toggleExpand = (id: string) => {
    setExpandedId(prev => prev === id ? null : id)
    setAddItemOptionId(null)
    setProductSearch('')
  }

  const openAddItem = (optId: string) => {
    setAddItemOptionId(optId)
    setProductSearch('')
  }

  const addItem = async (optId: string, product: Product) => {
    const qty = Number(itemQty[product.id] ?? 1)
    if (!qty || qty <= 0) return toast.error('Cantidad inválida')
    setAddingProductId(product.id)
    try {
      await api.post(`/api/portal-admin/program-options/${optId}/items`, { productId: product.id, quantity: qty })
      toast.success(`${product.name} agregado`)
      setItemQty(prev => ({ ...prev, [product.id]: '' }))
      fetchOptions()
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setAddingProductId(null)
    }
  }

  const removeItem = async (optId: string, itemId: string) => {
    setRemovingItemId(itemId)
    try {
      await api.delete(`/api/portal-admin/program-options/${optId}/items/${itemId}`)
      fetchOptions()
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setRemovingItemId(null)
    }
  }

  const currentType = PROGRAM_TYPES.find(t => t.value === activeType)!

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-800">Paquetes por Programa</h1>
          <p className="text-gray-600 mt-1">
            Define las opciones que los maestros pueden seleccionar al hacer un pedido
          </p>
        </div>
        <button onClick={openCreate} className="btn-primary btn-md flex items-center gap-2">
          <Plus size={20} /> Nuevo Paquete
        </button>
      </div>

      {/* Program type tabs */}
      <div className="bg-white rounded-xl border border-gray-200 p-1.5 flex gap-1 overflow-x-auto">
        {PROGRAM_TYPES.map(t => (
          <button
            key={t.value}
            onClick={() => setActiveType(t.value)}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
              activeType === t.value ? 'bg-primary-600 text-white shadow-sm' : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            <span>{t.icon}</span> {t.label}
            {t.mandatory && (
              <span className={`text-xs px-1.5 py-0.5 rounded font-semibold ${activeType === t.value ? 'bg-white/20 text-white' : 'bg-amber-100 text-amber-700'}`}>
                Obligatorio
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Info banner */}
      <div className={`rounded-xl p-4 text-sm flex items-start gap-3 ${currentType.mandatory ? 'bg-amber-50 border border-amber-200 text-amber-800' : 'bg-blue-50 border border-blue-200 text-blue-800'}`}>
        <Package size={18} className="flex-shrink-0 mt-0.5" />
        <div>
          {currentType.mandatory
            ? <p>Los maestros <strong>deben seleccionar obligatoriamente</strong> uno de estos paquetes. El pedido se creará con exactamente los productos del paquete elegido.</p>
            : <p>Estos paquetes son <strong>sugerencias opcionales</strong>. El maestro puede seleccionar uno para pre-llenar su carrito, pero luego puede agregar o quitar productos libremente.</p>
          }
        </div>
      </div>

      {/* Options list */}
      {loading ? (
        <div className="flex items-center justify-center h-48">
          <div className="w-8 h-8 border-4 border-primary-600 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : options.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <Package size={48} className="mx-auto text-gray-300 mb-4" />
          <p className="text-gray-600">No hay paquetes para este programa.</p>
          <button onClick={openCreate} className="btn-primary btn-md mt-4">Crear primer paquete</button>
        </div>
      ) : (
        <div className="space-y-3">
          {options.map(opt => {
            const expanded = expandedId === opt.id
            const addingItems = addItemOptionId === opt.id
            const optTotal = opt.items.reduce((s, i) => s + i.basePrice * i.quantity, 0)
            return (
              <motion.div key={opt.id} layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                {/* Option header */}
                <div className="flex items-center justify-between p-5">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <button onClick={() => toggleExpand(opt.id)} className="flex items-center gap-2 text-left flex-1 min-w-0">
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${opt.isActive ? 'bg-primary-100 text-primary-700' : 'bg-gray-100 text-gray-400'}`}>
                        {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="font-semibold text-gray-800 truncate">{opt.name}</p>
                          {!opt.isActive && <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 font-medium">Inactivo</span>}
                        </div>
                        {opt.description && <p className="text-xs text-gray-400 truncate">{opt.description}</p>}
                        <p className="text-xs text-gray-500 mt-0.5">
                          {opt.items.length} productos · <span className="font-semibold text-primary-600">{money(optTotal)}</span>
                        </p>
                        {opt.levels && opt.levels.length > 0 && (
                          <p className="text-xs text-blue-600 mt-0.5">
                            Niveles: {opt.levels.map(l => LEVELS.find(x => x.value === l)?.label ?? l).join(', ')}
                          </p>
                        )}
                      </div>
                    </button>
                  </div>
                  <div className="flex items-center gap-1 ml-4">
                    <button onClick={() => openEdit(opt)} className="p-2 text-gray-500 hover:bg-gray-100 rounded-lg" title="Editar"><Edit2 size={16} /></button>
                    <button onClick={() => deleteOption(opt)} className="p-2 text-red-500 hover:bg-red-50 rounded-lg" title="Eliminar"><Trash2 size={16} /></button>
                  </div>
                </div>

                {/* Expanded: items + add product */}
                <AnimatePresence>
                  {expanded && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className="overflow-hidden"
                    >
                      <div className="border-t border-gray-100 p-5 space-y-4">
                        {/* Current items */}
                        {opt.items.length === 0 ? (
                          <p className="text-sm text-gray-400 text-center py-4">Este paquete no tiene productos aún.</p>
                        ) : (
                          <table className="w-full text-sm">
                            <thead className="text-gray-500 text-xs">
                              <tr>
                                <th className="text-left pb-2">Producto</th>
                                <th className="text-right pb-2">Cant.</th>
                                <th className="text-right pb-2">Precio Unit.</th>
                                <th className="text-right pb-2">Subtotal</th>
                                <th className="pb-2" />
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-50">
                              {opt.items.map(item => (
                                <tr key={item.id}>
                                  <td className="py-2 text-gray-800">{item.productName}</td>
                                  <td className="py-2 text-right text-gray-600">{item.quantity}</td>
                                  <td className="py-2 text-right text-gray-600">{money(item.basePrice)}</td>
                                  <td className="py-2 text-right font-semibold text-gray-800">{money(item.basePrice * item.quantity)}</td>
                                  <td className="py-2 pl-3">
                                    <button
                                      onClick={() => removeItem(opt.id, item.id)}
                                      disabled={removingItemId === item.id}
                                      className="p-1 text-red-400 hover:text-red-600 hover:bg-red-50 rounded"
                                    >
                                      {removingItemId === item.id
                                        ? <span className="w-4 h-4 border-2 border-red-400 border-t-transparent rounded-full animate-spin inline-block" />
                                        : <Trash2 size={14} />
                                      }
                                    </button>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                            <tfoot>
                              <tr className="border-t border-gray-200">
                                <td colSpan={3} className="pt-2 text-right font-bold text-gray-700">Total</td>
                                <td className="pt-2 text-right font-bold text-primary-600">{money(optTotal)}</td>
                                <td />
                              </tr>
                            </tfoot>
                          </table>
                        )}

                        {/* Add product section */}
                        {!addingItems ? (
                          <button onClick={() => openAddItem(opt.id)} className="w-full py-2.5 rounded-lg border-2 border-dashed border-gray-200 text-sm text-gray-500 hover:border-primary-400 hover:text-primary-600 flex items-center justify-center gap-1.5">
                            <Plus size={16} /> Agregar producto
                          </button>
                        ) : (
                          <div className="border border-gray-200 rounded-xl p-4 space-y-3">
                            <div className="flex items-center justify-between">
                              <p className="text-sm font-semibold text-gray-700">Agregar producto al paquete</p>
                              <button onClick={() => setAddItemOptionId(null)} className="p-1 hover:bg-gray-100 rounded"><X size={16} className="text-gray-400" /></button>
                            </div>
                            <div className="relative">
                              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                              <input
                                value={productSearch}
                                onChange={e => setProductSearch(e.target.value)}
                                placeholder="Buscar producto…"
                                className="input pl-9 w-full"
                              />
                            </div>
                            {loadingProducts ? (
                              <div className="flex justify-center py-4"><div className="w-6 h-6 border-2 border-primary-600 border-t-transparent rounded-full animate-spin" /></div>
                            ) : products.length === 0 ? (
                              <p className="text-sm text-gray-400 text-center py-4">No se encontraron productos.</p>
                            ) : (
                              <div className="max-h-64 overflow-y-auto space-y-2">
                                {products.map(p => {
                                  const alreadyIn = opt.items.some(i => i.productId === p.id)
                                  return (
                                    <div key={p.id} className={`flex items-center justify-between p-3 rounded-lg border text-sm ${alreadyIn ? 'bg-gray-50 border-gray-100' : 'border-gray-100 hover:bg-gray-50'}`}>
                                      <div className="flex-1 min-w-0">
                                        <p className="font-medium text-gray-800 truncate">{p.name}</p>
                                        <p className="text-xs text-gray-400">{money(p.basePrice)}</p>
                                      </div>
                                      <div className="flex items-center gap-2 ml-3">
                                        <input
                                          type="number"
                                          min={1}
                                          value={itemQty[p.id] ?? 1}
                                          onChange={e => setItemQty(prev => ({ ...prev, [p.id]: e.target.value }))}
                                          className="w-16 input py-1 text-center text-sm"
                                          disabled={alreadyIn}
                                        />
                                        <button
                                          onClick={() => addItem(opt.id, p)}
                                          disabled={alreadyIn || addingProductId === p.id}
                                          className="px-3 py-1.5 rounded-lg bg-primary-600 text-white text-xs font-semibold hover:bg-primary-700 disabled:opacity-50"
                                        >
                                          {addingProductId === p.id
                                            ? <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin inline-block" />
                                            : alreadyIn ? 'Ya incluido' : 'Agregar'
                                          }
                                        </button>
                                      </div>
                                    </div>
                                  )
                                })}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            )
          })}
        </div>
      )}

      {/* Option create/edit modal */}
      {showOptionModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="bg-white rounded-xl shadow-xl w-full max-w-md">
            <div className="p-6 border-b flex items-center justify-between">
              <h2 className="text-xl font-bold text-gray-800">{editingOption ? 'Editar Paquete' : 'Nuevo Paquete'}</h2>
              <button onClick={() => setShowOptionModal(false)} className="p-1 hover:bg-gray-100 rounded"><X size={18} /></button>
            </div>
            <form onSubmit={submitOption} className="p-6 space-y-4">
              <div>
                <label className="label">Programa *</label>
                <select
                  className="input w-full"
                  value={optionForm.programType}
                  onChange={e => setOptionForm({ ...optionForm, programType: e.target.value })}
                >
                  {PROGRAM_TYPES.map(t => <option key={t.value} value={t.value}>{t.icon} {t.label}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Nombre del paquete *</label>
                <input className="input w-full" value={optionForm.name} onChange={e => setOptionForm({ ...optionForm, name: e.target.value })} required placeholder="Ej: Paquete A - Básico" />
              </div>
              <div>
                <label className="label">Descripción</label>
                <textarea rows={2} className="input w-full resize-none" value={optionForm.description} onChange={e => setOptionForm({ ...optionForm, description: e.target.value })} placeholder="Descripción opcional del paquete…" />
              </div>
              <div>
                <label className="label">Orden de visualización</label>
                <input type="number" min={0} className="input w-full" value={optionForm.sortOrder} onChange={e => setOptionForm({ ...optionForm, sortOrder: Number(e.target.value) })} />
                <p className="text-xs text-gray-400 mt-1">Número menor = aparece primero</p>
              </div>
              <div>
                <label className="label">Niveles educativos</label>
                <p className="text-xs text-gray-400 mb-2">Si no seleccionas ninguno, el paquete aparece para todos los niveles.</p>
                <div className="flex flex-wrap gap-2">
                  {LEVELS.map(l => (
                    <label key={l.value} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border cursor-pointer text-sm transition-colors ${optionForm.levels.includes(l.value) ? 'border-primary-500 bg-primary-50 text-primary-700 font-medium' : 'border-gray-200 text-gray-600 hover:border-gray-300'}`}>
                      <input type="checkbox" className="sr-only" checked={optionForm.levels.includes(l.value)} onChange={() => toggleLevel(l.value)} />
                      {l.label}
                    </label>
                  ))}
                </div>
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={optionForm.isActive} onChange={e => setOptionForm({ ...optionForm, isActive: e.target.checked })} className="w-4 h-4 text-primary-600 rounded" />
                <span className="text-sm text-gray-700">Paquete activo (visible para maestros)</span>
              </label>
              <div className="flex gap-3 justify-end pt-2 border-t">
                <button type="button" onClick={() => setShowOptionModal(false)} className="btn-secondary btn-md">Cancelar</button>
                <button type="submit" disabled={optionBusy} className="btn-primary btn-md">
                  {optionBusy ? <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin inline-block" /> : editingOption ? 'Guardar' : 'Crear'}
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </div>
  )
}
