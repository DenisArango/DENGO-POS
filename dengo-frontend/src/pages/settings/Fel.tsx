import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, FileText, PlugZap, CheckCircle2, AlertTriangle, Server } from 'lucide-react'
import { toast } from 'sonner'
import { api } from '../../lib/api'
import { useLicenseStore } from '../../store'
import PageIcon from '../../components/common/PageIcon'
import { Clock, Ban, FileMinus, type LucideIcon } from 'lucide-react'

// Facturación electrónica (FEL): read-only view of how this server is wired to
// the certifier (.env: FEL_PROVIDER, FELPLEX_*), per-branch establishments, and
// a live connection test. Keys never reach the browser.

interface FelStatus {
  config: {
    provider: 'none' | 'mock' | 'felplex'
    environment: 'mock' | 'stage' | 'production'
    baseUrl: string | null
    defaultEntityId: string | null
    hasDefaultApiKey: boolean
    entitiesWithOwnKey: string[]
    docType: string
    ivaRate: number
    allowCf: boolean
    cfMaxTotal: number
    sendEmail: boolean
    retryMinutes: number
    maxAttempts: number
  }
  counts: { pending: number; failed: number; voidFailed: number; creditNotesPending: number }
  branches: { id: string; name: string; entityId: string | null; felEstablishmentCode: string | null; ready: boolean }[]
}

interface TestResult { provider: string; environment: string; results: { branch: string; entityId?: string; ok: boolean; credits?: number | null; error?: string }[] }

const PROVIDER: Record<string, string> = { none: 'Sin certificador (las facturas quedan pendientes)', mock: 'Simulador interno (sin validez fiscal)', felplex: 'FELplex' }
const ENV: Record<string, string> = { mock: 'Simulación', stage: 'Pruebas (stage)', production: 'Producción' }
const DOC: Record<string, string> = { FACT: 'Factura — contribuyente general (IVA 12 %)', FPEQ: 'Factura pequeño contribuyente', FAPE: 'Factura pequeño contribuyente régimen electrónico' }

export default function FelSettings() {
  const navigate = useNavigate()
  const felEnabled = useLicenseStore(s => s.felEnabled)
  const [status, setStatus] = useState<FelStatus | null>(null)
  const [test, setTest] = useState<TestResult | null>(null)
  const [testing, setTesting] = useState(false)

  useEffect(() => { api.get<FelStatus>('/api/fel/status').then(setStatus).catch(e => toast.error(e.message)) }, [])

  const runTest = async () => {
    setTesting(true)
    try { setTest(await api.post<TestResult>('/api/fel/test', {})) } catch (e) { toast.error((e as Error).message) } finally { setTesting(false) }
  }

  const c = status?.config
  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate('/settings')} className="p-2 hover:bg-gray-100 rounded-lg"><ArrowLeft size={20} /></button>
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900 flex items-center gap-3"><PageIcon icon={FileText} color="violet" /> Facturación electrónica (FEL)</h1>
          <p className="text-sm text-gray-500">Certificación de facturas ante la SAT a través del certificador.</p>
        </div>
      </div>

      {!felEnabled && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-sm text-amber-800">
          La facturación está apagada en la licencia de este cliente: la casilla «¿Generar factura?» no aparece en caja. Se activa desde la licencia (felEnabled) cuando el cliente ya está habilitado en la SAT.
        </div>
      )}

      {c && (
        <div className="bg-white rounded-xl border border-gray-200/80 shadow-sm p-5 grid sm:grid-cols-2 gap-4 text-sm">
          <Item label="Certificador" value={PROVIDER[c.provider] ?? c.provider} />
          <Item label="Ambiente" value={ENV[c.environment] ?? c.environment} warn={c.provider !== 'none' && c.environment !== 'production'} />
          <Item label="Tipo de documento" value={DOC[c.docType] ?? c.docType} />
          <Item label="IVA" value={`${(c.ivaRate * 100).toFixed(0)} % incluido en precios`} />
          <Item label="Consumidor Final (sin NIT)" value={c.allowCf ? `Permitido hasta Q${c.cfMaxTotal.toFixed(2)}` : 'No: toda factura pide NIT'} />
          <Item label="Enviar factura por correo al cliente" value={c.sendEmail ? 'Sí (si el cliente tiene correo)' : 'No'} />
          <Item label="Credenciales" value={c.provider === 'felplex' ? (c.hasDefaultApiKey || c.entitiesWithOwnKey.length ? 'API Key configurada' : 'Falta FELPLEX_API_KEY') : '—'} warn={c.provider === 'felplex' && !c.hasDefaultApiKey && !c.entitiesWithOwnKey.length} />
          <Item label="Reintento automático" value={c.retryMinutes > 0 ? `Cada ${c.retryMinutes} min, hasta ${c.maxAttempts} intentos` : 'Apagado'} />
          <p className="sm:col-span-2 text-xs text-gray-500 flex items-center gap-1.5"><Server size={13} /> Estos valores se cambian en el archivo .env del servidor (FEL_PROVIDER, FELPLEX_ENV, FELPLEX_ENTITY_ID, FELPLEX_API_KEY, FEL_DOC_TYPE…).</p>
        </div>
      )}

      {status && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Count label="Facturas pendientes" n={status.counts.pending} icon={Clock} tile="bg-amber-50 text-amber-600" />
          <Count label="Facturas con error" n={status.counts.failed} bad icon={AlertTriangle} tile="bg-rose-50 text-rose-600" />
          <Count label="Anulaciones con error" n={status.counts.voidFailed} bad icon={Ban} tile="bg-orange-50 text-orange-600" />
          <Count label="Notas de crédito por certificar" n={status.counts.creditNotesPending} bad icon={FileMinus} tile="bg-violet-50 text-violet-600" />
        </div>
      )}

      {status && (
        <div className="bg-white rounded-xl border border-gray-200/80 shadow-sm overflow-hidden">
          <div className="px-5 py-3 border-b flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-700">Establecimientos (sucursales)</h2>
            <button onClick={runTest} disabled={testing || c?.provider === 'none'} className="btn-primary btn-sm flex items-center gap-1.5">
              <PlugZap size={15} /> {testing ? 'Probando…' : 'Probar conexión'}
            </button>
          </div>
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs text-gray-500"><tr><th className="text-left px-5 py-2">Sucursal</th><th className="text-left px-5 py-2">Empresa FELplex</th><th className="text-left px-5 py-2">Establecimiento SAT</th><th className="text-left px-5 py-2">Prueba</th></tr></thead>
            <tbody className="divide-y">
              {status.branches.map(b => {
                const r = test?.results.find(x => x.branch === b.name)
                return (
                  <tr key={b.id}>
                    <td className="px-5 py-2 font-medium text-gray-800">{b.name}</td>
                    <td className="px-5 py-2 font-mono text-xs">{b.entityId ?? (c?.provider === 'mock' ? <span className="text-gray-500 font-sans">Simulador</span> : <span className="text-red-600 font-sans">Sin configurar</span>)}</td>
                    <td className="px-5 py-2">{b.felEstablishmentCode ?? '—'}</td>
                    <td className="px-5 py-2">
                      {!r ? '—' : r.ok
                        ? <span className="inline-flex items-center gap-1 text-green-700"><CheckCircle2 size={14} /> Conectado{r.credits != null ? ` · ${r.credits} DTE disponibles` : ''}</span>
                        : <span className="inline-flex items-center gap-1 text-red-700"><AlertTriangle size={14} /> {r.error}</span>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          <p className="px-5 py-3 text-xs text-gray-500 border-t">El ID de empresa de cada sucursal se edita en Configuración → Tiendas. Cada establecimiento de la SAT es una empresa distinta en FELplex.</p>
        </div>
      )}
    </div>
  )
}

function Item({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div>
      <p className="text-xs text-gray-400">{label}</p>
      <p className={`font-medium ${warn ? 'text-amber-700' : 'text-gray-800'}`}>{value}</p>
    </div>
  )
}

function Count({ label, n, bad, icon: Icon, tile }: { label: string; n: number; bad?: boolean; icon: LucideIcon; tile: string }) {
  // All clear shows a green check; anything pending keeps its own colour.
  const ok = n === 0
  return (
    <div className="group bg-white rounded-xl border border-gray-200/80 shadow-sm p-4 flex items-start justify-between gap-3 transition-[transform,box-shadow] duration-200 hover:shadow-md motion-safe:hover:-translate-y-0.5">
      <div className="min-w-0">
        <p className="text-xs text-gray-500">{label}</p>
        <p className={`text-2xl font-bold ${n > 0 && bad ? 'text-red-600' : 'text-gray-800'}`}>{n}</p>
      </div>
      <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition-transform duration-300 motion-safe:group-hover:scale-110 ${ok ? 'bg-emerald-50 text-emerald-600' : tile}`}>
        {ok ? <CheckCircle2 size={18} aria-hidden /> : <Icon size={18} className="motion-safe:group-hover:animate-wiggle" aria-hidden />}
      </span>
    </div>
  )
}
