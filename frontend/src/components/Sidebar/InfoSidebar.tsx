import type { SelectedFeature } from '../../types'

interface InfoSidebarProps {
  feature:        SelectedFeature
  onClose:        () => void
  focusedHub:     string | null
  onFocusHub:     (name: string | null) => void
  onOpenHubPanel: (name: string) => void
}

export function InfoSidebar({ feature, onClose, focusedHub, onFocusHub, onOpenHubPanel }: InfoSidebarProps) {
  const p = feature.properties as Record<string, any>
  const isBackbone = !!p.backbone_tier

  const title =
    feature.type === 'pharmacy' ? (p.name || 'Unbekannte Apotheke')
    : feature.type === 'hub'    ? p.name
    : p.vehicle_id

  const badge =
    feature.type === 'pharmacy' ? { label: 'Apotheke',       cls: 'text-blue-300 bg-blue-500/10 border-blue-500/30' }
    : feature.type === 'hub'    ? { label: hubTypeLabel(p.hub_type), cls: 'text-violet-300 bg-violet-500/10 border-violet-500/30' }
    : isBackbone                ? { label: 'Lieferkette',     cls: 'text-rose-300 bg-rose-500/10 border-rose-500/30' }
    : { label: p.vehicle_type ?? 'Route', cls: 'text-cyan-300 bg-cyan-500/10 border-cyan-500/30' }

  let vehicleCounts: Record<string, number> = {}
  try {
    if (p.vehicle_counts)
      vehicleCounts = typeof p.vehicle_counts === 'string' ? JSON.parse(p.vehicle_counts) : p.vehicle_counts
  } catch { /* */ }

  const isFocused = focusedHub === p.name
  const cap = p.capacity as number | undefined
  const load = (p.load as number) ?? 0
  const loadPct = cap ? Math.min(100, Math.round((load / cap) * 100)) : 0

  return (
    <div className="bg-slate-900 border border-slate-700/60 rounded-xl shadow-2xl shadow-black/60 w-72 text-sm overflow-hidden">
      <div className="flex items-start justify-between gap-2 px-4 py-3 border-b border-slate-700/60 bg-slate-800/50">
        <div className="min-w-0 flex-1">
          <span className={`inline-flex text-xs px-2 py-0.5 rounded-full border font-medium mb-1.5 ${badge.cls}`}>{badge.label}</span>
          <div className="text-sm font-semibold text-white break-words leading-tight">{title}</div>
        </div>
        <button onClick={onClose}
                className="flex-shrink-0 w-6 h-6 flex items-center justify-center rounded-md text-slate-500 hover:text-slate-200 hover:bg-slate-700 transition-colors mt-1">✕</button>
      </div>

      <div className="px-4 py-3 space-y-2.5">

        {feature.type === 'pharmacy' && (
          <div className="space-y-1.5">
            {!!p.city && <Row icon="📍" label="Stadt" value={p.city} />}
            <Row icon="🏭" label="Hub" value={p.hub_name ?? '—'} />
            <Row icon="📦" label="Bedarf" value={p.demand != null ? `${p.demand} Einheiten` : 'Nicht berechnet'} />
          </div>
        )}

        {feature.type === 'hub' && (
          <div className="space-y-1.5">
            <Row icon="🏷" label="Typ" value={hubTypeLabel(p.hub_type)} />
            {!!p.parent_hub      && <Row icon="⬆" label="Übergeordnet" value={p.parent_hub} />}
            {!!p.delivery_window && <Row icon="🕗" label="Lieferfenster" value={p.delivery_window} />}
            {!!p.pharmacy_count  && <Row icon="💊" label="Apotheken" value={`${p.pharmacy_count}`} />}

            {/* Warehouse capacity bar */}
            {cap != null && (
              <div className="pt-1">
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-slate-500">Lagerauslastung</span>
                  <span className={loadPct > 100 ? 'text-red-400 font-semibold' : 'text-slate-300'}>
                    {load} / {cap} Einh.
                  </span>
                </div>
                <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                  <div className={`h-full rounded-full ${loadPct >= 90 ? 'bg-red-500' : loadPct >= 70 ? 'bg-amber-500' : 'bg-emerald-500'}`}
                       style={{ width: `${loadPct}%` }} />
                </div>
              </div>
            )}

            {Object.keys(vehicleCounts).length > 0 && (
              <>
                <div className="border-t border-slate-700/60 pt-2 mt-2">
                  <span className="text-xs font-medium text-slate-400 uppercase tracking-wide">Fahrzeugeinsatz</span>
                </div>
                {Object.entries(vehicleCounts).map(([vt, cnt]) => (
                  <Row key={vt} icon="🚐" label={vt} value={`${cnt} Route${cnt !== 1 ? 'n' : ''}`} />
                ))}
              </>
            )}

            {p.hub_type !== 'HQ' && (
              <div className="space-y-1.5 pt-1">
                {Object.keys(vehicleCounts).length > 0 && (
                  <button onClick={() => onOpenHubPanel(p.name)}
                          className="w-full text-xs py-2 rounded-lg font-medium bg-blue-600 hover:bg-blue-500 text-white transition-colors shadow-sm shadow-blue-900/50">
                    📋  Routen-Übersicht öffnen
                  </button>
                )}
                <button onClick={() => onFocusHub(isFocused ? null : p.name)}
                        className={`w-full text-xs py-2 rounded-lg font-medium transition-all border
                          ${isFocused ? 'bg-blue-600 border-blue-500 text-white'
                            : 'border-slate-600 text-slate-300 hover:border-blue-500/60 hover:text-blue-300'}`}>
                  {isFocused ? '✕  Filter aufheben' : '→  Nur Routen dieses Hubs'}
                </button>
              </div>
            )}
          </div>
        )}

        {feature.type === 'route' && isBackbone && (
          <div className="space-y-1.5">
            <Row icon="🚛" label="Fahrzeug" value={p.vehicle_type} />
            <Row icon="📍" label="Von" value={p.from_hub ?? p.hub_name} />
            <Row icon="🎯" label="Ziele" value={`${p.stop_count}`} />
            <div className="border-t border-slate-700/60 pt-2 mt-1 space-y-1.5">
              <Row icon="📦" label="Waren" value={`${p.total_items} Einh.`} />
              <Row icon="📏" label="Strecke" value={`${p.total_km} km`} />
              <Row icon="⏱" label="Zeit" value={`${(p.total_hours as number).toFixed(1)} h`} />
              <Row icon="💰" label="Kosten" value={`CHF ${(p.total_cost_chf as number).toLocaleString('de-CH')}`} hl />
              {p.co2_kg != null && <Row icon="🌱" label="CO₂" value={`${p.co2_kg} kg`} />}
            </div>
          </div>
        )}

        {feature.type === 'route' && !isBackbone && (
          <div className="space-y-1.5">
            <Row icon="🚐" label="Fahrzeug" value={p.vehicle_type} />
            <Row icon="🏭" label="Hub" value={p.hub_name} />
            <div className="border-t border-slate-700/60 pt-2 mt-1 space-y-1.5">
              <Row icon="📍" label="Stops" value={`${p.stop_count}`} />
              <Row icon="📦" label="Waren" value={`${p.total_items} Einh.`} />
              <Row icon="📏" label="Strecke" value={`${p.total_km} km`} />
              <Row icon="⏱" label="Fahrzeit" value={`${(p.total_hours as number).toFixed(1)} h`} />
              <Row icon="💰" label="Kosten" value={`CHF ${(p.total_cost_chf as number).toLocaleString('de-CH')}`} hl />
              {p.co2_kg != null && <Row icon="🌱" label="CO₂" value={`${p.co2_kg} kg`} />}
              {(p.restock_count as number) > 0 && <Row icon="🔄" label="Restock" value={`${p.restock_count}×`} />}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function hubTypeLabel(t: string) {
  return t === 'HQ' ? 'Hauptquartier' : t === 'VZ' ? 'Verteilzentrum' : 'Mini-Verteilzentrum'
}

function Row({ icon, label, value, hl }: { icon: string; label: string; value: string; hl?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex items-center gap-1.5 text-slate-500 flex-shrink-0">
        <span className="text-xs w-4">{icon}</span><span className="text-xs">{label}</span>
      </div>
      <span className={`text-xs text-right break-words ${hl ? 'text-slate-100 font-semibold' : 'text-slate-300'}`}>{value}</span>
    </div>
  )
}
