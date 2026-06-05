import type { SelectedFeature } from '../../types'

interface InfoSidebarProps {
  feature:      SelectedFeature
  onClose:      () => void
  focusedHub:   string | null
  onFocusHub:   (name: string | null) => void
}

export function InfoSidebar({ feature, onClose, focusedHub, onFocusHub }: InfoSidebarProps) {
  const p    = feature.properties
  const name = feature.type === 'pharmacy'
    ? ((p.name as string) || 'Unbekannte Apotheke')
    : feature.type === 'hub'
    ? (p.name as string)
    : (p.vehicle_id as string)

  const icon =
    feature.type === 'pharmacy' ? '💊 Apotheke'
    : feature.type === 'hub'    ? '🏭 Hub'
    : (p.vehicle_type === 'Backbone' ? '🔗 Lieferkette' : '🚐 Fahrzeugroute')

  // Parse vehicle_counts JSON string (GeoJSON props are strings)
  let vehicleCounts: Record<string, number> = {}
  try {
    if (p.vehicle_counts) {
      vehicleCounts = typeof p.vehicle_counts === 'string'
        ? JSON.parse(p.vehicle_counts)
        : (p.vehicle_counts as Record<string, number>)
    }
  } catch { /* ignore */ }

  const isHubFocused = focusedHub === (p.name as string)

  return (
    <div className="bg-gray-900/95 backdrop-blur rounded-xl shadow-2xl border border-gray-700 p-4 w-72 text-sm">
      {/* Header */}
      <div className="flex items-start justify-between gap-2 mb-3">
        <div>
          <div className="text-xs text-gray-500 uppercase tracking-wide font-semibold">{icon}</div>
          <div className="text-white font-semibold mt-0.5 break-words">{name}</div>
        </div>
        <button onClick={onClose} className="text-gray-500 hover:text-white text-lg leading-none flex-shrink-0 mt-0.5">×</button>
      </div>

      <div className="space-y-1.5">

        {/* ── Pharmacy ───────────────────────────────────────────────────── */}
        {feature.type === 'pharmacy' && (
          <>
            {p.city     && <InfoRow label="Stadt"           value={p.city as string} />}
            <InfoRow label="Zugewiesener Hub" value={(p.hub_name as string) ?? '—'} />
            <InfoRow label="Warenbedarf" value={p.demand != null ? `${p.demand} Einheiten` : 'Nicht berechnet'} />
          </>
        )}

        {/* ── Hub ────────────────────────────────────────────────────────── */}
        {feature.type === 'hub' && (
          <>
            <InfoRow label="Typ" value={
              p.hub_type === 'HQ' ? 'Hauptquartier (HQ)' :
              p.hub_type === 'VZ' ? 'Verteilzentrum (VZ)' : 'Mini-Verteilzentrum (mVZ)'
            } />
            {p.parent_hub       && <InfoRow label="Übergeordnet"  value={p.parent_hub as string} />}
            {p.delivery_window  && <InfoRow label="Liefert"       value={p.delivery_window as string} />}

            {/* Vehicle route counts */}
            {Object.keys(vehicleCounts).length > 0 && (
              <>
                <div className="border-t border-gray-700 pt-1.5 mt-1.5">
                  <span className="text-gray-500 text-xs">Fahrzeugrouten</span>
                </div>
                {Object.entries(vehicleCounts).map(([vt, cnt]) => (
                  <InfoRow key={vt} label={vt} value={`${cnt} Route${cnt !== 1 ? 'n' : ''}`} />
                ))}
                {(p.total_items as number) > 0 && (
                  <InfoRow label="Waren gesamt" value={`${p.total_items} Einheiten`} />
                )}
                {(p.total_km as number) > 0 && (
                  <InfoRow label="Gesamtstrecke" value={`${p.total_km} km`} />
                )}
              </>
            )}

            {/* Hub focus button — only for delivery hubs (not HQ) */}
            {p.hub_type !== 'HQ' && (
              <button
                onClick={() => onFocusHub(isHubFocused ? null : p.name as string)}
                className={`w-full mt-2 text-xs py-2 rounded-lg font-medium transition-colors ${
                  isHubFocused
                    ? 'bg-blue-600 text-white hover:bg-blue-700'
                    : 'border border-gray-600 text-gray-300 hover:border-blue-500 hover:text-blue-300'
                }`}
              >
                {isHubFocused ? '✕ Alle Routen anzeigen' : '→ Nur Routen dieses Hubs'}
              </button>
            )}
          </>
        )}

        {/* ── Backbone route ─────────────────────────────────────────────── */}
        {feature.type === 'route' && p.vehicle_type === 'Backbone' && (
          <>
            <InfoRow label="Typ"       value="Backbone-Versorgung" />
            <InfoRow label="Von"       value={p.hub_name as string} />
            <InfoRow label="Ziel"      value={(p.vehicle_id as string).split('→')[1]?.trim() ?? '—'} />
            <InfoRow label="Waren"     value={`${p.total_items} Einheiten`} />
            <InfoRow label="Strecke"   value={`${p.total_km} km`} />
            <InfoRow label="Fahrzeit"  value={`${(p.total_hours as number).toFixed(1)} h`} />
            <InfoRow label="Kosten"    value={`CHF ${p.total_cost_chf}`} />
            {p.co2_kg != null && <InfoRow label="CO₂" value={`${p.co2_kg} kg`} />}
          </>
        )}

        {/* ── Last-mile route ─────────────────────────────────────────────── */}
        {feature.type === 'route' && p.vehicle_type !== 'Backbone' && (
          <>
            <InfoRow label="Fahrzeugtyp" value={p.vehicle_type as string} />
            <InfoRow label="Hub"         value={p.hub_name as string} />
            <InfoRow label="Stops"       value={`${p.stop_count}`} />
            <InfoRow label="Waren"       value={`${p.total_items} Einheiten`} />
            <InfoRow label="Strecke"     value={`${p.total_km} km`} />
            <InfoRow label="Fahrzeit"    value={`${(p.total_hours as number).toFixed(1)} h`} />
            <InfoRow label="Kosten"      value={`CHF ${p.total_cost_chf}`} />
            {p.co2_kg != null && <InfoRow label="CO₂" value={`${p.co2_kg} kg`} />}
            {(p.restock_count as number) > 0 && (
              <InfoRow label="Restock" value={`${p.restock_count}×`} />
            )}
          </>
        )}
      </div>
    </div>
  )
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-gray-500 flex-shrink-0">{label}</span>
      <span className="text-gray-200 text-right break-words">{value}</span>
    </div>
  )
}
