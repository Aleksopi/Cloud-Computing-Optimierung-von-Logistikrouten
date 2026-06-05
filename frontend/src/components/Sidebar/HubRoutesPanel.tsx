import { useEffect, useMemo, useRef, useState } from 'react'
import { api } from '../../api/client'
import type { RouteSummary } from '../../types'
import { VEHICLE_ROUTE_COLOR } from '../Map/MapView'

interface Props {
  hubName:         string
  focusedVehicleId: string | null
  onSelectVehicle: (vehicleId: string | null) => void  // null = clear
  onClose:         () => void
}

const COLOR_BY_TYPE: Record<string, string> = Object.fromEntries(VEHICLE_ROUTE_COLOR)

export function HubRoutesPanel({ hubName, focusedVehicleId, onSelectVehicle, onClose }: Props) {
  const [routes,  setRoutes]  = useState<RouteSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState<string | null>(null)
  const overlayRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setLoading(true); setError(null)
    api.routes()
      .then(fc => setRoutes(
        fc.features
          .map(f => f.properties as unknown as RouteSummary)
          .filter(r => r.hub_name === hubName)
          .sort((a, b) => a.vehicle_id.localeCompare(b.vehicle_id))
      ))
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [hubName])

  // Close on overlay-background click
  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === overlayRef.current) onClose()
  }

  const totals = useMemo(() => ({
    km:    routes.reduce((s, r) => s + (r.total_km    || 0), 0),
    cost:  routes.reduce((s, r) => s + (r.total_cost_chf || 0), 0),
    co2:   routes.reduce((s, r) => s + (r.co2_kg      || 0), 0),
    items: routes.reduce((s, r) => s + (r.total_items  || 0), 0),
  }), [routes])

  const byType = useMemo(() => {
    const m: Record<string, number> = {}
    for (const r of routes) m[r.vehicle_type] = (m[r.vehicle_type] || 0) + 1
    return m
  }, [routes])

  const handleSelect = (vehicleId: string) => {
    onSelectVehicle(focusedVehicleId === vehicleId ? null : vehicleId)
    onClose()
  }

  return (
    /* ── Full-screen backdrop ── */
    <div ref={overlayRef} onClick={handleOverlayClick}
         className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 backdrop-blur-sm">

      {/* ── Modal panel ── */}
      <div className="bg-slate-900 border border-slate-700/60 rounded-2xl shadow-2xl shadow-black/80
                      w-[520px] max-w-[95vw] max-h-[85vh] flex flex-col overflow-hidden"
           onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-slate-700/60 bg-slate-800/60 flex-shrink-0">
          <div>
            <div className="text-xs text-slate-500 uppercase tracking-wider font-semibold mb-1">
              Routen-Übersicht
            </div>
            <div className="text-lg font-bold text-white">{hubName}</div>
            <div className="text-xs text-slate-400 mt-0.5">
              {Object.entries(byType).map(([t, c]) => `${c}× ${t}`).join(' · ') || 'Keine Routen'}
            </div>
          </div>
          <button onClick={onClose}
                  className="flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-lg
                             text-slate-500 hover:text-slate-200 hover:bg-slate-700 transition-colors text-lg">
            ✕
          </button>
        </div>

        {/* Aggregate stats */}
        {routes.length > 0 && (
          <div className="grid grid-cols-4 gap-px bg-slate-700/40 border-b border-slate-700/40 flex-shrink-0">
            <Stat label="Strecke"  value={`${fmt(totals.km)} km`}          />
            <Stat label="Kosten"   value={`CHF ${fmt(totals.cost)}`}        />
            <Stat label="Waren"    value={`${fmt(totals.items)} Einh.`}    />
            <Stat label="CO₂"      value={`${fmt(totals.co2)} kg`}          />
          </div>
        )}

        {/* Instruction */}
        <div className="px-5 py-2.5 text-xs text-slate-500 bg-slate-900 border-b border-slate-700/30 flex-shrink-0">
          Fahrzeug anklicken → nur diese Route auf der Karte · Popup schließt sich automatisch
        </div>

        {/* Vehicle list */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2 min-h-0">
          {loading && (
            <div className="flex items-center justify-center py-12">
              <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"/>
            </div>
          )}
          {error && <div className="text-center text-red-400 text-sm py-8">{error}</div>}
          {!loading && !routes.length && (
            <div className="text-center text-slate-500 text-sm py-10">
              Keine Fahrzeugrouten für diesen Hub.
            </div>
          )}

          {routes.map(r => {
            const active = focusedVehicleId === r.vehicle_id
            const color  = COLOR_BY_TYPE[r.vehicle_type] ?? '#3b82f6'
            const label  = r.vehicle_id.split('_').slice(1).join(' ')
            return (
              <button key={r.vehicle_id} onClick={() => handleSelect(r.vehicle_id)}
                className={`w-full text-left rounded-xl border p-3.5 transition-all group
                  ${active
                    ? 'border-blue-500 bg-blue-600/15 shadow-sm shadow-blue-900/30'
                    : 'border-slate-700/60 bg-slate-800/40 hover:border-slate-500 hover:bg-slate-800/70'
                  }`}>
                <div className="flex items-center gap-3 mb-2">
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
                    <span className="text-sm font-semibold text-slate-200 truncate">{label}</span>
                    <span className={`text-xs px-1.5 py-0.5 rounded font-medium flex-shrink-0 ${
                      active ? 'bg-blue-600 text-blue-100' : 'bg-slate-700 text-slate-400'
                    }`}>{r.vehicle_type}</span>
                  </div>
                  {active && (
                    <span className="flex items-center gap-1 text-xs text-blue-300 flex-shrink-0">
                      <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse"/>
                      aktiv
                    </span>
                  )}
                </div>
                <div className="grid grid-cols-3 gap-x-4 gap-y-1 text-xs text-slate-400 pl-5">
                  <span className="flex items-center gap-1"><span>📍</span>{r.stop_count} Stops</span>
                  <span className="flex items-center gap-1"><span>📦</span>{r.total_items} Einh.</span>
                  <span className="flex items-center gap-1"><span>📏</span>{r.total_km} km</span>
                  <span className="flex items-center gap-1"><span>💰</span>CHF {r.total_cost_chf}</span>
                  <span className="flex items-center gap-1"><span>⏱</span>{r.total_hours?.toFixed(1)} h</span>
                  {r.co2_kg != null && <span className="flex items-center gap-1"><span>🌱</span>{r.co2_kg} kg</span>}
                </div>
              </button>
            )
          })}
        </div>

        {focusedVehicleId && (
          <div className="px-5 py-3 border-t border-slate-700/60 bg-slate-800/40 flex-shrink-0">
            <button onClick={() => { onSelectVehicle(null); onClose() }}
                    className="w-full text-xs py-2 rounded-lg border border-slate-600 text-slate-400
                               hover:text-slate-200 hover:border-slate-400 transition-colors">
              ✕ Fahrzeugfilter aufheben — alle Routen anzeigen
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-slate-900 px-4 py-2.5">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="text-sm font-semibold text-slate-200">{value}</div>
    </div>
  )
}

function fmt(n: number) { return n.toLocaleString('de-CH', { maximumFractionDigits: 1 }) }
