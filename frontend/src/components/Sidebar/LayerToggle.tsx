import type { PipelineStatus } from '../../types'
import { COLORS, VEHICLE_ROUTE_COLOR } from '../Map/MapView'

const COLOR_BY_TYPE: Record<string, string> = Object.fromEntries(VEHICLE_ROUTE_COLOR)

interface Props {
  visibleLayers:     Set<string>
  pipelineStatus:    PipelineStatus
  onToggle:          (layer: string) => void
  vehicleTypes:      string[]
  vehicleTypeFilter: Set<string>
  onToggleVehicle:   (type: string) => void
}

interface LayerDef {
  key: string; label: string
  colors: string[]; subLabels?: string[]
  circle?: boolean; line?: boolean; dashed?: boolean
  step?: number; always?: boolean
}

const LAYERS: LayerDef[] = [
  { key: 'pharmacies', label: 'Apotheken',      colors: [COLORS.pharmacy],                              circle: true,  always: true },
  { key: 'hubs',       label: 'Hubs',           colors: [COLORS.hqFill, COLORS.vzFill, COLORS.mvzFill], subLabels: ['HQ','VZ','mVZ'], circle: true, step: 1 },
  { key: 'assignments',label: 'Einzugsgebiete', colors: [COLORS.assignmentVz, COLORS.assignmentMvz],   subLabels: ['VZ','mVZ'],      line: true,   step: 2 },
  { key: 'backbone',   label: 'Lieferkette',    colors: [COLORS.backboneHqVz, COLORS.backboneVzMvz],   subLabels: ['HQ→VZ','VZ→mVZ'], line: true, step: 4 },
  { key: 'routes',     label: 'Fahrzeugrouten', colors: [COLORS.sprinterRoute, COLORS.kleinLkwRoute],  subLabels: ['Sprinter','Klein-LKW'], line: true, step: 4 },
]

const FALLBACK_COLORS = ['#f59e0b', '#8b5cf6', '#06b6d4', '#10b981']
const vehColor = (name: string, i: number) => COLOR_BY_TYPE[name] ?? FALLBACK_COLORS[i % FALLBACK_COLORS.length]

export function LayerToggle({ visibleLayers, pipelineStatus, onToggle, vehicleTypes, vehicleTypeFilter, onToggleVehicle }: Props) {
  const avail = (l: LayerDef) => l.always || (l.step !== undefined && pipelineStatus[l.step]?.status === 'done')
  const routesDone = pipelineStatus[4]?.status === 'done'

  return (
    <div className="bg-slate-900/95 backdrop-blur border border-slate-700/60 rounded-xl shadow-2xl shadow-black/50 p-3 min-w-[200px]">
      {/* Header */}
      <div className="flex items-center gap-2 mb-2.5 pb-2 border-b border-slate-700/60">
        <svg className="w-3.5 h-3.5 text-slate-400" viewBox="0 0 16 16" fill="none">
          <rect x="1" y="3" width="14" height="1.5" rx="0.75" fill="currentColor"/>
          <rect x="3" y="7" width="10" height="1.5" rx="0.75" fill="currentColor"/>
          <rect x="5" y="11" width="6" height="1.5" rx="0.75" fill="currentColor"/>
        </svg>
        <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Layer</span>
      </div>

      <div className="space-y-1">
        {LAYERS.map(layer => {
          const on      = avail(layer)
          const checked = visibleLayers.has(layer.key)
          const isRoutes = layer.key === 'routes'

          return (
            <div key={layer.key} className={!on ? 'opacity-35' : ''}>
              <label className={`flex items-center gap-2 py-1 rounded-md px-1 select-none transition-colors
                                 ${on ? 'cursor-pointer hover:bg-slate-800/60' : 'cursor-not-allowed'}`}>
                {/* Checkbox */}
                <div
                  onClick={() => on && onToggle(layer.key)}
                  className={`w-3.5 h-3.5 rounded flex-shrink-0 flex items-center justify-center border transition-colors ${
                    checked && on ? 'border-blue-500 bg-blue-600' : 'border-slate-600 bg-transparent'
                  }`}
                >
                  {checked && on && (
                    <svg className="w-2 h-2 text-white" viewBox="0 0 8 8" fill="none">
                      <path d="M1.5 4 L3.5 6 L6.5 2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  )}
                </div>

                {/* Colour swatches */}
                <div className="flex items-center gap-0.5 flex-shrink-0">
                  {layer.colors.slice(0, 2).map((color, i) => (
                    layer.circle
                      ? <span key={i} className="w-2.5 h-2.5 rounded-full border border-white/20" style={{ backgroundColor: color }} />
                      : layer.dashed
                        ? <svg key={i} width="12" height="4"><line x1="0" y1="2" x2="12" y2="2" stroke={color} strokeWidth="1.5" strokeDasharray="3 2"/></svg>
                        : <span key={i} className="w-3 h-1 rounded-full" style={{ backgroundColor: color }} />
                  ))}
                </div>

                <span onClick={() => on && onToggle(layer.key)} className="text-xs text-slate-300 flex-1">
                  {layer.label}
                </span>
                {!on && layer.step && (
                  <span className="text-xs text-slate-600 ml-auto">S{layer.step}</span>
                )}
              </label>

              {/* Vehicle type sub-filter */}
              {isRoutes && on && routesDone && vehicleTypes.length > 0 && (
                <div className="ml-6 mt-0.5 space-y-0.5">
                  {vehicleTypes.map((vt, i) => {
                    const color  = vehColor(vt, i)
                    const active = vehicleTypeFilter.size === 0 || vehicleTypeFilter.has(vt)
                    return (
                      <label key={vt} className="flex items-center gap-1.5 py-0.5 px-1 rounded cursor-pointer hover:bg-slate-800/60">
                        <div
                          onClick={() => onToggleVehicle(vt)}
                          className={`w-3 h-3 rounded border flex items-center justify-center flex-shrink-0 transition-colors ${
                            active ? 'border-slate-500 bg-slate-700' : 'border-slate-700 bg-transparent'
                          }`}
                        >
                          {active && <span className="w-1.5 h-1.5 rounded-sm" style={{ backgroundColor: color }} />}
                        </div>
                        <span className="w-2.5 h-0.5 rounded flex-shrink-0" style={{ backgroundColor: color }} />
                        <span className={`text-xs ${active ? 'text-slate-400' : 'text-slate-600'}`}>{vt}</span>
                      </label>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Live traffic placeholder */}
      <div className="mt-2.5 pt-2 border-t border-slate-700/60">
        <div className="flex items-center gap-2 opacity-30 px-1">
          <div className="w-3.5 h-3.5 rounded border border-slate-600 flex-shrink-0" />
          <span className="text-slate-500 text-xs flex-1">Live-Verkehr</span>
          <span className="text-xs text-slate-600 bg-slate-800 px-1.5 py-0.5 rounded">Bald</span>
        </div>
      </div>
    </div>
  )
}
