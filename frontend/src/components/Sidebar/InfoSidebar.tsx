import type { SelectedFeature } from '../../types'
import type { DetailSubject } from '../common/DetailModal'

interface InfoSidebarProps {
  feature:           SelectedFeature
  onClose:           () => void
  focusedHub:        string | null
  onFocusHub:        (name: string | null) => void
  onOpenHubPanel:    (name: string) => void
  onPharmacyChain:   (pharmacyId: number, hubName: string) => void
  onShowDetail:      (subject: DetailSubject) => void
}

export function InfoSidebar({
  feature, onClose, focusedHub, onFocusHub, onOpenHubPanel, onPharmacyChain, onShowDetail,
}: InfoSidebarProps) {
  const p = feature.properties as Record<string, any>
  const isBackbone = !!p.backbone_tier

  const title =
    feature.type === 'pharmacy' ? (p.name || 'Unbekannte Apotheke')
    : feature.type === 'hub'    ? p.name
    : p.vehicle_id

  const badge =
    feature.type === 'pharmacy' ? { label: 'Apotheke',    cls: 'text-blue-300   bg-blue-500/10   border-blue-500/30'   }
    : feature.type === 'hub'    ? { label: hubLabel(p.hub_type), cls: 'text-violet-300 bg-violet-500/10 border-violet-500/30' }
    : isBackbone                ? { label: 'Hauptlauf', cls: 'text-rose-300   bg-rose-500/10   border-rose-500/30'   }
    : { label: p.vehicle_type ?? 'Route', cls: 'text-cyan-300 bg-cyan-500/10 border-cyan-500/30' }

  let vehicleCounts: Record<string, number> = {}
  try {
    if (p.vehicle_counts)
      vehicleCounts = typeof p.vehicle_counts === 'string' ? JSON.parse(p.vehicle_counts) : p.vehicle_counts
  } catch { /* */ }

  const isFocused = focusedHub === p.name
  const cap       = p.capacity as number | undefined
  const load      = (p.load as number) ?? 0
  const loadPct   = cap ? Math.min(100, Math.round((load / cap) * 100)) : 0
  const loadEst   = !!p.load_estimated

  return (
    <div className="bg-slate-900 border border-slate-700/60 rounded-xl shadow-2xl shadow-black/60 w-72 text-sm overflow-hidden">
      {/* Header */}
      <div className="flex items-start justify-between gap-2 px-4 py-3 border-b border-slate-700/60 bg-slate-800/50">
        <div className="min-w-0 flex-1">
          <span className={`inline-flex text-xs px-2 py-0.5 rounded-full border font-medium mb-1.5 ${badge.cls}`}>
            {badge.label}
          </span>
          <div className="text-sm font-semibold text-white break-words leading-tight">{title}</div>
        </div>
        <button onClick={onClose}
                className="flex-shrink-0 w-6 h-6 flex items-center justify-center rounded-md
                           text-slate-500 hover:text-slate-200 hover:bg-slate-700 transition-colors mt-1">
          ×
        </button>
      </div>

      <div className="px-4 py-3 space-y-2.5">

        {/* ── Pharmacy ─────────────────────────────────────────────────── */}
        {feature.type === 'pharmacy' && (
          <div className="space-y-1.5">
            {!!p.city          && <Row label="Stadt"          value={p.city} />}
            <Row                    label="Zugewiesen an"   value={p.hub_name ?? '—'} />
            <Row                    label="Warenbedarf"     value={p.demand != null ? `${p.demand} Einheiten` : 'Nicht berechnet'} />
            {!!p.opening_hours && <Row label="Öffnungszeiten" value={p.opening_hours} />}

            <div className="border-t border-slate-700/60 pt-2 mt-1 space-y-1.5">
              <button
                onClick={() => { onPharmacyChain(p.id as number, p.hub_name as string) }}
                disabled={!p.hub_name}
                className="w-full text-xs py-2 rounded-lg font-medium bg-blue-600 hover:bg-blue-500
                           disabled:bg-slate-700 disabled:text-slate-500 text-white transition-colors
                           shadow-sm shadow-blue-900/40">
                Lieferkette dieser Apotheke anzeigen
              </button>
              <p className="text-xs text-slate-600 text-center">
                Zeigt Last-Mile-Route + Hauptlauf-Kette (mVZ→VZ→HQ) auf der Karte
              </p>
            </div>
          </div>
        )}

        {/* ── Hub ──────────────────────────────────────────────────────── */}
        {feature.type === 'hub' && (
          <div className="space-y-1.5">
            <Row label="Typ"            value={hubLabel(p.hub_type)} />
            {!!p.parent_hub      && <Row label="Übergeordnet"  value={p.parent_hub} />}
            {!!p.opening_hours   && <Row label="Öffnungszeiten" value={p.opening_hours} />}
            {!!p.delivery_window && <Row label="Lieferschicht"  value={p.delivery_window} />}
            {!!p.pharmacy_count  && <Row label="Apotheken"      value={`${p.pharmacy_count}`} />}
            {p.warehouse_cost != null && <Row label="Lagerkosten" value={`CHF ${Number(p.warehouse_cost).toLocaleString('de-CH', { maximumFractionDigits: 0 })}`} />}

            {/* Capacity bar */}
            {cap != null && (
              <div className="pt-0.5">
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-slate-500">
                    Lagerauslastung{loadEst ? ' (geschätzt)' : ''}
                  </span>
                  <span className={loadPct > 100 ? 'text-red-400 font-semibold' : 'text-slate-300'}>
                    {load} / {cap} Einh. ({loadPct}%)
                  </span>
                </div>
                <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                  <div className={`h-full rounded-full transition-all ${
                    loadPct >= 100 ? 'bg-red-500' : loadPct >= 80 ? 'bg-amber-500' : 'bg-emerald-500'
                  }`} style={{ width: `${Math.min(loadPct, 100)}%` }} />
                </div>
                {loadEst && <p className="text-xs text-slate-600 mt-0.5">Basiert auf Schätzwert, aktuell nach Step 3</p>}
              </div>
            )}

            {/* Vehicle route counts */}
            {Object.keys(vehicleCounts).length > 0 && (
              <>
                <div className="border-t border-slate-700/60 pt-2 mt-1">
                  <span className="text-xs font-medium text-slate-400 uppercase tracking-wide">Fahrzeugeinsatz</span>
                </div>
                {Object.entries(vehicleCounts).map(([vt, cnt]) => (
                  <Row key={vt} label={vt} value={`${cnt} Route${cnt !== 1 ? 'n' : ''}`} />
                ))}
              </>
            )}

            <div className="pt-1 border-t border-slate-700/60 mt-1">
              <button onClick={() => onShowDetail({ kind: 'hub', data: p })}
                      className="w-full text-xs py-2 rounded-lg font-medium bg-blue-600 hover:bg-blue-500
                                 text-white transition-colors shadow-sm shadow-blue-900/40">
                Details anzeigen
              </button>
            </div>

            {p.hub_type !== 'HQ' && (
              <div className="space-y-1.5 pt-1">
                <button onClick={() => onOpenHubPanel(p.name)}
                        className="w-full text-xs py-2 rounded-lg font-medium border border-slate-600
                                   text-slate-300 hover:text-white hover:border-slate-400 transition-colors">
                  Routen-Übersicht öffnen
                </button>
                <button onClick={() => onFocusHub(isFocused ? null : p.name)}
                        className={`w-full text-xs py-2 rounded-lg font-medium transition-all border
                          ${isFocused
                            ? 'bg-slate-700 border-slate-500 text-slate-200'
                            : 'border-slate-600 text-slate-400 hover:border-blue-500/60 hover:text-blue-300'
                          }`}>
                  {isFocused ? 'Alle Routen zeigen' : 'Nur Routen + Zulieferung'}
                </button>
                {isFocused && (
                  <div className="flex items-center justify-center gap-4 text-xs pt-0.5">
                    <span className="flex items-center gap-1.5">
                      <span className="w-3 h-0.5 rounded" style={{ backgroundColor: '#f97316' }} />
                      <span className="text-slate-400">Eigene Routen</span>
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="w-3 h-0.5 rounded" style={{ backgroundColor: '#22c55e' }} />
                      <span className="text-slate-400">Zulieferung</span>
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── Backbone route ───────────────────────────────────────────── */}
        {feature.type === 'route' && isBackbone && (
          <div className="space-y-1.5">
            <Row label="Fahrzeug"  value={p.vehicle_type} />
            <Row label="Von"       value={p.from_hub ?? p.hub_name} />
            <Row label="Ziele"     value={`${p.stop_count}`} />
            <div className="border-t border-slate-700/60 pt-2 mt-1 space-y-1.5">
              <Row label="Waren"   value={`${p.total_items} Einh.`} />
              <Row label="Strecke" value={`${p.total_km} km`} />
              <EtaBlock p={p} />
              <Row label="Kosten"  value={`CHF ${(p.total_cost_chf as number).toLocaleString('de-CH')}`} hl />
              {p.co2_kg != null && <Row label="CO2" value={`${p.co2_kg} kg`} />}
            </div>
            <button onClick={() => onShowDetail({ kind: 'vehicle', data: p })}
                    className="w-full text-xs py-2 mt-1 rounded-lg font-medium bg-blue-600 hover:bg-blue-500
                               text-white transition-colors shadow-sm shadow-blue-900/40">
              Details anzeigen
            </button>
          </div>
        )}

        {/* ── Last-mile route ───────────────────────────────────────────── */}
        {feature.type === 'route' && !isBackbone && (
          <div className="space-y-1.5">
            <Row label="Fahrzeug"  value={p.vehicle_type} />
            <Row label="Hub"       value={p.hub_name} />
            <div className="border-t border-slate-700/60 pt-2 mt-1 space-y-1.5">
              <Row label="Stops"    value={`${p.stop_count}`} />
              <Row label="Waren"    value={`${p.total_items} Einh.`} />
              <Row label="Strecke"  value={`${p.total_km} km`} />
              <EtaBlock p={p} />
              <Row label="Kosten"   value={`CHF ${(p.total_cost_chf as number).toLocaleString('de-CH')}`} hl />
              {p.co2_kg != null && <Row label="CO2" value={`${p.co2_kg} kg`} />}
              {(p.restock_count as number) > 0 && <Row label="Restock" value={`${p.restock_count}×`} />}
            </div>
            <button onClick={() => onShowDetail({ kind: 'vehicle', data: p })}
                    className="w-full text-xs py-2 mt-1 rounded-lg font-medium bg-blue-600 hover:bg-blue-500
                               text-white transition-colors shadow-sm shadow-blue-900/40">
              Details anzeigen
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

function hubLabel(t: string) {
  return t === 'HQ' ? 'Hauptquartier' : t === 'VZ' ? 'Verteilzentrum' : 'Mini-Verteilzentrum'
}

/** Estimated travel time for a route, with traffic source + congestion delay. */
function EtaBlock({ p }: { p: Record<string, any> }) {
  if (p.total_hours == null) return null
  const src   = p.traffic_source as string | undefined
  const delay = typeof p.traffic_delay_min === 'number' ? p.traffic_delay_min : null
  const live  = src === 'tomtom'
  return (
    <>
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-slate-500 text-xs flex-shrink-0">Geschätzte Fahrzeit</span>
        <span className="text-xs text-right font-semibold text-slate-100 flex items-center gap-1.5 justify-end">
          {(p.total_hours as number).toFixed(1)} h
          {live && (
            <span className="text-[9px] font-semibold text-emerald-300 bg-emerald-950/50 border border-emerald-800/50 rounded px-1 py-px">
              LIVE
            </span>
          )}
          {src === 'simulation' && (
            <span className="text-[9px] font-semibold text-amber-300 bg-amber-950/50 border border-amber-800/50 rounded px-1 py-px">
              SIM
            </span>
          )}
        </span>
      </div>
      {delay != null && delay >= 1 && (
        <Row label="davon Stau" value={`+${Math.round(delay)} min`} />
      )}
    </>
  )
}

function Row({ label, value, hl }: { label: string; value: string; hl?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-slate-500 text-xs flex-shrink-0">{label}</span>
      <span className={`text-xs text-right break-words ${hl ? 'text-slate-100 font-semibold' : 'text-slate-300'}`}>
        {value}
      </span>
    </div>
  )
}
