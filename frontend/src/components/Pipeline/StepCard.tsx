import type { StepInfo } from '../../types'

const STEP_LABELS: Record<number, { title: string; desc: string }> = {
  1: { title: 'Hub Placement', desc: 'VZ & Mini-VZ platzieren' },
  2: { title: 'Influence Zones', desc: 'Straßen-Einzugsgebiete' },
  3: { title: 'Warenbedarf', desc: 'Demand pro Apotheke' },
  4: { title: 'Routenoptimierung', desc: 'Fahrzeugrouten berechnen' },
}

const STATUS_STYLES: Record<string, string> = {
  idle:    'bg-gray-700 text-gray-400',
  running: 'bg-amber-900/50 text-amber-300 animate-pulse',
  done:    'bg-emerald-900/50 text-emerald-300',
  error:   'bg-red-900/50 text-red-300',
}

const STATUS_ICONS: Record<string, string> = {
  idle: '○',
  running: '◌',
  done: '✓',
  error: '✗',
}

interface StepCardProps {
  step: number
  info: StepInfo
  onRun: () => void
  isLoading: boolean
  canRun: boolean
}

export function StepCard({ step, info, onRun, isLoading, canRun }: StepCardProps) {
  const label = STEP_LABELS[step]
  const { status } = info

  const elapsed =
    info.started_at && info.finished_at
      ? Math.round((new Date(info.finished_at).getTime() - new Date(info.started_at).getTime()) / 1000)
      : null

  return (
    <div className={`rounded-lg p-3 mb-2 ${STATUS_STYLES[status]}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 text-sm font-semibold">
            <span>{STATUS_ICONS[status]}</span>
            <span className="truncate">{step}. {label.title}</span>
          </div>
          <div className="text-xs opacity-70 mt-0.5 pl-4">{label.desc}</div>
          {elapsed !== null && (
            <div className="text-xs opacity-60 pl-4 mt-0.5">{elapsed}s</div>
          )}
          {status === 'error' && info.error_message && (
            <div className="text-xs text-red-300 pl-4 mt-1 break-all line-clamp-2">
              {info.error_message}
            </div>
          )}
        </div>

        <button
          onClick={onRun}
          disabled={!canRun || isLoading || status === 'running'}
          className={`
            flex-shrink-0 text-xs px-2.5 py-1 rounded font-medium transition-colors
            ${canRun && status !== 'running' && !isLoading
              ? 'bg-blue-600 hover:bg-blue-500 text-white cursor-pointer'
              : 'bg-gray-600 text-gray-400 cursor-not-allowed opacity-50'
            }
          `}
        >
          {status === 'running' ? '…' : status === 'done' ? '↻' : '▶'}
        </button>
      </div>
    </div>
  )
}
