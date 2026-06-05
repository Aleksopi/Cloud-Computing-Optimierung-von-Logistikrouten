import { useEffect, useState } from 'react'
import { api } from '../../api/client'
import type { FullSummary, PipelineStatus, VzStats } from '../../types'

interface SummaryPageProps {
  pipelineStatus: PipelineStatus
}

export function SummaryPage({ pipelineStatus }: SummaryPageProps) {
  const [data, setData]     = useState<FullSummary | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError]   = useState<string | null>(null)

  const step4Done = pipelineStatus[4]?.status === 'done'

  useEffect(() => {
    if (!step4Done) return
    setLoading(true)
    setError(null)
    api.fullSummary()
      .then(setData)
      .catch(e => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false))
  }, [step4Done])

  if (!step4Done) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-gray-500 gap-3">
        <span className="text-4xl">📊</span>
        <p className="text-sm">Bitte zuerst alle 4 Pipeline-Schritte ausführen.</p>
      </div>
    )
  }
  if (loading) return (
    <div className="flex items-center justify-center h-full text-gray-400 text-sm">Lade Daten…</div>
  )
  if (error) return (
    <div className="flex items-center justify-center h-full text-red-400 text-sm">{error}</div>
  )
  if (!data) return null

  const { overview, fleet, vehicle_specs, optimization, supply_chain } = data
  const co2SavedVsLkw = fleet.evan.total_km > 0
    ? Math.round(fleet.evan.total_km * (vehicle_specs.lkw.co2_g_per_km - vehicle_specs.evan.co2_g_per_km) / 1000)
    : 0

  return (
    <div className="h-full overflow-y-auto bg-gray-950 text-white">
      <div className="max-w-5xl mx-auto px-6 py-6 space-y-8">

        {/* ── Header ──────────────────────────────────────────────────────── */}
        <div>
          <h2 className="text-xl font-bold text-white">Ergebnis-Analyse</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Gesamte Lieferkette · {overview.pharmacies_assigned} / {overview.pharmacies_total} Apotheken · {overview.hubs_total} Hubs
          </p>
        </div>

        {/* ── KPI Row ─────────────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <KpiCard label="Gesamtkosten" value={`CHF ${fmt(overview.total_cost_chf)}`} sub="inkl. Backbone" color="blue" />
          <KpiCard label="CO₂-Emissionen" value={`${fmt(overview.total_co2_kg)} kg`} sub={`−${fmt(co2SavedVsLkw)} kg vs. Vollflotte LKW`} color="green" />
          <KpiCard label="Gesamtstrecke" value={`${fmt(overview.total_km)} km`} sub="alle Fahrzeugrouten" color="amber" />
          <KpiCard label="Fahrzeugrouten" value={`${fleet.evan.count + fleet.lkw.count}`} sub={`${fleet.evan.count} EVan + ${fleet.lkw.count} LKW`} color="violet" />
        </div>

        {/* ── Fleet Comparison ───────────────────────────────────────────── */}
        <Section title="Flotteneinsatz">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <FleetCard
              title="EVan-Flotte"
              icon="⚡"
              color="cyan"
              stats={fleet.evan}
              spec={vehicle_specs.evan}
            />
            <FleetCard
              title="LKW-Flotte"
              icon="🚛"
              color="violet"
              stats={fleet.lkw}
              spec={vehicle_specs.lkw}
            />
            <FleetCard
              title="Backbone-Lieferung"
              icon="🔗"
              color="slate"
              stats={fleet.backbone}
              spec={vehicle_specs.backbone as typeof vehicle_specs.lkw}
              isBackbone
            />
          </div>
        </Section>

        {/* ── CO2 Bar Chart ─────────────────────────────────────────────── */}
        <Section title="CO₂-Vergleich">
          <div className="space-y-3">
            <Co2Bar label="EVan" kg={fleet.evan.total_co2_kg} km={fleet.evan.total_km}
              color="bg-cyan-500" gPerKm={vehicle_specs.evan.co2_g_per_km} />
            <Co2Bar label="LKW" kg={fleet.lkw.total_co2_kg} km={fleet.lkw.total_km}
              color="bg-violet-500" gPerKm={vehicle_specs.lkw.co2_g_per_km} />
            <Co2Bar label="Backbone" kg={fleet.backbone.total_co2_kg} km={fleet.backbone.total_km}
              color="bg-slate-500" gPerKm={vehicle_specs.backbone.co2_g_per_km} />
          </div>
          <p className="text-xs text-gray-500 mt-3">
            CO₂-Einsparung durch EVans gegenüber Vollflotte LKW: <span className="text-green-400 font-semibold">−{fmt(co2SavedVsLkw)} kg</span>
          </p>
        </Section>

        {/* ── Supply Chain Hierarchy ────────────────────────────────────── */}
        <Section title={`Lieferkette  ·  ${supply_chain.hq_name} → ${supply_chain.vz_count} VZ → ${supply_chain.mvz_count} mVZ → ${supply_chain.pharmacy_count} Apotheken`}>
          <div className="space-y-2">
            {supply_chain.hierarchy.map(vz => (
              <VzRow key={vz.name} vz={vz} />
            ))}
          </div>
        </Section>

        {/* ── Vehicle Specs ─────────────────────────────────────────────── */}
        <Section title="Fahrzeugspezifikationen">
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead>
                <tr className="border-b border-gray-700 text-gray-400">
                  <th className="py-2 pr-4">Fahrzeug</th>
                  <th className="py-2 pr-4">Kapazität</th>
                  <th className="py-2 pr-4">Reichweite</th>
                  <th className="py-2 pr-4">Kosten / km</th>
                  <th className="py-2 pr-4">CO₂ / km</th>
                  <th className="py-2 pr-4">Ø Tempo</th>
                  <th className="py-2 pr-4">Fahrer / h</th>
                  <th className="py-2">Stop-Zeit</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                <SpecRow label={vehicle_specs.evan.label} color="text-cyan-400"
                  cap={`${vehicle_specs.evan.capacity} Einh.`}
                  range={`${vehicle_specs.evan.range_km} km`}
                  costKm={`CHF ${vehicle_specs.evan.cost_per_km}`}
                  co2Km={`${vehicle_specs.evan.co2_g_per_km} g`}
                  speed={`${vehicle_specs.evan.speed_kmh} km/h`}
                  driverH={`CHF ${vehicle_specs.evan.driver_chf_h}`}
                  stopMin={`${vehicle_specs.evan.service_min} min`}
                />
                <SpecRow label={vehicle_specs.lkw.label} color="text-violet-400"
                  cap={`${vehicle_specs.lkw.capacity} Einh.`}
                  range={`${vehicle_specs.lkw.range_km} km`}
                  costKm={`CHF ${vehicle_specs.lkw.cost_per_km}`}
                  co2Km={`${vehicle_specs.lkw.co2_g_per_km} g`}
                  speed={`${vehicle_specs.lkw.speed_kmh} km/h`}
                  driverH={`CHF ${vehicle_specs.lkw.driver_chf_h}`}
                  stopMin={`${vehicle_specs.lkw.service_min} min`}
                />
                <SpecRow label={vehicle_specs.backbone.label} color="text-slate-400"
                  cap="unbegrenzt"
                  range="—"
                  costKm={`CHF ${vehicle_specs.backbone.cost_per_km}`}
                  co2Km={`${vehicle_specs.backbone.co2_g_per_km} g`}
                  speed={`${vehicle_specs.backbone.speed_kmh} km/h`}
                  driverH="—"
                  stopMin="—"
                />
              </tbody>
            </table>
          </div>
        </Section>

        {/* ── Optimization Parameters ───────────────────────────────────── */}
        <Section title="Optimierungsparameter">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <p className="text-xs text-gray-400 mb-3">Gewichtung der Routenoptimierung</p>
              <div className="space-y-2">
                <WeightBar label="Kosten (CHF)" value={optimization.weights.cost} color="bg-blue-500" />
                <WeightBar label="Zeit (Fahrerstunden)" value={optimization.weights.time} color="bg-amber-500" />
                <WeightBar label="Umwelt (CO₂)" value={optimization.weights.environment} color="bg-green-500" />
              </div>
              <p className="text-xs text-gray-600 mt-3">
                Score = 40 % Fahrtkosten + 35 % Zeitkosten + 25 % CO₂-Schattenpreis
              </p>
            </div>
            <div className="space-y-2 text-xs">
              <InfoRow label="CO₂-Schattenpreis" value={`CHF ${optimization.co2_shadow_chf_per_kg} / kg`} />
              <InfoRow label="Verkehrsfaktor" value={`${optimization.traffic_factor} (free-flow)`} />
              <InfoRow label="Schichtlänge" value={`${optimization.shift_hours} h`} />
              <InfoRow label="Live-Verkehr" value="In Vorbereitung" dim />
              <div className="mt-3 p-2 bg-gray-800/60 rounded text-gray-400 text-xs leading-relaxed">
                Der Verkehrsfaktor skaliert alle Fahrtzeiten. Bei Live-Verkehr (kommend) wird er
                pro Streckenabschnitt dynamisch gesetzt und beeinflusst automatisch alle
                Scoring-Gewichte und Routenentscheidungen.
              </div>
            </div>
          </div>
        </Section>

      </div>
    </div>
  )
}

// ── Sub-components ────────────────────────────────────────────────────────────

function fmt(n: number) {
  return n.toLocaleString('de-CH', { maximumFractionDigits: 1 })
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-sm font-semibold text-gray-300 mb-3 pb-1 border-b border-gray-800">{title}</h3>
      {children}
    </div>
  )
}

const KPI_COLORS: Record<string, string> = {
  blue:   'border-blue-700/50 bg-blue-900/20',
  green:  'border-green-700/50 bg-green-900/20',
  amber:  'border-amber-700/50 bg-amber-900/20',
  violet: 'border-violet-700/50 bg-violet-900/20',
}
const KPI_VALUE_COLORS: Record<string, string> = {
  blue: 'text-blue-300', green: 'text-green-300', amber: 'text-amber-300', violet: 'text-violet-300',
}

function KpiCard({ label, value, sub, color }: { label: string; value: string; sub: string; color: string }) {
  return (
    <div className={`rounded-xl border p-4 ${KPI_COLORS[color]}`}>
      <p className="text-xs text-gray-500 mb-1">{label}</p>
      <p className={`text-xl font-bold ${KPI_VALUE_COLORS[color]}`}>{value}</p>
      <p className="text-xs text-gray-600 mt-1">{sub}</p>
    </div>
  )
}

const FLEET_COLORS: Record<string, { border: string; bg: string; text: string }> = {
  cyan:   { border: 'border-cyan-700/40',   bg: 'bg-cyan-900/15',   text: 'text-cyan-300' },
  violet: { border: 'border-violet-700/40', bg: 'bg-violet-900/15', text: 'text-violet-300' },
  slate:  { border: 'border-slate-600/40',  bg: 'bg-slate-800/20',  text: 'text-slate-300' },
}

function FleetCard({ title, icon, color, stats, spec, isBackbone }: {
  title: string
  icon: string
  color: string
  stats: import('../../types').FleetStats
  spec: import('../../types').VehicleSpecEntry
  isBackbone?: boolean
}) {
  const c = FLEET_COLORS[color]
  return (
    <div className={`rounded-xl border p-4 ${c.border} ${c.bg}`}>
      <div className="flex items-center gap-2 mb-3">
        <span className="text-lg">{icon}</span>
        <div>
          <p className={`text-sm font-semibold ${c.text}`}>{title}</p>
          <p className="text-xs text-gray-500">{spec.label}</p>
        </div>
      </div>
      <div className="space-y-1 text-xs">
        {!isBackbone && <FleetRow label="Fahrzeuge" value={`${stats.count}`} />}
        <FleetRow label="Strecke" value={`${fmt(stats.total_km)} km`} />
        <FleetRow label="Zeit" value={`${fmt(stats.total_hours)} h`} />
        <FleetRow label="Kosten" value={`CHF ${fmt(stats.total_cost_chf)}`} />
        <FleetRow label="CO₂" value={`${fmt(stats.total_co2_kg)} kg`} />
        <FleetRow label="Waren" value={`${fmt(stats.total_items)} Einh.`} />
        {!isBackbone && spec.capacity && (
          <FleetRow label="Kapazität/Fzg" value={`${spec.capacity} Einh.`} dim />
        )}
        {!isBackbone && spec.range_km && (
          <FleetRow label="Reichweite" value={`${spec.range_km} km`} dim />
        )}
        <FleetRow label="CHF / km" value={`${spec.cost_per_km}`} dim />
        <FleetRow label="CO₂ / km" value={`${spec.co2_g_per_km} g`} dim />
      </div>
    </div>
  )
}

function FleetRow({ label, value, dim }: { label: string; value: string; dim?: boolean }) {
  return (
    <div className="flex justify-between gap-2">
      <span className={dim ? 'text-gray-600' : 'text-gray-400'}>{label}</span>
      <span className={dim ? 'text-gray-500' : 'text-gray-200 font-medium'}>{value}</span>
    </div>
  )
}

function Co2Bar({ label, kg, km, color, gPerKm }: {
  label: string; kg: number; km: number; color: string; gPerKm: number
}) {
  const maxKg = 5000
  const pct = Math.min(100, (kg / maxKg) * 100)
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
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

function WeightBar({ label, value, color }: { label: string; value: number; color: string }) {
  const pct = Math.round(value * 100)
  return (
    <div>
      <div className="flex justify-between text-xs mb-1">
        <span className="text-gray-400">{label}</span>
        <span className="text-gray-300 font-medium">{pct}%</span>
      </div>
      <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

function InfoRow({ label, value, dim }: { label: string; value: string; dim?: boolean }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-gray-500">{label}</span>
      <span className={dim ? 'text-gray-600' : 'text-gray-300'}>{value}</span>
    </div>
  )
}

function SpecRow({ label, color, cap, range, costKm, co2Km, speed, driverH, stopMin }: {
  label: string; color: string
  cap: string; range: string; costKm: string; co2Km: string
  speed: string; driverH: string; stopMin: string
}) {
  return (
    <tr className="text-gray-300">
      <td className={`py-2 pr-4 font-medium ${color}`}>{label}</td>
      <td className="py-2 pr-4">{cap}</td>
      <td className="py-2 pr-4">{range}</td>
      <td className="py-2 pr-4">{costKm}</td>
      <td className="py-2 pr-4">{co2Km}</td>
      <td className="py-2 pr-4">{speed}</td>
      <td className="py-2 pr-4">{driverH}</td>
      <td className="py-2">{stopMin}</td>
    </tr>
  )
}

function VzRow({ vz }: { vz: VzStats }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="bg-gray-900/60 rounded-lg border border-gray-800 overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-2.5 text-left hover:bg-gray-800/40 transition-colors"
      >
        <div className="flex items-center gap-3">
          <span className="w-2 h-2 rounded-full bg-blue-500 flex-shrink-0" />
          <span className="text-sm font-medium text-blue-300">{vz.name}</span>
          <span className="text-xs text-gray-500">
            {vz.total_pharmacies} Apotheken · {vz.mvz_count} mVZ · {fmt(vz.total_items)} Einh.
          </span>
        </div>
        <div className="flex items-center gap-4 text-xs text-gray-500">
          {vz.backbone_km && <span>{fmt(vz.backbone_km)} km vom HQ</span>}
          {vz.backbone_cost_chf && <span>CHF {fmt(vz.backbone_cost_chf)}</span>}
          {vz.backbone_co2_kg && <span>{fmt(vz.backbone_co2_kg)} kg CO₂</span>}
          <span className="text-gray-600">{open ? '▲' : '▼'}</span>
        </div>
      </button>

      {open && (
        <div className="px-4 pb-3 pt-1 border-t border-gray-800">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
            {/* Direct pharmacies at VZ */}
            {vz.direct_pharmacies > 0 && (
              <div className="bg-gray-800/50 rounded p-2 text-xs">
                <span className="text-blue-400 font-medium">Direkt → {vz.name}</span>
                <br />
                <span className="text-gray-400">{vz.direct_pharmacies} Apotheken</span>
              </div>
            )}
            {/* Each mVZ */}
            {vz.mvz.map(mvz => (
              <div key={mvz.name} className="bg-gray-800/50 rounded p-2 text-xs">
                <div className="flex items-center gap-1.5 mb-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500 flex-shrink-0" />
                  <span className="text-amber-300 font-medium">{mvz.name}</span>
                </div>
                <div className="text-gray-400 space-y-0.5">
                  <div>{mvz.pharmacy_count} Apotheken · {fmt(mvz.total_items)} Einh.</div>
                  {mvz.backbone_km && (
                    <div className="text-gray-600">
                      {fmt(mvz.backbone_km)} km · CHF {mvz.backbone_cost_chf && fmt(mvz.backbone_cost_chf)} · {mvz.backbone_co2_kg && fmt(mvz.backbone_co2_kg)} kg CO₂
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
