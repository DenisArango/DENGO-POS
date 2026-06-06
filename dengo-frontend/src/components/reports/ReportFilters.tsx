import { useEffect, useState } from 'react'
import { api } from '../../lib/api'
import { useAuthStore } from '../../store'
import { useStore } from '../../contexts/StoreContext'

export type ReportFilterState = {
  branchId: string
  cashRegisterId: string
}

interface Props {
  value: ReportFilterState
  onChange: (v: ReportFilterState) => void
  showRegister?: boolean
}

export default function ReportFilters({ value, onChange, showRegister = true }: Props) {
  const { user } = useAuthStore()
  const { currentStore } = useStore()
  const isAdmin = user?.role === 'ADMIN'
  const [branches, setBranches] = useState<any[]>([])
  const [registers, setRegisters] = useState<any[]>([])

  useEffect(() => {
    if (isAdmin) {
      api.get<any[]>('/api/branches').then(d => setBranches(d ?? []))
    }
    if (showRegister) {
      api.get<any[]>('/api/reports/cash-registers').then(d => setRegisters(d ?? []))
    }
  }, [])

  if (!isAdmin && !showRegister) return null

  const filteredRegisters = value.branchId
    ? registers.filter(r => r.branchId === value.branchId)
    : registers

  return (
    <div className="flex flex-wrap gap-2">
      {isAdmin && (
        <select
          value={value.branchId}
          onChange={e => onChange({ branchId: e.target.value, cashRegisterId: '' })}
          className="input text-sm"
        >
          <option value="">Todas las sucursales</option>
          {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
      )}
      {showRegister && (
        <select
          value={value.cashRegisterId}
          onChange={e => onChange({ ...value, cashRegisterId: e.target.value })}
          className="input text-sm"
        >
          <option value="">Todas las cajas</option>
          {filteredRegisters.map(r => (
            <option key={r.id} value={r.id}>
              {r.name} #{r.registerNumber}
            </option>
          ))}
        </select>
      )}
    </div>
  )
}
