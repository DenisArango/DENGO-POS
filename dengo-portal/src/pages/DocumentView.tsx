import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { ArrowLeft, Printer } from 'lucide-react'
import PortalLayout from '../components/layout/PortalLayout'
import { api } from '../lib/api'
import type { PortalDocument } from '../types'
import { money } from '../lib/labels'

const fmt = (d: string) => new Date(d).toLocaleDateString('es-GT', { day: '2-digit', month: 'long', year: 'numeric' })
// "Válida hasta" is a calendar date saved as UTC midnight: read it in UTC or
// Guatemala (UTC-6) shows the day before.
const fmtDay = (d: string) => new Date(d).toLocaleDateString('es-GT', { day: '2-digit', month: 'long', year: 'numeric', timeZone: 'UTC' })

export default function DocumentView() {
  const { kind, id } = useParams<{ kind: 'quotation' | 'invoice'; id: string }>()
  const [doc, setDoc] = useState<PortalDocument | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!kind || !id) return
    api.getDocument(kind, id)
      .then(setDoc)
      .catch(e => toast.error(e instanceof Error ? e.message : 'No se pudo abrir el documento'))
      .finally(() => setLoading(false))
  }, [kind, id])

  const title = doc?.kind === 'INVOICE' ? 'Factura' : 'Cotización'

  return (
    <PortalLayout>
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center justify-between gap-3 mb-4 print:hidden">
          <Link to="/messages" className="inline-flex items-center gap-1.5 text-gray-500 hover:text-gray-700 text-sm"><ArrowLeft size={16} /> Volver a mensajes</Link>
          {doc && (
            <button onClick={() => window.print()} className="px-4 py-2.5 rounded-xl bg-brand-500 text-white text-sm font-semibold hover:bg-brand-600 flex items-center gap-2">
              <Printer size={16} /> Imprimir o guardar PDF
            </button>
          )}
        </div>

        {loading ? (
          <div className="flex items-center justify-center h-64"><div className="w-8 h-8 border-4 border-brand-500 border-t-transparent rounded-full animate-spin" /></div>
        ) : !doc ? (
          <p className="text-center text-gray-500 py-20">Documento no encontrado.</p>
        ) : (
          <article id="print-document" className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 sm:p-10 print:border-0 print:shadow-none print:p-0 text-gray-800">
            <header className="flex flex-wrap justify-between gap-6 border-b-2 border-gray-900 pb-5 mb-6">
              <div className="flex items-start gap-4">
                {doc.issuer.logo && <img src={doc.issuer.logo} alt="" className="w-16 h-16 object-contain" />}
                <div className="text-sm leading-relaxed">
                  <p className="text-lg font-extrabold text-gray-900">{doc.issuer.tradeName || doc.issuer.name}</p>
                  {doc.issuer.name && doc.issuer.name !== doc.issuer.tradeName && <p>{doc.issuer.name}</p>}
                  {doc.issuer.taxId && <p>NIT {doc.issuer.taxId}</p>}
                  {(doc.issuer.address || doc.issuer.city) && <p>{[doc.issuer.address, doc.issuer.city].filter(Boolean).join(', ')}</p>}
                  {(doc.issuer.phone || doc.issuer.email) && <p>{[doc.issuer.phone, doc.issuer.email].filter(Boolean).join(' · ')}</p>}
                </div>
              </div>
              <div className="text-right text-sm">
                <p className="text-2xl font-extrabold text-gray-900">{title}</p>
                <p className="font-mono font-semibold">{doc.number}</p>
                <p className="text-gray-500 mt-1">{fmt(doc.date)}</p>
                {doc.validUntil && <p className="text-gray-500">Válida hasta {fmtDay(doc.validUntil)}</p>}
              </div>
            </header>

            <section className="grid sm:grid-cols-2 gap-4 text-sm mb-6">
              <div>
                <p className="text-xs font-semibold text-gray-500">Cliente</p>
                <p className="font-semibold text-gray-900">{doc.customer.name}</p>
                <p>NIT {doc.customer.nit}</p>
              </div>
              {doc.order && (
                <div className="sm:text-right">
                  <p className="text-xs font-semibold text-gray-500">Pedido</p>
                  <p className="font-semibold text-gray-900">{doc.order.orderNumber} · {doc.order.school}</p>
                  {doc.order.grades && <p>{doc.order.grades}</p>}
                </div>
              )}
            </section>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-900 text-left">
                    <th className="py-2 pr-2">Descripción</th>
                    <th className="py-2 px-2 text-right">Cant.</th>
                    <th className="py-2 px-2 text-right">Precio</th>
                    <th className="py-2 pl-2 text-right">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {doc.items.map((it, i) => (
                    <tr key={i} className="border-b border-gray-200">
                      <td className="py-2 pr-2">{it.description}</td>
                      <td className="py-2 px-2 text-right">{it.quantity}</td>
                      <td className="py-2 px-2 text-right whitespace-nowrap">{money(it.unitPrice)}</td>
                      <td className="py-2 pl-2 text-right whitespace-nowrap font-semibold">{money(it.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <dl className="ml-auto mt-4 w-full sm:w-64 text-sm space-y-1">
              <div className="flex justify-between"><dt>Subtotal</dt><dd>{money(doc.subtotal)}</dd></div>
              {doc.discount > 0 && <div className="flex justify-between"><dt>Descuento</dt><dd>−{money(doc.discount)}</dd></div>}
              {doc.tax > 0 && <div className="flex justify-between"><dt>Impuesto</dt><dd>{money(doc.tax)}</dd></div>}
              <div className="flex justify-between border-t border-gray-900 pt-2 text-base font-extrabold text-gray-900"><dt>Total</dt><dd>{money(doc.total)}</dd></div>
            </dl>

            {doc.kind === 'INVOICE' && doc.fel && (
              <section className="mt-8 rounded-xl bg-gray-50 print:bg-white print:border print:border-gray-300 p-4 text-xs text-gray-600 space-y-0.5">
                {doc.fel.voided ? (
                  <p className="font-semibold text-red-700">Esta factura fue anulada en la SAT.</p>
                ) : doc.fel.status === 'CERTIFIED' ? (
                  <>
                    <p className="font-semibold text-gray-800">Documento Tributario Electrónico — Factura (FEL)</p>
                    {doc.fel.test && <p className="font-semibold text-orange-700">Documento de prueba: sin validez fiscal.</p>}
                    {doc.fel.serie && <p>Serie: <span className="font-mono">{doc.fel.serie}</span> · Número: <span className="font-mono">{doc.fel.number}</span></p>}
                    {doc.fel.authNumber && <p>Número de autorización: <span className="font-mono">{doc.fel.authNumber}</span></p>}
                    {doc.fel.certifiedAt && <p>Fecha de certificación: {fmt(doc.fel.certifiedAt)}</p>}
                    {doc.fel.certifierName && <p>Certificador: {doc.fel.certifierName}{doc.fel.certifierNit ? ` · NIT ${doc.fel.certifierNit}` : ''}</p>}
                    {doc.fel.pdfUrl && <p className="print:hidden"><a href={doc.fel.pdfUrl} target="_blank" rel="noopener" className="text-brand-700 font-semibold underline">Descargar PDF oficial</a></p>}
                  </>
                ) : (
                  <p>Factura pendiente de certificación electrónica. El proveedor te enviará la versión certificada.</p>
                )}
              </section>
            )}
            {doc.notes && <p className="mt-6 text-sm text-gray-600"><strong>Notas:</strong> {doc.notes}</p>}
          </article>
        )}
      </div>
    </PortalLayout>
  )
}
