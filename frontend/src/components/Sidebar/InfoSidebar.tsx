import type { SelectedFeature } from '../../types'

interface InfoSidebarProps {
  feature: SelectedFeature
  onClose: () => void
}

export function InfoSidebar({ feature, onClose }: InfoSidebarProps) {
  const p = feature.properties

  return (
    <div className="bg-gray-900/95 backdrop-blur rounded-xl shadow-2xl border border-gray-700 p-4 w-72 text-sm">
      <div className="flex items-start justify-between gap-2 mb-3">
        <div>
          <div className="text-xs text-gray-500 uppercase tracking-wide font-semibold">
            {feature.type === 'pharmacy' ? '💊 Apotheke'
              : feature.type === 'hub' ? '🏭 Hub'
              : p.vehicle_type === 'Backbone' ? '🔗 Lieferkette'
              : '🚐 Fahrzeugroute'}
          </div>
          <div className="text-white font-semibold mt-0.5 break-words">
            {feature.type === 'pharmacy'
              ? (p.name as string) || 'Unbekannte Apotheke'
              : feature.type === 'hub'
              ? (p.name as string)
              : (p.vehicle_id as string)}
          </div>
        </div>
        <button onClick={onClose} className="text-gray-500 hover:text-white text-lg leading-none flex-shrink-0 mt-0.5">×</button>
      </div>

      <div className="space-y-1.5">
        {feature.type === 'pharmacy' && (
          <>
            {p.city && <InfoRow label="Stadt" value={p.city as string} />}
            <InfoRow label="Zugewiesener Hub" value={(p.hub_name as string) ?? '—'} />
            <InfoRow label="Warenbedarf" value={p.demand != null ? `${p.demand} Einheiten` : 'Nicht berechnet'} />
          </>
        )}

        {feature.type === 'hub' && (
          <>
            <InfoRow
              label="Typ"
              value={
                p.hub_type === 'HQ' ? 'Hauptquartier (HQ)' :
                p.hub_type === 'VZ' ? 'Verteilzentrum (VZ)' :
                'Mini-Verteilzentrum (mVZ)'
              }
            />
            {p.parent_hub && (
              <InfoRow label="Übergeordnet" value={p.parent_hub as string} />
            )}
          </>
        )}

        {feature.type === 'route' && p.vehicle_type === 'Backbone' && (
          <>
            <InfoRow label="Typ" value="Backbone-Lieferung" />
            <InfoRow label="Von" value={p.hub_name as string} />
            <InfoRow label="Ziel" value={(p.vehicle_id as string).split('→')[1] ?? '—'} />
            <InfoRow label="Waren" value={`${p.total_items} Einheiten`} />
            <InfoRow label="Distanz" value={`${p.total_km} km`} />
            <InfoRow label="Fahrzeit" value={`${(p.total_hours as number).toFixed(1)} h`} />
            <InfoRow label="Kosten" value={`CHF ${p.total_cost_chf}`} />
          </>
        )}

        {feature.type === 'route' && p.vehicle_type !== 'Backbone' && (
          <>
            <InfoRow label="Fahrzeugtyp" value={p.vehicle_type as string} />
            <InfoRow label="Hub" value={p.hub_name as string} />
            <InfoRow label="Stops" value={`${p.stop_count}`} />
            <InfoRow label="Waren" value={`${p.total_items} Einheiten`} />
            <InfoRow label="Distanz" value={`${p.total_km} km`} />
            <InfoRow label="Fahrzeit" value={`${(p.total_hours as number).toFixed(1)} h`} />
            <InfoRow label="Kosten" value={`CHF ${p.total_cost_chf}`} />
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
