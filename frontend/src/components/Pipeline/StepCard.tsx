import type { StepInfo } from '../../types'

const STEP_META: Record<number, { title: string; desc: string; icon: string }> = {
  1: { title: 'Hub Placement',     desc: 'VZ & mVZ platzieren',    icon: '◎' },
  2: { title: 'Einzugsgebiete',    desc: 'Straßenbasierte Zuweisung', icon: '⬡' },
  3: { title: 'Warenbedarf',       desc: 'Demand pro Apotheke',    icon: '◈' },
  4: { title: 'Routenoptimierung', desc: 'Fahrzeugrouten + CO₂',   icon: '⬢' },
}

interface StepCardProps {
  step: number
  info: StepInfo
  onRun: () => void
  isLoading: boolean
  canRun: boolean
}

export function StepCard({ step, info, onRun, isLoading, canRun }: StepCardProps) {
  const meta       = STEP_META[step]
  const { status } = info

  const elapsed = info.started_at && info.finished_at
    ? Math.round((new Date(info.finished_at).getTime() - new Date(info.started_at).getTime()) / 1000)
    : null

  const isRunnable = canRun && status !== 'running' && !isLoading

  const borderColor =
    status === 'done'    ? 'border-l-emerald-500' :
    status === 'running' ? 'border-l-amber-400'   :
    status === 'error'   ? 'border-l-red-500'      :
    'border-l-slate-600'

  const bgColor =
    status === 'done'    ? 'bg-slate-800/60' :
    status === 'running' ? 'bg-slate-800/80' :
    status === 'error'   ? 'bg-red-950/40'   :
    'bg-slate-800/40'

  return (
    <div className={`
      rounded-lg mb-2 border-l-2 border border-slate-700/50
      ${borderColor} ${bgColor}
      transition-all duration-200
    `}>
      {/* Running progress bar */}
      {status === 'running' && (
        <div className="h-0.5 w-full bg-slate-700 rounded-t overflow-hidden">
          <div className="h-full bg-amber-400 animate-loading-bar" />
        </div>
      )}

      <div className="p-3">
        <div className="flex items-start gap-3">
          {/* Step number + icon */}
          <div className="flex-shrink-0 flex flex-col items-center gap-1 pt-0.5">
            <div className={`
              w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold
              ${status === 'done'    ? 'bg-emerald-500/20 text-emerald-400' :
                status === 'running' ? 'bg-amber-500/20 text-amber-400'     :
                status === 'error'   ? 'bg-red-500/20 text-red-400'         :
                'bg-slate-700 text-slate-400'}
            `}>
              {status === 'done'    ? '✓' :
               status === 'running' ? '…' :
               status === 'error'   ? '!' :
               step}
            </div>
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <span className={`text-xs font-semibold ${
                status === 'done'    ? 'text-slate-200' :
                status === 'running' ? 'text-amber-300' :
                status === 'error'   ? 'text-red-300'   :
                'text-slate-400'
              }`}>
                {meta.title}
              </span>

              <button
                onClick={onRun}
                disabled={!isRunnable}
                className={`
                  flex-shrink-0 text-xs px-2.5 py-1 rounded-md font-medium
                  transition-all duration-150 border
                  ${isRunnable
                    ? 'bg-blue-600 hover:bg-blue-500 text-white border-blue-500 shadow-sm shadow-blue-900/50'
                    : 'bg-transparent text-slate-600 border-slate-700 cursor-not-allowed'
                  }
                `}
              >
                {status === 'running' ? '●' : status === 'done' ? '↻' : '▶'}
              </button>
            </div>

            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-xs text-slate-500">{meta.desc}</span>
              {elapsed !== null && (
                <span className="text-xs text-slate-600">· {elapsed}s</span>
              )}
            </div>

            {status === 'error' && info.error_message && (
              <div className="mt-1.5 p-1.5 bg-red-950/50 border border-red-800/40 rounded text-xs text-red-400 line-clamp-2">
                {info.error_message.split('\n').at(-1) ?? info.error_message}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
