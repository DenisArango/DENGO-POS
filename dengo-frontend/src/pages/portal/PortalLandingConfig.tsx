import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import {
  Save, ExternalLink, Globe, Phone, Mail, MapPin, MessageCircle,
  Facebook, Instagram, GraduationCap,
} from 'lucide-react'
import { api } from '../../lib/api'

interface PortalConfig {
  businessName: string
  tagline?: string
  aboutText?: string
  primaryColor?: string
  address?: string
  city?: string
  phone?: string
  whatsapp?: string
  email?: string
  facebook?: string
  instagram?: string
}

const PORTAL_URL = 'http://localhost:5174'

export default function PortalLandingConfig() {
  const [form, setForm] = useState<PortalConfig>({ businessName: '', primaryColor: '#F97316' })
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    api.get<PortalConfig>('/api/portal-admin/config')
      .then(c => setForm({ primaryColor: '#F97316', ...c }))
      .catch(e => toast.error(e.message))
      .finally(() => setLoading(false))
  }, [])

  const set = (k: keyof PortalConfig, v: string) => setForm(f => ({ ...f, [k]: v }))

  const save = () => {
    if (!form.businessName) return toast.error('El nombre del negocio es requerido')
    setBusy(true)
    api.put('/api/portal-admin/config', form)
      .then(() => toast.success('Configuración guardada'))
      .catch(e => toast.error(e.message))
      .finally(() => setBusy(false))
  }

  if (loading) {
    return <div className="flex items-center justify-center h-64"><div className="w-8 h-8 border-4 border-primary-600 border-t-transparent rounded-full animate-spin" /></div>
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-800">Configuración del Portal</h1>
          <p className="text-gray-600 mt-1">Personaliza la página pública para los maestros</p>
        </div>
        <div className="flex gap-3">
          <a href={PORTAL_URL} target="_blank" rel="noreferrer" className="btn-secondary btn-md flex items-center gap-1.5"><ExternalLink size={16} /> Ver portal</a>
          <button onClick={save} disabled={busy} className="btn-primary btn-md flex items-center gap-1.5"><Save size={16} /> Guardar</button>
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Form */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 space-y-5">
          <h2 className="font-bold text-gray-800 flex items-center gap-2"><Globe size={18} className="text-primary-600" /> Información del negocio</h2>
          <div><label className="label">Nombre del negocio *</label><input className="input w-full" value={form.businessName} onChange={e => set('businessName', e.target.value)} /></div>
          <div><label className="label">Eslogan / Tagline</label><input className="input w-full" value={form.tagline ?? ''} onChange={e => set('tagline', e.target.value)} /></div>
          <div><label className="label">Acerca de (texto largo)</label><textarea rows={4} className="input w-full resize-none" value={form.aboutText ?? ''} onChange={e => set('aboutText', e.target.value)} /></div>

          <h2 className="font-bold text-gray-800 pt-2 border-t">Contacto</h2>
          <div className="grid grid-cols-2 gap-4">
            <div><label className="label">Dirección</label><input className="input w-full" value={form.address ?? ''} onChange={e => set('address', e.target.value)} /></div>
            <div><label className="label">Ciudad</label><input className="input w-full" value={form.city ?? ''} onChange={e => set('city', e.target.value)} /></div>
            <div><label className="label">Teléfono</label><input className="input w-full" value={form.phone ?? ''} onChange={e => set('phone', e.target.value)} /></div>
            <div><label className="label">WhatsApp</label><input className="input w-full" value={form.whatsapp ?? ''} onChange={e => set('whatsapp', e.target.value)} placeholder="50212345678" /></div>
            <div className="col-span-2"><label className="label">Correo electrónico</label><input type="email" className="input w-full" value={form.email ?? ''} onChange={e => set('email', e.target.value)} /></div>
          </div>

          <h2 className="font-bold text-gray-800 pt-2 border-t">Redes sociales</h2>
          <div className="grid grid-cols-2 gap-4">
            <div><label className="label">Facebook (URL)</label><input className="input w-full" value={form.facebook ?? ''} onChange={e => set('facebook', e.target.value)} /></div>
            <div><label className="label">Instagram (URL)</label><input className="input w-full" value={form.instagram ?? ''} onChange={e => set('instagram', e.target.value)} /></div>
          </div>
        </div>

        {/* Live preview */}
        <div className="lg:sticky lg:top-6 self-start">
          <p className="text-sm font-semibold text-gray-500 mb-3">Vista previa</p>
          <div className="rounded-2xl overflow-hidden shadow-lg border border-gray-200">
            <div className="bg-gradient-to-br from-orange-500 to-orange-700 text-white p-8">
              <div className="flex items-center gap-2.5 mb-6">
                <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center"><GraduationCap size={22} /></div>
                <span className="font-extrabold text-lg">{form.businessName || 'Nombre del negocio'}</span>
              </div>
              <h3 className="text-2xl font-extrabold leading-tight">{form.tagline || 'Tu proveedor educativo de confianza'}</h3>
            </div>
            <div className="bg-white p-6 space-y-4">
              {form.aboutText && <p className="text-sm text-gray-600 leading-relaxed">{form.aboutText}</p>}
              <div className="grid grid-cols-2 gap-3 text-sm">
                {form.phone && <PreviewItem icon={Phone} text={form.phone} />}
                {form.whatsapp && <PreviewItem icon={MessageCircle} text={form.whatsapp} />}
                {form.email && <PreviewItem icon={Mail} text={form.email} />}
                {(form.address || form.city) && <PreviewItem icon={MapPin} text={form.address || form.city || ''} />}
              </div>
              {(form.facebook || form.instagram) && (
                <div className="flex gap-2 pt-2 border-t">
                  {form.facebook && <span className="w-9 h-9 rounded-full bg-gray-100 text-gray-600 flex items-center justify-center"><Facebook size={16} /></span>}
                  {form.instagram && <span className="w-9 h-9 rounded-full bg-gray-100 text-gray-600 flex items-center justify-center"><Instagram size={16} /></span>}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function PreviewItem({ icon: Icon, text }: { icon: typeof Phone; text: string }) {
  return (
    <div className="flex items-center gap-2 text-gray-600">
      <Icon size={15} className="text-orange-500 flex-shrink-0" />
      <span className="truncate">{text}</span>
    </div>
  )
}
