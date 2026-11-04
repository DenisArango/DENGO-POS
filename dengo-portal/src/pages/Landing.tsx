import { useState } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Menu, X, ArrowRight, Phone, Mail, MapPin, MessageCircle, Facebook, Instagram, Check } from 'lucide-react'
import { BrandMark, usePortalConfig } from '../lib/usePortalConfig'
import { FALLBACK_NAME } from '../lib/brand'

// Everything client-specific (name, city, copy, colour, logo, photo, contact)
// comes from PortalConfig — this page is shared by every client's portal.
// The four programs are MINEDUC's own, the same for every school in Guatemala.
const PROGRAMS = [
  { title: 'Útiles escolares', desc: 'Cuadernos, lápices y material básico para cada alumno, calculado por grado.' },
  { title: 'Valija didáctica', desc: 'El monto por docente para material de enseñanza alineado al CNB.' },
  { title: 'Gratuidad', desc: 'Material para el establecimiento, un pedido por escuela al año.' },
  { title: 'Alimentación escolar', desc: 'Paquetes de alimentos para estudiantes del sector público.' },
]

const STEPS = [
  { title: 'Ingresa', desc: 'Con el correo y la contraseña que te entregó la librería.' },
  { title: 'Arma tu lista', desc: 'Escuela, grados y número de alumnos; elige un paquete o producto por producto.' },
  { title: 'Envíala', desc: 'El portal revisa los límites del programa antes de enviarla.' },
  { title: 'Sigue el estado', desc: 'En revisión, aprobado, cotizado, facturado — y mensajes directos si hay dudas.' },
]

const rise = (i = 0) => ({
  initial: { opacity: 0, y: 24 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, amount: 0.2 },
  transition: { duration: 0.5, ease: 'easeOut' as const, delay: i * 0.07 },
})

export default function Landing() {
  const { config, status } = usePortalConfig()
  const [menuOpen, setMenuOpen] = useState(false)
  const c = config ?? {}
  const name = c.businessName || FALLBACK_NAME
  const place = c.city || c.address
  const waLink = c.whatsapp ? `https://wa.me/${c.whatsapp.replace(/\D/g, '').replace(/^(\d{8})$/, '502$1')}` : null

  const nav = [['#programas', 'Programas'], ['#como-funciona', 'Cómo funciona'], ['#nosotros', 'Nosotros'], ['#contacto', 'Contacto']]

  return (
    <div className="bg-[#f2f3f5] text-gray-900">
      {/* ── Navegación ── */}
      <nav className="sticky top-0 z-50 bg-[#f2f3f5]">
        <div className="max-w-7xl mx-auto px-5 sm:px-8 h-16 flex items-center justify-between">
          <a href="#top" className="flex items-center gap-3 min-w-0">
            <BrandMark logoUrl={c.logoUrl} size={34} />
            <span className="font-bold text-lg truncate">{status === 'loading' && !config ? '' : name}</span>
          </a>
          <div className="hidden md:flex items-center gap-7 text-[15px] font-medium text-gray-800">
            {nav.map(([href, label]) => <a key={href} href={href} className="hover:text-brand-700 transition-colors">{label}</a>)}
            <Link to="/login" className="px-4 py-2 bg-brand-600 text-white font-semibold hover:bg-brand-700 active:translate-y-px transition">
              Ingresar
            </Link>
          </div>
          <button className="md:hidden p-2" aria-label={menuOpen ? 'Cerrar menú' : 'Abrir menú'} onClick={() => setMenuOpen(v => !v)}>
            {menuOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
        </div>
        {menuOpen && (
          <div className="md:hidden px-5 pb-4 space-y-1 bg-[#f2f3f5]">
            {nav.map(([href, label]) => (
              <a key={href} href={href} onClick={() => setMenuOpen(false)} className="block py-2.5 text-gray-800">{label}</a>
            ))}
            <Link to="/login" className="block mt-2 py-3 bg-brand-600 text-white font-semibold text-center">Ingresar al portal</Link>
          </div>
        )}
      </nav>

      {/* ── Hero: la lista de útiles ── */}
      <header id="top" className="max-w-7xl mx-auto px-5 sm:px-8 pt-10 sm:pt-16 pb-20 sm:pb-28 grid lg:grid-cols-12 gap-10 lg:gap-14 items-center">
        <motion.div {...rise()} className="lg:col-span-7">
          <h1 className="text-[clamp(2.6rem,7.2vw,6.5rem)] font-extrabold leading-[0.95] tracking-[-0.035em]">
            Pide los útiles en línea.
          </h1>
          <p className="mt-8 text-lg sm:text-xl leading-relaxed max-w-[34rem] text-gray-800">
            {c.tagline || 'Portal para docentes'}{place ? ` — ${place}` : ''}. Arma la lista de útiles, valija o gratuidad
            de tu grado y {name} la prepara para entregarla.
          </p>
          <div className="mt-10 flex flex-col sm:flex-row gap-3">
            <Link to="/login" className="px-7 py-4 bg-brand-600 text-white text-lg font-semibold hover:bg-brand-700 active:translate-y-px transition inline-flex items-center justify-center gap-2">
              Ingresar al portal <ArrowRight size={20} />
            </Link>
            <a href="#como-funciona" className="px-7 py-4 bg-gray-900/[0.06] text-gray-900 text-lg font-semibold hover:bg-gray-900/10 transition inline-flex items-center justify-center">
              Cómo funciona
            </a>
          </div>
        </motion.div>

        <motion.div {...rise(2)} className="lg:col-span-5">
          {c.heroImageUrl ? (
            <img src={c.heroImageUrl} alt={`${name}`} className="w-full aspect-[4/5] object-cover" />
          ) : (
            <div className="bg-white p-7 sm:p-9" aria-label="Programas que puedes pedir">
              <p className="text-sm font-semibold text-brand-700">Lista del ciclo {new Date().getFullYear() + (new Date().getMonth() >= 9 ? 1 : 0)}</p>
              <p className="mt-1 text-2xl font-bold">Lo que puedes pedir</p>
              <ul className="mt-6 space-y-4">
                {PROGRAMS.map(p => (
                  <li key={p.title} className="flex gap-4">
                    <span className="mt-0.5 flex-shrink-0 w-6 h-6 bg-brand-600 text-white flex items-center justify-center"><Check size={16} strokeWidth={3} /></span>
                    <span>
                      <span className="block font-semibold text-lg leading-snug">{p.title}</span>
                      <span className="block text-[15px] text-gray-700 leading-snug mt-0.5">{p.desc}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </motion.div>
      </header>

      {/* ── Programas ── */}
      <section id="programas" className="bg-brand-700 text-white">
        <div className="max-w-7xl mx-auto px-5 sm:px-8 py-24 sm:py-32 grid lg:grid-cols-12 gap-12">
          <motion.h2 {...rise()} className="lg:col-span-4 text-4xl sm:text-5xl font-extrabold tracking-[-0.03em] leading-[1.02]">
            Los programas del MINEDUC
          </motion.h2>
          <div className="lg:col-span-8 grid sm:grid-cols-2 gap-x-10 gap-y-12">
            {PROGRAMS.map((p, i) => (
              <motion.div key={p.title} {...rise(i + 1)}>
                <h3 className="text-2xl font-bold">{p.title}</h3>
                <p className="mt-3 text-lg leading-relaxed text-white/90">{p.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Cómo funciona ── */}
      <section id="como-funciona" className="max-w-7xl mx-auto px-5 sm:px-8 py-24 sm:py-32">
        <motion.h2 {...rise()} className="text-4xl sm:text-5xl font-extrabold tracking-[-0.03em] leading-[1.02] max-w-3xl">
          De la lista al aula, en cuatro pasos
        </motion.h2>
        <ol className="mt-14 grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {STEPS.map((s, i) => (
            <motion.li key={s.title} {...rise(i + 1)} className="bg-white p-7">
              <p className="text-2xl font-bold">{s.title}</p>
              <p className="mt-3 text-[17px] leading-relaxed text-gray-800">{s.desc}</p>
            </motion.li>
          ))}
        </ol>
      </section>

      {/* ── Nosotros ── */}
      <section id="nosotros" className="bg-white">
        <div className="max-w-7xl mx-auto px-5 sm:px-8 py-24 sm:py-32 grid lg:grid-cols-12 gap-12">
          <motion.h2 {...rise()} className="lg:col-span-4 text-4xl sm:text-5xl font-extrabold tracking-[-0.03em] leading-[1.02]">
            {name}
          </motion.h2>
          <motion.div {...rise(1)} className="lg:col-span-8">
            <p className="text-2xl sm:text-[28px] leading-snug font-medium max-w-[40rem]">
              {c.aboutText || 'Librería y papelería que atiende a docentes y escuelas del sector público con sus pedidos de programas educativos.'}
            </p>
            {place && <p className="mt-6 text-lg text-gray-700 flex items-center gap-2"><MapPin size={18} /> {place}</p>}
          </motion.div>
        </div>
      </section>

      {/* ── Contacto ── */}
      <section id="contacto" className="max-w-7xl mx-auto px-5 sm:px-8 py-24 sm:py-32 grid lg:grid-cols-12 gap-12 items-start">
        <motion.div {...rise()} className="lg:col-span-5">
          <h2 className="text-4xl sm:text-5xl font-extrabold tracking-[-0.03em] leading-[1.02]">¿Dudas con tu pedido?</h2>
          <p className="mt-6 text-lg leading-relaxed text-gray-800 max-w-md">
            Si ya tienes cuenta, escríbenos desde Mensajes dentro del portal. Si aún no la tienes, pídela por cualquiera de estos medios.
          </p>
          <Link to="/login" className="mt-8 px-7 py-4 bg-brand-600 text-white text-lg font-semibold hover:bg-brand-700 active:translate-y-px transition inline-flex items-center gap-2">
            Ingresar al portal <ArrowRight size={20} />
          </Link>
        </motion.div>
        <motion.ul {...rise(1)} className="lg:col-span-7 grid sm:grid-cols-2 gap-4">
          {[
            waLink && { icon: MessageCircle, label: 'WhatsApp', value: c.whatsapp!, href: waLink },
            c.phone && { icon: Phone, label: 'Teléfono', value: c.phone, href: `tel:${c.phone.replace(/\s/g, '')}` },
            c.email && { icon: Mail, label: 'Correo', value: c.email, href: `mailto:${c.email}` },
            c.address && { icon: MapPin, label: 'Dirección', value: [c.address, c.city].filter(Boolean).join(', '), href: undefined },
          ].filter(Boolean).map(item => {
            const it = item as { icon: typeof Phone; label: string; value: string; href?: string }
            const body = (
              <>
                <it.icon size={22} className="text-brand-700" />
                <span className="block mt-4 text-[15px] text-gray-700">{it.label}</span>
                <span className="block mt-1 text-lg font-semibold break-words">{it.value}</span>
              </>
            )
            return (
              <li key={it.label}>
                {it.href
                  ? <a href={it.href} target="_blank" rel="noreferrer" className="block h-full bg-white p-6 hover:bg-brand-50 transition-colors">{body}</a>
                  : <div className="h-full bg-white p-6">{body}</div>}
              </li>
            )
          })}
        </motion.ul>
      </section>

      {/* ── Cierre ── */}
      <footer className="bg-gray-900 text-white">
        <div className="max-w-7xl mx-auto px-5 sm:px-8 pt-20 pb-10">
          <p className="text-[clamp(2.4rem,8vw,7rem)] font-extrabold tracking-[-0.04em] leading-[0.95] break-words">{name}</p>
          <div className="mt-12 flex flex-col sm:flex-row sm:items-center justify-between gap-6 text-[15px] text-white/80">
            <div className="flex flex-wrap gap-6">
              <Link to="/login" className="hover:text-white">Portal de maestros</Link>
              {nav.map(([href, label]) => <a key={href} href={href} className="hover:text-white">{label}</a>)}
              {c.facebook && <a href={c.facebook} target="_blank" rel="noreferrer" aria-label="Facebook" className="hover:text-white"><Facebook size={20} /></a>}
              {c.instagram && <a href={c.instagram} target="_blank" rel="noreferrer" aria-label="Instagram" className="hover:text-white"><Instagram size={20} /></a>}
            </div>
            <p>© {new Date().getFullYear()} {name}</p>
          </div>
        </div>
      </footer>
    </div>
  )
}
