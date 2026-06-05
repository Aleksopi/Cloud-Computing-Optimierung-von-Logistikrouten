import { useEffect, useMemo, useState } from 'react'
import { api } from '../../api/client'
import type { RouteSummary } from '../../types'
import { VEHICLE_ROUTE_COLOR } from '../Map/MapView'

interface Props {
  hubName: string
  selectedRouteId: number | null
  onSelectRoute: (id: number | null) => void
  onClose: () => void
}

const COLOR_BY_TYPE: Record<string, string> = Object.fromEntries(VEHICLE_ROUTE_COLOR)

export function HubRoutesPanel({ hubName, selectedRouteId, onSelectRoute, onClose }: Props) {
  const [routes, setRoutes]   = useState<RouteSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState<string | null>(null)

  useEffect(() => {
    setLoading(true); setError(null)
    api.routes()
      .then(fc => {
        const rs = fc.features
          .map(f => f.properties as unknown as RouteSummary)
          .filter(r => r.hub_name === hubName)
          .sort((a, b) => a.vehicle_id.localeCompare(b.vehicle_id))
        setRoutes(rs)
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [hubName])

  const totals = useMemo(() => ({
    km:    routes.reduce((s, r) => s + (r.total_km || 0), 0),
    cost:  routes.reduce((s, r) => s + (r.total_cost_chf || 0), 0),
    co2:   routes.reduce((s, r) => s + (r.co2_kg || 0), 0),
    items: routes.reduce((s, r) => s + (r.total_items || 0), 0),
  }), [routes])

  const byType = useMemo(() => {
    const m: Record<string, number> = {}
    for (const r of routes) m[r.vehicle_type] = (m[r.vehicle_type] || 0) + 1
    return m
  }, [routes])

  return (
    <div className="bg-slate-900 border border-slate-700/60 rounded-xl shadow-2xl shadow-black/60
                    w-80 max-h-full flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-start justify-between gap-2 px-4 py-3 border-b border-slate-700/60 bg-slate-800/60 flex-shrink-0">
        <div>
          <div className="text-xs text-slate-500 uppercase tracking-wide font-semibold">Routen-Übersicht</div>
          <div className="text-base font-bold text-white">{hubName}</div>
          <div className="text-xs text-slate-400 mt-0.5">
            {Object.entries(byType).map(([t, c]) => `${c}× ${t}`).join(' · ') || 'Keine Routen'}
          </div>
        </div>
        <button onClick={onClose}
                className="flex-shrink-0 w-6 h-6 flex items-center justify-center rounded-md text-slate-500 hover:text-slate-200 hover:bg-slate-700 transition-colors">✕</button>
      </div>

      {/* Aggregate */}
      {routes.length > 0 && (
        <div className="grid grid-cols-2 gap-px bg-slate-700/40 flex-shrink-0">
          <Stat label="Strecke" value={`${fmt(totals.km)} km`} />
          <Stat label="Kosten" value={`CHF ${fmt(totals.cost)}`} />
          <Stat label="Waren" value={`${fmt(totals.items)} Einh.`} />
          <Stat label="CO₂" value={`${fmt(totals.co2)} kg`} />
        </div>
      )}

      {/* List */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1.5 min-h-0">
        {loading && <div className="text-center text-slate-500 text-sm py-8">Lade Routen…</div>}
        {error && <div className="text-center text-red-400 text-sm py-8">{error}</div>}
        {!loading && !routes.length && <div className="text-center text-slate-500 text-sm py-8">Keine Fahrzeugrouten.</div>}

        {selectedRouteId != null && (
          <button onClick={() => onSelectRoute(null)}
                  className="w-full text-xs py-1.5 mb-1 rounded-md border border-slate-600 text-slate-400 hover:text-slate-200 transition-colors">
            ✕ Auswahl aufheben — alle Routen zeigen
          </button>
        )}

        {routes.map(r => {
          const active = selectedRouteId === r.id
          const color  = COLOR_BY_TYPE[r.vehicle_type] ?? '#3b82f6'
          return (
            <button key={r.id} onClick={() => onSelectRoute(active ? null : r.id)}
              className={`w-full text-left rounded-lg border p-2.5 transition-all
                ${active ? 'border-blue-500 bg-blue-600/15' : 'border-slate-700/60 bg-slate-800/40 hover:border-slate-500'}`}>
              <div className="flex items-center gap-2 mb-1.5">
                <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
                <span className="text-sm font-semibold text-slate-200 truncate flex-1">
                  {r.vehicle_id.split('_').slice(1).join(' ')}
                </span>
                {active && <span className="text-xs text-blue-300">● aktiv</span>}
              </div>
              <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-xs text-slate-400 pl-4.5">
                <span>📍 {r.stop_count} Stops</span>
                <span>📦 {r.total_items} Einh.</span>
                <span>📏 {r.total_km} km</span>
                <span>💰 CHF {r.total_cost_chf}</span>
                <span>⏱ {r.total_hours?.toFixed(1)} h</span>
                {r.co2_kg != null && <span>🌱 {r.co2_kg} kg</span>}
              </div>
            </button>
          )
        })}
      </div>

      <div className="px-3 py-2 border-t border-slate-700/60 text-xs text-slate-600 text-center flex-shrink-0">
        Route anklicken → nur diese auf der Karte
      </div>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-slate-900 px-3 py-2">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="text-sm font-semibold text-slate-200">{value}</div>
    </div>
  )
}

function fmt(n: number) { return n.toLocaleString('de-CH', { maximumFractionDigits: 1 }) }
