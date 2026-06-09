import { useRef } from 'react'

/** A clickable hub or vehicle/route, from either the Analyse page or the map.
 *  `data` is a loose property bag: it may come from the analytics JSON (real
 *  arrays/objects) or from a MapLibre feature (where arrays/objects are
 *  serialised to JSON strings) — the helpers below normalise both. */
export type DetailSubject =
  | { kind: 'hub';     data: Record<string, any> }
  | { kind: 'vehicle'; data: Record<string, any> }

const VCOLORS: Record<string, string> = {
  Sprinter: '#0891b2', 'Klein-LKW': '#16a34a', LKW: '#7c3aed', Zug: '#db2777',
}
const vcol = (t: string) => VCOLORS[t] ?? '#3b82f6'

const asArray = (v: unknown): string[] => {
  if (Array.isArray(v)) return v as string[]
  if (typeof v === 'string' && v.trim()) { try { const p = JSON.parse(v); return Array.isArray(p) ? p : [] } catch { return [] } }
  return []
}
const asObject = (v: unknown): Record<string, number> => {
  if (v && typeof v === 'object' && !Array.isArray(v)) return v as Record<string, number>
  if (typeof v === 'string' && v.trim()) { try { const p = JSON.parse(v); return p && typeof p === 'object' ? p : {} } catch { return {} } }
  return {}
}
const num = (v: unknown): number | null => {
  if (v == null || v === '') return null
  const n = typeof v === 'number' ? v : parseFloat(String(v))
  return isNaN(n) ? null : n
}
const fmt = (n: number, d = 1) => n.toLocaleString('de-CH', { maximumFractionDigits: d })
const hubLabel = (t: string) => t === 'HQ' ? 'Hauptquartier' : t === 'VZ' ? 'Verteilzentrum' : 'Mini-Verteilzentrum'

export function DetailModal({ subject, onClose }: { subject: DetailSubject; onClose: () => void }) {
  const overlayRef = useRef<HTMLDivElement>(null)
  const onOverlay = (e: React.MouseEvent) => { if (e.target === overlayRef.current) onClose() }

  return (
    <div ref={overlayRef} onClick={onOverlay}
         className="fixed inset-0 z-[60] flex items-center justify-center bg-black/65 backdrop-blur-sm">
      <div className="bg-slate-900 border border-slate-700/60 rounded-2xl shadow-2xl shadow-black/80
                      w-[460px] max-w-[95vw] max-h-[85vh] flex flex-col overflow-hidden"
           onClick={e => e.stopPropagation()}>
        {subject.kind === 'hub' ? <HubBody d={subject.data} onClose={onClose} />
                                : <VehicleBody d={subject.data} onClose={onClose} />}
      </div>
    </div>
  )
}

function Header({ tag, tagCls, title, sub, onClose }: {
  tag: string; tagCls: string; title: string; sub?: string; onClose: () => void
}) {
  return (
    <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-slate-700/60 bg-slate-800/60 flex-shrink-0">
      <div className="min-w-0">
        <span className={`inline-flex text-xs px-2 py-0.5 rounded-full border font-medium mb-1.5 ${tagCls}`}>{tag}</span>
        <div className="text-lg font-bold text-white break-words leading-tight">{title}</div>
        {sub && <div className="text-xs text-slate-400 mt-0.5">{sub}</div>}
      </div>
      <button onClick={onClose}
              className="flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-lg
                         text-slate-500 hover:text-slate-200 hover:bg-slate-700 transition-colors text-lg">✕</button>
    </div>
  )
}

function Row({ label, value, hl }: { label: string; value: React.ReactNode; hl?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-0.5">
      <span className="text-slate-500 text-xs flex-shrink-0">{label}</span>
      <span className={`text-xs text-right break-words ${hl ? 'text-slate-100 font-semibold' : 'text-slate-300'}`}>{value}</span>
    </div>
  )
}

/* ── Hub detail ──────────────────────────────────────────────────────────── */
function HubBody({ d, onClose }: { d: Record<string, any>; onClose: () => void }) {
  const cap   = num(d.capacity)
  const load  = num(d.load) ?? 0
  const pct   = num(d.pct) ?? (cap ? Math.round((load / cap) * 100) : 0)
  const km    = num(d.route_km ?? d.total_km)
  const items = num(d.route_items ?? d.total_items)
  const counts = asObject(d.vehicle_counts)

  return (
    <>
      <Header tag={hubLabel(d.hub_type)} tagCls="text-violet-300 bg-violet-500/10 border-violet-500/30"
              title={d.name} sub={d.city || undefined} onClose={onClose} />
      <div className="px-5 py-4 overflow-y-auto space-y-1.5">
        <Row label="Typ" value={hubLabel(d.hub_type)} />
        {d.city            && <Row label="Stadt" value={d.city} />}
        {d.parent_hub      && <Row label="Übergeordnet" value={d.parent_hub} />}
        {d.opening_hours && d.opening_hours !== '—'   && <Row label="Öffnungszeiten" value={d.opening_hours} />}
        {d.delivery_window && d.delivery_window !== '—' && <Row label="Lieferschicht" value={d.delivery_window} />}
        {num(d.pharmacy_count) != null && <Row label="Apotheken" value={`${num(d.pharmacy_count)}`} />}
        {num(d.warehouse_cost) != null && <Row label="Lagerkosten" value={`CHF ${fmt(num(d.warehouse_cost)!, 0)}`} />}

        {cap != null && (
          <div className="pt-2">
            <div className="flex justify-between text-xs mb-1">
              <span className="text-slate-500">Lagerauslastung</span>
              <span className={pct > 100 ? 'text-red-400 font-semibold' : 'text-slate-300'}>{load} / {cap} Einh. ({pct}%)</span>
            </div>
            <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
              <div className={`h-full rounded-full ${pct >= 100 ? 'bg-red-500' : pct >= 80 ? 'bg-amber-500' : 'bg-emerald-500'}`}
                   style={{ width: `${Math.min(pct, 100)}%` }} />
            </div>
          </div>
        )}

        {(km != null || items != null) && (
          <div className="pt-2 border-t border-slate-700/60 mt-1 space-y-1.5">
            {items != null && <Row label="Ausgelieferte Waren" value={`${fmt(items, 0)} Einh.`} />}
            {km    != null && <Row label="Routen-Strecke (Last-Mile)" value={`${fmt(km)} km`} />}
          </div>
        )}

        {Object.keys(counts).length > 0 && (
          <div className="pt-2 border-t border-slate-700/60 mt-1">
            <p className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-1.5">Fahrzeugeinsatz</p>
            {Object.entries(counts).map(([vt, c]) => (
              <div key={vt} className="flex items-center gap-2 py-0.5">
                <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: vcol(vt) }} />
                <span className="text-xs text-slate-300 flex-1">{vt}</span>
                <span className="text-xs text-slate-400">{c} Route{c !== 1 ? 'n' : ''}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  )
}

/* ── Vehicle / route detail ──────────────────────────────────────────────── */
function VehicleBody({ d, onClose }: { d: Record<string, any>; onClose: () => void }) {
  const isBackbone = !!(d.backbone_tier || d.tier || d.to_hubs)
  const toCities   = asArray(d.to_cities)
  const fromCity   = d.from_city || ''
  const km    = num(d.total_km)
  const hours = num(d.total_hours)
  const cost  = num(d.total_cost_chf)
  const co2   = num(d.co2_kg)
  const items = num(d.total_items)
  const stops = num(d.stop_count)
  const delay = num(d.traffic_delay_min)
  const live  = d.traffic_source === 'tomtom'
  const forced = d.forced === true || d.forced === 'true'

  const fromLabel = fromCity ? `${d.hub_name ?? d.from_hub} (${fromCity})` : (d.hub_name ?? d.from_hub ?? '—')
  const toLabel   = toCities.length
    ? toCities.join(', ')
    : isBackbone ? asArray(d.to_hubs).join(', ') : `${stops ?? 0} Apotheken`

  return (
    <>
      <Header tag={isBackbone ? 'Hauptlauf' : (d.vehicle_type ?? 'Route')}
              tagCls={isBackbone ? 'text-rose-300 bg-rose-500/10 border-rose-500/30'
                                 : 'text-cyan-300 bg-cyan-500/10 border-cyan-500/30'}
              title={d.vehicle_id}
              sub={`${d.vehicle_type ?? ''}${isBackbone ? ' · Hub-zu-Hub' : ''}`} onClose={onClose} />
      <div className="px-5 py-4 overflow-y-auto space-y-1.5">
        {/* Route — von Stadt nach Stadt */}
        <div className="rounded-lg border border-slate-700/50 bg-slate-800/30 px-3 py-2.5 mb-1">
          <div className="flex items-center gap-2 text-xs mb-1">
            <span className="text-slate-500">Von</span>
            <span className="text-slate-200 font-medium">{fromLabel}</span>
          </div>
          <div className="flex items-start gap-2 text-xs">
            <span className="text-slate-500 flex-shrink-0 mt-px">Nach</span>
            <span className="text-slate-200">{toLabel}</span>
          </div>
        </div>

        {forced && (
          <div className="text-xs text-amber-300 bg-amber-950/30 border border-amber-800/40 rounded-lg px-3 py-2 mb-1">
            Zwangslieferung — garantierte Belieferung (ignoriert Schicht-/Öffnungszeit-Grenzen).
          </div>
        )}

        <Row label="Fahrzeugtyp" value={d.vehicle_type} />
        {!isBackbone && <Row label="Hub" value={d.hub_name} />}
        <Row label={isBackbone ? 'Ziele' : 'Stops'} value={`${stops ?? 0}`} />
        {items != null && <Row label="Waren" value={`${fmt(items, 0)} Einh.`} />}
        {km    != null && <Row label="Strecke" value={`${fmt(km)} km`} />}
        {hours != null && (
          <Row label="Fahrzeit" value={
            <span className="inline-flex items-center gap-1.5">
              {fmt(hours)} h
              {live && <span className="text-[9px] font-semibold text-emerald-300 bg-emerald-950/50 border border-emerald-800/50 rounded px-1 py-px">LIVE</span>}
              {d.traffic_source === 'simulation' && <span className="text-[9px] font-semibold text-amber-300 bg-amber-950/50 border border-amber-800/50 rounded px-1 py-px">SIM</span>}
            </span>
          } />
        )}
        {delay != null && delay >= 1 && <Row label="davon Stau" value={`+${Math.round(delay)} min`} />}
        {cost != null && <Row label="Kosten" value={`CHF ${fmt(cost, 0)}`} hl />}
        {co2  != null && <Row label="CO₂" value={`${fmt(co2)} kg`} />}
        {num(d.restock_count) != null && num(d.restock_count)! > 0 && <Row label="Restock" value={`${num(d.restock_count)}×`} />}
      </div>
    </>
  )
}
