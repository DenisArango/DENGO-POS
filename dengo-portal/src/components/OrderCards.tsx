import { Link } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'
import type { PortalOrder } from '../types'
import { programLabel, statusStyle, money, formatDate } from '../lib/labels'
import ProgramIcon from '../lib/ProgramIcon'

// Phone layout for an order list: one tappable row per order instead of a
// seven-column table that scrolls sideways. Tables stay on md and up.
export default function OrderCards({ orders }: { orders: PortalOrder[] }) {
  return (
    <ul className="md:hidden bg-white rounded-2xl border border-gray-200/80 shadow-sm divide-y divide-gray-100 overflow-hidden">
      {orders.map(o => {
        const st = statusStyle(o.status)
        return (
          <li key={o.id}>
            <Link to={`/orders/${o.id}`} className="flex items-center gap-3 px-4 py-3.5 active:bg-gray-50">
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-3">
                  <p className="flex min-w-0 items-center gap-1.5 font-medium text-gray-900">
                    <ProgramIcon type={o.programType} size={15} />
                    <span className="truncate">{programLabel(o.programType)}</span>
                  </p>
                  <p className="font-semibold text-gray-900 whitespace-nowrap">{money(o.totalAmount)}</p>
                </div>
                <p className="mt-0.5 truncate text-sm text-gray-600">{o.school?.name ?? '—'}</p>
                <div className="mt-2 flex items-center gap-2 text-xs text-gray-500">
                  <span className={`inline-flex px-2 py-0.5 rounded-full font-medium whitespace-nowrap ${st.className}`}>{st.label}</span>
                  <span className="font-mono">{o.orderNumber}</span>
                  <span aria-hidden>·</span>
                  <span className="whitespace-nowrap">{formatDate(o.createdAt)}</span>
                </div>
              </div>
              <ChevronRight size={18} className="shrink-0 text-gray-300" aria-hidden />
            </Link>
          </li>
        )
      })}
    </ul>
  )
}
