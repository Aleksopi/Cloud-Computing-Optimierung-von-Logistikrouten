import { useEffect, useState } from 'react'
import { api } from '../../api/client'
import type { FullSummary, PipelineStatus, VzStats, VehicleConfig } from '../../types'
import { COLORS, VEHICLE_ROUTE_COLOR } from '../Map/MapView'

interface SummaryPageProps { pipelineStatus: PipelineStatus }

const COLOR_BY_TYPE: Record<string, string> = Object.fromEntries(VEHICLE_ROUTE_COLOR)
const VCOL = (name: string, i: number) =>
  COLOR_BY_TYPE[name] ?? ['#f59e0b', '#8b5cf6', '#06b6d4', '#10b981'][i % 4]

export function SummaryPage({ pipelineStatus }: SummaryPageProps) {
  const [data, setData]       = useState<FullSummary | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState<string | null>(null)
  const step4Done = pipelineStatus[4]?.status === 'done'

  useEffect(() => {
    if (!step4Done) return
    setLoading(true); setError(null)
    api.fullSummary().then(setData).catch(e => setError(e.message)).finally(() => setLoading(false))
  }, [step4Done])

  if (!step4Done) return (
    <div className="flex flex-col items-center justify-center h-full text-slate-500 gap-4">
      <div className="w-16 h-16 rounded-2xl bg-slate-800/60 border border-slate-700/40 flex items-center justify-center">
        <svg className="w-8 h-8 text-slate-600" viewBox="0 0 24 24" fill="none">
          <rect x="2" y="12" width="4" height="10" rx="1" fill="currentColor"/>
          <rect x="9" y="7" width="4" height="15" rx="1" fill="currentColor"/>
          <rect x="16" y="2" width="4" height="20" rx="1" fill="currentColor"/>
        </svg>
      </div>
      <div className="text-center">
        <p className="text-sm font-medium text-slate-400">Analyse nicht verfügbar</p>
        <p className="text-xs text-slate-600 mt-1">Bitte alle 4 Pipeline-Schritte ausführen</p>
      </div>
    </div>
  )

  if (loading) return (
    <div className="flex items-center justify-center h-full">
      <div className="text-center space-y-3">
        <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto"/>
        <p className="text-sm text-slate-400">Analysiere Ergebnisse…</p>
      </div>
    </div>
  )
  if (error) return (
    <div className="flex items-center justify-center h-full text-red-400 text-sm">{error}</div>
  )
  if (!data) return null

  const { overview, fleet_by_type, fleet, vehicle_specs, optimization, supply_chain } = data
  const deliverySpecs = vehicle_specs.filter(v => v.can_last_mile && v.enabled)
  const backboneSpec  = vehicle_specs.find(v => v.can_backbone && v.enabled && !v.can_last_mile)
                        ?? vehicle_specs.find(v => v.can_backbone && v.enabled)
  const lkwSpec       = vehicle_specs.find(v => v.name === 'LKW')
  const co2Saved      = lkwSpec ? Math.max(0, Math.round(fleet.last_mile.total_km * lkwSpec.co2_g_per_km / 1000 - fleet.last_mile.total_co2_kg)) : 0

  return (
    <div className="h-full overflow-y-auto bg-slate-950 text-slate-100">
      <div className="max-w-6xl mx-auto px-6 py-6 space-y-6">

        {/* Page header */}
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-lg font-bold text-white">Analyse &amp; Ergebnisse</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              {overview.pharmacies_assigned}/{overview.pharmacies_total} Apotheken versorgt
              · {overview.hubs_total} Hubs · {supply_chain.vz_count} VZ + {supply_chain.mvz_count} mVZ
            </p>
          </div>
        </div>

        {/* ── KPI Row ────────────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <KpiCard label="Gesamtkosten"    main={`CHF ${fmt(overview.total_cost_chf)}`}
                   sub="inkl. Backbone"   icon="💰" accent="blue" />
          <KpiCard label="CO₂-Emissionen" main={`${fmt(overview.total_co2_kg)} kg`}
                   sub={co2Saved > 0 ? `−${fmt(co2Saved)} kg vs. Vollflotte LKW` : 'Gesamtemissionen'}
                   icon="🌱" accent="green" />
          <KpiCard label="Gesamtstrecke"  main={`${fmt(overview.total_km)} km`}
                   sub="alle Fahrzeugrouten" icon="📏" accent="amber" />
          <KpiCard label="Fahrzeugrouten" main={`${overview.total_last_mile_routes}`}
                   sub={Object.entries(fleet_by_type).map(([t,s]) => `${s.count} ${t}`).join(' · ')}
                   icon="🚐" accent="violet" />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

          {/* ── Left 2/3: Fleet + CO2 ──────────────────────────────────── */}
          <div className="lg:col-span-2 space-y-6">

            {/* Fleet cards */}
            <Card title="Flotteneinsatz" sub="nach Fahrzeugtyp">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {deliverySpecs.map((spec, i) => {
                  const stats = fleet_by_type[spec.name]
                  if (!stats) return null
                  return <FleetCard key={spec.id} spec={spec} stats={stats} color={VCOL(spec.name, i)} />
                })}
                {backboneSpec && (
                  <FleetCard spec={backboneSpec} stats={fleet.backbone}
                             color={VCOL('Backbone', 99)} isBackbone />
                )}
              </div>
            </Card>

            {/* CO2 bars */}
            <Card title="CO₂-Bilanz" sub="Emissionen nach Fahrzeugtyp">
              <div className="space-y-3">
                {[...deliverySpecs, ...(backboneSpec ? [backboneSpec] : [])].map((spec, i) => {
                  const stats = spec.vehicle_class === 'backbone' ? fleet.backbone : fleet_by_type[spec.name]
                  if (!stats) return null
                  const maxKg = Math.max(overview.total_co2_kg, 1)
                  const pct   = Math.min(100, (stats.total_co2_kg / maxKg) * 100)
                  return (
                    <div key={spec.id}>
                      <div className="flex justify-between text-xs mb-1.5">
                        <span className="text-slate-400 flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: VCOL(spec.name, i) }}/>
                          {spec.name}
                        </span>
                        <span className="text-slate-300">
                          {fmt(stats.total_co2_kg)} kg
                          <span className="text-slate-600 ml-2">{spec.co2_g_per_km} g/km · {fmt(stats.total_km)} km</span>
                        </span>
                      </div>
                      <div className="h-2.5 bg-slate-800 rounded-full overflow-hidden">
                        <div className="h-full rounded-full transition-all duration-500"
                             style={{ width: `${pct}%`, backgroundColor: VCOL(spec.name, i) }} />
                      </div>
                    </div>
                  )
                })}
                {co2Saved > 0 && (
                  <div className="mt-2 flex items-center gap-2 text-xs text-emerald-400 bg-emerald-950/30 border border-emerald-800/30 rounded-lg px-3 py-2">
                    <span>↓</span>
                    <span>CO₂-Einsparung durch Sprinter vs. Vollflotte LKW: <strong>{fmt(co2Saved)} kg</strong></span>
                  </div>
                )}
              </div>
            </Card>

            {/* Vehicle specs table */}
            <Card title="Fahrzeugspezifikationen" sub="Aktive Flottenkonfiguration">
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-slate-500 border-b border-slate-800">
                      {['Fahrzeug','Einsatz','Kap.','Reichw.','CHF/km','CO₂/km','Tempo','Fahrer/h','Stop'].map(h => (
                        <th key={h} className="pb-2 pr-4 text-left font-medium">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {vehicle_specs.filter(v => v.enabled).map((v, i) => (
                      <tr key={v.id} className="text-slate-300 hover:bg-slate-800/20">
                        <td className="py-2 pr-4 font-semibold" style={{ color: VCOL(v.name, i) }}>{v.name}</td>
                        <td className="py-2 pr-4">
                          <span className="flex gap-1">
                            {v.can_last_mile && <span className="px-1 rounded bg-cyan-900/40 text-cyan-300 text-xs">LM</span>}
                            {v.can_backbone  && <span className="px-1 rounded bg-rose-900/40 text-rose-300 text-xs">BB</span>}
                          </span>
                        </td>
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
            </Card>
          </div>

          {/* ── Right 1/3: Optimisation + Supply chain ─────────────────── */}
          <div className="space-y-6">

            {/* Optimisation weights */}
            <Card title="Optimierung" sub="Scoring-Gewichte">
              <div className="space-y-3">
                {[
                  { label: 'Kosten', value: optimization.weights.cost, color: 'bg-blue-500' },
                  { label: 'Zeit',   value: optimization.weights.time, color: 'bg-amber-500' },
                  { label: 'CO₂',   value: optimization.weights.environment, color: 'bg-emerald-500' },
                ].map(w => (
                  <div key={w.label}>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-slate-400">{w.label}</span>
                      <span className="text-slate-300 font-medium">{Math.round(w.value * 100)}%</span>
                    </div>
                    <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full ${w.color}`} style={{ width: `${w.value * 100}%` }}/>
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-3 pt-3 border-t border-slate-800 space-y-1.5">
                <MetaRow label="Verkehrsfaktor"  value={`${optimization.traffic_factor} (free-flow)`} />
                <MetaRow label="CO₂-Preis"       value={`CHF ${optimization.co2_shadow_chf_per_kg}/kg`} />
                <MetaRow label="Schichtlänge"    value={`${optimization.shift_hours} h`} />
              </div>
            </Card>

            {/* Supply chain summary */}
            <Card title="Lieferkette" sub={supply_chain.hq_name ?? 'HQ → VZ → mVZ'}>
              <div className="space-y-2 text-xs">
                <ChainRow label="HQ → VZ" count={supply_chain.vz_count} color="bg-red-500" />
                <ChainRow label="VZ → mVZ" count={supply_chain.mvz_count} color="bg-teal-500" />
                <ChainRow label="→ Apotheken" count={supply_chain.pharmacy_count} color="bg-blue-500" />
              </div>
            </Card>

          </div>
        </div>

        {/* ── Supply chain hierarchy ────────────────────────────────────── */}
        <Card title="Lieferketten-Hierarchie" sub="VZ-Einzugsgebiete aufklappen für Details">
          <div className="space-y-2">
            {supply_chain.hierarchy.map(vz => <VzRow key={vz.name} vz={vz} />)}
          </div>
        </Card>

      </div>
    </div>
  )
}

/* ── helpers ─────────────────────────────────────────────────────────────── */
function fmt(n: number) { return n.toLocaleString('de-CH', { maximumFractionDigits: 1 }) }

function Card({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }) {
  return (
    <div className="bg-slate-900/60 border border-slate-700/60 rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-700/40 bg-slate-800/30">
        <div className="flex items-baseline gap-2">
          <span className="text-sm font-semibold text-slate-200">{title}</span>
          {sub && <span className="text-xs text-slate-500">{sub}</span>}
        </div>
      </div>
      <div className="p-4">{children}</div>
    </div>
  )
}

const ACCENT_MAP: Record<string, { border: string; bg: string; text: string }> = {
  blue:   { border: 'border-blue-700/40',   bg: 'bg-blue-950/20',   text: 'text-blue-300'   },
  green:  { border: 'border-emerald-700/40', bg: 'bg-emerald-950/20', text: 'text-emerald-300' },
  amber:  { border: 'border-amber-700/40',  bg: 'bg-amber-950/20',  text: 'text-amber-300'  },
  violet: { border: 'border-violet-700/40', bg: 'bg-violet-950/20', text: 'text-violet-300' },
}

function KpiCard({ label, main, sub, icon, accent }: {
  label: string; main: string; sub: string; icon: string; accent: string
}) {
  const a = ACCENT_MAP[accent]
  return (
    <div className={`stat-card rounded-xl border p-4 ${a.border} ${a.bg}`}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-slate-500">{label}</span>
        <span className="text-base">{icon}</span>
      </div>
      <div className={`text-xl font-bold ${a.text}`}>{main}</div>
      <div className="text-xs text-slate-600 mt-1">{sub}</div>
    </div>
  )
}

function FleetCard({ spec, stats, color, isBackbone }: {
  spec: VehicleConfig; stats: import('../../types').FleetStats; color: string; isBackbone?: boolean
}) {
  return (
    <div className="rounded-xl border border-slate-700/40 bg-slate-800/20 p-3">
      <div className="flex items-center gap-2 mb-2.5">
        <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
        <div>
          <p className="text-xs font-semibold text-slate-200">{spec.name}</p>
          <p className="text-xs text-slate-600">{spec.co2_g_per_km} g CO₂/km</p>
        </div>
      </div>
      <div className="space-y-1 text-xs">
        {!isBackbone && <FRow l="Fahrzeuge" v={`${stats.count}`} />}
        <FRow l="Strecke"  v={`${fmt(stats.total_km)} km`} />
        <FRow l="Kosten"   v={`CHF ${fmt(stats.total_cost_chf)}`} />
        <FRow l="CO₂"      v={`${fmt(stats.total_co2_kg)} kg`} />
        <FRow l="Waren"    v={`${fmt(stats.total_items)} Einh.`} bold />
      </div>
    </div>
  )
}
function FRow({ l, v, bold }: { l: string; v: string; bold?: boolean }) {
  return (
    <div className="flex justify-between gap-1">
      <span className="text-slate-500">{l}</span>
      <span className={bold ? 'text-slate-200 font-semibold' : 'text-slate-300'}>{v}</span>
    </div>
  )
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-xs">
      <span className="text-slate-500">{label}</span>
      <span className="text-slate-400">{value}</span>
    </div>
  )
}

function ChainRow({ label, count, color }: { label: string; count: number; color: string }) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        <span className={`w-2 h-2 rounded-full ${color}`}/>
        <span className="text-slate-400">{label}</span>
      </div>
      <span className="text-slate-300 font-semibold">{count}</span>
    </div>
  )
}

function VzRow({ vz }: { vz: VzStats }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="border border-slate-800 rounded-xl overflow-hidden">
      <button onClick={() => setOpen(o => !o)}
              className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-slate-800/40 transition-colors">
        <span className="w-2 h-2 rounded-full bg-blue-500 flex-shrink-0"/>
        <span className="text-sm font-semibold text-blue-300">{vz.name}</span>
        <span className="text-xs text-slate-500">
          {vz.total_pharmacies} Apotheken · {vz.mvz_count} mVZ · {fmt(vz.total_items)} Einh.
        </span>
        <div className="ml-auto flex items-center gap-3 text-xs text-slate-500">
          {vz.backbone_km      && <span>{fmt(vz.backbone_km)} km HQ</span>}
          {vz.backbone_cost_chf && <span>CHF {fmt(vz.backbone_cost_chf)}</span>}
          {vz.backbone_co2_kg  && <span>{fmt(vz.backbone_co2_kg)} kg CO₂</span>}
          <span className="text-slate-600">{open ? '▲' : '▼'}</span>
        </div>
      </button>

      {open && (
        <div className="border-t border-slate-800 px-4 pb-3 pt-2">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
            {vz.direct_pharmacies > 0 && (
              <MvzCard name={`Direkt → ${vz.name}`} count={vz.direct_pharmacies} items={0} color="blue" />
            )}
            {vz.mvz.map(mvz => (
              <MvzCard key={mvz.name} name={mvz.name} count={mvz.pharmacy_count}
                       items={mvz.total_items} km={mvz.backbone_km ?? undefined} color="amber" />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function MvzCard({ name, count, items, km, color }: {
  name: string; count: number; items: number; km?: number; color: 'blue'|'amber'
}) {
  const c = color === 'blue'
    ? 'border-blue-800/40 bg-blue-950/20 text-blue-300'
    : 'border-amber-800/40 bg-amber-950/20 text-amber-300'
  return (
    <div className={`rounded-lg border p-2.5 text-xs ${c}`}>
      <p className="font-semibold mb-1">{name}</p>
      <p className="text-slate-400">{count} Apotheken</p>
      {items > 0 && <p className="text-slate-500">{fmt(items)} Einh.</p>}
      {km && <p className="text-slate-600">{fmt(km)} km</p>}
    </div>
  )
}
