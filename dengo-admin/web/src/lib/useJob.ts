import { useEffect, useState } from 'react'
import type { Job } from './api'

/** Live view of one job over SSE (snapshot, then lines/steps until done). */
export function useJob(id: string | null) {
  const [job, setJob] = useState<Job | null>(null)
  const [lost, setLost] = useState(false)
  useEffect(() => {
    if (!id) return
    setJob(null); setLost(false)
    const es = new EventSource(`/api/jobs/${id}/stream`)
    es.addEventListener('snapshot', (e) => setJob(JSON.parse((e as MessageEvent).data)))
    es.addEventListener('line', (e) => {
      const line = JSON.parse((e as MessageEvent).data)
      setJob(j => (j ? { ...j, lines: [...(j.lines ?? []), line] } : j))
    })
    es.addEventListener('step', (e) => {
      const { index, step } = JSON.parse((e as MessageEvent).data)
      setJob(j => (j ? { ...j, steps: j.steps.map((s, i) => (i === index ? step : s)) } : j))
    })
    es.addEventListener('done', (e) => { setJob(JSON.parse((e as MessageEvent).data)); es.close() })
    es.onerror = () => { setLost(true); es.close() }
    return () => es.close()
  }, [id])
  return { job, lost }
}
