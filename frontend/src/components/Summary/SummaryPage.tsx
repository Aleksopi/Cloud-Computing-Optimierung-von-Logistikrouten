import { useEffect, useState } from 'react'
import { api } from '../../api/client'
import type { FullSummary, PipelineStatus, VzStats, VehicleConfig } from '../../types'
import { COLORS } from '../Map/MapView'

interface SummaryPageProps {
  pipelineStatus: PipelineStatus
}

const VEHICLE_COLORS: Record<string, string> = {
  Sprinter: COLORS.sprinterRoute,
  LKW:      COLORS.lkwRoute,
  Backbone: COLORS.backbone ?? '#94a3b8',
}
function vcol(name: string, idx: number) {
  if (VEHICLE_COLORS[name]) return VEHICLE_COLORS[name]
  const palette = ['#f59e0b','#8b5cf6','#06b6d4','#10b981','#f97316']
  return palette[idx % palette.length]
}

export function SummaryPage({ pipelineStatus }: SummaryPageProps) {
  const [data, setData]       = useState<FullSummary | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState<string | null>(null)

  const step4Done = pipelineStatus[4]?.status === 'done'

  useEffect(() => {
    if (!step4Done) return
    setLoading(true); setError(null)
    api.fullSummary()
      .then(setData)
      .catch(e => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false))
  }, [step4Done])

  if (!step4Done) return (
    <div className="flex flex-col items-center justify-center h-full text-gray-500 gap-3">
      <span className="text-4xl">📊</span>
      <p className="text-sm">Bitte zuerst alle 4 Pipeline-Schritte ausführen.</p>
    </div>
  )
  if (loading) return (
    <div className="flex items-center justify-center h-full text-gray-400 text-sm">Lade Daten…</div>
  )
  if (error) return (
    <div className="flex items-center justify-center h-full text-red-400 text-sm">{error}</div>
  )
  if (!data) return null

  const { overview, fleet_by_type, fleet, vehicle_specs, optimization, supply_chain } = data

  const deliverySpecs = vehicle_specs.filter(v => v.vehicle_class === 'delivery')
  const backboneSpec  = vehicle_specs.find(v => v.vehicle_class === 'backbone')

  // CO2 saved: compare actual last-mile CO2 vs hypothetical all-LKW
  const lkwSpec = vehicle_specs.find(v => v.name === 'LKW')
  const totalLastMileKm = fleet.last_mile.total_km
  const hypotheticalCo2 = lkwSpec ? totalLastMileKm * lkwSpec.co2_g_per_km / 1000 : 0
  const co2Saved = Math.max(0, Math.round(hypotheticalCo2 - fleet.last_mile.total_co2_kg))

  return (
    <div className="h-full overflow-y-auto bg-gray-950 text-white">
      <div className="max-w-5xl mx-auto px-6 py-6 space-y-8">

        {/* Header */}
        <div>
          <h2 className="text-xl font-bold">Ergebnis-Analyse</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            {overview.pharmacies_assigned}/{overview.pharmacies_total} Apotheken · {overview.hubs_total} Hubs
          </p>
        </div>

        {/* KPI Row */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <KpiCard label="Gesamtkosten"    value={`CHF ${fmt(overview.total_cost_chf)}`}
                   sub="inkl. Backbone" color="blue" />
          <KpiCard label="CO₂-Emissionen" value={`${fmt(overview.total_co2_kg)} kg`}
                   sub={co2Saved > 0 ? `−${fmt(co2Saved)} kg vs. Vollflotte LKW` : ''} color="green" />
          <KpiCard label="Gesamtstrecke"  value={`${fmt(overview.total_km)} km`}
                   sub="alle Fahrzeugrouten" color="amber" />
          <KpiCard label="Fahrzeugrouten" value={`${overview.total_last_mile_routes}`}
                   sub={Object.entries(fleet_by_type).map(([t,s]) => `${s.count} ${t}`).join(' + ')}
                   color="violet" />
        </div>

        {/* Fleet by vehicle type */}
        <Section title="Flotteneinsatz nach Fahrzeugtyp">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {deliverySpecs.map((spec, i) => {
              const stats = fleet_by_type[spec.name]
              if (!stats) return null
              return (
                <FleetCard key={spec.id} title={spec.name} spec={spec}
                           stats={stats} color={vcol(spec.name, i)} />
              )
            })}
            {backboneSpec && (
              <FleetCard title="Backbone-Lieferung" spec={backboneSpec}
                         stats={fleet.backbone} color={COLORS.backbone ?? '#94a3b8'} isBackbone />
            )}
          </div>
        </Section>

        {/* CO2 bar chart */}
        <Section title="CO₂-Vergleich">
          <div className="space-y-3">
            {deliverySpecs.map((spec, i) => {
              const stats = fleet_by_type[spec.name]
              if (!stats) return null
              return (
                <Co2Bar key={spec.id} label={spec.name} kg={stats.total_co2_kg}
                        km={stats.total_km} gPerKm={spec.co2_g_per_km}
                        color={vcol(spec.name, i)} />
              )
            })}
            <Co2Bar label="Backbone" kg={fleet.backbone.total_co2_kg}
                    km={fleet.backbone.total_km}
                    gPerKm={backboneSpec?.co2_g_per_km ?? 450}
                    color={COLORS.backbone ?? '#94a3b8'} />
          </div>
          {co2Saved > 0 && (
            <p className="text-xs text-gray-500 mt-3">
              CO₂-Einsparung durch Sprinter vs. Vollflotte LKW:{' '}
              <span className="text-green-400 font-semibold">−{fmt(co2Saved)} kg</span>
            </p>
          )}
        </Section>

        {/* Supply Chain */}
        <Section title={`Lieferkette · ${supply_chain.hq_name ?? 'HQ'} → ${supply_chain.vz_count} VZ → ${supply_chain.mvz_count} mVZ → ${supply_chain.pharmacy_count} Apotheken`}>
          <div className="space-y-2">
            {supply_chain.hierarchy.map(vz => <VzRow key={vz.name} vz={vz} />)}
          </div>
        </Section>

        {/* Vehicle specs table */}
        <Section title="Fahrzeugspezifikationen">
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead>
                <tr className="border-b border-gray-700 text-gray-400">
                  <th className="py-2 pr-4">Fahrzeug</th>
                  <th className="py-2 pr-4">Kapazität</th>
                  <th className="py-2 pr-4">Reichweite</th>
                  <th className="py-2 pr-4">CHF / km</th>
                  <th className="py-2 pr-4">CO₂ / km</th>
                  <th className="py-2 pr-4">Tempo</th>
                  <th className="py-2 pr-4">Fahrer / h</th>
                  <th className="py-2">Stop-Zeit</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {vehicle_specs.filter(v => v.enabled).map((v, i) => (
                  <tr key={v.id} className="text-gray-300">
                    <td className="py-2 pr-4 font-medium" style={{ color: vcol(v.name, i) }}>{v.name}</td>
                    <td className="py-2 pr-4">{v.capacity ?? '∞'} Einh.</td>
                    <td className="py-2 pr-4">{v.range_km ? `${v.range_km} km` : '—'}</td>
                    <td className="py-2 pr-4">CHF {v.cost_per_km}</td>
                    <td className="py-2 pr-4">{v.co2_g_per_km} g</td>
                    <td className="py-2 pr-4">{v.speed_kmh} km/h</td>
                    <td className="py-2 pr-4">{v.driver_chf_h ? `CHF ${v.driver_chf_h}` : '—'}</td>
                    <td className="py-2">{v.service_min ? `${v.service_min} min` : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>

        {/* Optimisation parameters */}
        <Section title="Optimierungsparameter">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <p className="text-xs text-gray-400 mb-3">Gewichtung der Routenoptimierung</p>
              <div className="space-y-2">
                <WeightBar label="Kosten (CHF)"         value={optimization.weights.cost}        color="bg-blue-500" />
                <WeightBar label="Zeit (Fahrerstunden)" value={optimization.weights.time}        color="bg-amber-500" />
                <WeightBar label="Umwelt (CO₂)"         value={optimization.weights.environment} color="bg-green-500" />
              </div>
              <p className="text-xs text-gray-600 mt-3">
                Score = {Math.round(optimization.weights.cost*100)}% Kosten +{' '}
                {Math.round(optimization.weights.time*100)}% Zeit +{' '}
                {Math.round(optimization.weights.environment*100)}% CO₂
              </p>
            </div>
            <div className="space-y-2 text-xs">
              <InfoRow label="CO₂-Schattenpreis"   value={`CHF ${optimization.co2_shadow_chf_per_kg} / kg`} />
              <InfoRow label="Verkehrsfaktor"       value={`${optimization.traffic_factor} (free-flow)`} />
              <InfoRow label="Schichtlänge"         value={`${optimization.shift_hours} h`} />
              <InfoRow label="Live-Verkehr"         value="In Vorbereitung" dim />
              <div className="mt-3 p-2 bg-gray-800/60 rounded text-gray-400 text-xs leading-relaxed">
                Der Verkehrsfaktor skaliert alle Fahrtzeiten. Bei Live-Verkehr wird er pro
                Streckenabschnitt dynamisch gesetzt und beeinflusst alle drei Scoring-Gewichte gleichzeitig.
              </div>
            </div>
          </div>
        </Section>

      </div>
    </div>
  )
}

// ── Sub-components ────────────────────────────────────────────────────────────

function fmt(n: number) { return n.toLocaleString('de-CH', { maximumFractionDigits: 1 }) }

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-sm font-semibold text-gray-300 mb-3 pb-1 border-b border-gray-800">{title}</h3>
      {children}
    </div>
  )
}

const KPI_BG:  Record<string,string> = { blue:'border-blue-700/50 bg-blue-900/20', green:'border-green-700/50 bg-green-900/20', amber:'border-amber-700/50 bg-amber-900/20', violet:'border-violet-700/50 bg-violet-900/20' }
const KPI_TXT: Record<string,string> = { blue:'text-blue-300', green:'text-green-300', amber:'text-amber-300', violet:'text-violet-300' }

function KpiCard({ label, value, sub, color }: { label:string; value:string; sub:string; color:string }) {
  return (
    <div className={`rounded-xl border p-4 ${KPI_BG[color]}`}>
      <p className="text-xs text-gray-500 mb-1">{label}</p>
      <p className={`text-xl font-bold ${KPI_TXT[color]}`}>{value}</p>
      <p className="text-xs text-gray-600 mt-1">{sub}</p>
    </div>
  )
}

function FleetCard({ title, spec, stats, color, isBackbone }: {
  title: string; spec: VehicleConfig; color: string
  stats: import('../../types').FleetStats; isBackbone?: boolean
}) {
  return (
    <div className="rounded-xl border border-gray-700/40 bg-gray-800/20 p-4">
      <div className="flex items-center gap-2 mb-3">
        <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
        <div>
          <p className="text-sm font-semibold text-gray-200">{title}</p>
          <p className="text-xs text-gray-500">{spec.co2_g_per_km} g CO₂/km · CHF {spec.cost_per_km}/km</p>
        </div>
      </div>
      <div className="space-y-1 text-xs">
        {!isBackbone && <FR label="Fahrzeuge"  value={`${stats.count}`} />}
        <FR label="Strecke"    value={`${fmt(stats.total_km)} km`} />
        <FR label="Zeit"       value={`${fmt(stats.total_hours)} h`} />
        <FR label="Kosten"     value={`CHF ${fmt(stats.total_cost_chf)}`} />
        <FR label="CO₂"        value={`${fmt(stats.total_co2_kg)} kg`} />
        <FR label="Waren"      value={`${fmt(stats.total_items)} Einh.`} />
        {spec.capacity && <FR label="Kap./Fzg" value={`${spec.capacity} Einh.`} dim />}
        {spec.range_km && <FR label="Reichweite" value={`${spec.range_km} km`} dim />}
      </div>
    </div>
  )
}

function FR({ label, value, dim }: { label:string; value:string; dim?:boolean }) {
  return (
    <div className="flex justify-between gap-2">
      <span className={dim ? 'text-gray-600' : 'text-gray-400'}>{label}</span>
      <span className={dim ? 'text-gray-500' : 'text-gray-200 font-medium'}>{value}</span>
    </div>
  )
}

function Co2Bar({ label, kg, km, gPerKm, color }: { label:string; kg:number; km:number; gPerKm:number; color:string }) {
  const pct = Math.min(100, (kg / Math.max(kg, 5000)) * 100)
  return (
    <div>
      <div className="flex justify-between text-xs mb-1">
        <span className="text-gray-400">{label}</span>
        <span className="text-gray-300">
          {fmt(kg)} kg CO₂
          <span className="text-gray-600 ml-2">({gPerKm} g/km · {fmt(km)} km)</span>
        </span>
      </div>
      <div className="h-3 bg-gray-800 rounded-full overflow-hidden">
        <div className="h-full rounded-full" style={{ width:`${pct}%`, backgroundColor: color }} />
      </div>
    </div>
  )
}

function WeightBar({ label, value, color }: { label:string; value:number; color:string }) {
  const pct = Math.round(value * 100)
  return (
    <div>
      <div className="flex justify-between text-xs mb-1">
        <span className="text-gray-400">{label}</span>
        <span className="text-gray-300 font-medium">{pct}%</span>
      </div>
      <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width:`${pct}%` }} />
      </div>
    </div>
  )
}

function InfoRow({ label, value, dim }: { label:string; value:string; dim?:boolean }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-gray-500">{label}</span>
      <span className={dim ? 'text-gray-600' : 'text-gray-300'}>{value}</span>
    </div>
  )
}

function VzRow({ vz }: { vz: VzStats }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="bg-gray-900/60 rounded-lg border border-gray-800 overflow-hidden">
      <button onClick={() => setOpen(o => !o)}
              className="w-full flex items-center justify-between px-4 py-2.5 text-left hover:bg-gray-800/40 transition-colors">
        <div className="flex items-center gap-3">
          <span className="w-2 h-2 rounded-full bg-blue-500" />
          <span className="text-sm font-medium text-blue-300">{vz.name}</span>
          <span className="text-xs text-gray-500">
            {vz.total_pharmacies} Apotheken · {vz.mvz_count} mVZ · {fmt(vz.total_items)} Einh.
          </span>
        </div>
        <div className="flex items-center gap-3 text-xs text-gray-500">
          {vz.backbone_km      && <span>{fmt(vz.backbone_km)} km vom HQ</span>}
          {vz.backbone_cost_chf && <span>CHF {fmt(vz.backbone_cost_chf)}</span>}
          <span className="text-gray-600">{open ? '▲' : '▼'}</span>
        </div>
      </button>
      {open && (
        <div className="px-4 pb-3 pt-1 border-t border-gray-800">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
            {vz.direct_pharmacies > 0 && (
              <div className="bg-gray-800/50 rounded p-2 text-xs">
                <span className="text-blue-400 font-medium">Direkt → {vz.name}</span>
                <br /><span className="text-gray-400">{vz.direct_pharmacies} Apotheken</span>
              </div>
            )}
            {vz.mvz.map(mvz => (
              <div key={mvz.name} className="bg-gray-800/50 rounded p-2 text-xs">
                <div className="flex items-center gap-1.5 mb-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                  <span className="text-amber-300 font-medium">{mvz.name}</span>
                </div>
                <div className="text-gray-400 space-y-0.5">
                  <div>{mvz.pharmacy_count} Apotheken · {fmt(mvz.total_items)} Einh.</div>
                  {mvz.backbone_km && (
                    <div className="text-gray-600">
                      {fmt(mvz.backbone_km)} km · CHF {mvz.backbone_cost_chf && fmt(mvz.backbone_cost_chf)}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
