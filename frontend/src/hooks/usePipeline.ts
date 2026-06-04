import { useCallback, useEffect, useState } from 'react'
import { api } from '../api/client'
import type { PipelineStatus } from '../types'

const DEFAULT: PipelineStatus = {
  1: { status: 'idle', started_at: null, finished_at: null, error_message: null },
  2: { status: 'idle', started_at: null, finished_at: null, error_message: null },
  3: { status: 'idle', started_at: null, finished_at: null, error_message: null },
  4: { status: 'idle', started_at: null, finished_at: null, error_message: null },
}

export function usePipeline() {
  const [status, setStatus] = useState<PipelineStatus>(DEFAULT)
  const [loading, setLoading] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  const fetchStatus = useCallback(async () => {
    try {
      setStatus(await api.status())
    } catch {
      // backend not ready yet — ignore silently
    }
  }, [])

  const hasRunning = Object.values(status).some(s => s.status === 'running')

  useEffect(() => {
    fetchStatus()
    const interval = setInterval(fetchStatus, hasRunning ? 1500 : 5000)
    return () => clearInterval(interval)
  }, [fetchStatus, hasRunning])

  const runStep = useCallback(
    async (step: number) => {
      setLoading(step)
      setError(null)
      try {
        await api.runStep(step)
        await fetchStatus()
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e))
      } finally {
        setLoading(null)
      }
    },
    [fetchStatus],
  )

  const reset = useCallback(async () => {
    setError(null)
    await api.reset()
    await fetchStatus()
  }, [fetchStatus])

  return { status, runStep, reset, loading, error }
}
