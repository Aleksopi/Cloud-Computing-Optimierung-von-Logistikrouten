import type { SelectedFeature } from '../../types'

interface InfoSidebarProps {
  feature:    SelectedFeature
  onClose:    () => void
  focusedHub: string | null
  onFocusHub: (name: string | null) => void
}

export function InfoSidebar({ feature, onClose, focusedHub, onFocusHub }: InfoSidebarProps) {
  const p = feature.properties

  const title =
    feature.type === 'pharmacy' ? ((p.name as string) || 'Unbekannte Apotheke')
    : feature.type === 'hub'    ? (p.name as string)
    : (p.vehicle_id as string)

  const badge =
    feature.type === 'pharmacy' ? { label: 'Apotheke',      color: 'text-blue-300 bg-blue-500/10 border-blue-500/30' }
    : feature.type === 'hub'    ? { label: hubTypeLabel(p.hub_type as string), color: 'text-violet-300 bg-violet-500/10 border-violet-500/30' }
    : p.vehicle_type === 'Backbone'
      ? { label: 'Backbone-Route', color: 'text-slate-300 bg-slate-500/10 border-slate-500/30' }
      : { label: p.vehicle_type as string, color: 'text-cyan-300 bg-cyan-500/10 border-cyan-500/30' }

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
    <div className="bg-slate-900 border border-slate-700/60 rounded-xl shadow-2xl shadow-black/60 w-72 text-sm overflow-hidden">
      {/* Header */}
      <div className="flex items-start justify-between gap-2 px-4 py-3 border-b border-slate-700/60 bg-slate-800/50">
        <div className="min-w-0 flex-1">
          <span className={`inline-flex items-center text-xs px-2 py-0.5 rounded-full border font-medium mb-1.5 ${badge.color}`}>
            {badge.label}
          </span>
          <div className="text-sm font-semibold text-white break-words leading-tight">
            {title}
          </div>
        </div>
        <button onClick={onClose}
                className="flex-shrink-0 w-6 h-6 flex items-center justify-center rounded-md text-slate-500 hover:text-slate-200 hover:bg-slate-700 transition-colors mt-1">
          ✕
        </button>
      </div>

      {/* Body */}
      <div className="px-4 py-3 space-y-2.5">

        {/* ── Pharmacy ─────────────────────────────────────────────────── */}
        {feature.type === 'pharmacy' && (
          <div className="space-y-1.5">
            {!!p.city && <InfoRow icon="📍" label="Stadt"    value={p.city as string} />}
            <InfoRow icon="🏭" label="Hub"     value={(p.hub_name as string) ?? '—'} />
            <InfoRow icon="📦" label="Bedarf"  value={p.demand != null ? `${p.demand} Einheiten` : 'Nicht berechnet'} />
          </div>
        )}

        {/* ── Hub ──────────────────────────────────────────────────────── */}
        {feature.type === 'hub' && (
          <div className="space-y-1.5">
            <InfoRow icon="🏷" label="Typ"         value={hubTypeLabel(p.hub_type as string)} />
            {!!p.parent_hub      && <InfoRow icon="⬆" label="Übergeordnet"  value={p.parent_hub as string} />}
            {!!p.delivery_window && <InfoRow icon="🕗" label="Lieferfenster" value={p.delivery_window as string} />}

            {Object.keys(vehicleCounts).length > 0 && (
              <>
                <div className="border-t border-slate-700/60 pt-2 mt-2">
                  <span className="text-xs font-medium text-slate-400 uppercase tracking-wide">Fahrzeugeinsatz</span>
                </div>
                {Object.entries(vehicleCounts).map(([vt, cnt]) => (
                  <InfoRow key={vt} icon="🚐" label={vt} value={`${cnt} Route${cnt !== 1 ? 'n' : ''}`} />
                ))}
                {(p.total_items as number) > 0 &&
                  <InfoRow icon="📦" label="Waren" value={`${(p.total_items as number).toLocaleString('de-CH')} Einh.`} />}
                {(p.total_km as number) > 0 &&
                  <InfoRow icon="📏" label="Strecke" value={`${(p.total_km as number).toLocaleString('de-CH')} km`} />}
              </>
            )}

            {p.hub_type !== 'HQ' && (
              <button
                onClick={() => onFocusHub(isHubFocused ? null : p.name as string)}
                className={`
                  w-full mt-1 text-xs py-2 rounded-lg font-medium transition-all border
                  ${isHubFocused
                    ? 'bg-blue-600 border-blue-500 text-white shadow-sm shadow-blue-900/50'
                    : 'border-slate-600 text-slate-300 hover:border-blue-500/60 hover:text-blue-300 hover:bg-blue-900/20'
                  }
                `}
              >
                {isHubFocused ? '✕  Alle Routen anzeigen' : '→  Nur Routen dieses Hubs'}
              </button>
            )}
          </div>
        )}

        {/* ── Backbone route ───────────────────────────────────────────── */}
        {feature.type === 'route' && p.vehicle_type === 'Backbone' && (
          <div className="space-y-1.5">
            <InfoRow icon="📍" label="Von"     value={p.hub_name as string} />
            <InfoRow icon="🎯" label="Ziel"    value={(p.vehicle_id as string).split('→')[1]?.trim() ?? '—'} />
            <div className="border-t border-slate-700/60 pt-2 mt-1 space-y-1.5">
              <InfoRow icon="📦" label="Waren"   value={`${p.total_items} Einh.`} />
              <InfoRow icon="📏" label="Strecke" value={`${p.total_km} km`} />
              <InfoRow icon="⏱" label="Zeit"    value={`${(p.total_hours as number).toFixed(1)} h`} />
              <InfoRow icon="💰" label="Kosten"  value={`CHF ${(p.total_cost_chf as number).toLocaleString('de-CH')}`} highlight />
              {p.co2_kg != null && <InfoRow icon="🌱" label="CO₂" value={`${p.co2_kg} kg`} />}
            </div>
          </div>
        )}

        {/* ── Last-mile route ───────────────────────────────────────────── */}
        {feature.type === 'route' && p.vehicle_type !== 'Backbone' && (
          <div className="space-y-1.5">
            <InfoRow icon="🚐" label="Fahrzeug"  value={p.vehicle_type as string} />
            <InfoRow icon="🏭" label="Hub"       value={p.hub_name as string} />
            <div className="border-t border-slate-700/60 pt-2 mt-1 space-y-1.5">
              <InfoRow icon="📍" label="Stops"    value={`${p.stop_count}`} />
              <InfoRow icon="📦" label="Waren"    value={`${p.total_items} Einh.`} />
              <InfoRow icon="📏" label="Strecke"  value={`${p.total_km} km`} />
              <InfoRow icon="⏱" label="Fahrzeit" value={`${(p.total_hours as number).toFixed(1)} h`} />
              <InfoRow icon="💰" label="Kosten"   value={`CHF ${(p.total_cost_chf as number).toLocaleString('de-CH')}`} highlight />
              {p.co2_kg != null && <InfoRow icon="🌱" label="CO₂" value={`${p.co2_kg} kg`} />}
              {(p.restock_count as number) > 0 &&
                <InfoRow icon="🔄" label="Restock" value={`${p.restock_count}×`} />}
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

function InfoRow({ icon, label, value, highlight }: {
  icon: string; label: string; value: string; highlight?: boolean
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex items-center gap-1.5 text-slate-500 flex-shrink-0">
        <span className="text-xs w-4">{icon}</span>
        <span className="text-xs">{label}</span>
      </div>
      <span className={`text-xs text-right break-words ${highlight ? 'text-slate-200 font-semibold' : 'text-slate-300'}`}>
        {value}
      </span>
    </div>
  )
}
