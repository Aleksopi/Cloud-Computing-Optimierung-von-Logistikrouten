import { useEffect, useState } from 'react'
import { api } from '../../api/client'
import type { FullSummary, PipelineStatus, VzStats, VehicleConfig, IndividualRoute, HubLoad, Savings } from '../../types'
import { COLORS, VEHICLE_ROUTE_COLOR } from '../Map/MapView'
import { DetailModal, type DetailSubject } from '../common/DetailModal'

interface SummaryPageProps { pipelineStatus: PipelineStatus }

const COLOR_BY_TYPE: Record<string, string> = Object.fromEntries(VEHICLE_ROUTE_COLOR)
const VCOL = (name: string, i: number) =>
  COLOR_BY_TYPE[name] ?? ['#f59e0b', '#8b5cf6', '#06b6d4', '#10b981'][i % 4]
const fmt = (n: number, d = 1) => n.toLocaleString('de-CH', { maximumFractionDigits: d })
const groupBy = <T,>(arr: T[], fn: (x: T) => string): Record<string, T[]> =>
  arr.reduce((a, x) => { const k = fn(x); (a[k] ??= []).push(x); return a }, {} as Record<string, T[]>)

const TABS = [
  { id: 'overview',    label: 'Übersicht'    },
  { id: 'vehicles',    label: 'Last Mile'    },
  { id: 'backbone',    label: 'Hauptlauf'    },
  { id: 'hubs',        label: 'Hubs'         },
  { id: 'coverage',    label: 'Belieferung'  },
  { id: 'traffic',     label: 'Verkehr'      },
  { id: 'environment', label: 'CO2 & Umwelt' },
] as const
type TabId = typeof TABS[number]['id']

export function SummaryPage({ pipelineStatus }: SummaryPageProps) {
  const [data, setData]       = useState<FullSummary | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState<string | null>(null)
  const [tab, setTab]         = useState<TabId>('overview')
  const [detail, setDetail]   = useState<DetailSubject | null>(null)
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

  const { overview, fleet_by_type, fleet, vehicle_specs, optimization, supply_chain, metrics, individual_routes, fleet_utilization } = data
  const deliverySpecs = vehicle_specs.filter(v => v.can_last_mile && v.enabled)
  const lkwSpec       = vehicle_specs.find(v => v.name === 'LKW')
  const co2Saved      = lkwSpec ? Math.max(0, Math.round(fleet.last_mile.total_km * lkwSpec.co2_g_per_km / 1000 - fleet.last_mile.total_co2_kg)) : 0
  const routesByType  = groupBy(individual_routes, r => r.vehicle_type)

  return (
    <div className="h-full flex flex-col bg-slate-950 text-slate-100 overflow-hidden">
      {/* Tab bar */}
      <div className="flex-shrink-0 flex items-center gap-1 px-6 pt-4 pb-0 border-b border-slate-800">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
                  className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors border-b-2 -mb-px
                    ${tab === t.id
                      ? 'text-white border-blue-500 bg-slate-800/60'
                      : 'text-slate-400 border-transparent hover:text-slate-200 hover:bg-slate-800/30'
                    }`}>
            {t.label}
          </button>
        ))}
        <div className="ml-auto flex items-center gap-3 text-xs text-slate-500 pb-2">
          {overview.pharmacies_assigned}/{overview.pharmacies_total} Apotheken
          {metrics.undelivered_pharmacies > 0 && (
            <span className="text-red-400">· {metrics.undelivered_pharmacies} nicht belieferbar</span>
          )}
          {metrics.unrouted_pharmacies > 0 && (
            <span className="text-amber-400">· {metrics.unrouted_pharmacies} nicht zugewiesen</span>
          )}
        </div>
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto">
        {tab === 'overview'    && <OverviewTab    data={data} co2Saved={co2Saved} />}
        {tab === 'vehicles'    && <VehiclesTab    deliverySpecs={deliverySpecs} routesByType={routesByType} fleetUtil={fleet_utilization} onDetail={setDetail} />}
        {tab === 'backbone'    && <BackboneTab    data={data} onDetail={setDetail} />}
        {tab === 'hubs'        && <HubsTab        data={data} onDetail={setDetail} />}
        {tab === 'coverage'    && <CoverageTab    data={data} />}
        {tab === 'traffic'     && <TrafficTab     data={data} />}
        {tab === 'environment' && <EnvironmentTab data={data} deliverySpecs={deliverySpecs} co2Saved={co2Saved} />}
      </div>

      {detail && <DetailModal subject={detail} onClose={() => setDetail(null)} />}
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════════════════
   TAB: Übersicht
══════════════════════════════════════════════════════════════════════════ */
function OverviewTab({ data, co2Saved }: { data: FullSummary; co2Saved: number }) {
  const { overview, fleet_by_type, vehicle_specs, optimization, metrics, fleet_utilization, savings } = data
  const deliverySpecs = vehicle_specs.filter(v => v.can_last_mile && v.enabled)

  return (
    <div className="max-w-5xl mx-auto px-6 py-6 space-y-6">
      {/* KPI row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard accent="blue"   label="Transportkosten"  main={`CHF ${fmt(overview.total_cost_chf, 0)}`}
                 sub={`+ CHF ${fmt(overview.warehouse_cost_chf, 0)} Lager · CHF ${fmt(metrics.cost_per_item_chf, 2)}/Einh.`} />
        <KpiCard accent="green"  label="CO2-Emissionen"  main={`${fmt(overview.total_co2_kg)} kg`}
                 sub={co2Saved > 0 ? `−${fmt(co2Saved)} kg vs. Vollflotte LKW` : `${fmt(metrics.co2_per_km_kg * 1000, 1)} g/km`} />
        <KpiCard accent="amber"  label="Gesamtstrecke"   main={`${fmt(overview.total_km)} km`}
                 sub={`Ø ${fmt(metrics.avg_km_per_route)} km / Route`} />
        <KpiCard accent="violet" label="Fahrzeugrouten"  main={`${overview.total_last_mile_routes}`}
                 sub={`Ø ${fmt(metrics.avg_stops_per_route)} Stops · ${fmt(metrics.total_driver_hours)} h`} />
      </div>

      {/* Optimisation value — savings vs. naive individual deliveries */}
      {savings && <SavingsCard savings={savings} />}

      {/* Traffic & optimisation context */}
      <TrafficContextCard optimization={optimization} />

      {/* Cost breakdown: transport vs. warehouse */}
      <Card title="Kostenaufteilung" sub="Transport vs. Lager (gesamt)">
        {(() => {
          const transport = overview.total_cost_chf
          const wh        = overview.warehouse_cost_chf
          const total     = Math.max(1, transport + wh)
          return (
            <>
              <div className="flex h-6 rounded-lg overflow-hidden border border-slate-700/60">
                <div className="flex items-center justify-center text-[10px] font-semibold text-white/90"
                     style={{ width: `${transport / total * 100}%`, backgroundColor: '#3b82f6' }}>
                  {Math.round(transport / total * 100)}%
                </div>
                <div className="flex items-center justify-center text-[10px] font-semibold text-white/90"
                     style={{ width: `${wh / total * 100}%`, backgroundColor: '#f59e0b' }}>
                  {Math.round(wh / total * 100)}%
                </div>
              </div>
              <div className="flex flex-wrap gap-4 mt-2 text-xs">
                <span className="flex items-center gap-1.5 text-slate-400"><span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: '#3b82f6' }} />Transport CHF {fmt(transport, 0)}</span>
                <span className="flex items-center gap-1.5 text-slate-400"><span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: '#f59e0b' }} />Lager CHF {fmt(wh, 0)}</span>
                <span className="text-slate-500">Gesamt CHF {fmt(overview.total_cost_incl_warehouse_chf, 0)}</span>
              </div>
            </>
          )
        })()}
      </Card>

      {/* Fleet summary + utilization */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card title="Flotteneinsatz">
          <div className="space-y-3">
            {deliverySpecs.map((spec, i) => {
              const stats = fleet_by_type[spec.name]
              const util  = fleet_utilization[spec.name]
              if (!stats) return null
              return (
                <div key={spec.id} className="flex items-center gap-3 p-3 rounded-lg bg-slate-800/40 border border-slate-700/40">
                  <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: VCOL(spec.name, i) }} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline justify-between mb-1">
                      <span className="text-sm font-semibold text-slate-200">{spec.name}</span>
                      {util && (
                        <span className="text-xs text-slate-500">
                          {util.actually_used} / {util.total_available} eingesetzt ({util.utilization_pct}%)
                        </span>
                      )}
                    </div>
                    <div className="flex gap-4 text-xs text-slate-400">
                      <span>{fmt(stats.total_km)} km</span>
                      <span>CHF {fmt(stats.total_cost_chf, 0)}</span>
                      <span>{fmt(stats.total_co2_kg)} kg CO2</span>
                    </div>
                    {util && (
                      <div className="mt-1.5 h-1 bg-slate-800 rounded-full overflow-hidden">
                        <div className="h-full rounded-full" style={{ width: `${util.utilization_pct}%`, backgroundColor: VCOL(spec.name, i) }} />
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </Card>

        <Card title="Kennzahlen">
          <div className="space-y-2">
            {([
              ['Durchschn. Stops / Route',  `${fmt(metrics.avg_stops_per_route)}`],
              ['Durchschn. Distanz / Route', `${fmt(metrics.avg_km_per_route)} km`],
              ['Kosten pro Einheit',          `CHF ${fmt(metrics.cost_per_item_chf, 2)}`],
              ['Lagerkosten (gesamt)',        `CHF ${fmt(overview.warehouse_cost_chf, 0)}`],
              ['Gesamtkosten inkl. Lager',    `CHF ${fmt(overview.total_cost_incl_warehouse_chf, 0)}`],
              ['CO2 pro km (gesamt)',         `${fmt(metrics.co2_per_km_kg * 1000, 1)} g/km`],
              ['Gesamte Fahrstunden',         `${fmt(metrics.total_driver_hours)} h`],
              ['Belieferte Apotheken',        `${metrics.served_pharmacies}`],
              ['Nicht belieferbare Apotheken', `${metrics.undelivered_pharmacies}`,
                metrics.undelivered_pharmacies > 0 ? 'text-red-400' : undefined],
              ['Nicht zugewiesene Apotheken', `${metrics.unrouted_pharmacies}`,
                metrics.unrouted_pharmacies > 0 ? 'text-amber-400' : undefined],
            ] as [string, string, string?][]).map(([l, v, cls]) => (
              <div key={l} className="flex justify-between text-xs">
                <span className="text-slate-500">{l}</span>
                <span className={`font-medium ${cls ?? 'text-slate-300'}`}>{v}</span>
              </div>
            ))}
          </div>
          <div className="mt-4 pt-3 border-t border-slate-800">
            <p className="text-xs font-medium text-slate-400 mb-2">Optimierungsgewichte</p>
            {[
              ['Kosten',   optimization.weights.cost,        'bg-blue-500'],
              ['Zeit',     optimization.weights.time,        'bg-amber-500'],
              ['CO2',      optimization.weights.environment, 'bg-emerald-500'],
            ].map(([l, v, c]) => (
              <div key={l as string} className="flex items-center gap-2 mb-1">
                <span className="text-xs text-slate-500 w-14">{l as string}</span>
                <div className="flex-1 h-1.5 bg-slate-800 rounded-full overflow-hidden">
                  <div className={`h-full rounded-full ${c as string}`} style={{ width: `${(v as number) * 100}%` }} />
                </div>
                <span className="text-xs text-slate-400 w-8 text-right">{Math.round((v as number) * 100)}%</span>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════════════════
   TAB: Fahrzeuge
══════════════════════════════════════════════════════════════════════════ */
function VehiclesTab({ deliverySpecs, routesByType, fleetUtil, onDetail }: {
  deliverySpecs: VehicleConfig[]
  routesByType: Record<string, IndividualRoute[]>
  fleetUtil: Record<string, import('../../types').FleetUtilization>
  onDetail: (s: DetailSubject) => void
}) {
  return (
    <div className="max-w-6xl mx-auto px-6 py-6 space-y-6">
      {/* Fleet utilization overview */}
      <Card title="Fahrzeugflotte — Auslastung" sub="eingesetzte vs. verfügbare Fahrzeuge">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-slate-500 border-b border-slate-800">
                {['Typ','Eingesetzt','Verfügbar','Auslastung','Auslastungsbalken'].map(h => (
                  <th key={h} className="pb-2 pr-4 text-left font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/40">
              {deliverySpecs.map((spec, i) => {
                const util = fleetUtil[spec.name]
                if (!util) return null
                const pct = util.utilization_pct
                return (
                  <tr key={spec.id} className="text-slate-300">
                    <td className="py-2.5 pr-4 font-semibold" style={{ color: VCOL(spec.name, i) }}>{spec.name}</td>
                    <td className="py-2.5 pr-4 text-slate-200 font-medium">{util.actually_used}</td>
                    <td className="py-2.5 pr-4 text-slate-500">{util.total_available}</td>
                    <td className="py-2.5 pr-4">
                      <span className={`font-medium ${pct >= 80 ? 'text-amber-400' : pct >= 50 ? 'text-blue-300' : 'text-slate-400'}`}>
                        {pct}%
                      </span>
                    </td>
                    <td className="py-2.5 w-48">
                      <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
                        <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: VCOL(spec.name, i) }} />
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-slate-600 mt-3">
          Nicht eingesetzte Fahrzeuge verursachen keine Kosten. Verfügbar = max_per_hub × Anzahl Liefer-Hubs.
        </p>
      </Card>

      {/* Per-vehicle detail grouped by type */}
      {deliverySpecs.map((spec, i) => {
        const routes = routesByType[spec.name] ?? []
        if (!routes.length) return null
        return (
          <VehicleTypeGroup key={spec.id} type={spec.name} routes={routes} color={VCOL(spec.name, i)} onDetail={onDetail} />
        )
      })}
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════════════════
   TAB: Hauptlauf (backbone — Hub ↔ Hub)
══════════════════════════════════════════════════════════════════════════ */
function BackboneTab({ data, onDetail }: { data: FullSummary; onDetail: (s: DetailSubject) => void }) {
  const { backbone_by_type, fleet, individual_backbone_routes } = data
  const routesByType = groupBy(individual_backbone_routes, r => r.vehicle_type)
  const types = Object.keys(routesByType).sort()
  const bb = fleet.backbone

  if (!individual_backbone_routes.length) return (
    <div className="max-w-5xl mx-auto px-6 py-12 text-center text-slate-500 text-sm">
      Keine Hauptlauf-Routen vorhanden — bitte Schritt 4 ausführen.
    </div>
  )

  return (
    <div className="max-w-6xl mx-auto px-6 py-6 space-y-6">
      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard accent="violet" label="Hauptlauf-Routen" main={`${bb.count}`} sub="HQ→VZ + VZ→mVZ" />
        <KpiCard accent="amber"  label="Strecke"          main={`${fmt(bb.total_km)} km`} sub={`${fmt(bb.total_items, 0)} Einheiten transportiert`} />
        <KpiCard accent="blue"   label="Kosten"           main={`CHF ${fmt(bb.total_cost_chf, 0)}`} sub={`${fmt(bb.total_hours)} h Fahrzeit`} />
        <KpiCard accent="green"  label="CO2"              main={`${fmt(bb.total_co2_kg)} kg`} sub="Hauptlauf gesamt" />
      </div>

      {/* Fleet by backbone vehicle type */}
      <Card title="Hauptlauf-Flotte nach Fahrzeugtyp" sub="Hub-zu-Hub Transport (Sprinter / LKW / Zug …)">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-slate-500 border-b border-slate-800">
                {['Fahrzeug','Routen','Strecke','Waren','Zeit','Kosten','CO2'].map(h => (
                  <th key={h} className="pb-2 pr-4 text-left font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/40">
              {types.map((t, i) => {
                const s = backbone_by_type[t]
                if (!s) return null
                return (
                  <tr key={t} className="text-slate-300 hover:bg-slate-800/20">
                    <td className="py-2 pr-4 font-semibold" style={{ color: VCOL(t, i) }}>{t}</td>
                    <td className="py-2 pr-4">{s.count}</td>
                    <td className="py-2 pr-4">{fmt(s.total_km)} km</td>
                    <td className="py-2 pr-4">{fmt(s.total_items, 0)}</td>
                    <td className="py-2 pr-4">{fmt(s.total_hours)} h</td>
                    <td className="py-2 pr-4 text-slate-200 font-medium">CHF {fmt(s.total_cost_chf, 0)}</td>
                    <td className="py-2 pr-4">{fmt(s.total_co2_kg)} kg</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Per-type route detail */}
      {types.map((t, i) => (
        <VehicleTypeGroup key={t} type={t} routes={routesByType[t]} color={VCOL(t, i)} onDetail={onDetail} />
      ))}
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════════════════
   TAB: Hubs
══════════════════════════════════════════════════════════════════════════ */
function HubsTab({ data, onDetail }: { data: FullSummary; onDetail: (s: DetailSubject) => void }) {
  const { metrics, supply_chain, vehicle_specs } = data

  // Distribution hubs only (VZ + mVZ) — these carry the ≥10 % utilisation rule.
  const dist     = metrics.hub_loads.filter(h => h.hub_type !== 'HQ')
  const vzCount  = dist.filter(h => h.hub_type === 'VZ').length
  const mvzCount = dist.filter(h => h.hub_type === 'mVZ').length
  const utils    = dist.map(h => h.pct)
  const avgU     = utils.length ? utils.reduce((a, b) => a + b, 0) / utils.length : 0
  const minU     = utils.length ? Math.min(...utils) : 0

  return (
    <div className="max-w-5xl mx-auto px-6 py-6 space-y-6">
      {/* Hub distribution summary */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard accent="blue"   label="Verteilzentren (VZ)" main={`${vzCount}`} sub="automatisch 4–6" />
        <KpiCard accent="amber"  label="Mini-VZ (mVZ)"       main={`${mvzCount}`} sub="dynamisch nach Bedarf" />
        <KpiCard accent="green"  label="Ø Lagerauslastung"   main={`${fmt(avgU)}%`} sub={`${dist.length} Verteil-Hubs`} />
        <KpiCard accent="violet" label="Min. Auslastung"     main={`${fmt(minU)}%`} sub="Zieluntergrenze 10%" />
      </div>

      {/* Hub loads */}
      <Card title="Lagerauslastung & -kosten" sub="Hub anklicken für Details · Lagerkosten standortabhängig (dichter = teurer)">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-slate-500 border-b border-slate-800">
                {['Hub','Typ','Last / Kapazität','Auslastung','Lagerkosten','Balken'].map(h => (
                  <th key={h} className="pb-2 pr-4 text-left font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/40">
              {metrics.hub_loads.map(h => (
                <tr key={h.name} onClick={() => onDetail({ kind: 'hub', data: h })}
                    title="Details anzeigen"
                    className="text-slate-300 hover:bg-slate-800/40 cursor-pointer transition-colors">
                  <td className="py-2 pr-4 font-medium text-slate-200">
                    <span className="text-blue-300 hover:underline">{h.name}</span>
                    {h.city && <span className="text-slate-500 ml-1.5">· {h.city}</span>}
                  </td>
                  <td className="py-2 pr-4 text-slate-500 text-xs">{h.hub_type}</td>
                  <td className="py-2 pr-4">{h.load} / {h.capacity} Einh.</td>
                  <td className="py-2 pr-4">
                    <span className={`font-semibold text-xs ${h.pct >= 100 ? 'text-red-400' : h.pct >= 80 ? 'text-amber-400' : 'text-emerald-400'}`}>
                      {h.pct}%
                    </span>
                  </td>
                  <td className="py-2 pr-4 text-slate-400">
                    {h.warehouse_cost != null ? `CHF ${fmt(h.warehouse_cost, 0)}` : '—'}
                  </td>
                  <td className="py-2 w-32">
                    <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full ${h.pct >= 100 ? 'bg-red-500' : h.pct >= 80 ? 'bg-amber-500' : 'bg-emerald-500'}`}
                           style={{ width: `${Math.min(h.pct, 100)}%` }} />
                    </div>
                  </td>
                </tr>
              ))}
              <tr className="font-semibold text-slate-300 border-t border-slate-700/60 bg-slate-800/20">
                <td className="py-2 pr-4 text-slate-500" colSpan={4}>Summe Lagerkosten</td>
                <td className="py-2 pr-4">
                  CHF {fmt(metrics.hub_loads.reduce((s, h) => s + (h.warehouse_cost || 0), 0), 0)}
                </td>
                <td />
              </tr>
            </tbody>
          </table>
        </div>
      </Card>

      {/* Specs table */}
      <Card title="Fahrzeugspezifikationen">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-slate-500 border-b border-slate-800">
                {['Fahrzeug','Einsatz','Kap.','Reichw.','CHF/km','CO2/km','Tempo','Fahrer/h','Stop'].map(h => (
                  <th key={h} className="pb-2 pr-4 text-left font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/40">
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

      {/* Supply chain hierarchy */}
      <Card title="Lieferketten-Hierarchie" sub="HQ direktlieferung + VZ → mVZ → Apotheken">
        <div className="space-y-2">
          {supply_chain.hierarchy.map(vz => <VzRow key={vz.name} vz={vz} />)}
        </div>
      </Card>
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════════════════
   TAB: Belieferung (coverage — why pharmacies can/can't be supplied)
══════════════════════════════════════════════════════════════════════════ */
function CoverageTab({ data }: { data: FullSummary }) {
  const { metrics, overview } = data
  const list    = metrics.undelivered_list ?? []
  const reasons = Object.entries(groupBy(list, e => e.reason)).sort((a, b) => b[1].length - a[1].length)
  const total   = overview.pharmacies_total
  const served  = metrics.served_pharmacies
  const pct     = total ? Math.round((served / total) * 100) : 0

  return (
    <div className="max-w-5xl mx-auto px-6 py-6 space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard accent="green"  label="Belieferte Apotheken" main={`${served}`} sub={`${pct}% von ${total}`} />
        <KpiCard accent="amber"  label="Nicht belieferbar"    main={`${metrics.undelivered_pharmacies}`} sub="Gründe siehe unten" />
        <KpiCard accent="violet" label="Nicht zugewiesen"     main={`${metrics.unrouted_pharmacies}`} sub="keinem Hub zugeordnet" />
        <KpiCard accent="blue"   label="Apotheken gesamt"     main={`${total}`} sub="Schweiz" />
      </div>

      <Card title="Abdeckung" sub={`${served} von ${total} Apotheken werden beliefert`}>
        <div className="flex h-6 rounded-lg overflow-hidden border border-slate-700/60">
          <div className="bg-emerald-500 flex items-center justify-center text-[10px] font-semibold text-white/90"
               style={{ width: `${pct}%` }}>{pct >= 8 ? `${pct}%` : ''}</div>
          {pct < 100 && <div className="bg-red-500/70 flex-1 flex items-center justify-center text-[10px] font-semibold text-white/90">{100 - pct}%</div>}
        </div>
        <div className="flex gap-4 mt-2 text-xs text-slate-400">
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-emerald-500" />Beliefert</span>
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-red-500/70" />Nicht beliefert</span>
        </div>
      </Card>

      {list.length === 0 ? (
        <Card title="Vollständige Belieferung">
          <p className="text-sm text-emerald-400">✓ Jede zugewiesene Apotheke wird von mindestens einer Route bedient.</p>
        </Card>
      ) : (
        <>
          <div className="rounded-xl border border-amber-700/40 bg-amber-950/10 px-4 py-3 text-xs text-amber-200/90 leading-relaxed">
            <strong>Tipp:</strong> Unter <strong>Einstellungen → Parameter → „Alle Apotheken beliefern"</strong> lässt
            sich eine garantierte Belieferung erzwingen. Zwangslieferungen ignorieren dabei Schicht- und
            Öffnungszeit-Grenzen, damit keine Apotheke offen bleibt — danach Schritt 4 erneut ausführen.
          </div>

          {reasons.map(([reason, entries]) => (
            <Card key={reason} title={reason} sub={`${entries.length} Apotheke${entries.length !== 1 ? 'n' : ''}`}>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-slate-500 border-b border-slate-800">
                      {['Apotheke', 'Stadt', 'Hub', 'Bedarf'].map(h => (
                        <th key={h} className="pb-2 pr-4 text-left font-medium">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/40">
                    {entries.map(e => (
                      <tr key={e.id} className="text-slate-300 hover:bg-slate-800/20">
                        <td className="py-2 pr-4 font-medium text-slate-200">{e.name || `#${e.id}`}</td>
                        <td className="py-2 pr-4 text-slate-400">{e.city || '—'}</td>
                        <td className="py-2 pr-4 text-slate-400">{e.hub_name ?? '—'}</td>
                        <td className="py-2 pr-4 text-slate-400">{e.demand != null ? `${e.demand} Einh.` : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          ))}
        </>
      )}
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════════════════
   TAB: CO2 & Umwelt
══════════════════════════════════════════════════════════════════════════ */
function EnvironmentTab({ data, deliverySpecs, co2Saved }: {
  data: FullSummary; deliverySpecs: VehicleConfig[]; co2Saved: number
}) {
  const { overview, fleet_by_type, fleet, vehicle_specs } = data
  const backboneSpec = vehicle_specs.find(v => v.can_backbone && !v.can_last_mile)
  const maxCo2 = overview.total_co2_kg

  return (
    <div className="max-w-5xl mx-auto px-6 py-6 space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <KpiCard accent="green" label="Gesamt-CO2"       main={`${fmt(overview.total_co2_kg)} kg`} sub="alle Fahrzeuge + Backbone" />
        <KpiCard accent="blue"  label="CO2 / km"         main={`${fmt(data.metrics.co2_per_km_kg * 1000, 1)} g/km`} sub="gewichteter Durchschnitt" />
        <KpiCard accent="amber" label="CO2-Einsparung"   main={co2Saved > 0 ? `${fmt(co2Saved)} kg` : 'N/A'}
                 sub="Sprinter vs. Vollflotte LKW" />
      </div>

      {/* CO2 bars */}
      <Card title="CO2 nach Fahrzeugtyp" sub="Anteil an Gesamtemissionen">
        <div className="space-y-4">
          {[...deliverySpecs, ...(backboneSpec ? [backboneSpec] : [])].map((spec, i) => {
            const stats = spec.can_last_mile ? fleet_by_type[spec.name] : fleet.backbone
            if (!stats) return null
            const pct = maxCo2 > 0 ? (stats.total_co2_kg / maxCo2) * 100 : 0
            return (
              <div key={spec.name}>
                <div className="flex justify-between text-xs mb-1.5">
                  <span className="text-slate-300 flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full" style={{ backgroundColor: VCOL(spec.name, i) }}/>
                    {spec.name}
                  </span>
                  <span className="text-slate-400">
                    {fmt(stats.total_co2_kg)} kg
                    <span className="text-slate-600 ml-2">{spec.co2_g_per_km} g/km · {fmt(stats.total_km)} km</span>
                  </span>
                </div>
                <div className="h-3 bg-slate-800 rounded-full overflow-hidden">
                  <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: VCOL(spec.name, i) }} />
                </div>
                <div className="text-right text-xs text-slate-600 mt-0.5">{fmt(pct, 1)}%</div>
              </div>
            )
          })}
        </div>
        {co2Saved > 0 && (
          <div className="mt-4 text-xs text-emerald-400 bg-emerald-950/30 border border-emerald-800/30 rounded-lg px-3 py-2">
            CO2-Einsparung durch Sprinter vs. vollständiger LKW-Flotte: <strong>{fmt(co2Saved)} kg gespart</strong>
          </div>
        )}
      </Card>

      {/* CO2 per vehicle type details */}
      <Card title="CO2-Details nach Fahrzeugtyp">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-slate-500 border-b border-slate-800">
                {['Fahrzeug','g CO2/km','Strecke','CO2 gesamt','Anteil','Kosten'].map(h => (
                  <th key={h} className="pb-2 pr-4 text-left font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/40">
              {[...deliverySpecs, ...(backboneSpec ? [backboneSpec] : [])].map((spec, i) => {
                const stats = spec.can_last_mile ? fleet_by_type[spec.name] : fleet.backbone
                if (!stats) return null
                const pct = maxCo2 > 0 ? (stats.total_co2_kg / maxCo2) * 100 : 0
                return (
                  <tr key={spec.name} className="text-slate-300 hover:bg-slate-800/20">
                    <td className="py-2 pr-4 font-semibold" style={{ color: VCOL(spec.name, i) }}>{spec.name}</td>
                    <td className="py-2 pr-4">{spec.co2_g_per_km} g</td>
                    <td className="py-2 pr-4">{fmt(stats.total_km)} km</td>
                    <td className="py-2 pr-4 font-medium">{fmt(stats.total_co2_kg)} kg</td>
                    <td className="py-2 pr-4">{fmt(pct, 1)}%</td>
                    <td className="py-2 text-slate-400">CHF {fmt(stats.total_cost_chf, 0)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════════════════
   TAB: Verkehr (traffic impact)
══════════════════════════════════════════════════════════════════════════ */
const SRC_META: Record<string, { label: string; color: string }> = {
  tomtom:       { label: 'TomTom Live',                color: '#34d399' },
  tomtom_error: { label: 'TomTom-Fehler → Freifluss', color: '#f87171' },
  tomtom_nokey: { label: 'Kein Key → Freifluss',      color: '#fbbf24' },
  simulation:   { label: 'Simulation',                color: '#fbbf24' },
  static:       { label: 'Statisch',                  color: '#94a3b8' },
}

function TrafficTab({ data }: { data: FullSummary }) {
  const t  = data.traffic
  const sm = SRC_META[t.source] ?? SRC_META.static
  const byType   = Object.entries(t.by_type)
  const maxDelay = Math.max(1, ...byType.map(([, s]) => s.total_delay_min))
  const affected = [...data.individual_routes]
    .filter(r => (r.traffic_delay_min ?? 0) > 0)
    .sort((a, b) => (b.traffic_delay_min ?? 0) - (a.traffic_delay_min ?? 0))
    .slice(0, 10)

  return (
    <div className="max-w-5xl mx-auto px-6 py-6 space-y-6">
      {(t.error || t.last_error) && (
        <div className="rounded-xl border border-red-800/50 bg-red-950/30 px-4 py-3 text-sm text-red-300 flex items-start gap-2">
          <WarnIcon className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <span><strong>TomTom:</strong> {t.error || t.last_error} — Routen mit Freifluss-Zeiten berechnet.</span>
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="rounded-xl border p-4 border-slate-700/50 bg-slate-900/60">
          <p className="text-xs text-slate-500 mb-1">Datenquelle</p>
          <p className="text-lg font-bold" style={{ color: sm.color }}>{sm.label}</p>
          <p className="text-xs text-slate-600 mt-1">Modus: {t.mode === 'tomtom' ? 'TomTom' : 'Simulation'}</p>
        </div>
        <KpiCard accent="amber"  label="Ø Verkehrsfaktor"  main={`×${t.effective_factor.toFixed(2)}`} sub={`${asDelay(t.effective_factor)} Fahrzeit`} />
        <KpiCard accent="blue"   label="Mehrzeit gesamt"   main={`${fmt(t.total_delay_min, 0)} min`} sub="durch Verkehr/Stau" />
        <KpiCard accent="violet" label="Betroffene Routen" main={`${affected.length}`} sub="mit Mehrzeit > 0" />
      </div>

      <Card title="Mehrzeit je Fahrzeugtyp" sub="zusätzliche Fahrminuten durch Verkehr + Ø-Faktor">
        {byType.length === 0 ? <p className="text-xs text-slate-500">Keine Daten.</p> : (
          <div className="space-y-3">
            {byType.map(([vt, s], i) => (
              <div key={vt}>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-slate-300 flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full" style={{ backgroundColor: VCOL(vt, i) }} />
                    {vt} <span className="text-slate-600">×{s.avg_factor.toFixed(2)}</span>
                  </span>
                  <span className="text-slate-400">{fmt(s.total_delay_min, 0)} min · {s.routes} Routen</span>
                </div>
                <div className="h-2.5 bg-slate-800 rounded-full overflow-hidden">
                  <div className="h-full rounded-full" style={{ width: `${(s.total_delay_min / maxDelay) * 100}%`, backgroundColor: VCOL(vt, i) }} />
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card title="Am stärksten betroffene Routen" sub="Top 10 nach Verkehrs-Mehrzeit">
        {affected.length === 0 ? (
          <p className="text-xs text-slate-500">Keine Routen mit Verkehrsmehrzeit (Modell aus oder Freifluss).</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-slate-500 border-b border-slate-800">
                  {['Fahrzeug-ID', 'Hub', 'Faktor', 'Mehrzeit', 'Strecke', 'Zeit'].map(h => (
                    <th key={h} className="pb-2 pr-4 text-left font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/40">
                {affected.map(r => (
                  <tr key={r.vehicle_id} className="text-slate-300 hover:bg-slate-800/20">
                    <td className="py-2 pr-4 font-mono text-slate-300">{r.vehicle_id}</td>
                    <td className="py-2 pr-4">{r.hub_name}</td>
                    <td className="py-2 pr-4">×{(r.traffic_factor ?? 1).toFixed(2)}</td>
                    <td className="py-2 pr-4 text-amber-300 font-medium">+{Math.round(r.traffic_delay_min ?? 0)} min</td>
                    <td className="py-2 pr-4">{r.total_km} km</td>
                    <td className="py-2 pr-4">{r.total_hours.toFixed(1)} h</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════════════════
   Shared sub-components
══════════════════════════════════════════════════════════════════════════ */

/* Optimisation value: multi-stop routes vs. naive one-trip-per-pharmacy delivery */
function SavingsCard({ savings }: { savings: Savings }) {
  const items: [string, string, number, string][] = [
    ['Strecke',    `${fmt(savings.saved_km)} km`,        savings.saved_km_pct,    `${fmt(savings.optimized_km)} statt ${fmt(savings.baseline_km)} km`],
    ['Kosten',     `CHF ${fmt(savings.saved_cost_chf, 0)}`, savings.saved_cost_pct, `CHF ${fmt(savings.optimized_cost_chf, 0)} statt ${fmt(savings.baseline_cost_chf, 0)}`],
    ['Fahrzeit',   `${fmt(savings.saved_hours)} h`,      savings.saved_hours_pct, `${fmt(savings.optimized_hours)} statt ${fmt(savings.baseline_hours)} h`],
    ['CO2',        `${fmt(savings.saved_co2_kg)} kg`,    savings.saved_co2_pct,   `${fmt(savings.optimized_co2_kg)} statt ${fmt(savings.baseline_co2_kg)} kg`],
  ]
  return (
    <div className="rounded-xl border border-emerald-700/40 bg-emerald-950/10 overflow-hidden">
      <div className="flex items-center gap-2.5 px-4 py-3 border-b border-slate-700/40 bg-slate-800/30">
        <span className="w-2 h-2 rounded-full bg-emerald-400" />
        <span className="text-sm font-semibold text-slate-200">Optimierungsgewinn — Last Mile</span>
        <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-emerald-900/40 text-emerald-300 border border-emerald-700/40">
          {savings.pharmacies} Apotheken
        </span>
      </div>
      <div className="p-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {items.map(([label, abs, pct, detail]) => (
            <div key={label}>
              <p className="text-[10px] uppercase tracking-wide text-slate-500 mb-1">{label} gespart</p>
              <p className="text-xl font-bold text-emerald-300">−{pct}%</p>
              <p className="text-xs text-slate-400 mt-0.5">{abs}</p>
              <p className="text-[10px] text-slate-600 mt-0.5">{detail}</p>
            </div>
          ))}
        </div>
        <p className="text-xs text-slate-500 mt-3 leading-relaxed">
          Mehrstopp-Optimierung gegenüber <strong>Einzelfahrten</strong> (eine Hin-/Rückfahrt je Apotheke,
          günstigstes Fahrzeug <strong>{savings.baseline_vehicle}</strong>). Konservative Referenz —
          die Einsparung gegenüber unkonsolidierter Belieferung ist real höher.
        </p>
      </div>
    </div>
  )
}

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

function WarnIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M8 2 L15 14 H1 Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
      <line x1="8" y1="6.5" x2="8" y2="10" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      <circle cx="8" cy="11.8" r="0.7" fill="currentColor" />
    </svg>
  )
}

const congColor = (f: number) => (f >= 1.35 ? '#f87171' : f >= 1.12 ? '#fbbf24' : '#34d399')
const asDelay   = (f: number) => `${f >= 1 ? '+' : '−'}${Math.round(Math.abs(f - 1) * 100)} %`
const fmtHour   = (h: number) => {
  const hrs = Math.floor(h), mins = Math.round((h - hrs) * 60)
  return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}`
}

function TrafficContextCard({ optimization }: { optimization: FullSummary['optimization'] }) {
  const on       = optimization.live_traffic_enabled
  const live     = optimization.traffic_source === 'tomtom'
  const factor   = optimization.effective_traffic_factor ?? optimization.traffic_factor
  const profile  = optimization.traffic_profile
  const shiftEnd = optimization.shift_start + optimization.shift_hours
  const badge    = live ? 'TomTom Live' : on ? 'Verkehrsmodell aktiv (Sim.)' : 'Statischer Faktor'

  return (
    <div className={`rounded-xl border overflow-hidden ${
      live ? 'border-emerald-700/40 bg-emerald-950/10'
           : on ? 'border-amber-700/40 bg-amber-950/10' : 'border-slate-700/60 bg-slate-900/60'}`}>
      <div className="flex items-center gap-2.5 px-4 py-3 border-b border-slate-700/40 bg-slate-800/30">
        <span className={`w-2 h-2 rounded-full ${
          live ? 'bg-emerald-400 animate-pulse' : on ? 'bg-amber-400 animate-pulse' : 'bg-slate-600'}`} />
        <span className="text-sm font-semibold text-slate-200">Verkehr &amp; Optimierung</span>
        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
          live ? 'bg-emerald-900/40 text-emerald-300 border border-emerald-700/40'
               : on ? 'bg-amber-900/40 text-amber-300 border border-amber-700/40'
                    : 'bg-slate-800 text-slate-500 border border-slate-700/50'}`}>
          {badge}
        </span>
      </div>

      <div className="p-4 grid grid-cols-2 md:grid-cols-4 gap-4 items-start">
        <Metric label="Angewandter Verkehrsfaktor" value={`×${factor.toFixed(2)}`}
                color={on ? congColor(factor) : '#94a3b8'} hint={`${asDelay(factor)} Fahrzeit ggü. Freifluss`} />
        <Metric label="Lieferfenster" value={`${fmtHour(optimization.shift_start)}–${fmtHour(shiftEnd)}`}
                color="#cbd5e1" hint={`${optimization.shift_hours} h Schicht`} />
        <Metric label={live ? 'Datenquelle' : 'Stau-Intensität'}
                value={live ? 'TomTom' : on ? `${optimization.traffic_peak_intensity.toFixed(2)}×` : '—'}
                color={live ? '#34d399' : '#cbd5e1'} hint={live ? 'Echtzeit-Verkehr' : on ? 'Modell-Skalierung' : 'inaktiv'} />
        <Metric label="CO₂-Schattenpreis" value={`CHF ${optimization.co2_shadow_chf_per_kg.toFixed(2)}`}
                color="#cbd5e1" hint="pro kg CO₂" />
      </div>

      {on && profile && profile.length === 24 && (
        <div className="px-4 pb-4">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs text-slate-500">Tagesverlauf — Stau-Modell</span>
            <span className="text-[10px] text-slate-600">Lieferfenster hervorgehoben</span>
          </div>
          <div className="flex items-end gap-[2px] h-14">
            {profile.map((f, h) => {
              const inShift = h + 1 > optimization.shift_start && h < shiftEnd
              const max = Math.max(1.05, ...profile)
              return (
                <div key={h} className="flex-1 flex flex-col justify-end group relative" style={{ height: '100%' }}>
                  <div className="w-full rounded-t" style={{
                    height: `${Math.max(4, ((f - 1) / (max - 1 || 1)) * 100)}%`,
                    backgroundColor: congColor(f), opacity: inShift ? 1 : 0.3,
                  }} />
                  <div className="absolute -top-6 left-1/2 -translate-x-1/2 hidden group-hover:block bg-slate-950 border border-slate-700 rounded px-1.5 py-0.5 text-[10px] text-slate-200 whitespace-nowrap z-10">
                    {String(h).padStart(2, '0')}:00 · ×{f.toFixed(2)}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

function Metric({ label, value, color, hint }: { label: string; value: string; color: string; hint?: string }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wide text-slate-500 mb-1">{label}</p>
      <p className="text-lg font-bold" style={{ color }}>{value}</p>
      {hint && <p className="text-[10px] text-slate-600 mt-0.5">{hint}</p>}
    </div>
  )
}

function VehicleTypeGroup({ type, routes, color, onDetail }: {
  type: string; routes: IndividualRoute[]; color: string; onDetail?: (s: DetailSubject) => void
}) {
  const [open, setOpen] = useState(true)
  const totals = {
    km:    routes.reduce((s, r) => s + r.total_km,        0),
    items: routes.reduce((s, r) => s + r.total_items,     0),
    cost:  routes.reduce((s, r) => s + r.total_cost_chf,  0),
    co2:   routes.reduce((s, r) => s + r.co2_kg,          0),
    stops: routes.reduce((s, r) => s + r.stop_count,      0),
    hours: routes.reduce((s, r) => s + r.total_hours,     0),
    runs:  routes.reduce((s, r) => s + r.restock_count + 1, 0),
    delay: routes.reduce((s, r) => s + (r.traffic_delay_min || 0), 0),
  }
  const trafficSrc = routes.find(r => r.traffic_source)?.traffic_source ?? null
  return (
    <Card title="">
      <button onClick={() => setOpen(o => !o)}
              className="w-full flex items-center gap-3 text-left -m-1 p-1 rounded-lg hover:bg-slate-800/30 transition-colors mb-2">
        <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
        <span className="text-sm font-bold text-slate-200">{type}</span>
        <span className="text-xs text-slate-500">{routes.length} Fahrzeuge · {totals.runs} Läufe gesamt</span>
        {trafficSrc && (
          <span className={`text-[9px] font-semibold rounded px-1 py-px border ${
            trafficSrc === 'tomtom' ? 'text-emerald-300 bg-emerald-950/50 border-emerald-800/50'
              : trafficSrc === 'simulation' ? 'text-amber-300 bg-amber-950/50 border-amber-800/50'
              : 'text-slate-400 bg-slate-800 border-slate-700'}`}>
            {trafficSrc === 'tomtom' ? 'LIVE' : trafficSrc === 'simulation' ? 'SIM' : 'STATIK'}
          </span>
        )}
        <div className="ml-auto flex gap-4 text-xs text-slate-500">
          <span>{fmt(totals.km)} km</span><span>CHF {fmt(totals.cost, 0)}</span>
          <span>{fmt(totals.co2)} kg CO2</span>
          <span className="text-slate-600">{open ? '▲' : '▼'}</span>
        </div>
      </button>
      {open && (
        <div className="overflow-x-auto mt-1">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-slate-600 border-b border-slate-800/60">
                {['Fahrzeug-ID','Hub','Läufe','Stops','Waren','Strecke','Zeit','Verkehr','Kosten','CO2'].map(h => (
                  <th key={h} className="pb-1.5 pr-3 text-left font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/30">
              {routes.map(r => (
                <tr key={r.vehicle_id} onClick={() => onDetail?.({ kind: 'vehicle', data: r })}
                    title="Details anzeigen"
                    className="text-slate-400 hover:bg-slate-800/40 hover:text-slate-300 cursor-pointer transition-colors">
                  <td className="py-1.5 pr-3 font-mono text-blue-300 text-xs hover:underline">{r.vehicle_id}</td>
                  <td className="py-1.5 pr-3">{r.hub_name}</td>
                  <td className="py-1.5 pr-3 font-medium text-slate-300">{r.restock_count + 1}</td>
                  <td className="py-1.5 pr-3">{r.stop_count}</td>
                  <td className="py-1.5 pr-3">{r.total_items}</td>
                  <td className="py-1.5 pr-3">{r.total_km} km</td>
                  <td className="py-1.5 pr-3">{r.total_hours.toFixed(1)} h</td>
                  <td className="py-1.5 pr-3">{r.traffic_delay_min != null && r.traffic_delay_min >= 1 ? `+${Math.round(r.traffic_delay_min)} min` : '—'}</td>
                  <td className="py-1.5 pr-3 text-slate-200 font-medium">CHF {r.total_cost_chf}</td>
                  <td className="py-1.5">{r.co2_kg} kg</td>
                </tr>
              ))}
              <tr className="font-semibold text-slate-300 border-t border-slate-700/60 bg-slate-800/20">
                <td className="py-1.5 pr-3 text-slate-500" colSpan={2}>Summe</td>
                <td className="py-1.5 pr-3">{totals.runs}</td>
                <td className="py-1.5 pr-3">{totals.stops}</td>
                <td className="py-1.5 pr-3">{fmt(totals.items, 0)}</td>
                <td className="py-1.5 pr-3">{fmt(totals.km)} km</td>
                <td className="py-1.5 pr-3">{fmt(totals.hours)} h</td>
                <td className="py-1.5 pr-3">{totals.delay >= 1 ? `+${fmt(totals.delay, 0)} min` : '—'}</td>
                <td className="py-1.5 pr-3">CHF {fmt(totals.cost, 0)}</td>
                <td className="py-1.5">{fmt(totals.co2)} kg</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </Card>
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
          {vz.backbone_km && <span>{fmt(vz.backbone_km)} km</span>}
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
