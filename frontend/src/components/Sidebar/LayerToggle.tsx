import type { PipelineStatus } from '../../types'
import { COLORS } from '../Map/MapView'

interface LayerToggleProps {
  visibleLayers: Set<string>
  pipelineStatus: PipelineStatus
  onToggle: (layer: string) => void
}

interface LayerDef {
  key: string
  label: string
  colors: string[]
  subLabels?: string[]
  circle?: boolean
  line?: boolean
  dashed?: boolean
  step?: number
  always?: boolean
}

const LAYERS: LayerDef[] = [
  {
    key: 'pharmacies',
    label: 'Apotheken',
    colors: [COLORS.pharmacy],
    circle: true,
    always: true,
  },
  {
    key: 'hubs',
    label: 'Hubs',
    colors: [COLORS.hqFill, COLORS.vzFill, COLORS.mvzFill],
    subLabels: ['HQ', 'VZ', 'mVZ'],
    circle: true,
    step: 1,
  },
  {
    key: 'assignments',
    label: 'Einzugsgebiete',
    colors: [COLORS.assignmentVz, COLORS.assignmentMvz],
    subLabels: ['VZ-Gebiet', 'mVZ-Gebiet'],
    line: true,
    step: 2,
  },
  {
    key: 'backbone',
    label: 'Lieferkette',
    colors: [COLORS.backbone],
    subLabels: ['HQ → VZ → mVZ'],
    line: true,
    dashed: true,
    step: 4,
  },
  {
    key: 'routes',
    label: 'Fahrzeugrouten',
    colors: [COLORS.evanRoute, COLORS.lkwRoute],
    subLabels: ['EVan', 'LKW'],
    line: true,
    step: 4,
  },
]

export function LayerToggle({ visibleLayers, pipelineStatus, onToggle }: LayerToggleProps) {
  const available = (layer: LayerDef) =>
    layer.always || (layer.step !== undefined && pipelineStatus[layer.step]?.status === 'done')

  return (
    <div className="bg-gray-900/92 backdrop-blur rounded-xl p-3 shadow-xl border border-gray-700 text-xs min-w-[210px]">
      <div className="text-gray-400 font-semibold uppercase tracking-wide text-xs mb-2.5">Layer & Legende</div>

      <div className="space-y-2">
        {LAYERS.map(layer => {
          const on = available(layer)
          const checked = visibleLayers.has(layer.key)

          return (
            <div key={layer.key} className={!on ? 'opacity-40' : ''}>
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
                      {layer.line && !layer.dashed && (
                        <span
                          className="w-4 h-0.5 flex-shrink-0 rounded"
                          style={{ backgroundColor: color }}
                        />
                      )}
                      {layer.line && layer.dashed && (
                        <svg width="16" height="4" className="flex-shrink-0">
                          <line x1="0" y1="2" x2="16" y2="2"
                            stroke={color} strokeWidth="2"
                            strokeDasharray="4 3" strokeLinecap="round"
                          />
                        </svg>
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
