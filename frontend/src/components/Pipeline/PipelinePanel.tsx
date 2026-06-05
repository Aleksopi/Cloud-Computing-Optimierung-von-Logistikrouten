import { useState, useEffect, useCallback } from 'react'
import { StepCard } from './StepCard'
import { api } from '../../api/client'
import type { PipelineStatus, Summary } from '../../types'

interface PipelinePanelProps {
  status: PipelineStatus
  onRunStep: (step: number) => void
  onReset: () => void
  loading: number | null
  error: string | null
}

export function PipelinePanel({ status, onRunStep, onReset, loading, error }: PipelinePanelProps) {
  const [summary, setSummary] = useState<Summary | null>(null)
  const [confirmReset, setConfirmReset] = useState(false)

  useEffect(() => {
    if (status[4]?.status === 'done') {
      api.summary().then(setSummary).catch(() => {})
    }
  }, [status[4]?.status])

  const handleReset = useCallback(() => {
    setConfirmReset(false)
    setSummary(null)
    onReset()
  }, [onReset])

  const canRun = (step: number) => {
    if (step === 1) return status[1]?.status !== 'running'
    return status[step - 1]?.status === 'done' && status[step]?.status !== 'running'
  }

  return (
    <div className="flex flex-col flex-1 overflow-y-auto p-3">
      <div className="mb-3">
        {[1, 2, 3, 4].map(step => (
          <StepCard
            key={step}
            step={step}
            info={status[step] ?? { status: 'idle', started_at: null, finished_at: null, error_message: null }}
            onRun={() => onRunStep(step)}
            isLoading={loading === step}
            canRun={canRun(step)}
          />
        ))}
      </div>

      {error && (
        <div className="text-xs text-red-400 bg-red-900/30 rounded p-2 mb-3 break-all">
          {error}
        </div>
      )}

      {!confirmReset ? (
        <button
          onClick={() => setConfirmReset(true)}
          className="w-full text-xs py-1.5 rounded border border-gray-600 text-gray-400
                     hover:border-gray-400 hover:text-gray-200 transition-colors mb-4"
        >
          Pipeline zurücksetzen
        </button>
      ) : (
        <div className="mb-4 rounded border border-red-700/60 bg-red-900/20 p-2.5">
          <p className="text-xs text-red-300 mb-2 text-center">Alle Ergebnisse löschen?</p>
          <div className="flex gap-2">
            <button
              onClick={handleReset}
              className="flex-1 text-xs py-1.5 rounded bg-red-700 hover:bg-red-600 text-white font-medium transition-colors"
            >
              Ja, zurücksetzen
            </button>
            <button
              onClick={() => setConfirmReset(false)}
              className="flex-1 text-xs py-1.5 rounded border border-gray-600 text-gray-400
                         hover:border-gray-400 hover:text-gray-200 transition-colors"
            >
              Abbrechen
            </button>
          </div>
        </div>
      )}

      {summary && (
        <div className="bg-gray-800 rounded-lg p-3 text-xs space-y-1.5">
          <div className="text-gray-300 font-semibold mb-2">Ergebnis-Zusammenfassung</div>
          <Row label="Hubs gesamt" value={summary.hubs} />
          <Row label="Apotheken zugewiesen" value={`${summary.pharmacies_assigned} / ${summary.pharmacies_total}`} />
          <Row label="Warenbedarf gesamt" value={`${summary.total_demand} Einheiten`} />
          <Row label="Fahrzeugrouten" value={`${summary.evan_routes} EVan + ${summary.lkw_routes} LKW`} />
          <Row label="Gesamtdistanz" value={`${summary.total_km.toLocaleString()} km`} />
          <Row label="Gesamtkosten" value={`CHF ${summary.total_cost_chf.toLocaleString()}`} />
        </div>
      )}

      <div className="mt-auto pt-3 text-xs text-gray-600 text-center">
        Live-Verkehr — coming soon
      </div>
    </div>
  )
}

function Row({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex justify-between gap-2">
      <span className="text-gray-500">{label}</span>
      <span className="text-gray-200 font-medium text-right">{value}</span>
    </div>
  )
}
