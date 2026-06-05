import type { PipelineStatus } from '../../types'
import { COLORS } from '../Map/MapView'

interface LayerToggleProps {
  visibleLayers:     Set<string>
  pipelineStatus:    PipelineStatus
  onToggle:          (layer: string) => void
  vehicleTypes:      string[]           // available vehicle types from fleet config
  vehicleTypeFilter: Set<string>        // which types are visible (empty = all)
  onToggleVehicle:   (type: string) => void
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
    key: 'pharmacies', label: 'Apotheken',
    colors: [COLORS.pharmacy], circle: true, always: true,
  },
  {
    key: 'hubs', label: 'Hubs',
    colors: [COLORS.hqFill, COLORS.vzFill, COLORS.mvzFill],
    subLabels: ['HQ', 'VZ', 'mVZ'], circle: true, step: 1,
  },
  {
    key: 'assignments', label: 'Einzugsgebiete',
    colors: [COLORS.assignmentVz, COLORS.assignmentMvz],
    subLabels: ['VZ-Gebiet', 'mVZ-Gebiet'], line: true, step: 2,
  },
  {
    key: 'backbone', label: 'Lieferkette',
    colors: [COLORS.backboneHqVz, COLORS.backboneVzMvz],
    subLabels: ['HQ → VZ', 'VZ → mVZ'],
    line: true, step: 4,
  },
  {
    key: 'routes', label: 'Fahrzeugrouten',
    colors: [COLORS.sprinterRoute, COLORS.lkwRoute],
    subLabels: ['Sprinter', 'LKW'],
    line: true, step: 4,
  },
]

// Fixed palette for arbitrary vehicle types (cycles if more than 6)
const VEHICLE_COLORS = [
  COLORS.sprinterRoute, COLORS.lkwRoute, '#f59e0b', '#8b5cf6', '#06b6d4', '#10b981',
]

export function LayerToggle({
  visibleLayers, pipelineStatus, onToggle,
  vehicleTypes, vehicleTypeFilter, onToggleVehicle,
}: LayerToggleProps) {
  const available = (layer: LayerDef) =>
    layer.always || (layer.step !== undefined && pipelineStatus[layer.step]?.status === 'done')

  const routesDone = pipelineStatus[4]?.status === 'done'

  return (
    <div className="bg-gray-900/92 backdrop-blur rounded-xl p-3 shadow-xl border border-gray-700 text-xs min-w-[215px]">
      <div className="text-gray-400 font-semibold uppercase tracking-wide text-xs mb-2.5">Layer & Legende</div>

      <div className="space-y-2">
        {LAYERS.map(layer => {
          const on      = available(layer)
          const checked = visibleLayers.has(layer.key)
          const isRoutes = layer.key === 'routes'

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
                <span onClick={() => on && onToggle(layer.key)} className="text-gray-200 font-medium">
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
                        <span className="w-2.5 h-2.5 rounded-full flex-shrink-0 border border-white/30"
                              style={{ backgroundColor: color }} />
                      )}
                      {layer.line && !layer.dashed && !isRoutes && (
                        <span className="w-4 h-0.5 flex-shrink-0 rounded" style={{ backgroundColor: color }} />
                      )}
                      {layer.line && layer.dashed && (
                        <svg width="16" height="4" className="flex-shrink-0">
                          <line x1="0" y1="2" x2="16" y2="2" stroke={color} strokeWidth="2"
                                strokeDasharray="4 3" strokeLinecap="round" />
                        </svg>
                      )}
                      {layer.subLabels?.[i] && (
                        <span className="text-gray-400">{layer.subLabels[i]}</span>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Vehicle type filter — under "Fahrzeugrouten" */}
              {isRoutes && on && routesDone && vehicleTypes.length > 0 && (
                <div className="pl-6 mt-1.5 space-y-1 border-t border-gray-700/60 pt-1.5">
                  <span className="text-gray-600 text-xs">Filtern:</span>
                  {vehicleTypes.map((vt, i) => {
                    const color   = VEHICLE_COLORS[i % VEHICLE_COLORS.length]
                    const active  = vehicleTypeFilter.size === 0 || vehicleTypeFilter.has(vt)
                    return (
                      <label key={vt} className="flex items-center gap-1.5 cursor-pointer">
                        <span
                          onClick={() => onToggleVehicle(vt)}
                          className={`w-3 h-3 rounded flex-shrink-0 flex items-center justify-center text-white text-xs border transition-colors ${
                            active ? 'border-gray-400 bg-gray-600' : 'border-gray-600 bg-transparent'
                          }`}
                        >
                          {active && <span className="w-1.5 h-1.5 rounded-sm" style={{ backgroundColor: color }} />}
                        </span>
                        <span className="w-3 h-0.5 flex-shrink-0 rounded" style={{ backgroundColor: color }} />
                        <span className={active ? 'text-gray-300' : 'text-gray-600'}>{vt}</span>
                      </label>
                    )
                  })}
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
