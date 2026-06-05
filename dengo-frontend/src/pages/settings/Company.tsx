import { useState } from 'react'
import { motion } from 'framer-motion'
import { ArrowLeft, Building2, Save, Upload, MapPin, Phone, Mail, Globe, FileText, Hash } from 'lucide-react'
import { toast } from 'sonner'
import { useNavigate } from 'react-router-dom'

interface CompanyInfo {
  name: string
  legalName: string
  taxId: string
  address: string
  city: string
  country: string
  phone: string
  email: string
  website: string
  logo?: string
  description: string
  industry: string
}

const mockCompanyInfo: CompanyInfo = {
  name: 'DENGO POS',
  legalName: 'DENGO Sistemas S.A. de C.V.',
  taxId: '123456789-0',
  address: 'Av. Principal 123',
  city: 'Ciudad de Guatemala',
  country: 'Guatemala',
  phone: '+502 2345-6789',
  email: 'contacto@dengopos.com',
  website: 'www.dengopos.com',
  description: 'Sistema de punto de venta para pequeños y medianos negocios',
  industry: 'Retail'
}

export default function Company() {
  const navigate = useNavigate()
  const [companyInfo, setCompanyInfo] = useState<CompanyInfo>(mockCompanyInfo)
  const [hasChanges, setHasChanges] = useState(false)

  const handleChange = (field: keyof CompanyInfo, value: string) => {
    setCompanyInfo(prev => ({ ...prev, [field]: value }))
    setHasChanges(true)
  }

  const handleSave = () => {
    // Aquí iría la lógica para guardar en el backend
    console.log('Guardando información de empresa:', companyInfo)
    toast.success('Información de empresa actualizada exitosamente')
    setHasChanges(false)
  }

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      // Aquí iría la lógica para subir el archivo
      const reader = new FileReader()
      reader.onloadend = () => {
        setCompanyInfo(prev => ({ ...prev, logo: reader.result as string }))
        setHasChanges(true)
        toast.success('Logo cargado exitosamente')
      }
      reader.readAsDataURL(file)
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate('/settings')}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <ArrowLeft size={20} />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
              <Building2 size={28} />
              Información de Empresa
            </h1>
            <p className="text-gray-600 text-sm mt-1">
              Datos fiscales, logo y configuración general de la empresa
            </p>
          </div>
        </div>

        <button
          onClick={handleSave}
          disabled={!hasChanges}
          className={`btn-primary btn-md flex items-center gap-2 ${
            !hasChanges ? 'opacity-50 cursor-not-allowed' : ''
          }`}
        >
          <Save size={18} />
          Guardar Cambios
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Logo */}
        <div className="lg:col-span-1">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white rounded-lg shadow-sm p-6"
          >
            <h2 className="text-lg font-semibold text-gray-800 mb-4">Logo de la Empresa</h2>

            <div className="space-y-4">
              <div className="w-full h-48 bg-gray-100 rounded-lg flex items-center justify-center overflow-hidden">
                {companyInfo.logo ? (
                  <img src={companyInfo.logo} alt="Logo" className="max-w-full max-h-full object-contain" />
                ) : (
                  <Building2 size={64} className="text-gray-400" />
                )}
              </div>

              <label className="btn-outline btn-md w-full flex items-center justify-center gap-2 cursor-pointer">
                <Upload size={18} />
                Subir Logo
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleLogoUpload}
                  className="hidden"
                />
              </label>

              <p className="text-xs text-gray-500 text-center">
                Formatos permitidos: PNG, JPG, SVG
                <br />
                Tamaño máximo: 2MB
              </p>
            </div>
          </motion.div>
        </div>

        {/* Información General */}
        <div className="lg:col-span-2 space-y-6">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="bg-white rounded-lg shadow-sm p-6"
          >
            <h2 className="text-lg font-semibold text-gray-800 mb-4">Información General</h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="label">Nombre Comercial *</label>
                <input
                  type="text"
                  value={companyInfo.name}
                  onChange={(e) => handleChange('name', e.target.value)}
                  className="input w-full"
                  placeholder="DENGO POS"
                />
              </div>

              <div>
                <label className="label">Razón Social *</label>
                <input
                  type="text"
                  value={companyInfo.legalName}
                  onChange={(e) => handleChange('legalName', e.target.value)}
                  className="input w-full"
                  placeholder="DENGO Sistemas S.A. de C.V."
                />
              </div>

              <div>
                <label className="label">NIT / RFC *</label>
                <div className="relative">
                  <Hash className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={18} />
                  <input
                    type="text"
                    value={companyInfo.taxId}
                    onChange={(e) => handleChange('taxId', e.target.value)}
                    className="input w-full pl-10"
                    placeholder="123456789-0"
                  />
                </div>
              </div>

              <div>
                <label className="label">Industria</label>
                <select
                  value={companyInfo.industry}
                  onChange={(e) => handleChange('industry', e.target.value)}
                  className="input w-full"
                >
                  <option value="Retail">Retail / Comercio</option>
                  <option value="Restaurant">Restaurante</option>
                  <option value="Pharmacy">Farmacia</option>
                  <option value="Supermarket">Supermercado</option>
                  <option value="Hardware">Ferretería</option>
                  <option value="Other">Otro</option>
                </select>
              </div>

              <div className="md:col-span-2">
                <label className="label">Descripción</label>
                <textarea
                  value={companyInfo.description}
                  onChange={(e) => handleChange('description', e.target.value)}
                  className="input w-full"
                  rows={3}
                  placeholder="Breve descripción de la empresa..."
                />
              </div>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="bg-white rounded-lg shadow-sm p-6"
          >
            <h2 className="text-lg font-semibold text-gray-800 mb-4">Información de Contacto</h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2">
                <label className="label">Dirección *</label>
                <div className="relative">
                  <MapPin className="absolute left-3 top-3 text-gray-400" size={18} />
                  <textarea
                    value={companyInfo.address}
                    onChange={(e) => handleChange('address', e.target.value)}
                    className="input w-full pl-10"
                    rows={2}
                    placeholder="Av. Principal 123, Zona 10"
                  />
                </div>
              </div>

              <div>
                <label className="label">Ciudad *</label>
                <input
                  type="text"
                  value={companyInfo.city}
                  onChange={(e) => handleChange('city', e.target.value)}
                  className="input w-full"
                  placeholder="Ciudad de Guatemala"
                />
              </div>

              <div>
                <label className="label">País *</label>
                <input
                  type="text"
                  value={companyInfo.country}
                  onChange={(e) => handleChange('country', e.target.value)}
                  className="input w-full"
                  placeholder="Guatemala"
                />
              </div>

              <div>
                <label className="label">Teléfono *</label>
                <div className="relative">
                  <Phone className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={18} />
                  <input
                    type="tel"
                    value={companyInfo.phone}
                    onChange={(e) => handleChange('phone', e.target.value)}
                    className="input w-full pl-10"
                    placeholder="+502 2345-6789"
                  />
                </div>
              </div>

              <div>
                <label className="label">Correo Electrónico *</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={18} />
                  <input
                    type="email"
                    value={companyInfo.email}
                    onChange={(e) => handleChange('email', e.target.value)}
                    className="input w-full pl-10"
                    placeholder="contacto@empresa.com"
                  />
                </div>
              </div>

              <div className="md:col-span-2">
                <label className="label">Sitio Web</label>
                <div className="relative">
                  <Globe className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={18} />
                  <input
                    type="url"
                    value={companyInfo.website}
                    onChange={(e) => handleChange('website', e.target.value)}
                    className="input w-full pl-10"
                    placeholder="www.empresa.com"
                  />
                </div>
              </div>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="bg-blue-50 border border-blue-200 rounded-lg p-4"
          >
            <div className="flex items-start gap-3">
              <FileText className="text-blue-600 flex-shrink-0 mt-0.5" size={20} />
              <div>
                <h3 className="font-medium text-blue-900 mb-1">Información Importante</h3>
                <p className="text-sm text-blue-700">
                  Esta información aparecerá en facturas, recibos y otros documentos fiscales.
                  Asegúrate de que todos los datos sean correctos y estén actualizados.
                </p>
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  )
}
