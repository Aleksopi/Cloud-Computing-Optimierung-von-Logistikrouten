import { useState, useEffect, useCallback } from 'react'
import { StepCard } from './StepCard'
import { TrafficToggle } from './TrafficToggle'
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
  const [summary,       setSummary]       = useState<Summary | null>(null)
  const [confirmReset,  setConfirmReset]  = useState(false)

  useEffect(() => {
    if (status[4]?.status === 'done') {
      api.summary().then(setSummary).catch(() => {})
    } else {
      setSummary(null)
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

  const doneCount = [1,2,3,4].filter(s => status[s]?.status === 'done').length
  const isAnyRunning = Object.values(status).some(s => s.status === 'running')

  return (
    <div className="flex flex-col flex-1 overflow-hidden">

      {/* ── Section header ─────────────────────────────────────────────── */}
      <div className="px-4 py-3 border-b border-slate-700/60 flex-shrink-0">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-semibold text-slate-300 uppercase tracking-wider">Pipeline</span>
          <span className="text-xs text-slate-500">{doneCount}/4 abgeschlossen</span>
        </div>
        {/* Progress track */}
        <div className="flex gap-1">
          {[1,2,3,4].map(s => (
            <div key={s} className={`
              flex-1 h-1 rounded-full transition-all duration-300
              ${status[s]?.status === 'done'    ? 'bg-emerald-500' :
                status[s]?.status === 'running' ? 'bg-amber-400 animate-pulse' :
                status[s]?.status === 'error'   ? 'bg-red-500' :
                'bg-slate-700'}
            `}/>
          ))}
        </div>
      </div>

      {/* ── Step cards ─────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-0">
        {[1, 2, 3, 4].map(step => (
          <div key={step}>
            <StepCard
              step={step}
              info={status[step] ?? { status: 'idle', started_at: null, finished_at: null, error_message: null }}
              onRun={() => onRunStep(step)}
              isLoading={loading === step}
              canRun={canRun(step)}
            />
            {/* Traffic-model (simulation) switch attached to the Routenoptimierung card */}
            {step === 4 && <TrafficToggle step4Done={status[4]?.status === 'done'} />}
          </div>
        ))}
      </div>

      {/* ── Error display ──────────────────────────────────────────────── */}
      {error && (
        <div className="mx-3 mb-2 text-xs text-red-400 bg-red-950/40 border border-red-800/40 rounded-lg p-2.5 break-all">
          {error}
        </div>
      )}

      {/* ── Quick summary ──────────────────────────────────────────────── */}
      {summary && (
        <div className="mx-3 mb-3 rounded-lg border border-slate-700/60 bg-slate-800/50 overflow-hidden">
          <div className="px-3 py-2 border-b border-slate-700/40 flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            <span className="text-xs font-semibold text-slate-300">Ergebnis</span>
          </div>
          <div className="px-3 py-2 space-y-1.5 text-xs">
            <SumRow label="Apotheken" value={`${summary.pharmacies_assigned}/${summary.pharmacies_total}`} />
            <SumRow label="Routen"    value={`${summary.evan_routes + summary.lkw_routes} gesamt`} />
            <SumRow label="Distanz"   value={`${summary.total_km.toLocaleString('de-CH')} km`} />
            <SumRow label="Kosten"    value={`CHF ${summary.total_cost_chf.toLocaleString('de-CH', {maximumFractionDigits:0})}`} bold />
          </div>
        </div>
      )}

      {/* ── Reset ──────────────────────────────────────────────────────── */}
      <div className="px-3 pb-3 flex-shrink-0">
        {!confirmReset ? (
          <button
            onClick={() => setConfirmReset(true)}
            disabled={isAnyRunning}
            className={`
              w-full text-xs py-2 rounded-lg border font-medium transition-colors
              ${isAnyRunning
                ? 'border-slate-700 text-slate-600 cursor-not-allowed'
                : 'border-slate-600 text-slate-400 hover:border-red-600/60 hover:text-red-400'
              }
            `}
          >
            Pipeline zurücksetzen
          </button>
        ) : (
          <div className="rounded-lg border border-red-700/60 bg-red-950/30 p-2.5">
            <p className="text-xs text-red-300 mb-2 text-center font-medium">Alle Ergebnisse löschen?</p>
            <div className="flex gap-2">
              <button onClick={handleReset}
                      className="flex-1 text-xs py-1.5 rounded-md bg-red-700 hover:bg-red-600 text-white font-semibold transition-colors">
                Zurücksetzen
              </button>
              <button onClick={() => setConfirmReset(false)}
                      className="flex-1 text-xs py-1.5 rounded-md border border-slate-600 text-slate-400 hover:text-slate-200 transition-colors">
                Abbrechen
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function SumRow({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className="flex justify-between gap-2">
      <span className="text-slate-500">{label}</span>
      <span className={bold ? 'text-slate-200 font-semibold' : 'text-slate-300'}>{value}</span>
    </div>
  )
}
