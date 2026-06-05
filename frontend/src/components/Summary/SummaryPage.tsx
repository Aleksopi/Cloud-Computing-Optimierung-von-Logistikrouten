import { useEffect, useState } from 'react'
import { api } from '../../api/client'
import type { FullSummary, PipelineStatus, VzStats, VehicleConfig, IndividualRoute, HubLoad } from '../../types'
import { COLORS, VEHICLE_ROUTE_COLOR } from '../Map/MapView'

interface SummaryPageProps { pipelineStatus: PipelineStatus }

const COLOR_BY_TYPE: Record<string, string> = Object.fromEntries(VEHICLE_ROUTE_COLOR)
const VCOL = (name: string, i: number) =>
  COLOR_BY_TYPE[name] ?? ['#f59e0b', '#8b5cf6', '#06b6d4', '#10b981'][i % 4]

const fmt = (n: number, d = 1) => n.toLocaleString('de-CH', { maximumFractionDigits: d })

function groupBy<T>(arr: T[], fn: (x: T) => string): Record<string, T[]> {
  return arr.reduce((acc, x) => { const k = fn(x); (acc[k] ??= []).push(x); return acc }, {} as Record<string, T[]>)
}

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
      <div className="w-14 h-14 rounded-xl bg-slate-800/60 border border-slate-700/40 flex items-center justify-center">
        <svg className="w-7 h-7 text-slate-600" viewBox="0 0 24 24" fill="none">
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
  if (error) return <div className="flex items-center justify-center h-full text-red-400 text-sm">{error}</div>
  if (!data)  return null

  const { overview, fleet_by_type, fleet, vehicle_specs, optimization, supply_chain, metrics, individual_routes } = data
  const deliverySpecs = vehicle_specs.filter(v => v.can_last_mile && v.enabled)
  const lkwSpec       = vehicle_specs.find(v => v.name === 'LKW')
  const co2Saved      = lkwSpec ? Math.max(0, Math.round(fleet.last_mile.total_km * lkwSpec.co2_g_per_km / 1000 - fleet.last_mile.total_co2_kg)) : 0
  const routesByType  = groupBy(individual_routes, r => r.vehicle_type)

  return (
    <div className="h-full overflow-y-auto bg-slate-950 text-slate-100">
      <div className="max-w-6xl mx-auto px-6 py-6 space-y-6">

        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-lg font-bold text-white">Analyse &amp; Ergebnisse</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              {overview.pharmacies_assigned}/{overview.pharmacies_total} Apotheken versorgt
              · {overview.hubs_total} Hubs · {supply_chain.vz_count} VZ + {supply_chain.mvz_count} mVZ
              {metrics.unrouted_pharmacies > 0 && (
                <span className="ml-2 text-amber-400 font-medium">
                  · {metrics.unrouted_pharmacies} nicht zugewiesen
                </span>
              )}
            </p>
          </div>
        </div>

        {/* KPI Row */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <KpiCard label="Gesamtkosten"  main={`CHF ${fmt(overview.total_cost_chf, 0)}`}
                   sub={`CHF ${fmt(metrics.cost_per_item_chf, 2)} / Einheit`}  accent="blue" />
          <KpiCard label="CO2-Emissionen" main={`${fmt(overview.total_co2_kg)} kg`}
                   sub={co2Saved > 0 ? `−${fmt(co2Saved)} kg vs. Vollflotte LKW` : `${fmt(metrics.co2_per_km_kg * 1000, 1)} g/km`}
                   accent="green" />
          <KpiCard label="Gesamtstrecke"  main={`${fmt(overview.total_km)} km`}
                   sub={`Ø ${fmt(metrics.avg_km_per_route)} km / Route`}  accent="amber" />
          <KpiCard label="Fahrzeugrouten" main={`${overview.total_last_mile_routes}`}
                   sub={`Ø ${fmt(metrics.avg_stops_per_route)} Stops · ${fmt(metrics.total_driver_hours)} h gesamt`}
                   accent="violet" />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

          {/* ── Left: Fleet + CO2 ──────────────────────────────────────── */}
          <div className="lg:col-span-2 space-y-6">

            {/* Fleet cards */}
            <Card title="Flotteneinsatz" sub="nach Fahrzeugtyp">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {deliverySpecs.map((spec, i) => {
                  const stats = fleet_by_type[spec.name]
                  if (!stats) return null
                  return <FleetCard key={spec.id} spec={spec} stats={stats} color={VCOL(spec.name, i)} />
                })}
              </div>
            </Card>

            {/* CO2 bars */}
            <Card title="CO2-Bilanz" sub="Emissionen nach Fahrzeugtyp">
              <div className="space-y-3">
                {[...deliverySpecs, ...(vehicle_specs.find(v => v.can_backbone && v.enabled && !v.can_last_mile) ? [vehicle_specs.find(v => v.can_backbone && v.enabled && !v.can_last_mile)!] : [])].map((spec, i) => {
                  const stats = spec.can_last_mile ? fleet_by_type[spec.name] : fleet.backbone
                  if (!stats) return null
                  const pct = Math.min(100, (stats.total_co2_kg / Math.max(overview.total_co2_kg, 1)) * 100)
                  return (
                    <div key={spec.name}>
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
                        <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: VCOL(spec.name, i) }} />
                      </div>
                    </div>
                  )
                })}
                {co2Saved > 0 && (
                  <div className="mt-2 text-xs text-emerald-400 bg-emerald-950/30 border border-emerald-800/30 rounded-lg px-3 py-2">
                    CO2-Einsparung durch Sprinter vs. Vollflotte LKW: <strong>{fmt(co2Saved)} kg</strong>
                  </div>
                )}
              </div>
            </Card>

            {/* Hub capacity table */}
            <Card title="Lagerauslastung" sub="alle Hubs — geschätzt bis Step 3 abgeschlossen">
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-slate-500 border-b border-slate-800">
                      {['Hub','Typ','Auslastung','Last / Kapazität'].map(h => (
                        <th key={h} className="pb-2 pr-4 text-left font-medium">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {metrics.hub_loads.map(h => (
                      <tr key={h.name} className="text-slate-300 hover:bg-slate-800/20">
                        <td className="py-2 pr-4 font-medium text-slate-200">{h.name}</td>
                        <td className="py-2 pr-4 text-slate-500">{h.hub_type}</td>
                        <td className="py-2 pr-4 w-32">
                          <div className="flex items-center gap-2">
                            <div className="flex-1 h-1.5 bg-slate-800 rounded-full overflow-hidden">
                              <div className={`h-full rounded-full ${h.pct >= 100 ? 'bg-red-500' : h.pct >= 80 ? 'bg-amber-500' : 'bg-emerald-500'}`}
                                   style={{ width: `${Math.min(h.pct, 100)}%` }} />
                            </div>
                            <span className={`text-xs font-medium w-10 ${h.pct >= 100 ? 'text-red-400' : h.pct >= 80 ? 'text-amber-400' : 'text-emerald-400'}`}>
                              {h.pct}%
                            </span>
                          </div>
                        </td>
                        <td className="py-2 text-slate-400">{h.load} / {h.capacity} Einh.</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>

            {/* Vehicle specs */}
            <Card title="Fahrzeugspezifikationen" sub="Aktive Flottenkonfiguration">
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-slate-500 border-b border-slate-800">
                      {['Fahrzeug','Einsatz','Kap.','Reichw.','CHF/km','CO2/km','Tempo','Fahrer/h','Stop'].map(h => (
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
                        <td className="py-2 pr-4">{v.capacity ?? 'unbegrenzt'}</td>
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

          {/* ── Right: Optimisation + Supply chain ─────────────────────── */}
          <div className="space-y-6">

            <Card title="Optimierung" sub="Scoring-Gewichte">
              <div className="space-y-3">
                {[
                  { label: 'Kosten',   value: optimization.weights.cost,        color: 'bg-blue-500' },
                  { label: 'Zeit',     value: optimization.weights.time,        color: 'bg-amber-500' },
                  { label: 'CO2',      value: optimization.weights.environment, color: 'bg-emerald-500' },
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
              <div className="mt-3 pt-3 border-t border-slate-800 space-y-1.5 text-xs">
                <KV label="Verkehrsfaktor"  value={`${optimization.traffic_factor}`} />
                <KV label="CO2-Preis"       value={`CHF ${optimization.co2_shadow_chf_per_kg}/kg`} />
                <KV label="Schichtlänge"    value={`${optimization.shift_hours} h`} />
                <KV label="Kosten/Einheit"  value={`CHF ${fmt(metrics.cost_per_item_chf, 2)}`} />
                <KV label="CO2/km (ges.)"   value={`${fmt(metrics.co2_per_km_kg * 1000, 1)} g`} />
                <KV label="Fahrstunden"     value={`${fmt(metrics.total_driver_hours)} h`} />
              </div>
            </Card>

            <Card title="Lieferkette" sub={`${supply_chain.hq_name ?? 'HQ'} → VZ → mVZ`}>
              <div className="space-y-2 text-xs">
                <ChainRow label="HQ" count={1}                     color="bg-red-500" />
                <ChainRow label="Verteilzentren (VZ)"   count={supply_chain.vz_count}   color="bg-blue-500" />
                <ChainRow label="Mini-Verteilzentren"   count={supply_chain.mvz_count}  color="bg-teal-500" />
                <ChainRow label="Apotheken"              count={supply_chain.pharmacy_count} color="bg-slate-400" />
              </div>
            </Card>
          </div>
        </div>

        {/* Per-vehicle table */}
        <Card title="Alle Fahrzeugrouten" sub="Last-Mile — nach Typ und Hub sortiert">
          {Object.entries(routesByType).map(([type, routes]) => (
            <VehicleTypeGroup key={type} type={type} routes={routes}
                              color={VCOL(type, Object.keys(routesByType).indexOf(type))} />
          ))}
          {individual_routes.length === 0 && (
            <p className="text-xs text-slate-500 py-4 text-center">Keine Routen vorhanden.</p>
          )}
        </Card>

        {/* Supply chain hierarchy */}
        <Card title="Lieferketten-Hierarchie" sub="VZ-Einzugsgebiete aufklappen">
          <div className="space-y-2">
            {supply_chain.hierarchy.map(vz => <VzRow key={vz.name} vz={vz} />)}
          </div>
        </Card>

      </div>
    </div>
  )
}

/* ── Sub-components ─────────────────────────────────────────────────────── */

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

const ACCENT: Record<string, { border: string; bg: string; text: string }> = {
  blue:   { border: 'border-blue-700/40',    bg: 'bg-blue-950/20',    text: 'text-blue-300'   },
  green:  { border: 'border-emerald-700/40', bg: 'bg-emerald-950/20', text: 'text-emerald-300' },
  amber:  { border: 'border-amber-700/40',   bg: 'bg-amber-950/20',   text: 'text-amber-300'  },
  violet: { border: 'border-violet-700/40',  bg: 'bg-violet-950/20',  text: 'text-violet-300' },
}

function KpiCard({ label, main, sub, accent }: { label: string; main: string; sub: string; accent: string }) {
  const a = ACCENT[accent]
  return (
    <div className={`rounded-xl border p-4 ${a.border} ${a.bg}`}>
      <p className="text-xs text-slate-500 mb-1">{label}</p>
      <p className={`text-xl font-bold ${a.text}`}>{main}</p>
      <p className="text-xs text-slate-600 mt-1">{sub}</p>
    </div>
  )
}

function FleetCard({ spec, stats, color }: { spec: VehicleConfig; stats: import('../../types').FleetStats; color: string }) {
  return (
    <div className="rounded-xl border border-slate-700/40 bg-slate-800/20 p-3">
      <div className="flex items-center gap-2 mb-2.5">
        <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
        <div>
          <p className="text-xs font-semibold text-slate-200">{spec.name}</p>
          <p className="text-xs text-slate-600">{spec.co2_g_per_km} g CO2/km</p>
        </div>
      </div>
      <div className="space-y-1 text-xs">
        <FRow l="Fahrzeuge"  v={`${stats.count}`} />
        <FRow l="Strecke"    v={`${fmt(stats.total_km)} km`} />
        <FRow l="Kosten"     v={`CHF ${fmt(stats.total_cost_chf, 0)}`} />
        <FRow l="CO2"        v={`${fmt(stats.total_co2_kg)} kg`} />
        <FRow l="Waren"      v={`${fmt(stats.total_items, 0)} Einh.`} bold />
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

function KV({ label, value }: { label: string; value: string }) {
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

function VehicleTypeGroup({ type, routes, color }: { type: string; routes: IndividualRoute[]; color: string }) {
  const [open, setOpen] = useState(true)
  const totals = {
    km:    routes.reduce((s, r) => s + r.total_km,       0),
    items: routes.reduce((s, r) => s + r.total_items,    0),
    cost:  routes.reduce((s, r) => s + r.total_cost_chf, 0),
    co2:   routes.reduce((s, r) => s + r.co2_kg,         0),
    stops: routes.reduce((s, r) => s + r.stop_count,     0),
    hours: routes.reduce((s, r) => s + r.total_hours,    0),
  }
  return (
    <div className="mb-4">
      <button onClick={() => setOpen(o => !o)}
              className="w-full flex items-center gap-3 py-2 text-left hover:bg-slate-800/30 rounded-lg px-2 transition-colors mb-1">
        <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
        <span className="text-sm font-semibold text-slate-200">{type}</span>
        <span className="text-xs text-slate-500">{routes.length} Fahrzeuge</span>
        <div className="ml-auto flex items-center gap-4 text-xs text-slate-500">
          <span>{fmt(totals.km)} km</span>
          <span>CHF {fmt(totals.cost, 0)}</span>
          <span>{fmt(totals.co2)} kg CO2</span>
          <span className="text-slate-600">{open ? '▲' : '▼'}</span>
        </div>
      </button>
      {open && (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-slate-600 border-b border-slate-800/60">
                {['Fahrzeug','Hub','Stops','Waren','Strecke','Zeit','Kosten','CO2','Restock'].map(h => (
                  <th key={h} className="pb-1.5 pr-3 text-left font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/40">
              {routes.map(r => (
                <tr key={r.vehicle_id} className="text-slate-400 hover:bg-slate-800/20 hover:text-slate-300 transition-colors">
                  <td className="py-1.5 pr-3 font-medium text-slate-300">{r.vehicle_id}</td>
                  <td className="py-1.5 pr-3">{r.hub_name}</td>
                  <td className="py-1.5 pr-3">{r.stop_count}</td>
                  <td className="py-1.5 pr-3">{r.total_items} Einh.</td>
                  <td className="py-1.5 pr-3">{r.total_km} km</td>
                  <td className="py-1.5 pr-3">{r.total_hours.toFixed(1)} h</td>
                  <td className="py-1.5 pr-3 text-slate-200 font-medium">CHF {r.total_cost_chf}</td>
                  <td className="py-1.5 pr-3">{r.co2_kg} kg</td>
                  <td className="py-1.5">{r.restock_count > 0 ? `${r.restock_count}x` : '—'}</td>
                </tr>
              ))}
              {/* Summary row */}
              <tr className="text-slate-300 font-semibold border-t border-slate-700/60 bg-slate-800/20">
                <td className="py-1.5 pr-3 text-slate-400" colSpan={2}>Summe</td>
                <td className="py-1.5 pr-3">{totals.stops}</td>
                <td className="py-1.5 pr-3">{fmt(totals.items, 0)} Einh.</td>
                <td className="py-1.5 pr-3">{fmt(totals.km)} km</td>
                <td className="py-1.5 pr-3">{fmt(totals.hours)} h</td>
                <td className="py-1.5 pr-3">CHF {fmt(totals.cost, 0)}</td>
                <td className="py-1.5 pr-3">{fmt(totals.co2)} kg</td>
                <td className="py-1.5">—</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
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
          {vz.total_pharmacies} Apotheken · {vz.mvz_count} mVZ · {fmt(vz.total_items, 0)} Einh.
        </span>
        <div className="ml-auto flex items-center gap-3 text-xs text-slate-500">
          {vz.backbone_km      && <span>{fmt(vz.backbone_km)} km</span>}
          {vz.backbone_cost_chf && <span>CHF {fmt(vz.backbone_cost_chf, 0)}</span>}
          <span className="text-slate-600">{open ? '▲' : '▼'}</span>
        </div>
      </button>
      {open && (
        <div className="border-t border-slate-800 px-4 pb-3 pt-2">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
            {vz.direct_pharmacies > 0 && (
              <div className="rounded-lg border border-blue-800/40 bg-blue-950/20 p-2.5 text-xs">
                <p className="text-blue-400 font-semibold mb-1">Direkt — {vz.name}</p>
                <p className="text-slate-400">{vz.direct_pharmacies} Apotheken</p>
              </div>
            )}
            {vz.mvz.map(mvz => (
              <div key={mvz.name} className="rounded-lg border border-amber-800/40 bg-amber-950/20 p-2.5 text-xs">
                <p className="text-amber-300 font-semibold mb-1">{mvz.name}</p>
                <div className="text-slate-400 space-y-0.5">
                  <div>{mvz.pharmacy_count} Apotheken · {fmt(mvz.total_items, 0)} Einh.</div>
                  {mvz.backbone_km && <div className="text-slate-600">{fmt(mvz.backbone_km)} km</div>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
