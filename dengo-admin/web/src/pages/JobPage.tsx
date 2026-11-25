import { Link, useParams } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import JobView from '../components/JobView'

export default function JobPage() {
  const { id } = useParams()
  return (
    <div className="mx-auto max-w-[1440px]">
      <Link to="/trabajos" className="mb-5 inline-flex items-center gap-1.5 text-[13px] font-semibold text-ink-600 hover:text-coral-600"><ArrowLeft className="h-4 w-4" />Trabajos</Link>
      <JobView id={id!} />
    </div>
  )
}
