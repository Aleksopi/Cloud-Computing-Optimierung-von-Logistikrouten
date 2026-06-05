import type { SelectedFeature } from '../../types'

interface InfoSidebarProps {
  feature:           SelectedFeature
  onClose:           () => void
  focusedHub:        string | null
  onFocusHub:        (name: string | null) => void
  onOpenHubPanel:    (name: string) => void
  onPharmacyChain:   (pharmacyId: number, hubName: string) => void
}

export function InfoSidebar({
  feature, onClose, focusedHub, onFocusHub, onOpenHubPanel, onPharmacyChain,
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
    : isBackbone                ? { label: 'Lieferkette', cls: 'text-rose-300   bg-rose-500/10   border-rose-500/30'   }
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
          ✕
        </button>
      </div>

      <div className="px-4 py-3 space-y-2.5">

        {/* ── Pharmacy ─────────────────────────────────────────────────── */}
        {feature.type === 'pharmacy' && (
          <div className="space-y-1.5">
            {!!p.city     && <Row icon="📍" label="Stadt"          value={p.city} />}
            <Row             icon="🏭" label="Zugewiesen an"   value={p.hub_name ?? '—'} />
            <Row             icon="📦" label="Warenbedarf"     value={p.demand != null ? `${p.demand} Einheiten` : 'Nicht berechnet'} />
            {!!p.opening_hours && <Row icon="🕗" label="Öffnungszeiten" value={p.opening_hours} />}

            <div className="border-t border-slate-700/60 pt-2 mt-1 space-y-1.5">
              <button
                onClick={() => { onPharmacyChain(p.id as number, p.hub_name as string) }}
                disabled={!p.hub_name}
                className="w-full text-xs py-2 rounded-lg font-medium bg-blue-600 hover:bg-blue-500
                           disabled:bg-slate-700 disabled:text-slate-500 text-white transition-colors
                           shadow-sm shadow-blue-900/40">
                🔗 Lieferkette dieser Apotheke anzeigen
              </button>
              <p className="text-xs text-slate-600 text-center">
                Zeigt Fahrtroute + Backbone-Kette auf der Karte
              </p>
            </div>
          </div>
        )}

        {/* ── Hub ──────────────────────────────────────────────────────── */}
        {feature.type === 'hub' && (
          <div className="space-y-1.5">
            <Row icon="🏷" label="Typ"          value={hubLabel(p.hub_type)} />
            {!!p.parent_hub      && <Row icon="⬆" label="Übergeordnet"  value={p.parent_hub} />}
            {!!p.opening_hours   && <Row icon="🕗" label="Öffnungszeiten" value={p.opening_hours} />}
            {!!p.delivery_window && <Row icon="📦" label="Lieferschicht" value={p.delivery_window} />}
            {!!p.pharmacy_count  && <Row icon="💊" label="Apotheken"     value={`${p.pharmacy_count}`} />}

            {/* Capacity bar */}
            {cap != null && (
              <div className="pt-0.5">
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-slate-500">Lagerauslastung</span>
                  <span className={loadPct > 100 ? 'text-red-400 font-semibold' : 'text-slate-300'}>
                    {load} / {cap} Einh. ({loadPct}%)
                  </span>
                </div>
                <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                  <div className={`h-full rounded-full ${loadPct >= 90 ? 'bg-red-500' : loadPct >= 70 ? 'bg-amber-500' : 'bg-emerald-500'}`}
                       style={{ width: `${Math.min(loadPct, 100)}%` }} />
                </div>
              </div>
            )}

            {/* Vehicle route counts */}
            {Object.keys(vehicleCounts).length > 0 && (
              <>
                <div className="border-t border-slate-700/60 pt-2 mt-1">
                  <span className="text-xs font-medium text-slate-400 uppercase tracking-wide">Fahrzeugeinsatz</span>
                </div>
                {Object.entries(vehicleCounts).map(([vt, cnt]) => (
                  <Row key={vt} icon="🚐" label={vt} value={`${cnt} Route${cnt !== 1 ? 'n' : ''}`} />
                ))}
              </>
            )}

            {p.hub_type !== 'HQ' && (
              <div className="space-y-1.5 pt-1 border-t border-slate-700/60 mt-1">
                {/* Übersicht-Button (routes modal) */}
                <button onClick={() => onOpenHubPanel(p.name)}
                        className="w-full text-xs py-2 rounded-lg font-medium bg-blue-600 hover:bg-blue-500
                                   text-white transition-colors shadow-sm shadow-blue-900/40">
                  📋 Routen-Übersicht öffnen
                </button>
                {/* Focus/filter toggle */}
                <button onClick={() => onFocusHub(isFocused ? null : p.name)}
                        className={`w-full text-xs py-2 rounded-lg font-medium transition-all border
                          ${isFocused
                            ? 'bg-slate-700 border-slate-500 text-slate-200'
                            : 'border-slate-600 text-slate-400 hover:border-blue-500/60 hover:text-blue-300'
                          }`}>
                  {isFocused ? '✕ Alle Routen zeigen' : '→ Nur Routen dieses Hubs'}
                </button>
              </div>
            )}
          </div>
        )}

        {/* ── Backbone route ───────────────────────────────────────────── */}
        {feature.type === 'route' && isBackbone && (
          <div className="space-y-1.5">
            <Row icon="🚛" label="Fahrzeug"   value={p.vehicle_type} />
            <Row icon="📍" label="Von"        value={p.from_hub ?? p.hub_name} />
            <Row icon="🎯" label="Ziele"      value={`${p.stop_count}`} />
            <div className="border-t border-slate-700/60 pt-2 mt-1 space-y-1.5">
              <Row icon="📦" label="Waren"    value={`${p.total_items} Einh.`} />
              <Row icon="📏" label="Strecke"  value={`${p.total_km} km`} />
              <Row icon="⏱" label="Zeit"     value={`${(p.total_hours as number).toFixed(1)} h`} />
              <Row icon="💰" label="Kosten"   value={`CHF ${(p.total_cost_chf as number).toLocaleString('de-CH')}`} hl />
              {p.co2_kg != null && <Row icon="🌱" label="CO₂" value={`${p.co2_kg} kg`} />}
            </div>
          </div>
        )}

        {/* ── Last-mile route ───────────────────────────────────────────── */}
        {feature.type === 'route' && !isBackbone && (
          <div className="space-y-1.5">
            <Row icon="🚐" label="Fahrzeug"  value={p.vehicle_type} />
            <Row icon="🏭" label="Hub"       value={p.hub_name} />
            <div className="border-t border-slate-700/60 pt-2 mt-1 space-y-1.5">
              <Row icon="📍" label="Stops"    value={`${p.stop_count}`} />
              <Row icon="📦" label="Waren"    value={`${p.total_items} Einh.`} />
              <Row icon="📏" label="Strecke"  value={`${p.total_km} km`} />
              <Row icon="⏱" label="Fahrzeit" value={`${(p.total_hours as number).toFixed(1)} h`} />
              <Row icon="💰" label="Kosten"   value={`CHF ${(p.total_cost_chf as number).toLocaleString('de-CH')}`} hl />
              {p.co2_kg != null && <Row icon="🌱" label="CO₂" value={`${p.co2_kg} kg`} />}
              {(p.restock_count as number) > 0 && <Row icon="🔄" label="Restock" value={`${p.restock_count}×`} />}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function hubLabel(t: string) {
  return t === 'HQ' ? 'Hauptquartier' : t === 'VZ' ? 'Verteilzentrum' : 'Mini-Verteilzentrum'
}

function Row({ icon, label, value, hl }: { icon: string; label: string; value: string; hl?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex items-center gap-1.5 text-slate-500 flex-shrink-0">
        <span className="text-xs w-4">{icon}</span>
        <span className="text-xs">{label}</span>
      </div>
      <span className={`text-xs text-right break-words ${hl ? 'text-slate-100 font-semibold' : 'text-slate-300'}`}>
        {value}
      </span>
    </div>
  )
}
