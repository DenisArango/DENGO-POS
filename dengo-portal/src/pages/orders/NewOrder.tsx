import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { toast } from 'sonner'
import {
  ArrowRight, ArrowLeft, Search, Plus, Minus, ShoppingCart, Check, AlertTriangle,
  School as SchoolIcon, X, PackageSearch, CheckCircle2, Package, Users, Trash2,
} from 'lucide-react'
import PortalLayout from '../../components/layout/PortalLayout'
import { api } from '../../lib/api'
import type { GradeRow } from '../../lib/api'
import type { Program, Product, Category, TeacherSchoolAssignment, PortalOrder, ProgramOption } from '../../types'
import { programLabel, programIcon, money } from '../../lib/labels'

interface CartItem {
  product: Product
  quantity: number
}

const STEPS = ['Escuela y Grados', 'Productos', 'Confirmar']
const MANDATORY_OPTION_TYPES = ['FOOD_PACKAGE', 'SCHOOL_SUPPLIES']

const LEVEL_LABELS: Record<string, string> = {
  CEIN_PAIN: 'CEIN / PAIN',
  PREPRIMARIA: 'Pre-primaria',
  PRIMARIA: 'Primaria',
  BASICO: 'Básico',
  DIVERSIFICADO: 'Diversificado',
}
const LEVELS = Object.entries(LEVEL_LABELS).map(([value, label]) => ({ value, label }))

export default function NewOrder() {
  const navigate = useNavigate()
  const [step, setStep] = useState(1)

  const [schools, setSchools] = useState<TeacherSchoolAssignment[]>([])
  const [programs, setPrograms] = useState<Program[]>([])
  const [loadingInit, setLoadingInit] = useState(true)

  // Step 1 state
  const [schoolId, setSchoolId] = useState('')
  const [programType, setProgramType] = useState('')
  const [grades, setGrades] = useState<Array<{ gradeName: string; studentCount: string }>>([
    { gradeName: '', studentCount: '' },
  ])

  // Step 2 state
  const [programOptions, setProgramOptions] = useState<ProgramOption[]>([])
  const [loadingOptions, setLoadingOptions] = useState(false)
  const [selectedOptionId, setSelectedOptionId] = useState<string | null>(null)
  const [categories, setCategories] = useState<Category[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [loadingProducts, setLoadingProducts] = useState(false)
  const [search, setSearch] = useState('')
  const [activeCategory, setActiveCategory] = useState('')
  const [cart, setCart] = useState<Record<string, CartItem>>({})
  const [cartOpen, setCartOpen] = useState(false)

  // Step 3 state
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [created, setCreated] = useState<PortalOrder | null>(null)

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const isMandatory = MANDATORY_OPTION_TYPES.includes(programType)

  useEffect(() => {
    api.getMe()
      .then(me => {
        setSchools(me.teacher?.schools ?? [])
        setPrograms(me.programs ?? [])
      })
      .catch(e => toast.error(e instanceof Error ? e.message : 'Error al cargar'))
      .finally(() => setLoadingInit(false))
  }, [])

  const selectedSchool = schools.find(s => s.id === schoolId)
  const selectedProgram = programs.find(p => p.type === programType)
  const totalStudents = grades.reduce((s, g) => s + (Number(g.studentCount) || 0), 0)

  // ── Load options + categories when entering step 2 ──
  useEffect(() => {
    if (step !== 2 || !programType) return
    setSelectedOptionId(null)

    const level = selectedSchool?.educationalLevel || undefined
    setLoadingOptions(true)
    api.getProgramOptions(programType, level)
      .then(setProgramOptions)
      .catch(() => setProgramOptions([]))
      .finally(() => setLoadingOptions(false))

    if (!MANDATORY_OPTION_TYPES.includes(programType)) {
      api.getCategories(programType).then(setCategories).catch(() => setCategories([]))
    }
  }, [step, programType])

  // ── Load products (debounced, only for optional programs) ──
  const loadProducts = () => {
    if (!programType || isMandatory) return
    setLoadingProducts(true)
    const params: Record<string, string> = { programType, limit: '60' }
    if (search) params.search = search
    if (activeCategory) params.categoryId = activeCategory
    api.getProducts(params)
      .then(r => setProducts(r.data))
      .catch(e => toast.error(e instanceof Error ? e.message : 'Error al cargar productos'))
      .finally(() => setLoadingProducts(false))
  }

  useEffect(() => {
    if (step !== 2 || isMandatory) return
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(loadProducts, 300)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, search, activeCategory, programType])

  const selectOption = (option: ProgramOption) => {
    setSelectedOptionId(option.id)
    const newCart: Record<string, CartItem> = {}
    for (const item of option.items) {
      newCart[item.productId] = {
        product: {
          id: item.productId,
          name: item.productName,
          basePrice: item.basePrice,
          imageUrl: item.imageUrl ?? undefined,
        },
        quantity: item.quantity,
      }
    }
    setCart(newCart)
  }

  const cartItems = useMemo(() => Object.values(cart), [cart])
  const cartTotal = useMemo(
    () => cartItems.reduce((s, it) => s + it.product.basePrice * it.quantity, 0),
    [cartItems]
  )

  const limit = selectedProgram?.maxAmountPerTeacher ?? null
  const limitPerStudent = selectedProgram?.limitPerStudent ?? null
  const maxByStudents = limitPerStudent && totalStudents > 0 ? limitPerStudent * totalStudents : null
  const effectiveLimit = maxByStudents != null && (limit == null || maxByStudents < limit) ? maxByStudents : limit
  const overLimit = effectiveLimit != null && cartTotal > effectiveLimit

  const addToCart = (product: Product) => {
    setCart(prev => {
      const existing = prev[product.id]
      return { ...prev, [product.id]: { product, quantity: (existing?.quantity ?? 0) + 1 } }
    })
  }
  const setQty = (productId: string, qty: number) => {
    setCart(prev => {
      if (qty <= 0) {
        const { [productId]: _removed, ...rest } = prev
        return rest
      }
      const item = prev[productId]
      if (!item) return prev
      return { ...prev, [productId]: { ...item, quantity: qty } }
    })
  }

  // ── Grade breakdown helpers ──
  const addGrade = () => setGrades(g => [...g, { gradeName: '', studentCount: '' }])
  const removeGrade = (i: number) => setGrades(g => g.filter((_, idx) => idx !== i))
  const updateGrade = (i: number, field: 'gradeName' | 'studentCount', value: string) => {
    setGrades(g => g.map((row, idx) => idx === i ? { ...row, [field]: value } : row))
  }

  // ── Step navigation ──
  const goStep2 = () => {
    if (!schoolId) return toast.error('Selecciona una escuela')
    if (!programType) return toast.error('Selecciona un programa')
    const validGrades = grades.filter(g => g.gradeName.trim() && Number(g.studentCount) > 0)
    if (validGrades.length === 0) return toast.error('Ingresa al menos un grado con número de alumnos')
    const hasEmpty = grades.some(g => !g.gradeName.trim() || !Number(g.studentCount))
    if (hasEmpty) return toast.error('Completa todos los campos de grado')
    setCart({})
    setStep(2)
  }
  const goStep3 = () => {
    if (isMandatory && !selectedOptionId) return toast.error('Debes seleccionar un paquete para este programa')
    if (cartItems.length === 0) return toast.error('Agrega al menos un producto')
    if (overLimit) return toast.error('El total excede el límite del programa')
    setStep(3)
  }

  const submit = async () => {
    if (!selectedSchool) return
    const validGrades: GradeRow[] = grades
      .filter(g => g.gradeName.trim() && Number(g.studentCount) > 0)
      .map(g => ({ gradeName: g.gradeName.trim(), studentCount: Number(g.studentCount) }))

    if (validGrades.length > 1 && !notes.trim()) {
      return toast.error('El comentario es obligatorio cuando el pedido cubre más de un grado')
    }

    setSubmitting(true)
    try {
      const order = await api.createOrder({
        schoolId: selectedSchool.school.id,
        educationalLevel: selectedSchool.educationalLevel || undefined,
        programType,
        grades: validGrades,
        notes: notes || undefined,
        items: cartItems.map(it => ({
          productId: it.product.id,
          quantity: it.quantity,
          unitPrice: it.product.basePrice,
        })),
      })
      setCreated(order)
      toast.success('¡Solicitud enviada!')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo enviar el pedido')
    } finally {
      setSubmitting(false)
    }
  }

  if (loadingInit) {
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
      {/* Progress */}
      <div className="mb-8">
        <h1 className="text-2xl font-extrabold text-gray-900 mb-5">Nuevo Pedido</h1>
        <div className="flex items-center">
          {STEPS.map((label, i) => {
            const n = i + 1
            const done = step > n
            const active = step === n
            return (
              <div key={label} className="flex items-center flex-1 last:flex-none">
                <div className="flex items-center gap-2.5">
                  <div className={`w-9 h-9 rounded-full flex items-center justify-center font-bold text-sm transition-colors ${
                    done ? 'bg-green-500 text-white' : active ? 'bg-brand-500 text-white' : 'bg-gray-200 text-gray-500'
                  }`}>
                    {done ? <Check size={16} /> : n}
                  </div>
                  <span className={`text-sm font-medium hidden sm:block ${active ? 'text-gray-900' : 'text-gray-400'}`}>{label}</span>
                </div>
                {n < STEPS.length && <div className={`flex-1 h-0.5 mx-3 ${done ? 'bg-green-500' : 'bg-gray-200'}`} />}
              </div>
            )
          })}
        </div>
      </div>

      <AnimatePresence mode="wait">
        {/* ── STEP 1 ── */}
        {step === 1 && (
          <motion.div key="s1" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-6">

            {/* School selection */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
              <label className="block text-sm font-bold text-gray-700 mb-2 flex items-center gap-2">
                <SchoolIcon size={16} className="text-brand-500" /> Escuela asignada
              </label>
              {schools.length === 0 ? (
                <p className="text-sm text-gray-500">No tienes escuelas asignadas. Contacta al proveedor.</p>
              ) : (
                <>
                  <select
                    value={schoolId}
                    onChange={e => setSchoolId(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-brand-400 focus:ring-2 focus:ring-brand-100 outline-none"
                  >
                    <option value="">Selecciona una escuela…</option>
                    {schools.map(s => (
                      <option key={s.id} value={s.id}>
                        {s.school.name}
                        {s.educationalLevel ? ` — ${LEVEL_LABELS[s.educationalLevel] ?? s.educationalLevel}` : ''}
                      </option>
                    ))}
                  </select>
                  {selectedSchool?.educationalLevel && (
                    <p className="mt-2 text-xs text-brand-700 font-medium bg-brand-50 px-3 py-1.5 rounded-lg inline-block">
                      Nivel: {LEVEL_LABELS[selectedSchool.educationalLevel] ?? selectedSchool.educationalLevel}
                    </p>
                  )}
                </>
              )}
            </div>

            {/* Program selection */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
              <label className="block text-sm font-bold text-gray-700 mb-4">Programa educativo</label>
              {programs.length === 0 ? (
                <p className="text-sm text-gray-500">No hay programas activos disponibles.</p>
              ) : (
                <div className="grid sm:grid-cols-2 gap-3">
                  {programs.map(p => {
                    const selected = programType === p.type
                    const mandatory = MANDATORY_OPTION_TYPES.includes(p.type)
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => setProgramType(p.type)}
                        className={`text-left rounded-2xl border-2 p-4 transition-all ${
                          selected ? 'border-brand-500 bg-brand-50' : 'border-gray-100 hover:border-brand-200'
                        }`}
                      >
                        <div className="flex items-start gap-3">
                          <div className="text-2xl">{programIcon(p.type)}</div>
                          <div className="flex-1">
                            <p className="font-bold text-gray-900">{p.name || programLabel(p.type)}</p>
                            {p.description && <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{p.description}</p>}
                            {p.maxAmountPerTeacher != null && (
                              <p className="mt-2 text-xs font-semibold text-brand-600">Límite total: {money(p.maxAmountPerTeacher)}</p>
                            )}
                            {p.limitPerStudent != null && (
                              <p className="mt-1 text-xs font-semibold text-emerald-600">Límite: {money(p.limitPerStudent)} por alumno</p>
                            )}
                            {mandatory && (
                              <p className="mt-1 text-xs text-amber-600 font-medium">* Se requiere seleccionar un paquete</p>
                            )}
                          </div>
                          {selected && <CheckCircle2 className="text-brand-500 flex-shrink-0" size={20} />}
                        </div>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Grade breakdown */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
              <div className="flex items-center justify-between mb-4">
                <label className="text-sm font-bold text-gray-700 flex items-center gap-2">
                  <Users size={16} className="text-brand-500" /> Desglose por grado
                </label>
                {totalStudents > 0 && (
                  <span className="text-sm font-semibold text-gray-600 bg-gray-100 px-3 py-1 rounded-full">
                    {totalStudents} alumnos total
                  </span>
                )}
              </div>

              {selectedProgram?.limitPerStudent && totalStudents > 0 && (
                <div className="mb-4 p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-sm text-emerald-800">
                  Límite máximo del pedido: {money(selectedProgram.limitPerStudent)} × {totalStudents} alumnos
                  {' = '}<strong>{money(selectedProgram.limitPerStudent * totalStudents)}</strong>
                </div>
              )}

              <div className="space-y-2">
                <div className="grid grid-cols-[1fr_auto_auto] gap-2 text-xs text-gray-500 font-medium px-1">
                  <span>Grado / Sección</span>
                  <span className="text-center w-24">Alumnos</span>
                  <span className="w-8" />
                </div>
                {grades.map((g, i) => (
                  <div key={i} className="grid grid-cols-[1fr_auto_auto] gap-2 items-center">
                    <input
                      value={g.gradeName}
                      onChange={e => updateGrade(i, 'gradeName', e.target.value)}
                      placeholder="Ej: Tercero A, Cuarto Primaria…"
                      className="px-3 py-2.5 rounded-xl border border-gray-200 focus:border-brand-400 focus:ring-2 focus:ring-brand-100 outline-none text-sm"
                    />
                    <input
                      type="number"
                      min={1}
                      value={g.studentCount}
                      onChange={e => updateGrade(i, 'studentCount', e.target.value)}
                      placeholder="0"
                      className="w-24 px-3 py-2.5 rounded-xl border border-gray-200 focus:border-brand-400 focus:ring-2 focus:ring-brand-100 outline-none text-sm text-center"
                    />
                    <button
                      type="button"
                      onClick={() => removeGrade(i)}
                      disabled={grades.length === 1}
                      className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 disabled:opacity-20 disabled:cursor-not-allowed transition-colors"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                ))}
              </div>

              <button
                type="button"
                onClick={addGrade}
                className="mt-3 w-full py-2.5 rounded-xl border-2 border-dashed border-gray-200 text-sm text-gray-500 hover:border-brand-400 hover:text-brand-600 flex items-center justify-center gap-1.5 transition-colors"
              >
                <Plus size={15} /> Agregar otro grado
              </button>

              {grades.length > 1 && (
                <p className="mt-3 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                  Al cubrir más de un grado, el comentario será obligatorio en el paso de confirmación.
                </p>
              )}
            </div>

            <div className="flex justify-end">
              <button onClick={goStep2} className="px-6 py-3 rounded-xl bg-brand-500 text-white font-bold hover:bg-brand-600 flex items-center gap-2">
                Continuar <ArrowRight size={18} />
              </button>
            </div>
          </motion.div>
        )}

        {/* ── STEP 2 ── */}
        {step === 2 && (
          <motion.div key="s2" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
            {isMandatory ? (
              /* Mandatory: only package cards */
              <div className="space-y-6">
                <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 text-sm text-amber-800 flex items-start gap-2">
                  <AlertTriangle size={18} className="flex-shrink-0 mt-0.5" />
                  <p>Este programa requiere que selecciones uno de los paquetes predefinidos. El proveedor preparará exactamente los productos del paquete elegido.</p>
                </div>

                {loadingOptions ? (
                  <div className="flex items-center justify-center h-48">
                    <div className="w-7 h-7 border-4 border-brand-500 border-t-transparent rounded-full animate-spin" />
                  </div>
                ) : programOptions.length === 0 ? (
                  <div className="bg-white rounded-2xl border border-gray-100 p-10 text-center text-gray-500">
                    <Package size={40} className="mx-auto text-gray-300 mb-3" />
                    <p>El proveedor aún no ha creado paquetes para este programa.</p>
                    <p className="text-xs mt-1">Contacta al proveedor para más información.</p>
                  </div>
                ) : (
                  <div className="grid sm:grid-cols-2 gap-4">
                    {programOptions.map(opt => {
                      const isSelected = selectedOptionId === opt.id
                      const optTotal = opt.items.reduce((s, i) => s + i.basePrice * i.quantity, 0)
                      return (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() => selectOption(opt)}
                          className={`text-left rounded-2xl border-2 p-5 transition-all shadow-sm ${
                            isSelected ? 'border-brand-500 bg-brand-50 shadow-brand-100' : 'border-gray-100 bg-white hover:border-brand-200'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2 mb-3">
                            <div>
                              <p className="font-bold text-gray-900">{opt.name}</p>
                              {opt.description && <p className="text-xs text-gray-500 mt-0.5">{opt.description}</p>}
                            </div>
                            {isSelected && <CheckCircle2 className="text-brand-500 flex-shrink-0" size={22} />}
                          </div>
                          <div className="space-y-1.5 mb-3">
                            {opt.items.map(item => (
                              <div key={item.productId} className="flex items-center justify-between text-sm">
                                <span className="text-gray-700">{item.productName}</span>
                                <span className="text-gray-500 font-medium">×{item.quantity}</span>
                              </div>
                            ))}
                          </div>
                          <div className="pt-2.5 border-t border-gray-100 flex items-center justify-between">
                            <span className="text-xs text-gray-400">{opt.items.length} productos</span>
                            <span className="font-bold text-brand-600">{money(optTotal)}</span>
                          </div>
                        </button>
                      )
                    })}
                  </div>
                )}

                {selectedOptionId && cartItems.length > 0 && (
                  <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                    <h3 className="font-bold text-gray-900 mb-3 flex items-center gap-2">
                      <CheckCircle2 size={18} className="text-green-500" /> Paquete seleccionado
                    </h3>
                    <div className="space-y-2">
                      {cartItems.map(it => (
                        <div key={it.product.id} className="flex items-center justify-between text-sm">
                          <span className="text-gray-700">{it.product.name}</span>
                          <div className="flex items-center gap-3">
                            <span className="text-gray-400">×{it.quantity}</span>
                            <span className="font-semibold text-gray-800">{money(it.product.basePrice * it.quantity)}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="mt-3 pt-3 border-t flex items-center justify-between">
                      <span className="font-bold text-gray-700">Total</span>
                      <span className="text-lg font-extrabold text-brand-600">{money(cartTotal)}</span>
                    </div>
                  </div>
                )}

                <div className="flex items-center justify-between">
                  <button onClick={() => setStep(1)} className="px-5 py-3 rounded-xl border-2 border-gray-200 text-gray-700 font-semibold flex items-center gap-2 hover:border-brand-300">
                    <ArrowLeft size={18} /> Atrás
                  </button>
                  <button
                    onClick={goStep3}
                    disabled={!selectedOptionId || cartItems.length === 0}
                    className="px-6 py-3 rounded-xl bg-brand-500 text-white font-bold hover:bg-brand-600 flex items-center gap-2 disabled:opacity-50"
                  >
                    Continuar <ArrowRight size={18} />
                  </button>
                </div>
              </div>
            ) : (
              /* Optional: packages at top + free product browsing */
              <div>
                {!loadingOptions && programOptions.length > 0 && (
                  <div className="mb-6">
                    <p className="text-sm font-bold text-gray-700 mb-3 flex items-center gap-2">
                      <Package size={16} className="text-brand-500" /> Paquetes sugeridos
                      <span className="text-xs font-normal text-gray-400 ml-1">— haz clic para pre-llenar el carrito</span>
                    </p>
                    <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                      {programOptions.map(opt => {
                        const isSelected = selectedOptionId === opt.id
                        const optTotal = opt.items.reduce((s, i) => s + i.basePrice * i.quantity, 0)
                        return (
                          <button
                            key={opt.id}
                            type="button"
                            onClick={() => selectOption(opt)}
                            className={`text-left rounded-xl border-2 p-4 transition-all ${
                              isSelected ? 'border-brand-500 bg-brand-50' : 'border-gray-100 bg-white hover:border-brand-200'
                            }`}
                          >
                            <div className="flex items-center justify-between mb-2">
                              <p className="font-semibold text-gray-900 text-sm">{opt.name}</p>
                              {isSelected && <CheckCircle2 className="text-brand-500" size={16} />}
                            </div>
                            <p className="text-xs text-gray-400">{opt.items.length} productos</p>
                            <p className="text-sm font-bold text-brand-600 mt-1">{money(optTotal)}</p>
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )}

                <div className="grid lg:grid-cols-3 gap-6">
                  <div className="lg:col-span-2 space-y-4">
                    <div className="relative">
                      <Search size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
                      <input
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        placeholder="Buscar productos…"
                        className="w-full pl-11 pr-4 py-3 rounded-xl border border-gray-200 focus:border-brand-400 focus:ring-2 focus:ring-brand-100 outline-none"
                      />
                    </div>

                    {categories.length > 0 && (
                      <div className="flex gap-2 overflow-x-auto pb-1">
                        <button onClick={() => setActiveCategory('')} className={`px-3.5 py-1.5 rounded-full text-sm font-medium whitespace-nowrap ${activeCategory === '' ? 'bg-brand-500 text-white' : 'bg-white border border-gray-200 text-gray-600'}`}>
                          Todas
                        </button>
                        {categories.map(c => (
                          <button key={c.id} onClick={() => setActiveCategory(c.id)} className={`px-3.5 py-1.5 rounded-full text-sm font-medium whitespace-nowrap ${activeCategory === c.id ? 'bg-brand-500 text-white' : 'bg-white border border-gray-200 text-gray-600'}`}>
                            {c.name}
                          </button>
                        ))}
                      </div>
                    )}

                    {loadingProducts ? (
                      <div className="flex items-center justify-center h-48">
                        <div className="w-7 h-7 border-4 border-brand-500 border-t-transparent rounded-full animate-spin" />
                      </div>
                    ) : products.length === 0 ? (
                      <div className="bg-white rounded-2xl border border-gray-100 p-10 text-center text-gray-500">
                        <PackageSearch size={40} className="mx-auto text-gray-300 mb-3" />
                        No se encontraron productos.
                      </div>
                    ) : (
                      <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-3">
                        {products.map(p => {
                          const inCart = cart[p.id]
                          return (
                            <div key={p.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex flex-col">
                              <div className="h-24 rounded-xl bg-gradient-to-br from-brand-50 to-amber-50 flex items-center justify-center mb-3 overflow-hidden">
                                {p.imageUrl ? <img src={p.imageUrl} alt={p.name} className="h-full w-full object-cover" /> : <span className="text-3xl">📦</span>}
                              </div>
                              <p className="font-semibold text-gray-900 text-sm leading-snug line-clamp-2">{p.name}</p>
                              {p.brand && <p className="text-xs text-gray-400 mt-0.5">{p.brand}</p>}
                              <p className="mt-auto pt-2 font-bold text-brand-600">{money(p.basePrice)}</p>
                              {inCart ? (
                                <div className="mt-2 flex items-center justify-between bg-brand-50 rounded-xl p-1">
                                  <button onClick={() => setQty(p.id, inCart.quantity - 1)} className="w-8 h-8 rounded-lg bg-white text-brand-600 flex items-center justify-center shadow-sm"><Minus size={15} /></button>
                                  <span className="font-bold text-gray-800">{inCart.quantity}</span>
                                  <button onClick={() => setQty(p.id, inCart.quantity + 1)} className="w-8 h-8 rounded-lg bg-white text-brand-600 flex items-center justify-center shadow-sm"><Plus size={15} /></button>
                                </div>
                              ) : (
                                <button onClick={() => addToCart(p)} className="mt-2 w-full py-2 rounded-xl bg-brand-500 text-white text-sm font-semibold hover:bg-brand-600 flex items-center justify-center gap-1.5">
                                  <Plus size={15} /> Agregar
                                </button>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>

                  <div className="hidden lg:block">
                    <div className="sticky top-24">
                      <CartPanel
                        items={cartItems}
                        total={cartTotal}
                        limit={effectiveLimit}
                        overLimit={overLimit}
                        limitPerStudent={limitPerStudent}
                        totalStudents={totalStudents}
                        onQty={setQty}
                        onContinue={goStep3}
                      />
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between mt-6">
                  <button onClick={() => setStep(1)} className="px-5 py-3 rounded-xl border-2 border-gray-200 text-gray-700 font-semibold flex items-center gap-2 hover:border-brand-300">
                    <ArrowLeft size={18} /> Atrás
                  </button>
                  <button onClick={() => setCartOpen(true)} className="lg:hidden relative px-5 py-3 rounded-xl bg-brand-500 text-white font-semibold flex items-center gap-2">
                    <ShoppingCart size={18} /> {money(cartTotal)}
                    {cartItems.length > 0 && (
                      <span className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-gray-900 text-white text-xs flex items-center justify-center">{cartItems.length}</span>
                    )}
                  </button>
                  <button onClick={goStep3} className="hidden lg:flex px-6 py-3 rounded-xl bg-brand-500 text-white font-bold hover:bg-brand-600 items-center gap-2">
                    Continuar <ArrowRight size={18} />
                  </button>
                </div>

                <AnimatePresence>
                  {cartOpen && (
                    <>
                      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setCartOpen(false)} className="fixed inset-0 bg-black/40 z-40 lg:hidden" />
                      <motion.div
                        initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
                        transition={{ type: 'spring', damping: 30, stiffness: 300 }}
                        className="fixed inset-x-0 bottom-0 z-50 lg:hidden bg-white rounded-t-3xl p-5 max-h-[80vh] overflow-y-auto"
                      >
                        <div className="flex items-center justify-between mb-3">
                          <h3 className="font-bold text-gray-900">Tu pedido</h3>
                          <button onClick={() => setCartOpen(false)}><X size={22} className="text-gray-400" /></button>
                        </div>
                        <CartPanel items={cartItems} total={cartTotal} limit={effectiveLimit} overLimit={overLimit} limitPerStudent={limitPerStudent} totalStudents={totalStudents} onQty={setQty} onContinue={() => { setCartOpen(false); goStep3() }} bare />
                      </motion.div>
                    </>
                  )}
                </AnimatePresence>
              </div>
            )}
          </motion.div>
        )}

        {/* ── STEP 3 ── */}
        {step === 3 && (
          <motion.div key="s3" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="max-w-2xl mx-auto space-y-6">
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
              <h2 className="font-bold text-gray-900 mb-4">Resumen del pedido</h2>
              <dl className="grid grid-cols-2 gap-y-2 text-sm mb-5">
                <dt className="text-gray-500">Escuela</dt>
                <dd className="text-gray-900 font-medium text-right">{selectedSchool?.school.name}</dd>
                {selectedSchool?.educationalLevel && (
                  <>
                    <dt className="text-gray-500">Nivel</dt>
                    <dd className="text-gray-900 font-medium text-right">{LEVEL_LABELS[selectedSchool.educationalLevel] ?? selectedSchool.educationalLevel}</dd>
                  </>
                )}
                <dt className="text-gray-500">Programa</dt>
                <dd className="text-gray-900 font-medium text-right">{programIcon(programType)} {programLabel(programType)}</dd>
                <dt className="text-gray-500">Total alumnos</dt>
                <dd className="text-gray-900 font-medium text-right">{totalStudents}</dd>
              </dl>

              {/* Grade breakdown summary */}
              <div className="mb-4 p-3 bg-gray-50 rounded-xl">
                <p className="text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wide">Grados</p>
                <div className="space-y-1">
                  {grades.filter(g => g.gradeName && g.studentCount).map((g, i) => (
                    <div key={i} className="flex items-center justify-between text-sm">
                      <span className="text-gray-700">{g.gradeName}</span>
                      <span className="text-gray-500 font-medium">{g.studentCount} alumnos</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="divide-y divide-gray-100 border-t border-gray-100">
                {cartItems.map(it => (
                  <div key={it.product.id} className="flex items-center justify-between py-2.5 text-sm">
                    <div>
                      <p className="text-gray-800 font-medium">{it.product.name}</p>
                      <p className="text-gray-400 text-xs">{it.quantity} × {money(it.product.basePrice)}</p>
                    </div>
                    <p className="font-semibold text-gray-900">{money(it.product.basePrice * it.quantity)}</p>
                  </div>
                ))}
              </div>
              <div className="flex items-center justify-between mt-4 pt-4 border-t border-gray-200">
                <span className="font-bold text-gray-900">Total</span>
                <span className="text-xl font-extrabold text-brand-600">{money(cartTotal)}</span>
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
              <label className="block text-sm font-bold text-gray-700 mb-2">
                Comentarios{grades.length > 1 ? <span className="text-red-500 ml-1">*</span> : ' (opcional)'}
              </label>
              {grades.length > 1 && (
                <p className="text-xs text-amber-700 mb-2">Requerido porque el pedido cubre más de un grado.</p>
              )}
              <textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
                rows={3}
                placeholder="Instrucciones o comentarios para el proveedor…"
                className={`w-full px-4 py-3 rounded-xl border focus:ring-2 focus:ring-brand-100 outline-none resize-none ${
                  grades.length > 1 && !notes.trim() ? 'border-red-300 focus:border-red-400' : 'border-gray-200 focus:border-brand-400'
                }`}
              />
            </div>

            <div className="flex items-center justify-between">
              <button onClick={() => setStep(2)} className="px-5 py-3 rounded-xl border-2 border-gray-200 text-gray-700 font-semibold flex items-center gap-2 hover:border-brand-300">
                <ArrowLeft size={18} /> Atrás
              </button>
              <button onClick={submit} disabled={submitting} className="px-6 py-3 rounded-xl bg-brand-500 text-white font-bold hover:bg-brand-600 flex items-center gap-2 disabled:opacity-60">
                {submitting ? <span className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <>Enviar Solicitud <Check size={18} /></>}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Success modal */}
      <AnimatePresence>
        {created && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
            <motion.div initial={{ opacity: 0, scale: 0.92 }} animate={{ opacity: 1, scale: 1 }} className="bg-white rounded-3xl shadow-2xl p-8 max-w-sm w-full text-center">
              <div className="w-16 h-16 rounded-full bg-green-100 text-green-600 flex items-center justify-center mx-auto mb-4">
                <CheckCircle2 size={36} />
              </div>
              <h3 className="text-xl font-extrabold text-gray-900">¡Solicitud enviada!</h3>
              <p className="text-gray-500 mt-2 text-sm">Tu pedido fue recibido y está en revisión por el proveedor.</p>
              <p className="mt-4 inline-block px-4 py-2 rounded-xl bg-gray-100 font-mono font-bold text-gray-700">{created.orderNumber}</p>
              <button onClick={() => navigate('/orders')} className="mt-6 w-full py-3 rounded-xl bg-brand-500 text-white font-bold hover:bg-brand-600">
                Ver mis pedidos
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </PortalLayout>
  )
}

function CartPanel({
  items, total, limit, overLimit, limitPerStudent, totalStudents, onQty, onContinue, bare,
}: {
  items: CartItem[]
  total: number
  limit: number | null
  overLimit: boolean
  limitPerStudent: number | null
  totalStudents: number
  onQty: (id: string, q: number) => void
  onContinue: () => void
  bare?: boolean
}) {
  const inner = (
    <>
      {!bare && (
        <h3 className="font-bold text-gray-900 mb-3 flex items-center gap-2"><ShoppingCart size={18} className="text-brand-500" /> Tu pedido</h3>
      )}
      {items.length === 0 ? (
        <p className="text-sm text-gray-400 py-6 text-center">Aún no has agregado productos.</p>
      ) : (
        <div className="space-y-2.5 max-h-72 overflow-y-auto">
          {items.map(it => (
            <div key={it.product.id} className="flex items-center gap-2 text-sm">
              <div className="flex-1 min-w-0">
                <p className="text-gray-800 font-medium truncate">{it.product.name}</p>
                <p className="text-gray-400 text-xs">{money(it.product.basePrice)}</p>
              </div>
              <div className="flex items-center gap-1.5">
                <button onClick={() => onQty(it.product.id, it.quantity - 1)} className="w-7 h-7 rounded-lg bg-gray-100 text-gray-600 flex items-center justify-center"><Minus size={13} /></button>
                <span className="w-6 text-center font-semibold">{it.quantity}</span>
                <button onClick={() => onQty(it.product.id, it.quantity + 1)} className="w-7 h-7 rounded-lg bg-gray-100 text-gray-600 flex items-center justify-center"><Plus size={13} /></button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="mt-4 pt-3 border-t border-gray-100">
        <div className="flex items-center justify-between">
          <span className="text-gray-600 font-medium">Total</span>
          <span className="text-lg font-extrabold text-gray-900">{money(total)}</span>
        </div>
        {limitPerStudent != null && totalStudents > 0 && (
          <p className="text-xs text-gray-400 mt-1">Límite: {money(limitPerStudent)} × {totalStudents} alumnos = {money(limitPerStudent * totalStudents)}</p>
        )}
        {limit != null && limitPerStudent == null && (
          <p className="text-xs text-gray-400 mt-1">Límite del programa: {money(limit)}</p>
        )}
        {overLimit && (
          <div className="mt-3 flex items-start gap-2 rounded-xl bg-orange-50 border border-orange-200 text-orange-700 text-xs px-3 py-2">
            <AlertTriangle size={15} className="flex-shrink-0 mt-0.5" />
            El total supera el límite permitido.
          </div>
        )}
        <button
          onClick={onContinue}
          disabled={items.length === 0 || overLimit}
          className="mt-4 w-full py-3 rounded-xl bg-brand-500 text-white font-bold hover:bg-brand-600 flex items-center justify-center gap-2 disabled:opacity-50"
        >
          Continuar <ArrowRight size={18} />
        </button>
      </div>
    </>
  )

  if (bare) return inner
  return <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">{inner}</div>
}
