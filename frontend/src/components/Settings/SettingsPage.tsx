import { useCallback, useEffect, useState } from 'react'
import { api } from '../../api/client'
import { ErrorModal } from '../common/ErrorModal'
import type { VehicleConfig, VehicleConfigCreate, SystemConfigEntry, TrafficInfo, TomTomConfig } from '../../types'

const SETTINGS_TABS = [
  { id: 'fleet',      label: 'Flotte'        },
  { id: 'weights',    label: 'Gewichtung'    },
  { id: 'parameters', label: 'Parameter'     },
  { id: 'traffic',    label: 'Verkehrsmodell' },
  { id: 'hours',      label: 'Öffnungszeiten' },
] as const
type SettingsTab = typeof SETTINGS_TABS[number]['id']

export function SettingsPage() {
  const [tab,       setTab]       = useState<SettingsTab>('fleet')
  const [vehicles,  setVehicles]  = useState<VehicleConfig[]>([])
  const [sysConf,   setSysConf]   = useState<SystemConfigEntry[]>([])
  const [loading,   setLoading]   = useState(true)
  const [saving,    setSaving]    = useState(false)
  const [saved,     setSaved]     = useState(false)
  const [error,     setError]     = useState<string | null>(null)
  const [editId,    setEditId]    = useState<number | 'new' | null>(null)
  const [editBuf,   setEditBuf]   = useState<Partial<VehicleConfigCreate>>({})
  const [sysEdits,  setSysEdits]  = useState<Record<string, string>>({})

  const load = useCallback(() => {
    setLoading(true)
    Promise.all([api.getVehicles(), api.getSystemConfig()])
      .then(([v, s]) => { setVehicles(v); setSysConf(s) })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { load() }, [load])

  const startEdit = (v: VehicleConfig) => { setEditId(v.id); setEditBuf({ ...v }) }
  const startNew  = () => {
    setEditId('new')
    setEditBuf({ name: '', vehicle_class: null, can_last_mile: true, can_backbone: false,
      capacity: 30, range_km: 350, cost_per_km: 0.38, co2_g_per_km: 185, speed_kmh: 65,
      driver_chf_h: 45, service_min: 20, max_per_hub: 10, restock_threshold: 5,
      sort_order: vehicles.length + 1, enabled: true })
  }
  const cancelEdit = () => { setEditId(null); setEditBuf({}) }

  const saveVehicle = async () => {
    if (!editBuf.name?.trim()) { setError('Name darf nicht leer sein'); return }
    setSaving(true); setError(null)
    try {
      if (editId === 'new') {
        const created = await api.createVehicle(editBuf as VehicleConfigCreate)
        setVehicles(vs => [...vs, created])
      } else {
        const u = await api.updateVehicle(editId as number, editBuf as VehicleConfigCreate)
        setVehicles(vs => vs.map(v => v.id === u.id ? u : v))
      }
      setEditId(null); setEditBuf({}); flashSaved()
    } catch (e) { setError(e instanceof Error ? e.message : String(e)) }
    finally { setSaving(false) }
  }

  const deleteVehicle = async (id: number) => {
    if (!confirm('Fahrzeug wirklich löschen?')) return
    try { await api.deleteVehicle(id); setVehicles(vs => vs.filter(v => v.id !== id)) }
    catch (e) { setError(e instanceof Error ? e.message : String(e)) }
  }

  const saveSystemConfig = async () => {
    if (Object.keys(sysEdits).length === 0) return
    setSaving(true); setError(null)
    try { setSysConf(await api.updateSystemConfig(sysEdits)); setSysEdits({}); flashSaved() }
    catch (e) { setError(e instanceof Error ? e.message : String(e)) }
    finally { setSaving(false) }
  }

  const flashSaved = () => { setSaved(true); setTimeout(() => setSaved(false), 2500) }

  const sysVal = (key: string) => sysEdits[key] ?? sysConf.find(c => c.key === key)?.value ?? ''

  if (loading) return (
    <div className="flex items-center justify-center h-full">
      <div className="text-center space-y-3">
        <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto" />
        <p className="text-sm text-slate-400">Lade Einstellungen…</p>
      </div>
    </div>
  )

  return (
    <div className="h-full overflow-y-auto bg-slate-950 text-slate-100">
      <div className="max-w-6xl mx-auto px-6 py-6 space-y-6">

        {/* Page header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-white">Systemeinstellungen</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Flotte, Gewichtung &amp; Parameter · Änderungen wirken ab nächstem Step 2/3/4
            </p>
          </div>
          <div className="flex items-center gap-3">
            {saved && (
              <div className="flex items-center gap-1.5 text-xs text-emerald-400 bg-emerald-900/30 border border-emerald-700/40 rounded-lg px-3 py-1.5">
                <svg className="w-3 h-3" viewBox="0 0 12 12" fill="none">
                  <path d="M2 6 L5 9 L10 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                Gespeichert
              </div>
            )}
          </div>
        </div>

        {/* Tab bar */}
        <div className="flex items-center gap-1 border-b border-slate-800">
          {SETTINGS_TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`px-4 py-2 text-sm font-medium rounded-t-lg border-b-2 -mb-px transition-colors
                ${tab === t.id ? 'text-white border-blue-500 bg-slate-800/60'
                  : 'text-slate-400 border-transparent hover:text-slate-200 hover:bg-slate-800/30'}`}>
              {t.label}
            </button>
          ))}
        </div>

        {error && (
          <div className="flex items-center gap-2 text-sm text-red-400 bg-red-950/40 border border-red-800/40 rounded-xl px-4 py-3">
            <WarnIcon className="w-4 h-4 flex-shrink-0 text-red-500" /> {error}
            <button onClick={() => setError(null)} className="ml-auto text-red-600 hover:text-red-400">✕</button>
          </div>
        )}

        {/* ── Vehicle Fleet ───────────────────────────────────────────── */}
        {tab === 'fleet' && (
        <section className="bg-slate-900/60 border border-slate-700/60 rounded-xl overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-700/60 bg-slate-800/40">
            <div>
              <h3 className="text-sm font-semibold text-slate-200">Fahrzeugflotte</h3>
              <p className="text-xs text-slate-500 mt-0.5">Kapazitäten, Reichweiten und Kostensätze</p>
            </div>
            {editId === null && (
              <button onClick={startNew}
                      className="text-xs px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-medium transition-colors flex items-center gap-1.5">
                <span>+</span> Fahrzeug hinzufügen
              </button>
            )}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-slate-800/40">
                <tr className="text-slate-500 uppercase tracking-wide text-xs">
                  {['Name','Einsatz','Kap.','Reichw.','CHF/km','CO₂/km','Tempo','Fahrer/h','Stop','Max/Hub','Prio','Aktiv',''].map(h => (
                    <th key={h} className="px-4 py-2.5 text-left font-medium whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {vehicles.map(v => (
                  editId === v.id
                    ? <EditRow key={v.id} buf={editBuf} onChange={setEditBuf} onSave={saveVehicle} onCancel={cancelEdit} saving={saving} />
                    : <VehicleRow key={v.id} v={v} onEdit={() => startEdit(v)} onDelete={() => deleteVehicle(v.id)} />
                ))}
                {editId === 'new' && (
                  <EditRow buf={editBuf} onChange={setEditBuf} onSave={saveVehicle} onCancel={cancelEdit} saving={saving} />
                )}
              </tbody>
            </table>
          </div>
        </section>
        )}

        {/* ── Gewichtung (interactive sliders) ─────────────────────────── */}
        {tab === 'weights' && (
          <WeightsTab sysConf={sysConf} setSysConf={setSysConf} flashSaved={flashSaved} setError={setError} />
        )}

        {/* ── Logistik-Parameter ───────────────────────────────────────── */}
        {tab === 'parameters' && (
        <section className="bg-slate-900/60 border border-slate-700/60 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-700/60 bg-slate-800/40">
            <h3 className="text-sm font-semibold text-slate-200">Logistik-Parameter</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Hubs, Warenbedarf, Schicht, statischer Verkehrsfaktor und Lagerkosten ·
              VZ-Anzahl wird auf 4–6 begrenzt, die mVZ-Anzahl ergibt sich automatisch aus Bedarf
              und Mindestauslastung.
            </p>
          </div>
          <div className="px-5 py-5">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4">
              {[
                'n_vz', 'hub_min_utilization',
                'vz_capacity', 'mvz_capacity',
                'hq_storage_factor', 'hq_direct_radius_km',
                'population_per_item', 'max_catchment_km', 'vz_hard_radius_km',
                'default_demand_est',
                'shift_start', 'shift_hours', 'traffic_factor', 'co2_shadow_chf',
                'warehouse_cost_hq', 'warehouse_cost_vz', 'warehouse_cost_mvz',
                'warehouse_density_cost', 'warehouse_density_radius_km', 'warehouse_density_weight',
              ].map(key => (
                <SysField key={key} conf={sysConf.find(c => c.key === key)}
                           value={sysVal(key)} onChange={v => setSysEdits(p => ({...p, [key]: v}))} />
              ))}
            </div>
            <div className="flex justify-end mt-6">
              <button onClick={saveSystemConfig} disabled={saving || Object.keys(sysEdits).length === 0}
                className={`text-sm px-6 py-2 rounded-lg font-semibold transition-all ${
                  Object.keys(sysEdits).length > 0
                    ? 'bg-blue-600 hover:bg-blue-500 text-white shadow-sm shadow-blue-900/50'
                    : 'bg-slate-800 text-slate-600 cursor-not-allowed'}`}>
                {saving ? 'Speichern…' : 'Einstellungen speichern'}
              </button>
            </div>
          </div>
        </section>
        )}

        {/* ── Live traffic ─────────────────────────────────────────────── */}
        {tab === 'traffic' && <TrafficSection />}

        {/* ── Opening hours ────────────────────────────────────────────── */}
        {tab === 'hours' && (
        <section className="bg-slate-900/60 border border-slate-700/60 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-700/60 bg-slate-800/40">
            <h3 className="text-sm font-semibold text-slate-200">Öffnungszeiten</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Stunden als Dezimalzahl (z.B. 8.5 = 08:30 · 18.75 = 18:45).
              Routing überspringt Stops außerhalb dieser Zeiten.
              Änderungen wirken ab nächstem Step 1 (Hubs) bzw. sofort für neue Apotheken-Imports.
            </p>
          </div>
          <div className="px-5 py-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { label: 'Apotheke Öffnung', key: 'pharmacy_open_hour' },
                { label: 'Apotheke Schluss', key: 'pharmacy_close_hour' },
                { label: 'HQ Öffnung',      key: 'hub_hq_open' },
                { label: 'HQ Schluss',      key: 'hub_hq_close' },
                { label: 'VZ Öffnung',      key: 'hub_vz_open' },
                { label: 'VZ Schluss',      key: 'hub_vz_close' },
                { label: 'mVZ Öffnung',     key: 'hub_mvz_open' },
                { label: 'mVZ Schluss',     key: 'hub_mvz_close' },
              ].map(({ label, key }) => (
                <div key={key}>
                  <label className="block text-xs text-slate-300 font-medium mb-1">{label}</label>
                  <div className="relative">
                    <input type="number" step="0.25" min="0" max="24"
                           value={sysEdits[key] ?? sysConf.find(c => c.key === key)?.value ?? ''}
                           onChange={e => setSysEdits(p => ({ ...p, [key]: e.target.value }))}
                           className="w-full bg-slate-800 text-slate-200 text-sm rounded-lg px-3 py-2 pr-14
                                      border border-slate-700 focus:outline-none focus:border-blue-500 transition-colors" />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-500 pointer-events-none">
                      {(() => {
                        const raw = sysEdits[key] ?? sysConf.find(c => c.key === key)?.value ?? ''
                        const h = parseFloat(raw)
                        if (isNaN(h)) return ''
                        const hrs  = Math.floor(h)
                        const mins = Math.round((h - hrs) * 60)
                        return `${hrs.toString().padStart(2,'0')}:${mins.toString().padStart(2,'0')}`
                      })()}
                    </span>
                  </div>
                </div>
              ))}
            </div>
            <div className="flex justify-end mt-5">
              <button onClick={saveSystemConfig}
                      disabled={saving || Object.keys(sysEdits).length === 0}
                      className={`text-sm px-6 py-2 rounded-lg font-semibold transition-all ${
                        Object.keys(sysEdits).length > 0
                          ? 'bg-blue-600 hover:bg-blue-500 text-white'
                          : 'bg-slate-800 text-slate-600 cursor-not-allowed'
                      }`}>
                {saving ? 'Speichern…' : 'Öffnungszeiten speichern'}
              </button>
            </div>
          </div>
        </section>
        )}

      </div>
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

/* ── Vehicle row ─────────────────────────────────────────────────────────── */
function VehicleRow({ v, onEdit, onDelete }: { v: VehicleConfig; onEdit: () => void; onDelete: () => void }) {
  return (
    <tr className={`hover:bg-slate-800/30 transition-colors ${!v.enabled ? 'opacity-40' : ''}`}>
      <td className="px-4 py-3 font-semibold text-slate-200">{v.name}</td>
      <td className="px-4 py-3">
        <div className="flex gap-1">
          {v.can_last_mile && <span className="px-1.5 py-0.5 rounded text-xs font-medium bg-cyan-900/40 text-cyan-300 border border-cyan-700/40">Last-Mile</span>}
          {v.can_backbone  && <span className="px-1.5 py-0.5 rounded text-xs font-medium bg-rose-900/40 text-rose-300 border border-rose-700/40">Backbone</span>}
          {!v.can_last_mile && !v.can_backbone && <span className="text-xs text-slate-600">—</span>}
        </div>
      </td>
      <td className="px-4 py-3 text-slate-400">{v.capacity ?? '∞'}</td>
      <td className="px-4 py-3 text-slate-400">{v.range_km} km</td>
      <td className="px-4 py-3 text-slate-400">{v.cost_per_km}</td>
      <td className="px-4 py-3 text-slate-400">{v.co2_g_per_km} g</td>
      <td className="px-4 py-3 text-slate-400">{v.speed_kmh}</td>
      <td className="px-4 py-3 text-slate-400">{v.driver_chf_h ?? '—'}</td>
      <td className="px-4 py-3 text-slate-400">{v.service_min ? `${v.service_min} min` : '—'}</td>
      <td className="px-4 py-3 text-slate-400">{v.max_per_hub ?? '—'}</td>
      <td className="px-4 py-3 text-slate-400">{v.sort_order}</td>
      <td className="px-4 py-3">
        {v.enabled
          ? <span className="flex items-center gap-1 text-emerald-400 text-xs"><span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block"/>Aktiv</span>
          : <span className="text-slate-600 text-xs">Inaktiv</span>}
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          <button onClick={onEdit}
                  className="px-2.5 py-1 text-xs text-slate-300 hover:text-white border border-slate-700 hover:border-slate-500 rounded-md transition-colors">
            Bearbeiten
          </button>
          <button onClick={onDelete}
                  className="px-2.5 py-1 text-xs text-red-400 hover:text-red-300 border border-red-800/40 hover:border-red-700/60 rounded-md transition-colors">
            Löschen
          </button>
        </div>
      </td>
    </tr>
  )
}

/* ── Edit row ────────────────────────────────────────────────────────────── */
function EditRow({ buf, onChange, onSave, onCancel, saving }: {
  buf: Partial<VehicleConfigCreate>; onChange: (b: Partial<VehicleConfigCreate>) => void
  onSave: () => void; onCancel: () => void; saving: boolean
}) {
  const set = (k: keyof VehicleConfigCreate) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const raw = e.target.value
    const nums: (keyof VehicleConfigCreate)[] = ['capacity','range_km','cost_per_km','co2_g_per_km',
      'speed_kmh','driver_chf_h','service_min','max_per_hub','restock_threshold','sort_order']
    onChange({ ...buf, [k]: nums.includes(k) ? (raw === '' ? null : parseFloat(raw)) : raw })
  }
  const setCheck = (k: keyof VehicleConfigCreate) => (e: React.ChangeEvent<HTMLInputElement>) =>
    onChange({ ...buf, [k]: e.target.checked })

  return (
    <tr className="bg-blue-950/20 border-t border-b border-blue-800/40">
      {[
        <In key="name" value={buf.name ?? ''} onChange={set('name')} placeholder="Name" />,
        <div key="tiers" className="flex flex-col gap-1">
          <label className="flex items-center gap-1 text-xs text-cyan-300 whitespace-nowrap">
            <input type="checkbox" checked={buf.can_last_mile ?? false} onChange={setCheck('can_last_mile')} className="accent-cyan-500 w-3 h-3" />
            Last-Mile
          </label>
          <label className="flex items-center gap-1 text-xs text-rose-300 whitespace-nowrap">
            <input type="checkbox" checked={buf.can_backbone ?? false} onChange={setCheck('can_backbone')} className="accent-rose-500 w-3 h-3" />
            Backbone
          </label>
        </div>,
        <In key="cap" value={buf.capacity ?? ''} onChange={set('capacity')} type="number" placeholder="∞" />,
        <In key="rng" value={buf.range_km ?? ''} onChange={set('range_km')} type="number" />,
        <In key="cst" value={buf.cost_per_km ?? ''} onChange={set('cost_per_km')} type="number" step="0.01" />,
        <In key="co2" value={buf.co2_g_per_km ?? ''} onChange={set('co2_g_per_km')} type="number" />,
        <In key="spd" value={buf.speed_kmh ?? ''} onChange={set('speed_kmh')} type="number" />,
        <In key="drv" value={buf.driver_chf_h ?? ''} onChange={set('driver_chf_h')} type="number" />,
        <In key="svc" value={buf.service_min ?? ''} onChange={set('service_min')} type="number" />,
        <In key="mxh" value={buf.max_per_hub ?? ''} onChange={set('max_per_hub')} type="number" />,
        <In key="srt" value={buf.sort_order ?? 0} onChange={set('sort_order')} type="number" />,
        <input key="enb" type="checkbox" checked={buf.enabled ?? true} onChange={setCheck('enabled')} className="accent-blue-500 w-4 h-4" />,
      ].map((el, i) => <td key={i} className="px-3 py-2">{el}</td>)}
      <td className="px-4 py-2">
        <div className="flex items-center gap-2">
          <button onClick={onSave} disabled={saving}
                  className="px-3 py-1 text-xs bg-emerald-700 hover:bg-emerald-600 text-white rounded-md font-medium transition-colors">
            {saving ? '…' : 'Speichern'}
          </button>
          <button onClick={onCancel}
                  className="px-3 py-1 text-xs border border-slate-600 text-slate-400 hover:text-slate-200 rounded-md transition-colors">
            Abbruch
          </button>
        </div>
      </td>
    </tr>
  )
}

function In({ value, onChange, type='text', placeholder='', step }: {
  value: string|number; onChange: React.ChangeEventHandler<HTMLInputElement>
  type?: string; placeholder?: string; step?: string
}) {
  return (
    <input type={type} value={value} onChange={onChange} placeholder={placeholder} step={step}
           className="w-full bg-slate-800 text-slate-200 text-xs rounded-md px-2 py-1 border border-slate-600
                      focus:outline-none focus:border-blue-500 transition-colors min-w-[50px]" />
  )
}

function SysField({ conf, value, onChange }: {
  conf?: SystemConfigEntry; value: string; onChange: (v: string) => void
}) {
  if (!conf) return null
  return (
    <div>
      <label className="block text-xs text-slate-300 font-medium mb-1">
        {conf.label ?? conf.key}
      </label>
      {conf.description && <p className="text-xs text-slate-600 mb-1.5">{conf.description}</p>}
      <input type="number" step="any" value={value} onChange={e => onChange(e.target.value)}
             className="w-full bg-slate-800 text-slate-200 text-sm rounded-lg px-3 py-2 border border-slate-700
                        focus:outline-none focus:border-blue-500 transition-colors" />
    </div>
  )
}

/* ── Gewichtung der Optimierungsfaktoren ─────────────────────────────────────── */

type Weights = { cost: number; time: number; env: number }
const WKEYS = ['cost', 'time', 'env'] as const

const WMETA: Record<keyof Weights, { label: string; color: string; desc: string }> = {
  cost: { label: 'Kosten',  color: '#3b82f6', desc: 'Fahrtkosten (km × CHF/km)' },
  time: { label: 'Zeit',    color: '#f59e0b', desc: 'Fahrzeit × Fahrerlohn' },
  env:  { label: 'Umwelt',  color: '#10b981', desc: 'CO₂ × Schattenpreis' },
}

const WEIGHT_PRESETS: { label: string; w: Weights }[] = [
  { label: 'Kostenfokus',  w: { cost: 0.70, time: 0.20, env: 0.10 } },
  { label: 'Ausgewogen',   w: { cost: 0.40, time: 0.35, env: 0.25 } },
  { label: 'Zeitkritisch', w: { cost: 0.20, time: 0.65, env: 0.15 } },
  { label: 'Öko',          w: { cost: 0.20, time: 0.20, env: 0.60 } },
]

function readWeights(sysConf: SystemConfigEntry[]): Weights {
  const g = (k: string, d: number) => {
    const v = parseFloat(sysConf.find(c => c.key === k)?.value ?? '')
    return isNaN(v) ? d : v
  }
  return { cost: g('opt_weight_cost', 0.40), time: g('opt_weight_time', 0.35), env: g('opt_weight_env', 0.25) }
}

function WeightsTab({ sysConf, setSysConf, flashSaved, setError }: {
  sysConf: SystemConfigEntry[]
  setSysConf: (s: SystemConfigEntry[]) => void
  flashSaved: () => void
  setError: (e: string | null) => void
}) {
  const [saved, setSaved] = useState<Weights>(() => readWeights(sysConf))
  const [w, setW]         = useState<Weights>(saved)
  const [busy, setBusy]   = useState(false)

  useEffect(() => { const r = readWeights(sysConf); setSaved(r); setW(r) }, [sysConf])

  // Move one weight; rebalance the other two to keep the sum at 1.0
  const setWeight = (key: keyof Weights, value: number) => {
    const v = Math.max(0, Math.min(1, value))
    const others = WKEYS.filter(k => k !== key)
    const rest = 1 - v
    const othersSum = others.reduce((s, k) => s + w[k], 0)
    const next: Weights = { ...w, [key]: v }
    if (othersSum <= 1e-6) others.forEach(k => { next[k] = rest / others.length })
    else                   others.forEach(k => { next[k] = rest * (w[k] / othersSum) })
    setW(next)
  }

  const dirty = WKEYS.some(k => Math.abs(w[k] - saved[k]) > 0.005)

  const save = async () => {
    setBusy(true); setError(null)
    try {
      const res = await api.updateSystemConfig({
        opt_weight_cost: w.cost.toFixed(3),
        opt_weight_time: w.time.toFixed(3),
        opt_weight_env:  w.env.toFixed(3),
      })
      setSysConf(res); flashSaved()
    } catch (e) { setError(e instanceof Error ? e.message : String(e)) }
    finally { setBusy(false) }
  }

  const pct = (x: number) => Math.round(x * 100)

  return (
    <section className="bg-slate-900/60 border border-slate-700/60 rounded-xl overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-700/60 bg-slate-800/40">
        <h3 className="text-sm font-semibold text-slate-200">Gewichtung der Optimierungsfaktoren</h3>
        <p className="text-xs text-slate-500 mt-0.5">
          Bestimmt, wie stark Kosten, Zeit und Umwelt die Routenwahl (Schritt 4) beeinflussen. Summe immer 100 %.
        </p>
      </div>

      <div className="px-5 py-6 space-y-6">
        {/* Stacked proportion bar */}
        <div>
          <div className="flex h-6 rounded-lg overflow-hidden border border-slate-700/60">
            {WKEYS.map(k => (
              <div key={k} className="flex items-center justify-center text-[10px] font-semibold text-white/90 transition-all"
                   style={{ width: `${w[k] * 100}%`, backgroundColor: WMETA[k].color }}>
                {w[k] >= 0.12 ? `${pct(w[k])}%` : ''}
              </div>
            ))}
          </div>
          <div className="flex gap-4 mt-2">
            {WKEYS.map(k => (
              <span key={k} className="flex items-center gap-1.5 text-xs text-slate-400">
                <span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: WMETA[k].color }} />
                {WMETA[k].label} {pct(w[k])}%
              </span>
            ))}
          </div>
        </div>

        {/* Sliders */}
        <div className="space-y-5">
          {WKEYS.map(k => (
            <div key={k}>
              <div className="flex items-center justify-between mb-1.5">
                <div>
                  <span className="text-sm font-medium text-slate-200">{WMETA[k].label}</span>
                  <span className="text-xs text-slate-500 ml-2">{WMETA[k].desc}</span>
                </div>
                <span className="text-sm font-mono font-semibold" style={{ color: WMETA[k].color }}>{pct(w[k])}%</span>
              </div>
              <input type="range" min={0} max={1} step={0.01} value={w[k]}
                     onChange={e => setWeight(k, parseFloat(e.target.value))}
                     className="w-full" style={{ accentColor: WMETA[k].color }} />
            </div>
          ))}
        </div>

        {/* Presets */}
        <div>
          <p className="text-xs font-medium text-slate-400 mb-2">Voreinstellungen</p>
          <div className="flex flex-wrap gap-2">
            {WEIGHT_PRESETS.map(p => {
              const active = WKEYS.every(k => Math.abs(w[k] - p.w[k]) < 0.005)
              return (
                <button key={p.label} onClick={() => setW(p.w)}
                  className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${
                    active ? 'bg-blue-600/20 border-blue-600/50 text-blue-300'
                           : 'border-slate-700 text-slate-400 hover:border-slate-500 hover:text-slate-200'}`}>
                  {p.label}
                </button>
              )
            })}
          </div>
        </div>

        {/* Score formula */}
        <div className="bg-slate-800/50 border border-slate-700/40 rounded-xl p-3 space-y-1.5">
          <p className="text-xs font-semibold text-slate-300">Score-Formel (niedriger = besser)</p>
          <p className="text-xs text-slate-500 font-mono leading-relaxed">
            <span style={{ color: WMETA.cost.color }}>{w.cost.toFixed(2)}</span> × (km × CHF/km)
            + <span style={{ color: WMETA.time.color }}>{w.time.toFixed(2)}</span> × (h × Fahrerlohn)
            + <span style={{ color: WMETA.env.color }}>{w.env.toFixed(2)}</span> × (CO₂ × Schattenpreis)
          </p>
        </div>

        {/* Save */}
        <div className="flex items-center justify-end gap-3">
          {dirty && <span className="text-xs text-amber-400">Ungespeicherte Änderungen</span>}
          <button onClick={save} disabled={busy || !dirty}
            className={`text-sm px-6 py-2 rounded-lg font-semibold transition-all ${
              dirty ? 'bg-blue-600 hover:bg-blue-500 text-white shadow-sm shadow-blue-900/50'
                    : 'bg-slate-800 text-slate-600 cursor-not-allowed'}`}>
            {busy ? 'Speichern…' : 'Gewichtung speichern'}
          </button>
        </div>
        <p className="text-xs text-slate-500 text-right">
          ⟳ Wirkt erst nach erneutem Lauf von <strong>Schritt 4</strong>. Die Gewichtung steuert die
          Fahrzeugwahl (Öko → wenig CO₂, Kosten → günstig, Zeit → schnell).
        </p>
      </div>
    </section>
  )
}

/* ── Traffic-model settings (time-of-day simulation) ─────────────────────────── */

const congColor = (f: number) => (f >= 1.35 ? '#f87171' : f >= 1.12 ? '#fbbf24' : '#34d399')
const asDelay   = (f: number) => `${f >= 1 ? '+' : '−'}${Math.round(Math.abs(f - 1) * 100)} %`

function TrafficSection() {
  const [info,  setInfo]  = useState<TrafficInfo | null>(null)
  const [tt,    setTt]    = useState<TomTomConfig | null>(null)
  const [peak,  setPeak]  = useState(1)
  const [keyInput, setKeyInput] = useState('')
  const [busy,  setBusy]  = useState(false)
  const [err,   setErr]   = useState<string | null>(null)
  const [modal, setModal] = useState<{ ok: boolean; message: string; detail?: string } | null>(null)

  const apply = useCallback((data: TrafficInfo) => { setInfo(data); setPeak(data.peak_intensity) }, [])

  useEffect(() => {
    let alive = true
    const load = () => {
      api.getTraffic().then(t => { if (alive) apply(t) }).catch(e => setErr(String(e)))
      api.getTomTom().then(c => { if (alive) setTt(c) }).catch(() => {})
    }
    load()
    const id = setInterval(() => api.getTraffic().then(t => { if (alive) setInfo(t) }).catch(() => {}), 60_000)
    return () => { alive = false; clearInterval(id) }
  }, [apply])

  const save = async (enabled: boolean, peakIntensity: number) => {
    setBusy(true); setErr(null)
    try { apply(await api.setTraffic(enabled, peakIntensity, tt?.mode)) }
    catch (e) { setErr(e instanceof Error ? e.message : String(e)) }
    finally { setBusy(false) }
  }

  const changeMode = async (mode: 'simulation' | 'tomtom') => {
    if (!info || busy || tt?.mode === mode) return
    setBusy(true); setErr(null)
    try {
      setTt(await api.setTomTom({ mode }))
      apply(await api.getTraffic())   // applied source may flip
      if (mode === 'tomtom') {
        const t = await api.testTomTom()           // surface key/limit problems as popup
        if (!t.ok) setModal(t)
      }
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)) }
    finally { setBusy(false) }
  }

  const saveKey = async () => {
    setBusy(true); setErr(null)
    try {
      setTt(await api.setTomTom({ api_key: keyInput.trim() })); setKeyInput('')
      apply(await api.getTraffic())
      const t = await api.testTomTom()             // immediately verify the saved key
      setModal(t)                                  // show success or error (with detail)
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)) }
    finally { setBusy(false) }
  }

  const testKey = async () => {
    setBusy(true); setErr(null)
    try { setModal(await api.testTomTom()) }
    catch (e) { setErr(e instanceof Error ? e.message : String(e)) }
    finally { setBusy(false) }
  }

  if (!info) return null
  const on   = info.enabled
  const cong = info.current_congestion
  const live = info.source === 'tomtom'
  const peakChanged = Math.abs(peak - info.peak_intensity) > 0.001

  // Preview the daily curve at the slider's peak (model is linear in peak).
  const base    = info.profile.map(f => (info.peak_intensity > 0.01 ? 1 + (f - 1) / info.peak_intensity : f))
  const preview = base.map(b => 1 + (b - 1) * peak)
  const shiftEnd = info.shift_start + info.shift_hours
  const nowHour  = new Date().getHours() + new Date().getMinutes() / 60

  return (
    <section className="bg-slate-900/60 border border-slate-700/60 rounded-xl overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-slate-700/60 bg-slate-800/40">
        <div className="flex items-center gap-2.5">
          <span className={`w-2 h-2 rounded-full ${on ? 'bg-amber-400' : 'bg-slate-600'}`} />
          <div>
            <h3 className="text-sm font-semibold text-slate-200">
              Verkehrsmodell <span className="text-[10px] font-medium text-slate-500 align-middle">
                ({live ? 'TomTom Live' : 'Tageszeit-Simulation'})
              </span>
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              {live
                ? 'Echtzeit-Verkehr von TomTom — skaliert die Fahrzeiten in der Routenoptimierung (Schritt 4)'
                : 'Simuliertes, tageszeitabhängiges Stau-Modell — skaliert die Fahrzeiten in der Routenoptimierung (Schritt 4)'}
            </p>
          </div>
        </div>
        {/* Switch */}
        <button onClick={() => save(!on, peak)} disabled={busy} role="switch" aria-checked={on}
          className={`relative flex-shrink-0 w-11 h-6 rounded-full transition-colors duration-200
            ${on ? 'bg-amber-500' : 'bg-slate-600'} ${busy ? 'opacity-60' : 'hover:brightness-110'}`}>
          <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform duration-200
            ${on ? 'translate-x-5' : 'translate-x-0'}`} />
        </button>
      </div>

      <div className="px-5 py-5 space-y-5">
        {err && <div className="text-xs text-red-400 bg-red-950/40 border border-red-800/40 rounded-lg px-3 py-2">{err}</div>}

        {/* Last Step-4 live-run error (key invalid / limit reached) */}
        {tt?.last_error && (
          <div className="flex items-start gap-2 text-xs text-red-300 bg-red-950/40 border border-red-800/50 rounded-lg px-3 py-2">
            <WarnIcon className="w-4 h-4 flex-shrink-0 mt-0.5 text-red-400" />
            <span><strong>Letzter Live-Lauf:</strong> {tt.last_error}</span>
          </div>
        )}

        {/* Status tiles */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <Tile label="Status" value={on ? 'Aktiv' : 'Inaktiv'} live={live}
                color={on ? (live ? '#34d399' : '#fbbf24') : '#64748b'}
                hint={on ? (live ? 'TomTom Live-Daten' : 'Stau-Modell läuft') : 'Statischer Faktor'} />
          <Tile label="Angewandter Faktor" value={`×${info.effective_factor.toFixed(2)}`}
                color={on ? congColor(info.effective_factor) : '#94a3b8'}
                hint={on ? `${live ? 'Live' : 'Schicht-Ø'} · ${asDelay(info.effective_factor)} Fahrzeit` : 'aus statischem Verkehrsfaktor'} />
          <Tile label={live ? 'Verkehr · jetzt' : 'Modell · jetzt'} value={`×${cong.toFixed(2)}`} color={congColor(cong)}
                hint={`${asDelay(cong)} · ${new Date().toLocaleTimeString('de-CH', { hour: '2-digit', minute: '2-digit' })} Uhr ${live ? '(live)' : '(simuliert)'}`} />
        </div>

        {/* Peak intensity slider */}
        <div className={on ? '' : 'opacity-50 pointer-events-none'}>
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs font-medium text-slate-300">Stau-Intensität</label>
            <span className="text-xs font-mono text-amber-200">{peak.toFixed(2)}×</span>
          </div>
          <input type="range" min={0} max={2} step={0.05} value={peak}
                 onChange={e => setPeak(parseFloat(e.target.value))}
                 className="w-full accent-amber-500" />
          <div className="flex justify-between text-[10px] text-slate-600 mt-1">
            <span>0 — kein Stau</span><span>1.0 — Standard</span><span>2.0 — extrem</span>
          </div>
          {peakChanged && (
            <div className="flex justify-end mt-2">
              <button onClick={() => save(on, peak)} disabled={busy}
                      className="text-xs px-3 py-1.5 bg-amber-600 hover:bg-amber-500 text-white rounded-lg font-medium transition-colors">
                {busy ? 'Übernehmen…' : 'Intensität übernehmen'}
              </button>
            </div>
          )}
        </div>

        {/* Daily congestion curve */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-semibold text-slate-400">Tagesverlauf (Schweizer Pendlerprofil)</p>
            <span className="text-[10px] text-slate-600">Lieferfenster {fmtH(info.shift_start)}–{fmtH(shiftEnd)} hervorgehoben</span>
          </div>
          <CongestionChart curve={preview} shiftStart={info.shift_start} shiftEnd={shiftEnd} nowHour={nowHour} />
        </div>

        <p className="text-xs text-slate-600 leading-relaxed">
          Bei aktivem Verkehrsmodell nutzt Schritt 4 den über das Lieferfenster gemittelten Stau-Faktor
          statt des statischen Verkehrsfaktors. Höhere Fahrzeiten verschieben die Gewichtung im Score
          hin zu schnelleren Routen. Änderungen wirken beim nächsten Lauf von Schritt 4.
        </p>

        {/* Dynamic disclaimer */}
        {live ? (
          <div className="flex items-start gap-2 text-xs text-emerald-300/90 bg-emerald-950/20 border border-emerald-800/40 rounded-lg px-3 py-2">
            <span className="flex-shrink-0">●</span>
            <span className="leading-relaxed">
              <strong>TomTom Live-Verkehr aktiv:</strong> Fahrzeiten in Schritt 4 stammen aus TomTom
              Matrix Routing (stau-bereinigt); bei API-Ausfall automatischer Rückfall auf die Simulation.
            </span>
          </div>
        ) : (
          <div className="flex items-start gap-2 text-xs text-amber-300/90 bg-amber-950/20 border border-amber-800/40 rounded-lg px-3 py-2">
            <span className="flex-shrink-0">ⓘ</span>
            <span className="leading-relaxed">
              <strong>Simulation, keine Echtzeitdaten:</strong> Werte aus einem deterministischen
              Tagesgang-Profil (Schweizer Pendlerverkehr). Für echten Live-Verkehr unten auf
              „TomTom Live" umstellen (API-Key nötig).
            </span>
          </div>
        )}

        {/* Data source + TomTom API key (always visible) */}
        {tt && (
          <div className="rounded-lg border border-slate-700/50 bg-slate-800/30 p-4 space-y-4">
            <h4 className="text-xs font-semibold text-slate-300">Datenquelle &amp; TomTom-API</h4>

            {/* Mode segmented control */}
            <div>
              <p className="text-[11px] text-slate-400 mb-1.5">Verkehrsdatenquelle</p>
              <div className="inline-flex rounded-lg border border-slate-700 overflow-hidden text-xs">
                {(['simulation', 'tomtom'] as const).map(m => (
                  <button key={m} onClick={() => changeMode(m)} disabled={busy}
                    className={`px-3 py-1.5 font-medium transition-colors ${
                      tt.mode === m ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-slate-200'}`}>
                    {m === 'simulation' ? 'Simulation' : 'TomTom Live'}
                  </button>
                ))}
              </div>
              {tt.mode === 'tomtom' && tt.key_source === 'none' && (
                <p className="text-[10px] text-amber-400 mt-1.5">Kein API-Key hinterlegt — Live nutzt Freifluss (kein Stau).</p>
              )}
            </div>

            {/* API key — always editable; a saved key overrides .env */}
            <div>
              <p className="text-[11px] text-slate-400 mb-1.5">
                TomTom API-Key
                <span className="text-slate-600 ml-1">
                  {tt.key_source === 'file' ? `· aus .env geladen (${tt.key_masked})`
                    : tt.key_source === 'db' ? `· gespeichert (${tt.key_masked})` : '· nicht gesetzt'}
                </span>
              </p>
              <div className="flex gap-2">
                <input type="password" value={keyInput} onChange={e => setKeyInput(e.target.value)}
                       placeholder={tt.key_masked ? `${tt.key_masked} — neuen Key eingeben…` : 'API-Key eingeben…'}
                       className="flex-1 bg-slate-900 text-slate-200 text-xs rounded-md px-2.5 py-1.5 border border-slate-700 focus:outline-none focus:border-blue-500" />
                <button onClick={saveKey} disabled={busy || !keyInput.trim()}
                        className="text-xs px-3 py-1.5 rounded-md font-medium bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 disabled:text-slate-500 text-white transition-colors">
                  Speichern
                </button>
                <button onClick={testKey} disabled={busy}
                        className="text-xs px-3 py-1.5 rounded-md font-medium border border-slate-600 text-slate-300 hover:border-slate-400 transition-colors">
                  Testen
                </button>
              </div>
              <p className="text-[10px] text-slate-600 mt-1">
                Wird automatisch aus der <code className="text-slate-500">.env</code> gelesen, ist hier aber
                überschreibbar. Ein gespeicherter Key hat Vorrang; Feld leeren + Speichern → wieder <code className="text-slate-500">.env</code>.
              </p>
            </div>
          </div>
        )}
      </div>

      {modal && (
        <ErrorModal
          title={modal.ok ? 'TomTom-Verbindung OK' : 'TomTom-Verbindung fehlgeschlagen'}
          variant={modal.ok ? 'success' : 'error'}
          message={modal.message}
          detail={modal.detail}
          onClose={() => setModal(null)}
        />
      )}
    </section>
  )
}

function Tile({ label, value, color, hint, live }: {
  label: string; value: string; color: string; hint?: string; live?: boolean
}) {
  return (
    <div className="rounded-lg border border-slate-700/50 bg-slate-800/40 px-3 py-2.5">
      <div className="flex items-center gap-1.5 mb-1">
        <span className="text-[10px] uppercase tracking-wide text-slate-500">{label}</span>
        {live && <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />}
      </div>
      <div className="text-lg font-bold" style={{ color }}>{value}</div>
      {hint && <div className="text-[10px] text-slate-500 mt-0.5">{hint}</div>}
    </div>
  )
}

function CongestionChart({ curve, shiftStart, shiftEnd, nowHour }: {
  curve: number[]; shiftStart: number; shiftEnd: number; nowHour: number
}) {
  const max = Math.max(1.05, ...curve)
  return (
    <div className="rounded-lg border border-slate-700/40 bg-slate-900/40 p-3">
      <div className="flex items-end gap-[2px] h-24">
        {curve.map((f, h) => {
          const inShift = h + 1 > shiftStart && h < shiftEnd
          const isNow   = Math.floor(nowHour) === h
          const heightPct = ((f - 1) / (max - 1 || 1)) * 100
          return (
            <div key={h} className="flex-1 flex flex-col justify-end items-center group relative" style={{ height: '100%' }}>
              <div className="w-full rounded-t transition-all"
                   style={{
                     height: `${Math.max(3, heightPct)}%`,
                     backgroundColor: congColor(f),
                     opacity: inShift ? 1 : 0.35,
                     outline: isNow ? '1px solid #fff' : 'none',
                   }} />
              {/* tooltip */}
              <div className="absolute -top-7 hidden group-hover:block bg-slate-950 border border-slate-700 rounded px-1.5 py-0.5 text-[10px] text-slate-200 whitespace-nowrap z-10">
                {String(h).padStart(2, '0')}:00 · ×{f.toFixed(2)}
              </div>
            </div>
          )
        })}
      </div>
      <div className="flex justify-between text-[9px] text-slate-600 mt-1">
        {[0, 6, 12, 18, 23].map(h => <span key={h}>{String(h).padStart(2, '0')}h</span>)}
      </div>
    </div>
  )
}

function fmtH(h: number) {
  const hrs = Math.floor(h), mins = Math.round((h - hrs) * 60)
  return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}`
}
