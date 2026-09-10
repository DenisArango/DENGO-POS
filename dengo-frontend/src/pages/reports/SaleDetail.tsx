import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  ArrowLeft, Printer, Trash2, Save, Search, X,
  CheckCircle, AlertTriangle, Receipt
} from 'lucide-react'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { api } from '../../lib/api'
import { usePermissions } from '../../hooks/usePermissions'
import { toast } from 'sonner'
import ThermalReceipt from '../../components/print/ThermalReceipt'

const PM_LABEL: Record<string, string> = {
  CASH: 'Efectivo', CARD: 'Tarjeta', TRANSFER: 'Transferencia',
  CREDIT: 'Crédito', MIXED: 'Mixto',
}
const PM_COLOR: Record<string, string> = {
  CASH: 'bg-green-100 text-green-700', CARD: 'bg-blue-100 text-blue-700',
  TRANSFER: 'bg-purple-100 text-purple-700', CREDIT: 'bg-yellow-100 text-yellow-700',
  MIXED: 'bg-gray-100 text-gray-700',
}

interface EditItem {
  productId: string
  variationId?: string
  productName: string
  variationName?: string
  quantityStr: string
  priceStr: string
  discountStr: string // percentage 0-100
  cost: number
  convFactor: number
}

function toTotal(item: EditItem) {
  const qty = parseFloat(item.quantityStr) || 0
  const price = parseFloat(item.priceStr) || 0
  const disc = (parseFloat(item.discountStr) || 0) / 100
  return qty * price * (1 - disc)
}

function toCost(item: EditItem) {
  const qty = parseFloat(item.quantityStr) || 0
  return item.cost * item.convFactor * qty
}

export default function SaleDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { hasPermission } = usePermissions()
  const canEdit = hasPermission('sales.edit')
  const canVoid = hasPermission('sales.cancel')

  const [sale, setSale] = useState<any | null>(null)
  const [loading, setLoading] = useState(true)
  const [editMode, setEditMode] = useState(false)
  const [editItems, setEditItems] = useState<EditItem[]>([])
  const [editNotes, setEditNotes] = useState('')
  const [saving, setSaving] = useState(false)

  // Add product search
  const [productSearch, setProductSearch] = useState('')
  const [productResults, setProductResults] = useState<any[]>([])
  const [searchLoading, setSearchLoading] = useState(false)

  // Void
  const [showVoidConfirm, setShowVoidConfirm] = useState(false)
  const [voidReason, setVoidReason] = useState('')
  const [voiding, setVoiding] = useState(false)

  // Generate invoice (factura) after the fact
  const [showInvoiceForm, setShowInvoiceForm] = useState(false)
  const [invoiceBuyerNit, setInvoiceBuyerNit] = useState('')
  const [invoiceBuyerName, setInvoiceBuyerName] = useState('')
  const [generatingInvoice, setGeneratingInvoice] = useState(false)

  const fetchSale = useCallback(async () => {
    if (!id) return
    setLoading(true)
    try {
      const data = await api.get<any>(`/api/sales/${id}`)
      setSale(data)
      setEditNotes(data.notes ?? '')
    } catch { toast.error('Venta no encontrada') }
    finally { setLoading(false) }
  }, [id])

  useEffect(() => { fetchSale() }, [fetchSale])

  const startEdit = () => {
    if (!sale) return
    setEditItems((sale.items ?? []).map((item: any) => ({
      productId: item.product?.id ?? item.productId,
      variationId: item.variationId ?? undefined,
      productName: item.product?.name ?? 'Producto',
      variationName: item.variation?.name,
      quantityStr: String(Number(item.quantity)),
      priceStr: String(Number(item.unitPrice)),
      discountStr: String(Math.round(Number(item.discount ?? 0) * 100)),
      cost: Number(item.product?.cost ?? 0),
      convFactor: Number(item.variation?.conversionFactor ?? 1),
    })))
    setEditNotes(sale.notes ?? '')
    setEditMode(true)
  }

  const cancelEdit = () => { setEditMode(false); setProductSearch(''); setProductResults([]) }

  // Product search for adding items
  useEffect(() => {
    if (!productSearch.trim()) { setProductResults([]); return }
    const t = setTimeout(async () => {
      setSearchLoading(true)
      try {
        const data = await api.get<any[]>(`/api/products?search=${encodeURIComponent(productSearch)}&isActive=true`)
        setProductResults((data ?? []).slice(0, 8))
      } catch { setProductResults([]) }
      finally { setSearchLoading(false) }
    }, 250)
    return () => clearTimeout(t)
  }, [productSearch])

  const addProduct = (product: any, variation?: any) => {
    const existing = editItems.findIndex(i =>
      i.productId === product.id && (i.variationId ?? '') === (variation?.id ?? '')
    )
    if (existing >= 0) {
      setEditItems(prev => prev.map((item, idx) =>
        idx === existing
          ? { ...item, quantityStr: String((parseFloat(item.quantityStr) || 0) + 1) }
          : item
      ))
    } else {
      const isDefault = !variation || variation.isDefault
      setEditItems(prev => [...prev, {
        productId: product.id,
        variationId: isDefault ? undefined : variation?.id,
        productName: product.name,
        variationName: isDefault ? undefined : variation?.name,
        quantityStr: '1',
        priceStr: String(Number(variation?.price ?? product.basePrice ?? 0)),
        discountStr: '0',
        cost: Number(product.cost ?? 0),
        convFactor: Number(variation?.conversionFactor ?? 1),
      }])
    }
    setProductSearch('')
    setProductResults([])
  }

  const updateItem = (idx: number, field: keyof EditItem, val: string) => {
    setEditItems(prev => prev.map((item, i) => i === idx ? { ...item, [field]: val } : item))
  }

  const removeItem = (idx: number) => setEditItems(prev => prev.filter((_, i) => i !== idx))

  const handleSave = async () => {
    if (!id) return
    const items = editItems.map(item => ({
      productId: item.productId,
      variationId: item.variationId,
      quantity: parseFloat(item.quantityStr) || 0,
      unitPrice: parseFloat(item.priceStr) || 0,
      discount: (parseFloat(item.discountStr) || 0) / 100,
      total: toTotal(item),
    })).filter(i => i.quantity > 0)

    if (items.length === 0) { toast.error('La venta debe tener al menos un producto'); return }

    setSaving(true)
    try {
      const subtotal = items.reduce((s, i) => s + i.total, 0)
      await api.put(`/api/sales/${id}`, { items, subtotal, total: subtotal, notes: editNotes })
      toast.success('Venta actualizada')
      setEditMode(false)
      fetchSale()
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Error al guardar')
    } finally { setSaving(false) }
  }

  const openInvoiceForm = () => {
    if (!sale) return
    setInvoiceBuyerNit(sale.customer?.nit && sale.customer.nit !== 'C/F' && sale.customer.nit !== 'CF' ? sale.customer.nit : '')
    setInvoiceBuyerName(sale.customer?.name ?? '')
    setShowInvoiceForm(true)
  }

  const generateInvoice = async () => {
    if (!id) return
    if (!invoiceBuyerNit.trim()) { toast.error('Ingresa un NIT válido'); return }
    setGeneratingInvoice(true)
    try {
      await api.post(`/api/sales/${id}/generate-invoice`, {
        buyerNit: invoiceBuyerNit.trim(),
        buyerName: invoiceBuyerName.trim() || undefined,
      })
      toast.success('Factura generada')
      setShowInvoiceForm(false)
      fetchSale()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al generar factura')
    } finally {
      setGeneratingInvoice(false)
    }
  }

  const handleVoid = async () => {
    if (!id) return
    setVoiding(true)
    try {
      await api.delete(`/api/sales/${id}`, { reason: voidReason })
      toast.success('Venta anulada')
      setShowVoidConfirm(false)
      fetchSale()
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Error al anular')
    } finally { setVoiding(false) }
  }

  // Same thermal component the POS checkout receipt uses — printed straight
  // from this page (window.print()) instead of the old approach of opening a
  // blank popup window and writing raw HTML into it. That old approach had no
  // @page sizing at all (so it inherited whatever paper Windows defaulted to)
  // and, being a real navigable window, picked up Chrome's automatic
  // date/title/URL/page-number print header — both fixed by going through
  // the same path POS.tsx already uses correctly.
  const printSale = () => window.print()

  if (loading) return <div className="flex justify-center py-20"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary-600" /></div>
  if (!sale) return <div className="text-center py-20 text-gray-400">Venta no encontrada</div>

  const subtotal = editMode
    ? editItems.reduce((s, i) => s + toTotal(i), 0)
    : Number(sale.total)
  const totalProfit = editMode
    ? editItems.reduce((s, i) => s + toTotal(i) - toCost(i), 0)
    : (sale.saleProfit ?? 0)

  return (
    <>
    <div className="space-y-6 max-w-4xl mx-auto print:hidden">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="p-2 hover:bg-gray-100 rounded-lg"><ArrowLeft size={20} /></button>
          <div>
            <h1 className="text-2xl font-bold text-gray-800">{sale.invoiceNumber}</h1>
            <p className="text-sm text-gray-500">
              {format(new Date(sale.createdAt), "d 'de' MMMM yyyy, HH:mm", { locale: es })}
              {sale.isVoided && <span className="ml-2 text-red-500 font-semibold">— ANULADA</span>}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={printSale} className="btn-outline btn-sm flex items-center gap-1.5">
            <Printer size={15} /> Imprimir
          </button>
          {!sale.isVoided && !editMode && canEdit && !sale.requiresInvoice && (
            <button onClick={openInvoiceForm} className="btn-outline btn-sm flex items-center gap-1.5">
              <Receipt size={15} /> Generar factura
            </button>
          )}
          {!sale.isVoided && !editMode && canEdit && (
            <button onClick={startEdit} className="btn-outline btn-sm flex items-center gap-1.5">
              <Save size={15} /> Editar
            </button>
          )}
          {!sale.isVoided && !editMode && canVoid && (
            <button onClick={() => setShowVoidConfirm(true)} className="btn-sm bg-red-50 text-red-600 border border-red-200 hover:bg-red-100 rounded-lg px-3 flex items-center gap-1.5">
              <Trash2 size={15} /> Anular
            </button>
          )}
          {editMode && (
            <>
              <button onClick={cancelEdit} className="btn-outline btn-sm">Cancelar</button>
              <button onClick={handleSave} disabled={saving} className="btn-primary btn-sm flex items-center gap-1.5">
                {saving ? <div className="animate-spin rounded-full h-3.5 w-3.5 border-b-2 border-white" /> : <CheckCircle size={15} />}
                Guardar
              </button>
            </>
          )}
        </div>
      </div>

      {/* Info grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Cliente', value: sale.customer?.name ?? 'Consumidor Final' },
          { label: 'Cajero', value: sale.cashier?.name ?? '—' },
          { label: 'Sucursal', value: sale.branch?.name ?? '—' },
          { label: 'Caja', value: sale.cashRegister ? `${sale.cashRegister.name} #${sale.cashRegister.registerNumber}` : '—' },
        ].map(({ label, value }) => (
          <div key={label} className="bg-white rounded-lg shadow-sm p-4">
            <p className="text-xs text-gray-400 mb-1">{label}</p>
            <p className="text-sm font-medium text-gray-800">{value}</p>
          </div>
        ))}
      </div>

      {/* Payment info */}
      <div className="bg-white rounded-lg shadow-sm p-4 flex flex-wrap gap-4 items-center">
        <div>
          <p className="text-xs text-gray-400">Método</p>
          <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${PM_COLOR[sale.paymentMethod] ?? ''}`}>
            {PM_LABEL[sale.paymentMethod] ?? sale.paymentMethod}
          </span>
        </div>
        {sale.cashAmount > 0 && <div><p className="text-xs text-gray-400">Efectivo</p><p className="text-sm font-medium">Q{Number(sale.cashAmount).toFixed(2)}</p></div>}
        {sale.transferAmount > 0 && <div><p className="text-xs text-gray-400">Transferencia</p><p className="text-sm font-medium">Q{Number(sale.transferAmount).toFixed(2)}</p></div>}
        {sale.transferDocumentNumber && <div><p className="text-xs text-gray-400">Referencia</p><p className="text-sm font-mono">{sale.transferDocumentNumber}</p></div>}
        {sale.cardReference && <div><p className="text-xs text-gray-400">Referencia tarjeta</p><p className="text-sm font-mono">{sale.cardReference}</p></div>}
        {sale.notes && <div className="flex-1"><p className="text-xs text-gray-400">Notas</p><p className="text-sm text-gray-700">{sale.notes}</p></div>}
      </div>

      {/* Invoice (factura) info */}
      {sale.requiresInvoice && (
        <div className="bg-purple-50 border border-purple-200 rounded-lg p-4 flex flex-wrap gap-4 items-center">
          <div>
            <p className="text-xs text-purple-500">Factura</p>
            <p className="text-sm font-medium text-purple-800">Serie {sale.invoiceSeries} No. {sale.invoiceSeqNumber}</p>
          </div>
          <div>
            <p className="text-xs text-purple-500">NIT comprador</p>
            <p className="text-sm font-mono text-purple-800">{sale.buyerNit}</p>
          </div>
          <div>
            <p className="text-xs text-purple-500">Nombre</p>
            <p className="text-sm text-purple-800">{sale.buyerName}</p>
          </div>
          <div>
            <p className="text-xs text-purple-500">Emisor (NIT sucursal)</p>
            <p className="text-sm font-mono text-purple-800">{sale.branch?.companyTaxId ?? '—'}</p>
          </div>
          <div>
            <p className="text-xs text-purple-500">Estado</p>
            <p className="text-sm font-medium text-purple-800">
              {sale.felStatus === 'CERTIFIED' ? 'Certificada' : sale.felStatus === 'FAILED' ? 'Error de certificación' : 'Pendiente de certificación'}
            </p>
          </div>
        </div>
      )}

      {/* Items */}
      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        <div className="px-5 py-3 bg-gray-50 border-b flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-700">Artículos</h2>
          {editMode && <p className="text-xs text-blue-600">Modo edición — modifica cantidades, precios y descuentos</p>}
        </div>

        {/* Add product search (edit mode) */}
        {editMode && (
          <div className="px-5 py-3 border-b bg-blue-50 relative">
            <div className="flex items-center gap-2">
              <Search size={15} className="text-gray-400 flex-shrink-0" />
              <input
                type="text"
                value={productSearch}
                onChange={e => setProductSearch(e.target.value)}
                placeholder="Buscar producto para agregar..."
                className="input flex-1 text-sm py-1.5"
                autoComplete="off"
              />
              {searchLoading && <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary-500 flex-shrink-0" />}
            </div>
            {productResults.length > 0 && (
              <div className="absolute left-5 right-5 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-xl z-10 max-h-64 overflow-y-auto">
                {productResults.map((p: any) => {
                  const vars = p.variations ?? []
                  return (
                    <div key={p.id} className="border-b last:border-0">
                      {vars.length <= 1 ? (
                        <button onMouseDown={() => addProduct(p, vars[0])}
                          className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-primary-50 text-left text-sm">
                          <span className="font-medium text-gray-800">{p.name}</span>
                          <span className="text-primary-600 font-bold ml-4">Q{Number(p.basePrice).toFixed(2)}</span>
                        </button>
                      ) : (
                        <div className="px-4 py-2">
                          <p className="text-xs font-semibold text-gray-500 mb-1">{p.name}</p>
                          <div className="grid grid-cols-2 gap-1">
                            {vars.map((v: any) => (
                              <button key={v.id} onMouseDown={() => addProduct(p, v)}
                                className="text-left px-2 py-1.5 rounded hover:bg-primary-50 text-xs flex justify-between items-center">
                                <span className={v.isDefault ? 'font-medium' : ''}>{v.name}{v.isDefault ? ' (default)' : ''}</span>
                                <span className="text-primary-600 ml-2">Q{Number(v.price).toFixed(2)}</span>
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* Items table */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left px-5 py-2.5 text-xs text-gray-500 font-medium">Producto</th>
                <th className="text-right px-4 py-2.5 text-xs text-gray-500 font-medium w-28">Precio</th>
                <th className="text-center px-4 py-2.5 text-xs text-gray-500 font-medium w-24">Cantidad</th>
                <th className="text-center px-4 py-2.5 text-xs text-gray-500 font-medium w-20">Desc. %</th>
                <th className="text-right px-4 py-2.5 text-xs text-gray-500 font-medium w-24">Total</th>
                <th className="text-right px-4 py-2.5 text-xs text-gray-500 font-medium w-24">Ganancia</th>
                {editMode && <th className="w-8" />}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {editMode ? (
                editItems.map((item, idx) => {
                  const total = toTotal(item)
                  const profit = total - toCost(item)
                  return (
                    <tr key={idx} className="hover:bg-gray-50">
                      <td className="px-5 py-2.5">
                        <p className="font-medium text-gray-800">{item.productName}</p>
                        {item.variationName && <p className="text-xs text-gray-400">{item.variationName} ×{item.convFactor}</p>}
                      </td>
                      <td className="px-4 py-2.5">
                        <input
                          type="text"
                          inputMode="decimal"
                          value={item.priceStr}
                          onChange={e => updateItem(idx, 'priceStr', e.target.value)}
                          className="input text-sm py-0.5 w-full text-right"
                        />
                      </td>
                      <td className="px-4 py-2.5">
                        <input
                          type="text"
                          inputMode="decimal"
                          value={item.quantityStr}
                          onChange={e => updateItem(idx, 'quantityStr', e.target.value)}
                          className="input text-sm py-0.5 w-full text-center"
                        />
                      </td>
                      <td className="px-4 py-2.5">
                        <input
                          type="text"
                          inputMode="decimal"
                          value={item.discountStr}
                          onChange={e => updateItem(idx, 'discountStr', e.target.value)}
                          className="input text-sm py-0.5 w-full text-center"
                        />
                      </td>
                      <td className="px-4 py-2.5 text-right font-semibold">Q{total.toFixed(2)}</td>
                      <td className="px-4 py-2.5 text-right text-emerald-600 text-xs">Q{profit.toFixed(2)}</td>
                      <td className="px-4 py-2.5">
                        <button onClick={() => removeItem(idx)} className="text-gray-300 hover:text-red-500 transition-colors">
                          <X size={15} />
                        </button>
                      </td>
                    </tr>
                  )
                })
              ) : (
                (sale.items ?? []).map((item: any, idx: number) => {
                  const convFactor = Number(item.variation?.conversionFactor ?? 1)
                  const cost = Number(item.product?.cost ?? 0) * convFactor * Number(item.quantity)
                  const profit = Number(item.total) - cost
                  return (
                    <tr key={idx} className="hover:bg-gray-50">
                      <td className="px-5 py-2.5">
                        <p className="font-medium text-gray-800">{item.product?.name ?? '–'}</p>
                        {item.variation?.name && (
                          <p className="text-xs text-gray-400">{item.variation.name} ×{convFactor}</p>
                        )}
                        {Number(item.discount) > 0 && (
                          <p className="text-xs text-orange-500">-{(Number(item.discount) * 100).toFixed(0)}% desc.</p>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-right text-gray-600">Q{Number(item.unitPrice).toFixed(2)}</td>
                      <td className="px-4 py-2.5 text-center text-gray-700">{Number(item.quantity).toFixed(2).replace('.00', '')}</td>
                      <td className="px-4 py-2.5 text-center text-gray-500">{Number(item.discount) > 0 ? `${(Number(item.discount) * 100).toFixed(0)}%` : '–'}</td>
                      <td className="px-4 py-2.5 text-right font-semibold text-gray-800">Q{Number(item.total).toFixed(2)}</td>
                      <td className="px-4 py-2.5 text-right text-emerald-600 text-xs">Q{profit.toFixed(2)}</td>
                    </tr>
                  )
                })
              )}
              {(editMode ? editItems.length : (sale.items ?? []).length) === 0 && (
                <tr><td colSpan={7} className="text-center py-8 text-gray-400">Sin artículos</td></tr>
              )}
            </tbody>
            <tfoot className="bg-gray-50 border-t-2">
              <tr>
                <td colSpan={editMode ? 4 : 4} className="px-5 py-3 text-sm font-semibold text-gray-700 text-right">Total</td>
                <td className="px-4 py-3 text-right font-bold text-lg text-gray-800">Q{subtotal.toFixed(2)}</td>
                <td className="px-4 py-3 text-right font-bold text-emerald-600">Q{totalProfit.toFixed(2)}</td>
                {editMode && <td />}
              </tr>
            </tfoot>
          </table>
        </div>

        {/* Edit notes */}
        {editMode && (
          <div className="px-5 py-4 border-t">
            <label className="block text-sm font-medium text-gray-700 mb-1">Notas</label>
            <textarea
              value={editNotes}
              onChange={e => setEditNotes(e.target.value)}
              rows={2}
              className="input w-full resize-none text-sm"
              placeholder="Notas adicionales..."
            />
          </div>
        )}
      </div>

      {/* Credit payments */}
      {(sale.creditPayments ?? []).length > 0 && (
        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
          <div className="px-5 py-3 bg-gray-50 border-b">
            <h2 className="text-sm font-semibold text-gray-700">Abonos Recibidos</h2>
          </div>
          <div className="divide-y">
            {sale.creditPayments.map((p: any, i: number) => {
              const totalPaid = sale.creditPayments.slice(0, i + 1).reduce((s: number, x: any) => s + Number(x.amount), 0)
              return (
                <div key={p.id} className="px-5 py-3 flex items-center justify-between text-sm">
                  <div>
                    <p className="font-medium text-gray-800">{PM_LABEL[p.paymentMethod] ?? p.paymentMethod}</p>
                    <p className="text-xs text-gray-400">
                      {format(new Date(p.createdAt), 'dd/MM/yyyy HH:mm', { locale: es })} — {p.paidBy?.name}
                      {p.transferDocumentNumber && ` · Ref: ${p.transferDocumentNumber}`}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-green-600">+Q{Number(p.amount).toFixed(2)}</p>
                    <p className="text-xs text-gray-400">Acumulado: Q{totalPaid.toFixed(2)}</p>
                  </div>
                </div>
              )
            })}
          </div>
          <div className="px-5 py-3 bg-gray-50 border-t flex justify-between text-sm">
            <span className="font-medium text-gray-700">Pendiente</span>
            <span className="font-bold text-orange-600">
              Q{Math.max(0, Number(sale.total) - (sale.creditPayments ?? []).reduce((s: number, p: any) => s + Number(p.amount), 0)).toFixed(2)}
            </span>
          </div>
        </div>
      )}

      {/* Generate invoice */}
      {showInvoiceForm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-purple-100 rounded-lg"><Receipt size={22} className="text-purple-600" /></div>
              <div>
                <h3 className="font-bold text-gray-800">Generar factura</h3>
                <p className="text-xs text-gray-500">{sale.invoiceNumber} — se factura a nombre de la sucursal {sale.branch?.name}</p>
              </div>
            </div>
            <label className="block text-sm font-medium text-gray-700 mb-1">NIT del comprador *</label>
            <input type="text" value={invoiceBuyerNit} onChange={e => setInvoiceBuyerNit(e.target.value)}
              placeholder="NIT" className="input w-full mb-3" />
            <label className="block text-sm font-medium text-gray-700 mb-1">Nombre para la factura</label>
            <input type="text" value={invoiceBuyerName} onChange={e => setInvoiceBuyerName(e.target.value)}
              placeholder="Nombre" className="input w-full mb-4" />
            <p className="text-xs text-gray-400 mb-4">
              Emisor: {sale.branch?.companyName ?? sale.branch?.name} — NIT {sale.branch?.companyTaxId ?? 'sin configurar'}
            </p>
            <div className="flex gap-3">
              <button onClick={() => setShowInvoiceForm(false)} className="flex-1 btn-outline btn-md" disabled={generatingInvoice}>Cancelar</button>
              <button onClick={generateInvoice} disabled={generatingInvoice || !invoiceBuyerNit.trim()} className="flex-1 btn-primary btn-md disabled:opacity-50 flex items-center justify-center gap-2">
                {generatingInvoice && <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />}
                Generar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Void confirm */}
      {showVoidConfirm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-red-100 rounded-lg"><AlertTriangle size={22} className="text-red-600" /></div>
              <div>
                <h3 className="font-bold text-gray-800">Anular venta</h3>
                <p className="text-xs text-gray-500">{sale.invoiceNumber}</p>
              </div>
            </div>
            <p className="text-sm text-gray-600 mb-3">Se revertirá el inventario. Esta acción no se puede deshacer.</p>
            <label className="block text-sm font-medium text-gray-700 mb-1">Motivo (opcional)</label>
            <input type="text" value={voidReason} onChange={e => setVoidReason(e.target.value)}
              placeholder="Motivo de anulación" className="input w-full mb-4" />
            <div className="flex gap-3">
              <button onClick={() => setShowVoidConfirm(false)} className="flex-1 btn-outline btn-md" disabled={voiding}>Cancelar</button>
              <button onClick={handleVoid} disabled={voiding} className="flex-1 bg-red-600 text-white rounded-lg py-2 font-medium hover:bg-red-700 disabled:opacity-50 flex items-center justify-center gap-2">
                {voiding && <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />}
                Anular
              </button>
            </div>
          </div>
        </div>
      )}
    </div>

    <ThermalReceipt
      widthMm={sale.branch?.receiptWidthMm ?? 55}
      data={{
        invoiceNumber: sale.invoiceNumber,
        branchName: sale.branch?.name ?? 'Tienda',
        branchAddress: sale.branch?.address,
        branchPhone: sale.branch?.phone,
        logo: sale.branch?.logo,
        companyName: sale.branch?.companyName,
        companyTaxId: sale.branch?.companyTaxId,
        companyTagline: sale.branch?.companyTagline,
        socialMediaName: sale.branch?.socialMediaName,
        registerLabel: sale.cashRegister ? `${sale.cashRegister.name} #${sale.cashRegister.registerNumber}` : undefined,
        createdAt: sale.createdAt,
        items: (sale.items ?? []).map((item: any) => ({
          id: item.id,
          productName: item.product?.name ?? '–',
          variationName: item.variation?.name,
          quantity: Number(item.quantity),
          unitPrice: Number(item.unitPrice),
          discount: Number(item.discount ?? 0) * 100,
          total: Number(item.total),
        })),
        subtotal: Number(sale.subtotal),
        total: Number(sale.total),
        paymentMethodLabel: PM_LABEL[sale.paymentMethod] ?? sale.paymentMethod,
        cardReference: sale.cardReference,
        transferReference: sale.transferDocumentNumber,
        customerName: sale.customer?.name,
        customerNit: sale.customer?.nit,
        requiresInvoice: sale.requiresInvoice,
        invoiceSeries: sale.invoiceSeries,
        invoiceSeqNumber: sale.invoiceSeqNumber,
        buyerNit: sale.buyerNit,
        buyerName: sale.buyerName,
        felStatus: sale.felStatus,
      }}
    />
    </>
  )
}
