import type { PipelineStatus } from '../../types'

interface LayerToggleProps {
  visibleLayers: Set<string>
  pipelineStatus: PipelineStatus
  onToggle: (layer: string) => void
}

interface LayerDef {
  key: string
  label: string
  colors: string[]      // one per sub-item
  subLabels?: string[]  // optional labels per color
  circle?: boolean
  line?: boolean
  step?: number
  always?: boolean
}

const LAYERS: LayerDef[] = [
  {
    key: 'pharmacies',
    label: 'Apotheken',
    colors: ['#3b82f6'],
    circle: true,
    always: true,
  },
  {
    key: 'hubs',
    label: 'Hubs',
    colors: ['#dc2626', '#ea580c', '#16a34a'],
    subLabels: ['HQ', 'VZ', 'mVZ'],
    circle: true,
    step: 1,
  },
  {
    key: 'assignments',
    label: 'Einzugsgebiete',
    colors: ['#f97316', '#22c55e'],
    subLabels: ['VZ', 'mVZ'],
    line: true,
    step: 2,
  },
  {
    key: 'routes',
    label: 'Fahrzeugrouten',
    colors: ['#16a34a', '#2563eb'],
    subLabels: ['EVan', 'LKW'],
    line: true,
    step: 4,
  },
]

export function LayerToggle({ visibleLayers, pipelineStatus, onToggle }: LayerToggleProps) {
  const available = (layer: LayerDef) =>
    layer.always || (layer.step !== undefined && pipelineStatus[layer.step]?.status === 'done')

  return (
    <div className="bg-gray-900/92 backdrop-blur rounded-xl p-3 shadow-xl border border-gray-700 text-xs min-w-[200px]">
      <div className="text-gray-400 font-semibold uppercase tracking-wide text-xs mb-2.5">Layer & Legende</div>

      <div className="space-y-2">
        {LAYERS.map(layer => {
          const on = available(layer)
          const checked = visibleLayers.has(layer.key)

          return (
            <div key={layer.key} className={!on ? 'opacity-40' : ''}>
              {/* Toggle row */}
              <label className={`flex items-center gap-2 select-none ${on ? 'cursor-pointer' : 'cursor-not-allowed'}`}>
                <span
                  onClick={() => on && onToggle(layer.key)}
                  className={`w-4 h-4 rounded flex-shrink-0 flex items-center justify-center text-white text-xs border-2 transition-colors ${
                    checked && on ? 'border-gray-300 bg-gray-600' : 'border-gray-600 bg-transparent'
                  }`}
                >
                  {checked && on && '✓'}
                </span>
                <span
                  onClick={() => on && onToggle(layer.key)}
                  className="text-gray-200 font-medium"
                >
                  {layer.label}
                </span>
                {!on && layer.step && (
                  <span className="ml-auto text-gray-600">nach Step {layer.step}</span>
                )}
              </label>

              {/* Color legend sub-items */}
              {on && (
                <div className="pl-6 mt-1 space-y-0.5">
                  {layer.colors.map((color, i) => (
                    <div key={i} className="flex items-center gap-1.5">
                      {layer.circle && (
                        <span
                          className="w-2.5 h-2.5 rounded-full flex-shrink-0 border border-white/30"
                          style={{ backgroundColor: color }}
                        />
                      )}
                      {layer.line && (
                        <span
                          className="w-4 h-0.5 flex-shrink-0 rounded"
                          style={{ backgroundColor: color }}
                        />
                      )}
                      {layer.subLabels?.[i] && (
                        <span className="text-gray-400">{layer.subLabels[i]}</span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Live traffic placeholder */}
      <div className="mt-3 pt-2.5 border-t border-gray-700">
        <div className="flex items-center gap-2 opacity-30">
          <span className="w-4 h-4 rounded border-2 border-gray-600 flex-shrink-0" />
          <span className="text-gray-400">Live-Verkehr</span>
          <span className="ml-auto text-gray-600 text-xs">bald</span>
        </div>
      </div>
    </div>
  )
}
