// Contingencias FEL: the periods in which facturas were handed out as
// "Documento en contingencia" (the certifier couldn't be reached), with what
// the SAT's "Aviso de contingencia" asks for — start, end, establishment,
// reason and number of documents (Reglas y validaciones FEL 4.1, punto 3).
// The aviso itself is filed by the client in the Agencia Virtual SAT, or by
// email to efactura@sat.gob.gt; here it is only marked as done.

import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { WifiOff, CheckCircle2, Clock, AlertTriangle, ChevronDown, ChevronRight, Copy } from 'lucide-react'
import { toast } from 'sonner'
import { api } from '../../lib/api'

interface ContingencyDoc {
  id: string; invoiceNumber: string; accessNumber: string; issuedAt: string; status: string
  certifiedAt: string | null; serie: string | null; number: string | null; voided: boolean; total: number
  notifiedAt: string | null; deadline: string
}

interface Period {
  branchId: string; branch: string; establishment: string | null
  start: string; end: string | null; lastIssued: string; reason: string | null
  count: number; certified: number; pending: number; failed: number; notifiedAt: string | null
  docs: ContingencyDoc[]
}

const dt = (s: string | null) => (s ? new Date(s).toLocaleString('es-GT', { dateStyle: 'short', timeStyle: 'short' }) : '—')

export default function ContingencyPanel({ canNotify }: { canNotify: boolean }) {
  const [periods, setPeriods] = useState<Period[] | null>(null)
  const [open, setOpen] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(() => {
    api.get<Period[]>('/api/fel/contingencies').then(setPeriods).catch(e => toast.error((e as Error).message))
  }, [])
  useEffect(() => { load() }, [load])

  const mark = async (p: Period, undo = false) => {
    setBusy(true)
    try {
      await api.post('/api/fel/contingencies/notified', { saleIds: p.docs.map(d => d.id), undo })
      toast.success(undo ? 'Aviso desmarcado' : 'Aviso marcado como presentado')
      load()
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const copyAviso = (p: Period) => {
    const text = [
      `Aviso de contingencia FEL`,
      `Establecimiento: ${p.establishment ?? '—'} (${p.branch})`,
      `Inicio: ${dt(p.start)}`,
      `Fin: ${p.end ? dt(p.end) : 'en curso'}`,
      `Motivo: ${p.reason ?? 'Sin conexión con el certificador'}`,
      `Cantidad de documentos emitidos: ${p.count}`,
    ].join('\n')
    navigator.clipboard.writeText(text).then(() => toast.success('Datos del aviso copiados')).catch(() => toast.error('No se pudo copiar'))
  }

  if (!periods) return null

  return (
    <div className="bg-white rounded-xl border border-gray-200/80 shadow-sm overflow-hidden">
      <div className="px-5 py-3 border-b flex items-center gap-2">
        <WifiOff size={16} className="text-amber-600" />
        <h2 className="text-sm font-semibold text-gray-700">Contingencias</h2>
        <span className="text-xs text-gray-400">últimos 60 días</span>
      </div>
      {periods.length === 0 ? (
        <p className="px-5 py-4 text-sm text-gray-500 flex items-center gap-2"><CheckCircle2 size={16} className="text-emerald-600" /> No ha habido facturas emitidas en contingencia.</p>
      ) : (
        <ul className="divide-y">
          {periods.map(p => {
            const key = `${p.branchId}-${p.start}`
            const isOpen = open === key
            return (
              <li key={key}>
                <div className="px-5 py-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
                  <button onClick={() => setOpen(isOpen ? null : key)} className="flex items-center gap-1.5 font-medium text-gray-800" aria-expanded={isOpen}>
                    {isOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                    {p.branch}{p.establishment ? ` · est. ${p.establishment}` : ''}
                  </button>
                  <span className="text-gray-600">{dt(p.start)} → {p.end ? dt(p.end) : <span className="text-amber-700 font-medium">en curso</span>}</span>
                  <span className="text-gray-600">{p.count} documento{p.count === 1 ? '' : 's'}</span>
                  <span className="flex items-center gap-2 text-xs">
                    {p.certified > 0 && <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700">{p.certified} certificado{p.certified === 1 ? '' : 's'}</span>}
                    {p.pending > 0 && <span className="px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 inline-flex items-center gap-1"><Clock size={12} />{p.pending} pendiente{p.pending === 1 ? '' : 's'}</span>}
                    {p.failed > 0 && <span className="px-2 py-0.5 rounded-full bg-rose-50 text-rose-700 inline-flex items-center gap-1"><AlertTriangle size={12} />{p.failed} con error</span>}
                  </span>
                  <span className="ml-auto flex items-center gap-2">
                    {p.notifiedAt
                      ? <span className="text-xs text-emerald-700 inline-flex items-center gap-1"><CheckCircle2 size={14} /> Aviso presentado {dt(p.notifiedAt)}</span>
                      : <span className="text-xs text-amber-700">Aviso pendiente</span>}
                    <button onClick={() => copyAviso(p)} className="btn-outline btn-sm flex items-center gap-1.5"><Copy size={13} /> Copiar datos del aviso</button>
                    {canNotify && (p.notifiedAt
                      ? <button disabled={busy} onClick={() => mark(p, true)} className="btn-sm text-xs text-gray-500 hover:underline">Desmarcar</button>
                      : <button disabled={busy || !p.end} onClick={() => mark(p)} className="btn-primary btn-sm" title={p.end ? undefined : 'El aviso se presenta al terminar la contingencia'}>Marcar aviso presentado</button>)}
                  </span>
                </div>
                {isOpen && (
                  <div className="px-5 pb-4">
                    {p.reason && <p className="text-xs text-gray-500 mb-2">Motivo: {p.reason}</p>}
                    <table className="w-full text-xs">
                      <thead className="text-gray-400"><tr>
                        <th className="text-left py-1">Venta</th><th className="text-left">No. de acceso</th><th className="text-left">Emitido</th>
                        <th className="text-right">Total</th><th className="text-left pl-4">Estado</th><th className="text-left">Plazo SAT</th>
                      </tr></thead>
                      <tbody className="divide-y">
                        {p.docs.map(d => (
                          <tr key={d.id}>
                            <td className="py-1.5"><Link to={`/reports/sales/${d.id}`} className="text-primary-600 hover:underline">{d.invoiceNumber}</Link></td>
                            <td className="font-mono">{d.accessNumber}</td>
                            <td>{dt(d.issuedAt)}</td>
                            <td className="text-right">Q{d.total.toFixed(2)}</td>
                            <td className="pl-4">{d.voided ? 'Anulada' : d.certifiedAt ? `Certificada ${d.serie}-${d.number}` : d.status === 'FAILED' ? <span className="text-rose-700">Con error</span> : <span className="text-amber-700">Pendiente</span>}</td>
                            <td>{d.certifiedAt ? '—' : dt(d.deadline)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}
      <p className="px-5 py-3 text-xs text-gray-500 border-t">
        Cuando no hay conexión con el certificador, la factura sale como «Documento en contingencia» con un número de acceso, y DENGO la certifica sola al volver la conexión (la SAT da 5 días).
        Al terminar cada contingencia, el cliente presenta el aviso en la Agencia Virtual SAT → Factura Electrónica en Línea → Aviso de Contingencia, o por correo a efactura@sat.gob.gt.
      </p>
    </div>
  )
}
