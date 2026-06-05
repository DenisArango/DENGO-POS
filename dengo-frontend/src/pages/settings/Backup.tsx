import { useState } from 'react'
import { motion } from 'framer-motion'
import { ArrowLeft, Database, Download, Upload, Calendar, Clock, CheckCircle, AlertCircle } from 'lucide-react'
import { toast } from 'sonner'
import { useNavigate } from 'react-router-dom'

interface BackupRecord {
  id: string
  date: string
  size: string
  type: 'auto' | 'manual'
  status: 'completed' | 'failed'
}

const mockBackups: BackupRecord[] = [
  { id: '1', date: '2024-01-20 02:00:00', size: '45.2 MB', type: 'auto', status: 'completed' },
  { id: '2', date: '2024-01-19 02:00:00', size: '44.8 MB', type: 'auto', status: 'completed' },
  { id: '3', date: '2024-01-18 15:30:00', size: '43.5 MB', type: 'manual', status: 'completed' }
]

export default function Backup() {
  const navigate = useNavigate()
  const [autoBackup, setAutoBackup] = useState(true)
  const [backupTime, setBackupTime] = useState('02:00')
  const [backupFrequency, setBackupFrequency] = useState('daily')
  const [backups] = useState<BackupRecord[]>(mockBackups)
  const [hasChanges, setHasChanges] = useState(false)

  const handleCreateBackup = () => {
    toast.promise(
      new Promise((resolve) => setTimeout(resolve, 2000)),
      {
        loading: 'Creando respaldo...',
        success: 'Respaldo creado exitosamente',
        error: 'Error al crear respaldo'
      }
    )
  }

  const handleSave = () => {
    toast.success('Configuración de respaldos guardada')
    setHasChanges(false)
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button onClick={() => navigate('/settings')} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
            <ArrowLeft size={20} />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
              <Database size={28} />
              Respaldos
            </h1>
            <p className="text-gray-600 text-sm mt-1">Configurar respaldos automáticos y restauración</p>
          </div>
        </div>
        <button onClick={handleCreateBackup} className="btn-primary btn-md flex items-center gap-2">
          <Download size={18} />
          Crear Respaldo Manual
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="bg-white rounded-lg shadow-sm p-6">
          <h2 className="text-lg font-semibold text-gray-800 mb-4">Configuración Automática</h2>

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-gray-700">Respaldos Automáticos</p>
                <p className="text-sm text-gray-500">Crear respaldos programados</p>
              </div>
              <button
                onClick={() => { setAutoBackup(!autoBackup); setHasChanges(true); }}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  autoBackup ? 'bg-primary-600' : 'bg-gray-300'
                }`}
              >
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  autoBackup ? 'translate-x-6' : 'translate-x-1'
                }`} />
              </button>
            </div>

            {autoBackup && (
              <>
                <div>
                  <label className="label">Frecuencia</label>
                  <select value={backupFrequency} onChange={(e) => { setBackupFrequency(e.target.value); setHasChanges(true); }} className="input w-full">
                    <option value="daily">Diario</option>
                    <option value="weekly">Semanal</option>
                    <option value="monthly">Mensual</option>
                  </select>
                </div>

                <div>
                  <label className="label">Hora de Respaldo</label>
                  <input type="time" value={backupTime} onChange={(e) => { setBackupTime(e.target.value); setHasChanges(true); }} className="input w-full" />
                </div>

                <button onClick={handleSave} disabled={!hasChanges} className={`btn-primary btn-md w-full ${!hasChanges ? 'opacity-50 cursor-not-allowed' : ''}`}>
                  Guardar Configuración
                </button>
              </>
            )}
          </div>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="bg-white rounded-lg shadow-sm p-6">
          <h2 className="text-lg font-semibold text-gray-800 mb-4">Restaurar Respaldo</h2>

          <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center">
            <Upload className="mx-auto text-gray-400 mb-3" size={48} />
            <p className="text-gray-600 mb-2">Selecciona un archivo de respaldo</p>
            <label className="btn-outline btn-md inline-flex items-center gap-2 cursor-pointer">
              <Upload size={18} />
              Seleccionar Archivo
              <input type="file" accept=".zip,.sql" className="hidden" />
            </label>
          </div>

          <div className="mt-4 bg-yellow-50 border border-yellow-200 rounded-lg p-3">
            <div className="flex items-start gap-2">
              <AlertCircle className="text-yellow-600 flex-shrink-0 mt-0.5" size={18} />
              <p className="text-sm text-yellow-800">
                Advertencia: Restaurar un respaldo sobrescribirá todos los datos actuales.
              </p>
            </div>
          </div>
        </motion.div>
      </div>

      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="bg-white rounded-lg shadow-sm p-6">
        <h2 className="text-lg font-semibold text-gray-800 mb-4">Historial de Respaldos</h2>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">Fecha y Hora</th>
                <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">Tamaño</th>
                <th className="text-center py-3 px-4 text-sm font-medium text-gray-700">Tipo</th>
                <th className="text-center py-3 px-4 text-sm font-medium text-gray-700">Estado</th>
                <th className="text-center py-3 px-4 text-sm font-medium text-gray-700">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {backups.map((backup, index) => (
                <tr key={backup.id} className="border-b hover:bg-gray-50">
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-2">
                      <Calendar size={16} className="text-gray-400" />
                      <span className="text-sm">{backup.date}</span>
                    </div>
                  </td>
                  <td className="py-3 px-4 text-sm">{backup.size}</td>
                  <td className="py-3 px-4 text-center">
                    <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                      backup.type === 'auto' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'
                    }`}>
                      {backup.type === 'auto' ? 'Automático' : 'Manual'}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-center">
                    {backup.status === 'completed' ? (
                      <CheckCircle size={18} className="text-green-600 mx-auto" />
                    ) : (
                      <AlertCircle size={18} className="text-red-600 mx-auto" />
                    )}
                  </td>
                  <td className="py-3 px-4 text-center">
                    <button className="btn-outline btn-sm">
                      <Download size={14} className="mr-1" />
                      Descargar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </motion.div>
    </div>
  )
}
