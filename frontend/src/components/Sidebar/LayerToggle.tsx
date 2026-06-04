import type { PipelineStatus } from '../../types'

interface LayerToggleProps {
  visibleLayers: Set<string>
  pipelineStatus: PipelineStatus
  onToggle: (layer: string) => void
}

const LAYERS = [
  { key: 'pharmacies', label: 'Apotheken', color: '#3b82f6', always: true },
  { key: 'hubs',       label: 'Hubs',      color: '#ea580c', step: 1 },
  { key: 'assignments',label: 'Einzugsgebiete', color: '#f97316', step: 2 },
  { key: 'routes',     label: 'Fahrzeugrouten', color: '#22c55e', step: 4 },
] as const

export function LayerToggle({ visibleLayers, pipelineStatus, onToggle }: LayerToggleProps) {
  return (
    <div className="bg-gray-900/90 backdrop-blur rounded-lg p-3 shadow-xl border border-gray-700 text-sm space-y-1.5 min-w-[180px]">
      <div className="text-gray-400 text-xs font-semibold uppercase tracking-wide mb-2">Layer</div>
      {LAYERS.map(({ key, label, color, step, always }) => {
        const available = always || (step !== undefined && pipelineStatus[step]?.status === 'done')
        const checked = visibleLayers.has(key)
        return (
          <label
            key={key}
            className={`flex items-center gap-2 cursor-pointer select-none ${!available ? 'opacity-40 cursor-not-allowed' : ''}`}
          >
            <input
              type="checkbox"
              checked={checked}
              disabled={!available}
              onChange={() => available && onToggle(key)}
              className="sr-only"
            />
            <span
              className={`w-4 h-4 rounded flex-shrink-0 flex items-center justify-center text-white text-xs border-2 transition-colors`}
              style={{ borderColor: color, backgroundColor: checked && available ? color : 'transparent' }}
            >
              {checked && available && '✓'}
            </span>
            <span className="text-gray-200 text-xs">{label}</span>
          </label>
        )
      })}

      <div className="mt-2 pt-2 border-t border-gray-700">
        <label className="flex items-center gap-2 opacity-30 cursor-not-allowed select-none">
          <span className="w-4 h-4 rounded border-2 border-gray-500 flex-shrink-0" />
          <span className="text-gray-400 text-xs">Live-Verkehr</span>
          <span className="text-gray-600 text-xs ml-auto">bald</span>
        </label>
      </div>
    </div>
  )
}
