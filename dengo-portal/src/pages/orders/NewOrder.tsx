import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { toast } from 'sonner'
import {
  ArrowRight, ArrowLeft, Search, Plus, Minus, ShoppingCart, Check, AlertTriangle,
  School as SchoolIcon, X, PackageSearch, CheckCircle2, Package, Users, Trash2, Lock, RotateCcw,
} from 'lucide-react'
import PortalLayout from '../../components/layout/PortalLayout'
import { api } from '../../lib/api'
import type { GradeRow } from '../../lib/api'
import type { Program, Product, Category, TeacherSchoolAssignment, PortalOrder, ProgramOption, BlockedProgram } from '../../types'
import { programLabel, programIcon, money } from '../../lib/labels'

interface CartItem {
  product: Product
  quantity: number
}
type GradeDraft = { gradeName: string; studentCount: string }

// One question per screen: teachers asked for small, obvious steps.
const STEPS = ['Escuela', 'Programa', 'Alumnos', 'Productos', 'Confirmar']
const MANDATORY_OPTION_TYPES = ['FOOD_PACKAGE', 'SCHOOL_SUPPLIES']

const LEVEL_LABELS: Record<string, string> = {
  CEIN_PAIN: 'CEIN / PAIN',
  PREPRIMARIA: 'Pre-primaria',
  PRIMARIA: 'Primaria',
  BASICO: 'Básico',
  DIVERSIFICADO: 'Diversificado',
}

// ── Draft: an unfinished order survives closing the tab or losing signal ──
interface Draft {
  v: 1
  step: number
  schoolId: string
  programType: string
  grades: GradeDraft[]
  cart: Record<string, CartItem>
  selectedOptionId: string | null
  notes: string
  savedAt: number
}
const DRAFT_TTL = 30 * 24 * 3600 * 1000
const draftKey = (userId: string) => `portal-order-draft:${userId}`
function readDraft(userId: string): Draft | null {
  try {
    const raw = localStorage.getItem(draftKey(userId))
    if (!raw) return null
    const d = JSON.parse(raw) as Draft
    if (d.v !== 1 || Date.now() - d.savedAt > DRAFT_TTL) return null
    return d
  } catch { return null }
}
function clearDraft(userId: string) {
  try { localStorage.removeItem(draftKey(userId)) } catch { /* storage blocked */ }
}

export default function NewOrder() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [step, setStep] = useState(1)

  const [userId, setUserId] = useState('')
  const [schools, setSchools] = useState<TeacherSchoolAssignment[]>([])
  const [programs, setPrograms] = useState<Program[]>([])
  const [blocked, setBlocked] = useState<BlockedProgram[]>([])
  const [loadingInit, setLoadingInit] = useState(true)
  const [restored, setRestored] = useState(false)

  const [schoolId, setSchoolId] = useState('')
  const [programType, setProgramType] = useState('')
  const [grades, setGrades] = useState<GradeDraft[]>([{ gradeName: '', studentCount: '' }])

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

  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [created, setCreated] = useState<PortalOrder | null>(null)

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const isMandatory = MANDATORY_OPTION_TYPES.includes(programType)

  useEffect(() => {
    api.getMe()
      .then(me => {
        const list = me.teacher?.schools ?? []
        setUserId(me.id)
        setSchools(list)
        setPrograms(me.programs ?? [])
        setBlocked(me.blockedPrograms ?? [])

        const draft = readDraft(me.id)
        const draftStillValid = draft
          && list.some(s => s.id === draft.schoolId)
          && (!draft.programType || (me.programs ?? []).some(p => p.type === draft.programType))
        if (draft && draftStillValid && !searchParams.get('school')) {
          setSchoolId(draft.schoolId)
          setProgramType(draft.programType)
          setGrades(draft.grades.length ? draft.grades : [{ gradeName: '', studentCount: '' }])
          setCart(draft.cart)
          setSelectedOptionId(draft.selectedOptionId)
          setNotes(draft.notes)
          setStep(Math.min(Math.max(draft.step, 1), 5))
          setRestored(true)
          return
        }
        // Coming from a school's "Hacer pedido" on the dashboard, or the
        // teacher only has one school: don't make them pick it again.
        const wanted = searchParams.get('school')
        const initial = list.find(s => s.id === wanted) ?? (list.length === 1 ? list[0] : undefined)
        if (initial) {
          pickSchool(initial.id, list)
          setStep(2)
        }
      })
      .catch(e => toast.error(e instanceof Error ? e.message : 'Error al cargar'))
      .finally(() => setLoadingInit(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Save the draft on every change (nothing to save before a school is chosen).
  useEffect(() => {
    if (!userId || created || !schoolId) return
    const draft: Draft = { v: 1, step, schoolId, programType, grades, cart, selectedOptionId, notes, savedAt: Date.now() }
    try { localStorage.setItem(draftKey(userId), JSON.stringify(draft)) } catch { /* storage blocked */ }
  }, [userId, created, step, schoolId, programType, grades, cart, selectedOptionId, notes])

  const startOver = () => {
    clearDraft(userId)
    setRestored(false)
    setProgramType('')
    setGrades([{ gradeName: '', studentCount: '' }])
    setCart({})
    setSelectedOptionId(null)
    setNotes('')
    if (schools.length === 1) { pickSchool(schools[0]!.id); setStep(2) } else { setSchoolId(''); setStep(1) }
  }

  // Choosing a school pre-fills the first grade row with the grade/section
  // the teacher is assigned there, unless they already typed something.
  const pickSchool = (id: string, list: TeacherSchoolAssignment[] = schools) => {
    if (id !== schoolId) {
      // A different school may not allow the chosen program (gratuity).
      setProgramType('')
      setCart({})
      setSelectedOptionId(null)
    }
    setSchoolId(id)
    const a = list.find(s => s.id === id)
    const label = [a?.grade, a?.section].filter(Boolean).join(' ')
    if (label) setGrades(g => (g.length === 1 && !g[0]!.gradeName.trim() ? [{ ...g[0]!, gradeName: label }] : g))
  }

  const pickProgram = (type: string) => {
    if (type !== programType) {
      setCart({})
      setSelectedOptionId(null)
      setSearch('')
      setActiveCategory('')
    }
    setProgramType(type)
    setStep(3)
  }

  const selectedSchool = schools.find(s => s.id === schoolId)
  const selectedProgram = programs.find(p => p.type === programType)
  const kitMode = !!selectedProgram?.perStudent
  const totalStudents = grades.reduce((s, g) => s + (Number(g.studentCount) || 0), 0)
  const blockedFor = (type: string) => blocked.find(b => b.programType === type && b.schoolId === selectedSchool?.school.id)

  // ── Load packages + categories on the products step ──
  useEffect(() => {
    if (step !== 4 || !programType) return
    const level = selectedSchool?.educationalLevel || undefined
    setLoadingOptions(true)
    api.getProgramOptions(programType, level)
      .then(setProgramOptions)
      .catch(() => setProgramOptions([]))
      .finally(() => setLoadingOptions(false))
    if (!MANDATORY_OPTION_TYPES.includes(programType)) {
      api.getCategories(programType).then(setCategories).catch(() => setCategories([]))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, programType])

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
    if (step !== 4 || isMandatory) return
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
        product: { id: item.productId, name: item.productName, basePrice: item.basePrice, imageUrl: item.imageUrl ?? undefined },
        quantity: item.quantity,
      }
    }
    setCart(newCart)
  }

  const cartItems = useMemo(() => Object.values(cart), [cart])
  // In kit mode the cart is ONE student's kit.
  const cartTotal = useMemo(() => cartItems.reduce((s, it) => s + it.product.basePrice * it.quantity, 0), [cartItems])
  const orderTotal = kitMode ? cartTotal * totalStudents : cartTotal

  const limitPerStudent = selectedProgram?.limitPerStudent ?? null
  const maxPerTeacher = selectedProgram?.maxAmountPerTeacher ?? null
  // What the budget bar measures against: the kit vs the amount per student,
  // or the whole order vs the program's limit.
  const budget = useMemo(() => {
    if (kitMode) return limitPerStudent != null ? { used: cartTotal, limit: limitPerStudent, label: 'Kit de 1 alumno' } : null
    const byStudents = limitPerStudent != null && totalStudents > 0 ? limitPerStudent * totalStudents : null
    const limit = byStudents != null && (maxPerTeacher == null || byStudents < maxPerTeacher) ? byStudents : maxPerTeacher
    return limit != null ? { used: cartTotal, limit, label: 'Tu pedido' } : null
  }, [kitMode, limitPerStudent, maxPerTeacher, cartTotal, totalStudents])
  const overTeacherCap = maxPerTeacher != null && orderTotal > maxPerTeacher + 0.001
  const overLimit = (budget != null && budget.used > budget.limit + 0.001) || overTeacherCap

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

  const addGrade = () => setGrades(g => [...g, { gradeName: '', studentCount: '' }])
  const removeGrade = (i: number) => setGrades(g => g.filter((_, idx) => idx !== i))
  const updateGrade = (i: number, field: 'gradeName' | 'studentCount', value: string) => {
    setGrades(g => g.map((row, idx) => idx === i ? { ...row, [field]: value } : row))
  }

  // ── Step navigation ──
  const goProducts = () => {
    const validGrades = grades.filter(g => g.gradeName.trim() && Number(g.studentCount) > 0)
    if (validGrades.length === 0) return toast.error('Escribe el grado y cuántos alumnos tiene')
    if (grades.some(g => !g.gradeName.trim() || !Number(g.studentCount))) return toast.error('Completa el nombre y los alumnos de cada grado, o borra la fila vacía')
    setStep(4)
  }
  const goConfirm = () => {
    if (isMandatory && !selectedOptionId) return toast.error('Elige uno de los paquetes')
    if (cartItems.length === 0) return toast.error('Agrega al menos un producto')
    if (overLimit) return toast.error(kitMode ? 'El kit pasa del monto por alumno. Quita algún producto.' : 'El pedido pasa del límite. Quita algún producto.')
    setStep(5)
  }

  const submit = async () => {
    if (!selectedSchool) return
    const validGrades: GradeRow[] = grades
      .filter(g => g.gradeName.trim() && Number(g.studentCount) > 0)
      .map(g => ({ gradeName: g.gradeName.trim(), studentCount: Number(g.studentCount) }))
    if (validGrades.length > 1 && !notes.trim()) {
      return toast.error('Escribe un comentario: es obligatorio cuando el pedido cubre más de un grado')
    }
    setSubmitting(true)
    try {
      const order = await api.createOrder({
        schoolId: selectedSchool.school.id,
        educationalLevel: selectedSchool.educationalLevel || undefined,
        programType,
        grades: validGrades,
        notes: notes || undefined,
        items: cartItems.map(it => ({ productId: it.product.id, quantity: it.quantity })),
      })
      clearDraft(userId)
      setCreated(order)
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

  const stepAnim = { initial: { opacity: 0, x: 20 }, animate: { opacity: 1, x: 0 }, exit: { opacity: 0, x: -20 } }
  const backBtn = (to: number) => (
    <button onClick={() => setStep(to)} className="px-5 py-3 rounded-xl border-2 border-gray-200 text-gray-700 font-semibold flex items-center gap-2 hover:border-brand-300">
      <ArrowLeft size={18} /> Atrás
    </button>
  )
  const leftover = budget ? budget.limit - budget.used : 0

  return (
    <PortalLayout>
      {/* Progress */}
      <div className="mb-6">
        <h1 className="text-2xl font-extrabold text-gray-900 mb-1">Nuevo Pedido</h1>
        <p className="text-sm text-gray-500 mb-4 sm:hidden">Paso {step} de {STEPS.length}: <strong className="text-gray-800">{STEPS[step - 1]}</strong></p>
        <div className="flex items-center">
          {STEPS.map((label, i) => {
            const n = i + 1
            const done = step > n
            const active = step === n
            return (
              <div key={label} className="flex items-center flex-1 last:flex-none">
                <button
                  type="button"
                  disabled={!done}
                  onClick={() => setStep(n)}
                  className="flex items-center gap-2 disabled:cursor-default"
                  aria-current={active ? 'step' : undefined}
                >
                  <span className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm transition-colors ${
                    done ? 'bg-green-500 text-white' : active ? 'bg-brand-500 text-white' : 'bg-gray-200 text-gray-500'
                  }`}>
                    {done ? <Check size={15} /> : n}
                  </span>
                  <span className={`text-sm font-medium hidden md:block ${active ? 'text-gray-900' : 'text-gray-400'}`}>{label}</span>
                </button>
                {n < STEPS.length && <div className={`flex-1 h-0.5 mx-2 ${done ? 'bg-green-500' : 'bg-gray-200'}`} />}
              </div>
            )
          })}
        </div>
      </div>

      {restored && step < 5 && (
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-brand-50 border border-brand-100 px-4 py-3 text-sm text-brand-800">
          <span>Seguimos con el pedido que dejaste sin terminar.</span>
          <button onClick={startOver} className="flex items-center gap-1.5 font-semibold text-brand-700 hover:underline">
            <RotateCcw size={14} /> Empezar de nuevo
          </button>
        </div>
      )}

      <AnimatePresence mode="wait">
        {/* ── 1. School ── */}
        {step === 1 && (
          <motion.div key="s1" {...stepAnim} className="space-y-4">
            <StepTitle title="¿Para qué escuela es el pedido?" hint="Toca tu escuela para seguir." />
            {schools.length === 0 ? (
              <p className="bg-white rounded-2xl border border-gray-100 p-6 text-sm text-gray-500">No tienes escuelas asignadas. Escríbele al proveedor para que te asigne una.</p>
            ) : (
              <div className="grid sm:grid-cols-2 gap-3">
                {schools.map(s => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => { pickSchool(s.id); setStep(2) }}
                    className={`text-left rounded-2xl border-2 p-5 bg-white transition-all flex items-start gap-3 ${schoolId === s.id ? 'border-brand-500 bg-brand-50' : 'border-gray-100 hover:border-brand-200'}`}
                  >
                    <SchoolIcon size={22} className="text-brand-500 flex-shrink-0 mt-0.5" />
                    <span className="flex-1">
                      <span className="block font-bold text-gray-900">{s.school.name}</span>
                      <span className="block text-sm text-gray-500 mt-0.5">
                        {[s.educationalLevel && (LEVEL_LABELS[s.educationalLevel] ?? s.educationalLevel), s.grade, s.section, s.school.municipio].filter(Boolean).join(' · ')}
                      </span>
                    </span>
                    <ArrowRight size={18} className="text-gray-300 mt-1" />
                  </button>
                ))}
              </div>
            )}
          </motion.div>
        )}

        {/* ── 2. Program ── */}
        {step === 2 && (
          <motion.div key="s2" {...stepAnim} className="space-y-4">
            <StepTitle title="¿Qué programa vas a pedir?" hint={selectedSchool ? `Para ${selectedSchool.school.name}.` : undefined} />
            {programs.length === 0 ? (
              <p className="bg-white rounded-2xl border border-gray-100 p-6 text-sm text-gray-500">Ahora no hay programas abiertos. El proveedor te avisará cuando abra uno.</p>
            ) : (
              <div className="grid sm:grid-cols-2 gap-3">
                {programs.map(p => {
                  const taken = blockedFor(p.type)
                  return (
                    <button
                      key={p.id}
                      type="button"
                      disabled={!!taken}
                      onClick={() => pickProgram(p.type)}
                      className={`text-left rounded-2xl border-2 p-5 bg-white transition-all disabled:opacity-60 disabled:cursor-not-allowed ${
                        programType === p.type ? 'border-brand-500 bg-brand-50' : 'border-gray-100 hover:border-brand-200'
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <div className="text-3xl">{programIcon(p.type)}</div>
                        <div className="flex-1">
                          <p className="font-bold text-gray-900">{p.name || programLabel(p.type)}</p>
                          {p.description && <p className="text-sm text-gray-500 mt-0.5 leading-relaxed">{p.description}</p>}
                          {p.limitPerStudent != null && (
                            <p className="mt-2 text-sm font-semibold text-emerald-700">{money(p.limitPerStudent)} por alumno</p>
                          )}
                          {p.maxAmountPerTeacher != null && (
                            <p className="mt-1 text-sm font-semibold text-brand-700">Hasta {money(p.maxAmountPerTeacher)} {p.perStudent ? 'en total' : 'por maestro'}</p>
                          )}
                          {p.perStudent && <p className="mt-1 text-xs text-gray-500">Armas el kit de un alumno y lo multiplicamos por tus alumnos.</p>}
                          {taken && (
                            <p className="mt-2 text-xs font-medium text-gray-600 flex items-center gap-1.5">
                              <Lock size={12} /> Esta escuela ya tiene su pedido de este año ({taken.orderNumber}).
                            </p>
                          )}
                        </div>
                      </div>
                    </button>
                  )
                })}
              </div>
            )}
            <div className="flex">{backBtn(1)}</div>
          </motion.div>
        )}

        {/* ── 3. Students ── */}
        {step === 3 && (
          <motion.div key="s3" {...stepAnim} className="space-y-4 max-w-2xl">
            <StepTitle
              title="¿Cuántos alumnos tienes?"
              hint={grades.length > 1 ? 'Escribe cada grado y su número de alumnos.' : 'Escribe tu grado y cuántos alumnos tiene. Si el pedido es para varios grados, agrega otra fila.'}
            />
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-3">
              <div className="grid grid-cols-[1fr_6rem_2rem] gap-2 text-xs text-gray-500 font-medium px-1">
                <span>Grado y sección</span>
                <span className="text-center">Alumnos</span>
                <span />
              </div>
              {grades.map((g, i) => (
                <div key={i} className="grid grid-cols-[1fr_6rem_2rem] gap-2 items-center">
                  <input
                    value={g.gradeName}
                    onChange={e => updateGrade(i, 'gradeName', e.target.value)}
                    placeholder="Ej: Tercero A"
                    aria-label={`Grado ${i + 1}`}
                    className="px-3 py-3 rounded-xl border border-gray-200 focus:border-brand-400 focus:ring-2 focus:ring-brand-100 outline-none"
                  />
                  <input
                    type="number"
                    inputMode="numeric"
                    min={1}
                    value={g.studentCount}
                    onChange={e => updateGrade(i, 'studentCount', e.target.value)}
                    placeholder="0"
                    aria-label={`Alumnos del grado ${i + 1}`}
                    className="px-3 py-3 rounded-xl border border-gray-200 focus:border-brand-400 focus:ring-2 focus:ring-brand-100 outline-none text-center text-lg font-semibold"
                  />
                  <button
                    type="button"
                    onClick={() => removeGrade(i)}
                    disabled={grades.length === 1}
                    aria-label="Quitar grado"
                    className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 disabled:opacity-20 disabled:cursor-not-allowed"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={addGrade}
                className="w-full py-2.5 rounded-xl border-2 border-dashed border-gray-200 text-sm text-gray-500 hover:border-brand-400 hover:text-brand-600 flex items-center justify-center gap-1.5"
              >
                <Plus size={15} /> Agregar otro grado
              </button>
            </div>

            {totalStudents > 0 && (
              <div className="rounded-2xl bg-emerald-50 border border-emerald-100 p-4 text-emerald-900">
                <p className="flex items-center gap-2 font-semibold"><Users size={18} /> {totalStudents} alumnos en total</p>
                {limitPerStudent != null && (
                  <p className="text-sm mt-1">
                    {money(limitPerStudent)} por alumno × {totalStudents} = <strong>{money(limitPerStudent * totalStudents)}</strong> para el pedido.
                  </p>
                )}
                {kitMode && <p className="text-sm mt-1">En el siguiente paso armas el kit de <strong>un</strong> alumno; nosotros lo preparamos {totalStudents} veces.</p>}
              </div>
            )}

            <div className="flex items-center justify-between">
              {backBtn(2)}
              <button onClick={goProducts} className="px-6 py-3 rounded-xl bg-brand-500 text-white font-bold hover:bg-brand-600 flex items-center gap-2">
                Continuar <ArrowRight size={18} />
              </button>
            </div>
          </motion.div>
        )}

        {/* ── 4. Products ── */}
        {step === 4 && (
          <motion.div key="s4" {...stepAnim} className="pb-28 lg:pb-0">
            <StepTitle
              title={kitMode ? 'Arma el kit de un alumno' : isMandatory ? 'Elige un paquete' : 'Elige los productos'}
              hint={kitMode
                ? `Pon lo que lleva UN alumno. Al final lo multiplicamos por tus ${totalStudents} alumnos.`
                : isMandatory ? 'El proveedor prepara exactamente lo que trae el paquete.' : 'Toca "Agregar" en cada producto que necesitas.'}
            />

            {budget && (
              <div className="mb-5 hidden lg:block">
                <BudgetBar used={budget.used} limit={budget.limit} label={budget.label} kitMode={kitMode} totalStudents={totalStudents} orderTotal={orderTotal} />
              </div>
            )}

            {isMandatory ? (
              <div className="space-y-5">
                {loadingOptions ? (
                  <Spinner />
                ) : programOptions.length === 0 ? (
                  <div className="bg-white rounded-2xl border border-gray-100 p-10 text-center text-gray-500">
                    <Package size={40} className="mx-auto text-gray-300 mb-3" />
                    <p>El proveedor aún no ha creado paquetes para este programa.</p>
                    <p className="text-xs mt-1">Escríbele desde Mensajes para más información.</p>
                  </div>
                ) : (
                  <div className="grid sm:grid-cols-2 gap-4">
                    {programOptions.map(opt => {
                      const isSelected = selectedOptionId === opt.id
                      const optTotal = opt.items.reduce((s, i) => s + i.basePrice * i.quantity, 0)
                      const tooExpensive = kitMode && limitPerStudent != null && optTotal > limitPerStudent + 0.001
                      return (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() => selectOption(opt)}
                          className={`text-left rounded-2xl border-2 p-5 transition-all ${
                            isSelected ? 'border-brand-500 bg-brand-50' : 'border-gray-100 bg-white hover:border-brand-200'
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
                            <span className="text-xs text-gray-400">{kitMode ? 'por alumno' : `${opt.items.length} productos`}</span>
                            <span className={`font-bold ${tooExpensive ? 'text-red-600' : 'text-brand-600'}`}>{money(optTotal)}</span>
                          </div>
                          {tooExpensive && <p className="mt-2 text-xs text-red-600">Pasa del monto por alumno ({money(limitPerStudent!)}).</p>}
                        </button>
                      )
                    })}
                  </div>
                )}

                <div className="hidden lg:flex items-center justify-between">
                  {backBtn(3)}
                  <button onClick={goConfirm} disabled={!selectedOptionId || cartItems.length === 0 || overLimit} className="px-6 py-3 rounded-xl bg-brand-500 text-white font-bold hover:bg-brand-600 flex items-center gap-2 disabled:opacity-50">
                    Continuar <ArrowRight size={18} />
                  </button>
                </div>
              </div>
            ) : (
              <div>
                {!loadingOptions && programOptions.length > 0 && (
                  <div className="mb-6">
                    <p className="text-sm font-bold text-gray-700 mb-3 flex items-center gap-2">
                      <Package size={16} className="text-brand-500" /> Paquetes listos
                      <span className="text-xs font-normal text-gray-400">: tócalo para empezar con esos productos</span>
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
                            className={`text-left rounded-xl border-2 p-4 transition-all ${isSelected ? 'border-brand-500 bg-brand-50' : 'border-gray-100 bg-white hover:border-brand-200'}`}
                          >
                            <div className="flex items-center justify-between mb-1">
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
                        aria-label="Buscar productos"
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
                      <Spinner />
                    ) : products.length === 0 ? (
                      <div className="bg-white rounded-2xl border border-gray-100 p-10 text-center text-gray-500">
                        <PackageSearch size={40} className="mx-auto text-gray-300 mb-3" />
                        No se encontraron productos.
                      </div>
                    ) : (
                      <div className="grid grid-cols-2 xl:grid-cols-3 gap-3">
                        {products.map(p => {
                          const inCart = cart[p.id]
                          return (
                            <div key={p.id} className={`bg-white rounded-2xl border p-3 sm:p-4 flex flex-col ${inCart ? 'border-brand-300' : 'border-gray-100'}`}>
                              <div className="h-24 rounded-xl bg-gray-50 flex items-center justify-center mb-3 overflow-hidden">
                                {p.imageUrl ? <img loading="lazy" decoding="async" src={p.imageUrl} alt={p.name} className="h-full w-full object-cover" /> : <Package size={28} className="text-gray-300" />}
                              </div>
                              <p className="font-semibold text-gray-900 text-sm leading-snug line-clamp-2">{p.name}</p>
                              {p.brand && <p className="text-xs text-gray-400 mt-0.5">{p.brand}</p>}
                              <p className="mt-auto pt-2 font-bold text-brand-600">{money(p.basePrice)}</p>
                              {inCart ? (
                                <div className="mt-2 flex items-center justify-between bg-brand-50 rounded-xl p-1">
                                  <button onClick={() => setQty(p.id, inCart.quantity - 1)} aria-label="Quitar uno" className="w-9 h-9 rounded-lg bg-white text-brand-600 flex items-center justify-center shadow-sm"><Minus size={15} /></button>
                                  <span className="font-bold text-gray-800">{inCart.quantity}</span>
                                  <button onClick={() => setQty(p.id, inCart.quantity + 1)} aria-label="Agregar uno" className="w-9 h-9 rounded-lg bg-white text-brand-600 flex items-center justify-center shadow-sm"><Plus size={15} /></button>
                                </div>
                              ) : (
                                <button onClick={() => addToCart(p)} className="mt-2 w-full py-2.5 rounded-xl bg-brand-500 text-white text-sm font-semibold hover:bg-brand-600 flex items-center justify-center gap-1.5">
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
                      <CartPanel items={cartItems} total={cartTotal} kitMode={kitMode} overLimit={overLimit} onQty={setQty} onContinue={goConfirm} />
                    </div>
                  </div>
                </div>

                <div className="hidden lg:flex items-center justify-between mt-6">
                  {backBtn(3)}
                  <button onClick={goConfirm} className="px-6 py-3 rounded-xl bg-brand-500 text-white font-bold hover:bg-brand-600 flex items-center gap-2">
                    Continuar <ArrowRight size={18} />
                  </button>
                </div>
              </div>
            )}

            {/* Phone: budget + actions always under the thumb */}
            <div className="lg:hidden fixed inset-x-0 bottom-0 z-30 bg-white border-t border-gray-200 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] space-y-2.5">
              {budget && <BudgetBar compact used={budget.used} limit={budget.limit} label={budget.label} kitMode={kitMode} totalStudents={totalStudents} orderTotal={orderTotal} />}
              <div className="flex gap-2">
                <button onClick={() => setStep(3)} aria-label="Atrás" className="px-3 rounded-xl border-2 border-gray-200 text-gray-600"><ArrowLeft size={18} /></button>
                {!isMandatory && (
                  <button onClick={() => setCartOpen(true)} className="relative flex-1 py-3 rounded-xl border-2 border-brand-200 text-brand-700 font-semibold flex items-center justify-center gap-2">
                    <ShoppingCart size={17} /> {kitMode ? 'Ver kit' : 'Ver pedido'}
                    {cartItems.length > 0 && <span className="w-5 h-5 rounded-full bg-brand-500 text-white text-xs flex items-center justify-center">{cartItems.length}</span>}
                  </button>
                )}
                <button onClick={goConfirm} disabled={cartItems.length === 0 || overLimit} className="flex-1 py-3 rounded-xl bg-brand-500 text-white font-bold flex items-center justify-center gap-1.5 disabled:opacity-50">
                  Continuar <ArrowRight size={17} />
                </button>
              </div>
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
                      <h3 className="font-bold text-gray-900">{kitMode ? 'Kit de 1 alumno' : 'Tu pedido'}</h3>
                      <button onClick={() => setCartOpen(false)} aria-label="Cerrar"><X size={22} className="text-gray-400" /></button>
                    </div>
                    <CartPanel items={cartItems} total={cartTotal} kitMode={kitMode} overLimit={overLimit} onQty={setQty} onContinue={() => { setCartOpen(false); goConfirm() }} bare />
                  </motion.div>
                </>
              )}
            </AnimatePresence>
          </motion.div>
        )}

        {/* ── 5. Confirm ── */}
        {step === 5 && (
          <motion.div key="s5" {...stepAnim} className="max-w-2xl mx-auto space-y-5">
            <StepTitle title="Revisa y envía" hint="Si algo no está bien, toca Atrás o el número del paso arriba." />
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 sm:p-6">
              <dl className="grid grid-cols-2 gap-y-2 text-sm mb-5">
                <dt className="text-gray-500">Escuela</dt>
                <dd className="text-gray-900 font-medium text-right">{selectedSchool?.school.name}</dd>
                <dt className="text-gray-500">Programa</dt>
                <dd className="text-gray-900 font-medium text-right">{programIcon(programType)} {selectedProgram?.name || programLabel(programType)}</dd>
                <dt className="text-gray-500">Grados</dt>
                <dd className="text-gray-900 font-medium text-right">
                  {grades.filter(g => g.gradeName && g.studentCount).map(g => `${g.gradeName}: ${g.studentCount}`).join(', ')}
                </dd>
                <dt className="text-gray-500">Total alumnos</dt>
                <dd className="text-gray-900 font-medium text-right">{totalStudents}</dd>
              </dl>

              {kitMode && <p className="text-xs font-semibold text-gray-500 mb-1">Kit de cada alumno</p>}
              <div className="divide-y divide-gray-100 border-t border-gray-100">
                {cartItems.map(it => (
                  <div key={it.product.id} className="flex items-center justify-between py-2.5 text-sm gap-3">
                    <div className="min-w-0">
                      <p className="text-gray-800 font-medium">{it.product.name}</p>
                      <p className="text-gray-400 text-xs">
                        {it.quantity} × {money(it.product.basePrice)}
                        {kitMode && ` · ${it.quantity * totalStudents} en total`}
                      </p>
                    </div>
                    <p className="font-semibold text-gray-900 whitespace-nowrap">{money(it.product.basePrice * it.quantity * (kitMode ? totalStudents : 1))}</p>
                  </div>
                ))}
              </div>
              <div className="mt-4 pt-4 border-t border-gray-200 space-y-1">
                {kitMode && (
                  <div className="flex items-center justify-between text-sm text-gray-600">
                    <span>Kit de 1 alumno</span>
                    <span>{money(cartTotal)} × {totalStudents}</span>
                  </div>
                )}
                <div className="flex items-center justify-between">
                  <span className="font-bold text-gray-900">Total del pedido</span>
                  <span className="text-xl font-extrabold text-brand-600">{money(orderTotal)}</span>
                </div>
              </div>
              {budget && leftover > 0.009 && (
                <p className="mt-3 text-xs text-amber-800 bg-amber-50 rounded-lg px-3 py-2">
                  Te quedan {money(leftover)} {kitMode ? 'por alumno' : ''} sin usar. Puedes enviarlo así; el proveedor lo revisará.
                </p>
              )}
            </div>

            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 sm:p-6">
              <label htmlFor="order-notes" className="block text-sm font-bold text-gray-700 mb-1">
                Comentarios para el proveedor{grades.length > 1 ? <span className="text-red-500 ml-1">*</span> : ' (opcional)'}
              </label>
              <p className="text-xs text-gray-500 mb-2">
                {grades.length > 1 ? 'Obligatorio porque el pedido cubre más de un grado.' : '¿Algo que debamos cambiar o tener en cuenta? Escríbelo aquí y el proveedor lo corrige.'}
              </p>
              <textarea
                id="order-notes"
                value={notes}
                onChange={e => setNotes(e.target.value)}
                rows={3}
                placeholder="Ej: cambiar los crayones por marcadores…"
                className={`w-full px-4 py-3 rounded-xl border focus:ring-2 focus:ring-brand-100 outline-none resize-none ${
                  grades.length > 1 && !notes.trim() ? 'border-red-300 focus:border-red-400' : 'border-gray-200 focus:border-brand-400'
                }`}
              />
            </div>

            <div className="flex items-center justify-between">
              {backBtn(4)}
              <button onClick={submit} disabled={submitting} className="px-6 py-3 rounded-xl bg-brand-500 text-white font-bold hover:bg-brand-600 flex items-center gap-2 disabled:opacity-60">
                {submitting ? <span className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <>Enviar pedido <Check size={18} /></>}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {created && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
            <motion.div initial={{ opacity: 0, scale: 0.92 }} animate={{ opacity: 1, scale: 1 }} className="bg-white rounded-3xl shadow-2xl p-8 max-w-sm w-full text-center">
              <div className="w-16 h-16 rounded-full bg-green-100 text-green-600 flex items-center justify-center mx-auto mb-4">
                <CheckCircle2 size={36} />
              </div>
              <h3 className="text-xl font-extrabold text-gray-900">¡Pedido enviado!</h3>
              <p className="text-gray-500 mt-2 text-sm">El proveedor lo va a revisar. Te avisamos en Mensajes si hay que cambiar algo.</p>
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

function StepTitle({ title, hint }: { title: string; hint?: string | undefined }) {
  return (
    <div className="mb-4">
      <h2 className="text-xl font-bold text-gray-900">{title}</h2>
      {hint && <p className="text-sm text-gray-500 mt-1">{hint}</p>}
    </div>
  )
}

function Spinner() {
  return (
    <div className="flex items-center justify-center h-48">
      <div className="w-7 h-7 border-4 border-brand-500 border-t-transparent rounded-full animate-spin" />
    </div>
  )
}

/** How much of the money is used, always visible while choosing products. */
function BudgetBar({ used, limit, label, kitMode, totalStudents, orderTotal, compact }: {
  used: number; limit: number; label: string; kitMode: boolean; totalStudents: number; orderTotal: number; compact?: boolean
}) {
  const pct = limit > 0 ? Math.min(100, (used / limit) * 100) : 0
  const over = used > limit + 0.001
  const exact = !over && limit - used < 0.01
  const left = limit - used
  const bar = over ? 'bg-red-500' : exact ? 'bg-green-500' : 'bg-brand-500'
  return (
    <div className={compact ? '' : 'bg-white rounded-2xl border border-gray-100 shadow-sm p-4'}>
      <div className="flex items-baseline justify-between gap-2 text-sm">
        <span className="text-gray-600">{label}: <strong className="text-gray-900">{money(used)}</strong> de {money(limit)}</span>
        <span className={`font-semibold whitespace-nowrap ${over ? 'text-red-600' : exact ? 'text-green-700' : 'text-gray-700'}`}>
          {over ? `Te pasas ${money(-left)}` : exact ? 'Completo' : `Quedan ${money(left)}`}
        </span>
      </div>
      <div className="mt-2 h-2.5 rounded-full bg-gray-100 overflow-hidden" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct)}>
        <div className={`h-full rounded-full transition-all ${bar}`} style={{ width: `${pct}%` }} />
      </div>
      {kitMode && totalStudents > 0 && (
        <p className="mt-1.5 text-xs text-gray-500">× {totalStudents} alumnos = <strong className="text-gray-800">{money(orderTotal)}</strong> en total</p>
      )}
    </div>
  )
}

function CartPanel({ items, total, kitMode, overLimit, onQty, onContinue, bare }: {
  items: CartItem[]
  total: number
  kitMode: boolean
  overLimit: boolean
  onQty: (id: string, q: number) => void
  onContinue: () => void
  bare?: boolean
}) {
  const inner = (
    <>
      {!bare && (
        <h3 className="font-bold text-gray-900 mb-3 flex items-center gap-2"><ShoppingCart size={18} className="text-brand-500" /> {kitMode ? 'Kit de 1 alumno' : 'Tu pedido'}</h3>
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
                <button onClick={() => onQty(it.product.id, it.quantity - 1)} aria-label="Quitar uno" className="w-8 h-8 rounded-lg bg-gray-100 text-gray-600 flex items-center justify-center"><Minus size={13} /></button>
                <span className="w-6 text-center font-semibold">{it.quantity}</span>
                <button onClick={() => onQty(it.product.id, it.quantity + 1)} aria-label="Agregar uno" className="w-8 h-8 rounded-lg bg-gray-100 text-gray-600 flex items-center justify-center"><Plus size={13} /></button>
              </div>
            </div>
          ))}
        </div>
      )}
      <div className="mt-4 pt-3 border-t border-gray-100">
        <div className="flex items-center justify-between">
          <span className="text-gray-600 font-medium">{kitMode ? 'Por alumno' : 'Total'}</span>
          <span className="text-lg font-extrabold text-gray-900">{money(total)}</span>
        </div>
        {overLimit && (
          <div className="mt-3 flex items-start gap-2 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs px-3 py-2">
            <AlertTriangle size={15} className="flex-shrink-0 mt-0.5" />
            Pasa del monto permitido. Quita algún producto.
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
