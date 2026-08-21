import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  GraduationCap, Menu, X, ArrowRight, ChevronDown, Phone, Mail, MapPin,
  MessageCircle, Facebook, Instagram, BookOpen, Utensils, Pencil, Backpack,
  CheckCircle2, Sparkles,
} from 'lucide-react'
import { api } from '../lib/api'
import type { PortalConfig } from '../types'

const DEFAULTS: PortalConfig = {
  businessName: 'Variedades Dayana',
  tagline: 'Tu proveedor educativo de confianza en Baja Verapaz',
  aboutText:
    'Variedades Dayana es una librería y papelería con más de una década sirviendo a la comunidad educativa de Rabinal, Baja Verapaz. Abastecemos a escuelas del sector público con útiles escolares, libros, materiales de enseñanza y apoyamos los programas educativos del MINEDUC.',
  primaryColor: '#F97316',
  address: 'Rabinal, Baja Verapaz',
  city: 'Rabinal, Baja Verapaz',
  phone: '+502 0000 0000',
  whatsapp: '50200000000',
  email: 'contacto@variedadesdayana.com',
  facebook: '',
  instagram: '',
}

const PROGRAMS = [
  { icon: Utensils, emoji: '🍽️', title: 'Alimentación Escolar', desc: 'Paquetes de alimentos para estudiantes del sector público.' },
  { icon: Pencil, emoji: '✏️', title: 'Útiles Escolares', desc: 'Cuadernos, lápices, materiales básicos para el aula.' },
  { icon: Backpack, emoji: '🎒', title: 'Valija Didáctica', desc: 'Q600 por docente para materiales de enseñanza alineados al CNB.' },
  { icon: BookOpen, emoji: '📚', title: 'Gratuidades', desc: 'Materiales educativos gratuitos para establecimientos.' },
]

const STEPS = [
  'El maestro ingresa al portal con sus credenciales',
  'Selecciona su escuela, grado y programa',
  'Elige los productos del catálogo disponible',
  'Envía su solicitud al proveedor',
  'El proveedor procesa y prepara su pedido',
]

const fadeUp = {
  initial: { opacity: 0, y: 40 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: '-60px' },
  transition: { duration: 0.6, ease: 'easeOut' as const },
}

function Skeleton({ className = '' }: { className?: string }) {
  return <span className={`animate-pulse bg-gray-200 rounded ${className}`} />
}

export default function Landing() {
  const [cfg, setCfg] = useState<PortalConfig | null>(null)
  const [loading, setLoading] = useState(true)
  const [menuOpen, setMenuOpen] = useState(false)

  useEffect(() => {
    api.getConfig()
      .then(c => {
        const merged = { ...DEFAULTS, ...c }
        setCfg(merged)
        try { localStorage.setItem('portal-config', JSON.stringify(merged)) } catch { /* ignore */ }
      })
      .catch(() => setCfg(DEFAULTS))
      .finally(() => setLoading(false))
  }, [])

  const c = cfg ?? DEFAULTS

  return (
    <div className="bg-white text-gray-800">
      {/* ── Navbar ── */}
      <nav className="fixed top-0 inset-x-0 z-50 bg-white/85 backdrop-blur-md border-b border-gray-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <a href="#top" className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-brand-500 to-brand-600 flex items-center justify-center text-white shadow-sm">
              <GraduationCap size={20} />
            </div>
            <span className="font-extrabold text-gray-900 text-lg">
              {loading ? <Skeleton className="h-5 w-32 inline-block" /> : c.businessName}
            </span>
          </a>

          <div className="hidden md:flex items-center gap-6 text-sm font-medium text-gray-600">
            <a href="#nosotros" className="hover:text-brand-600 transition-colors">Quiénes Somos</a>
            <a href="#programas" className="hover:text-brand-600 transition-colors">Programas</a>
            <a href="#como-funciona" className="hover:text-brand-600 transition-colors">Cómo Funciona</a>
            <a href="#contacto" className="hover:text-brand-600 transition-colors">Contacto</a>
            <Link
              to="/login"
              className="px-4 py-2 rounded-xl bg-brand-500 text-white font-semibold shadow-sm hover:bg-brand-600 transition-colors flex items-center gap-1.5"
            >
              Portal Maestros <ArrowRight size={16} />
            </Link>
          </div>

          <button className="md:hidden p-2 text-gray-700" onClick={() => setMenuOpen(v => !v)}>
            {menuOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
        </div>

        {menuOpen && (
          <div className="md:hidden bg-white border-t border-gray-100 px-4 py-3 space-y-1">
            {[['#nosotros', 'Quiénes Somos'], ['#programas', 'Programas'], ['#como-funciona', 'Cómo Funciona'], ['#contacto', 'Contacto']].map(([href, label]) => (
              <a key={href} href={href} onClick={() => setMenuOpen(false)} className="block px-3 py-2 rounded-lg text-gray-700 hover:bg-brand-50">{label}</a>
            ))}
            <Link to="/login" className="block mt-2 px-3 py-2.5 rounded-xl bg-brand-500 text-white font-semibold text-center">
              Portal Maestros →
            </Link>
          </div>
        )}
      </nav>

      {/* ── Hero ── */}
      <header id="top" className="relative min-h-screen flex items-center pt-16 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-brand-50 via-white to-amber-50" />
        <div className="absolute -top-24 -right-24 w-96 h-96 bg-brand-200/40 rounded-full blur-3xl" />
        <div className="absolute bottom-0 -left-24 w-96 h-96 bg-amber-200/40 rounded-full blur-3xl" />
        <div className="absolute top-1/3 right-1/4 w-32 h-32 border-4 border-brand-200/50 rounded-3xl rotate-12 hidden lg:block" />

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 grid lg:grid-cols-2 gap-12 items-center py-16">
          <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7 }}>
            <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-brand-100 text-brand-700 text-xs font-semibold mb-5">
              <Sparkles size={14} /> Proveedor educativo · Rabinal, B.V.
            </span>
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold leading-[1.1] text-gray-900">
              {loading ? (
                <Skeleton className="h-16 w-full block" />
              ) : (
                <>Tu proveedor <span className="text-brand-500">educativo</span> de confianza en Baja Verapaz</>
              )}
            </h1>
            <p className="mt-6 text-lg text-gray-600 max-w-xl">
              {loading ? <Skeleton className="h-12 w-full block" /> : (c.tagline ?? DEFAULTS.tagline)}
              {' '}Servimos a las escuelas de Rabinal con útiles, libros y los programas educativos del MINEDUC.
            </p>
            <div className="mt-8 flex flex-col sm:flex-row gap-4">
              <Link
                to="/login"
                className="px-6 py-3.5 rounded-2xl bg-brand-500 text-white font-bold shadow-lg shadow-brand-500/30 hover:bg-brand-600 hover:shadow-brand-500/40 transition-all flex items-center justify-center gap-2"
              >
                Acceso Maestros <ArrowRight size={18} />
              </Link>
              <a
                href="#nosotros"
                className="px-6 py-3.5 rounded-2xl border-2 border-gray-200 text-gray-700 font-bold hover:border-brand-300 hover:text-brand-600 transition-all flex items-center justify-center gap-2"
              >
                Conocer más <ChevronDown size={18} />
              </a>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, scale: 0.92 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.7, delay: 0.15 }}
            className="relative"
          >
            <div className="bg-white rounded-3xl shadow-2xl shadow-brand-900/10 border border-gray-100 p-6 sm:p-8">
              <p className="text-sm font-semibold text-gray-500 mb-4">Programas que atendemos</p>
              <div className="grid grid-cols-2 gap-4">
                {PROGRAMS.map((p, i) => (
                  <motion.div
                    key={p.title}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.3 + i * 0.1 }}
                    className="rounded-2xl bg-gradient-to-br from-brand-50 to-amber-50 border border-brand-100 p-4"
                  >
                    <div className="text-2xl mb-2">{p.emoji}</div>
                    <p className="font-bold text-gray-800 text-sm leading-snug">{p.title}</p>
                  </motion.div>
                ))}
              </div>
            </div>
            <div className="absolute -bottom-5 -right-3 bg-brand-500 text-white rounded-2xl px-5 py-3 shadow-xl rotate-3">
              <p className="text-2xl font-extrabold leading-none">15+</p>
              <p className="text-[11px] font-medium opacity-90">años de servicio</p>
            </div>
          </motion.div>
        </div>
      </header>

      {/* ── Stats bar ── */}
      <section className="bg-gray-900 text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-10 grid grid-cols-2 lg:grid-cols-4 gap-8 text-center">
          {[
            ['15+', 'años de experiencia'],
            ['50+', 'escuelas atendidas'],
            ['4', 'programas educativos'],
            ['Rabinal, B.V.', 'Baja Verapaz, Guatemala'],
          ].map(([n, l], i) => (
            <motion.div key={l} {...fadeUp} transition={{ ...fadeUp.transition, delay: i * 0.08 }}>
              <p className="text-2xl sm:text-3xl font-extrabold text-brand-400">{n}</p>
              <p className="text-sm text-gray-400 mt-1">{l}</p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* ── Quiénes Somos ── */}
      <section id="nosotros" className="py-20 sm:py-28">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 grid lg:grid-cols-2 gap-14 items-center">
          <motion.div {...fadeUp}>
            <span className="text-brand-600 font-bold text-sm uppercase tracking-wide">Quiénes Somos</span>
            <h2 className="mt-3 text-3xl sm:text-4xl font-extrabold text-gray-900 leading-tight">
              Más de una década sirviendo a la educación guatemalteca
            </h2>
            <p className="mt-5 text-gray-600 leading-relaxed">{c.aboutText ?? DEFAULTS.aboutText}</p>
            <ul className="mt-6 space-y-3">
              {[
                'Librería y papelería con amplio catálogo',
                'Abastecimiento de útiles escolares al por mayor',
                'Materiales de enseñanza alineados al CNB',
                'Apoyo a los programas educativos del MINEDUC',
              ].map(item => (
                <li key={item} className="flex items-start gap-3 text-gray-700">
                  <CheckCircle2 className="text-brand-500 flex-shrink-0 mt-0.5" size={20} />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </motion.div>

          <motion.div {...fadeUp} className="grid grid-cols-2 gap-5">
            {[
              { icon: BookOpen, label: 'Librería', tint: 'from-blue-50 to-blue-100 text-blue-600' },
              { icon: Pencil, label: 'Útiles', tint: 'from-brand-50 to-brand-100 text-brand-600' },
              { icon: Backpack, label: 'Programas escolares', tint: 'from-green-50 to-green-100 text-green-600' },
              { icon: Sparkles, label: 'Papelería', tint: 'from-purple-50 to-purple-100 text-purple-600' },
            ].map(({ icon: Icon, label, tint }) => (
              <div key={label} className={`rounded-3xl bg-gradient-to-br ${tint} p-7 flex flex-col items-center justify-center text-center aspect-square`}>
                <Icon size={40} />
                <p className="mt-3 font-bold text-gray-800">{label}</p>
              </div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* ── Programas ── */}
      <section id="programas" className="py-20 sm:py-28 bg-gradient-to-b from-gray-50 to-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <motion.div {...fadeUp} className="text-center max-w-2xl mx-auto">
            <span className="text-brand-600 font-bold text-sm uppercase tracking-wide">Programas que Atendemos</span>
            <h2 className="mt-3 text-3xl sm:text-4xl font-extrabold text-gray-900">Apoyamos los programas del MINEDUC</h2>
            <p className="mt-4 text-gray-600">Cada programa con su catálogo y lineamientos específicos para tu establecimiento.</p>
          </motion.div>

          <div className="mt-14 grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {PROGRAMS.map((p, i) => (
              <motion.div
                key={p.title}
                {...fadeUp}
                transition={{ ...fadeUp.transition, delay: i * 0.1 }}
                whileHover={{ y: -8 }}
                className="rounded-3xl p-[2px] bg-gradient-to-br from-brand-400 to-amber-300"
              >
                <div className="h-full rounded-[22px] bg-white p-6">
                  <div className="w-14 h-14 rounded-2xl bg-brand-50 flex items-center justify-center text-3xl mb-4">{p.emoji}</div>
                  <h3 className="font-extrabold text-gray-900 text-lg">{p.title}</h3>
                  <p className="mt-2 text-sm text-gray-600 leading-relaxed">{p.desc}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Cómo Funciona ── */}
      <section id="como-funciona" className="py-20 sm:py-28">
        <div className="max-w-5xl mx-auto px-4 sm:px-6">
          <motion.div {...fadeUp} className="text-center">
            <span className="text-brand-600 font-bold text-sm uppercase tracking-wide">Cómo Funciona</span>
            <h2 className="mt-3 text-3xl sm:text-4xl font-extrabold text-gray-900">Tu pedido en 5 simples pasos</h2>
          </motion.div>

          <div className="mt-14 relative">
            <div className="absolute left-[27px] top-4 bottom-4 w-0.5 bg-brand-100 hidden sm:block" />
            <div className="space-y-6">
              {STEPS.map((step, i) => (
                <motion.div
                  key={step}
                  {...fadeUp}
                  transition={{ ...fadeUp.transition, delay: i * 0.08 }}
                  className="flex items-start gap-5 relative"
                >
                  <div className="flex-shrink-0 w-14 h-14 rounded-2xl bg-brand-500 text-white font-extrabold text-xl flex items-center justify-center shadow-lg shadow-brand-500/30 z-10">
                    {i + 1}
                  </div>
                  <div className="bg-white border border-gray-100 rounded-2xl px-5 py-4 shadow-sm flex-1">
                    <p className="text-gray-800 font-medium">{step}</p>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── Para Maestros CTA ── */}
      <section className="py-20">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <motion.div
            {...fadeUp}
            className="relative overflow-hidden rounded-[2.5rem] bg-gradient-to-br from-brand-500 to-brand-700 px-8 sm:px-16 py-16 text-center text-white"
          >
            <div className="absolute -top-16 -left-16 w-64 h-64 bg-white/10 rounded-full blur-2xl" />
            <div className="absolute -bottom-16 -right-16 w-64 h-64 bg-amber-300/20 rounded-full blur-2xl" />
            <div className="relative">
              <GraduationCap size={48} className="mx-auto mb-5 opacity-90" />
              <h2 className="text-3xl sm:text-4xl font-extrabold">¿Eres maestro o maestra?</h2>
              <p className="mt-4 text-brand-50 max-w-2xl mx-auto">
                Accede al portal para realizar las selecciones de tus programas educativos de forma rápida y sencilla, desde cualquier dispositivo.
              </p>
              <Link
                to="/login"
                className="mt-8 inline-flex items-center gap-2 px-8 py-4 rounded-2xl bg-white text-brand-600 font-extrabold shadow-xl hover:scale-[1.03] transition-transform"
              >
                Ingresar al Portal <ArrowRight size={20} />
              </Link>
            </div>
          </motion.div>
        </div>
      </section>

      {/* ── Contacto ── */}
      <section id="contacto" className="py-20 sm:py-28 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <motion.div {...fadeUp} className="text-center max-w-2xl mx-auto">
            <span className="text-brand-600 font-bold text-sm uppercase tracking-wide">Contacto</span>
            <h2 className="mt-3 text-3xl sm:text-4xl font-extrabold text-gray-900">Estamos para servirte</h2>
          </motion.div>

          <div className="mt-14 grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {[
              c.phone && { icon: Phone, label: 'Teléfono', value: c.phone, href: `tel:${c.phone}` },
              c.whatsapp && { icon: MessageCircle, label: 'WhatsApp', value: 'Escríbenos', href: `https://wa.me/${c.whatsapp.replace(/\D/g, '')}` },
              c.email && { icon: Mail, label: 'Correo', value: c.email, href: `mailto:${c.email}` },
              { icon: MapPin, label: 'Ubicación', value: c.address ?? c.city ?? 'Rabinal, Baja Verapaz', href: undefined },
            ].filter(Boolean).map((item) => {
              const it = item as { icon: typeof Phone; label: string; value: string; href?: string }
              const Inner = (
                <div className="bg-white rounded-3xl border border-gray-100 p-6 shadow-sm hover:shadow-md hover:border-brand-200 transition-all h-full">
                  <div className="w-12 h-12 rounded-2xl bg-brand-50 text-brand-600 flex items-center justify-center mb-4">
                    <it.icon size={22} />
                  </div>
                  <p className="text-sm text-gray-500">{it.label}</p>
                  <p className="font-bold text-gray-800 break-words">{it.value}</p>
                </div>
              )
              return it.href
                ? <a key={it.label} href={it.href} target="_blank" rel="noreferrer">{Inner}</a>
                : <div key={it.label}>{Inner}</div>
            })}
          </div>

          {(c.facebook || c.instagram) && (
            <div className="mt-8 flex justify-center gap-4">
              {c.facebook && (
                <a href={c.facebook} target="_blank" rel="noreferrer" className="w-11 h-11 rounded-full bg-white border border-gray-200 flex items-center justify-center text-gray-600 hover:text-brand-600 hover:border-brand-300 transition-colors">
                  <Facebook size={20} />
                </a>
              )}
              {c.instagram && (
                <a href={c.instagram} target="_blank" rel="noreferrer" className="w-11 h-11 rounded-full bg-white border border-gray-200 flex items-center justify-center text-gray-600 hover:text-brand-600 hover:border-brand-300 transition-colors">
                  <Instagram size={20} />
                </a>
              )}
            </div>
          )}
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="bg-gray-900 text-gray-400">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-12">
          <div className="flex flex-col md:flex-row justify-between gap-8">
            <div className="max-w-sm">
              <div className="flex items-center gap-2.5 text-white">
                <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-brand-500 to-brand-600 flex items-center justify-center">
                  <GraduationCap size={20} />
                </div>
                <span className="font-extrabold text-lg">{c.businessName}</span>
              </div>
              <p className="mt-4 text-sm leading-relaxed">{c.tagline ?? DEFAULTS.tagline}</p>
            </div>
            <div className="flex gap-12">
              <div>
                <p className="text-white font-semibold mb-3 text-sm">Navegación</p>
                <ul className="space-y-2 text-sm">
                  <li><a href="#nosotros" className="hover:text-brand-400">Quiénes Somos</a></li>
                  <li><a href="#programas" className="hover:text-brand-400">Programas</a></li>
                  <li><a href="#contacto" className="hover:text-brand-400">Contacto</a></li>
                </ul>
              </div>
              <div>
                <p className="text-white font-semibold mb-3 text-sm">Maestros</p>
                <ul className="space-y-2 text-sm">
                  <li><Link to="/login" className="hover:text-brand-400">Acceder al portal</Link></li>
                </ul>
              </div>
            </div>
          </div>
          <div className="mt-10 pt-6 border-t border-gray-800 text-sm text-center">
            © {new Date().getFullYear()} {c.businessName}. Todos los derechos reservados.
          </div>
        </div>
      </footer>
    </div>
  )
}
