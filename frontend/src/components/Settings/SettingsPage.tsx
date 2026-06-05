import { useCallback, useEffect, useState } from 'react'
import { api } from '../../api/client'
import type { VehicleConfig, VehicleConfigCreate, SystemConfigEntry } from '../../types'

export function SettingsPage() {
  const [vehicles, setVehicles]     = useState<VehicleConfig[]>([])
  const [sysConf, setSysConf]       = useState<SystemConfigEntry[]>([])
  const [loading, setLoading]       = useState(true)
  const [saving, setSaving]         = useState(false)
  const [saved, setSaved]           = useState(false)
  const [error, setError]           = useState<string | null>(null)
  const [editId, setEditId]         = useState<number | 'new' | null>(null)
  const [editBuf, setEditBuf]       = useState<Partial<VehicleConfigCreate>>({})
  const [sysEdits, setSysEdits]     = useState<Record<string, string>>({})

  const load = useCallback(() => {
    setLoading(true)
    Promise.all([api.getVehicles(), api.getSystemConfig()])
      .then(([v, s]) => { setVehicles(v); setSysConf(s) })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { load() }, [load])

  // ── Vehicle CRUD ────────────────────────────────────────────────────────────
  const startEdit = (v: VehicleConfig) => {
    setEditId(v.id)
    setEditBuf({ ...v })
  }

  const startNew = () => {
    setEditId('new')
    setEditBuf({
      name: '', vehicle_class: 'delivery', capacity: 30, range_km: 350,
      cost_per_km: 0.38, co2_g_per_km: 185, speed_kmh: 65,
      driver_chf_h: 45, service_min: 20, max_per_hub: 10, restock_threshold: 5,
      sort_order: vehicles.filter(v => v.vehicle_class === 'delivery').length + 1,
      enabled: true,
    })
  }

  const cancelEdit = () => { setEditId(null); setEditBuf({}) }

  const saveVehicle = async () => {
    if (!editBuf.name?.trim()) { setError('Name darf nicht leer sein'); return }
    setSaving(true); setError(null)
    try {
      const body = editBuf as VehicleConfigCreate
      if (editId === 'new') {
        const created = await api.createVehicle(body)
        setVehicles(vs => [...vs, created])
      } else {
        const updated = await api.updateVehicle(editId as number, body)
        setVehicles(vs => vs.map(v => v.id === updated.id ? updated : v))
      }
      setEditId(null); setEditBuf({})
      flashSaved()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }

  const deleteVehicle = async (id: number) => {
    if (!confirm('Fahrzeug wirklich löschen?')) return
    try {
      await api.deleteVehicle(id)
      setVehicles(vs => vs.filter(v => v.id !== id))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  // ── System Config ───────────────────────────────────────────────────────────
  const handleSysChange = (key: string, value: string) => {
    setSysEdits(prev => ({ ...prev, [key]: value }))
  }

  const saveSystemConfig = async () => {
    if (Object.keys(sysEdits).length === 0) return
    setSaving(true); setError(null)
    try {
      const updated = await api.updateSystemConfig(sysEdits)
      setSysConf(updated)
      setSysEdits({})
      flashSaved()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }

  const flashSaved = () => {
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  const sysVal = (key: string) =>
    sysEdits[key] ?? sysConf.find(c => c.key === key)?.value ?? ''

  if (loading) return (
    <div className="flex items-center justify-center h-full text-gray-400 text-sm">Lade Einstellungen…</div>
  )

  return (
    <div className="h-full overflow-y-auto bg-gray-950 text-white">
      <div className="max-w-5xl mx-auto px-6 py-6 space-y-10">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold">Einstellungen</h2>
            <p className="text-xs text-gray-500 mt-0.5">Änderungen werden beim nächsten Step 3 / 4 wirksam</p>
          </div>
          {saved && (
            <span className="text-xs text-green-400 bg-green-900/30 rounded px-3 py-1.5">✓ Gespeichert</span>
          )}
        </div>

        {error && (
          <div className="text-xs text-red-300 bg-red-900/30 rounded p-3">{error}</div>
        )}

        {/* ── Vehicle Fleet ───────────────────────────────────────────────── */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-gray-300 border-b border-gray-800 pb-1 flex-1">
              Fahrzeugflotte
            </h3>
          </div>

          <div className="overflow-x-auto rounded-lg border border-gray-800">
            <table className="w-full text-xs text-left">
              <thead className="bg-gray-900">
                <tr className="text-gray-400 border-b border-gray-800">
                  <Th>Name</Th><Th>Typ</Th><Th>Kap.</Th><Th>Reichw.</Th>
                  <Th>CHF/km</Th><Th>CO₂/km</Th><Th>Tempo</Th>
                  <Th>Fahr./h</Th><Th>Stop</Th><Th>Max/Hub</Th>
                  <Th>Prio</Th><Th>Aktiv</Th><Th>Aktionen</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {vehicles.map(v => (
                  editId === v.id ? (
                    <VehicleEditRow
                      key={v.id}
                      buf={editBuf}
                      onChange={setEditBuf}
                      onSave={saveVehicle}
                      onCancel={cancelEdit}
                      saving={saving}
                    />
                  ) : (
                    <tr key={v.id} className={`${v.enabled ? '' : 'opacity-40'} hover:bg-gray-900/40`}>
                      <Td><span className={v.vehicle_class === 'backbone' ? 'text-slate-300' : 'text-white'}>{v.name}</span></Td>
                      <Td><span className={`px-1.5 py-0.5 rounded text-xs ${v.vehicle_class === 'backbone' ? 'bg-slate-700 text-slate-300' : 'bg-blue-900/40 text-blue-300'}`}>{v.vehicle_class === 'backbone' ? 'BB' : 'Del.'}</span></Td>
                      <Td>{v.capacity ?? '∞'}</Td>
                      <Td>{v.range_km} km</Td>
                      <Td>{v.cost_per_km}</Td>
                      <Td>{v.co2_g_per_km} g</Td>
                      <Td>{v.speed_kmh}</Td>
                      <Td>{v.driver_chf_h ?? '—'}</Td>
                      <Td>{v.service_min ?? '—'} min</Td>
                      <Td>{v.max_per_hub ?? '—'}</Td>
                      <Td>{v.sort_order}</Td>
                      <Td>{v.enabled ? <span className="text-green-400">✓</span> : <span className="text-gray-600">✗</span>}</Td>
                      <Td>
                        <div className="flex gap-2">
                          <button onClick={() => startEdit(v)} className="text-blue-400 hover:text-blue-300">✏</button>
                          <button onClick={() => deleteVehicle(v.id)} className="text-red-400 hover:text-red-300">🗑</button>
                        </div>
                      </Td>
                    </tr>
                  )
                ))}
                {editId === 'new' && (
                  <VehicleEditRow
                    buf={editBuf}
                    onChange={setEditBuf}
                    onSave={saveVehicle}
                    onCancel={cancelEdit}
                    saving={saving}
                  />
                )}
              </tbody>
            </table>
          </div>

          {editId === null && (
            <button
              onClick={startNew}
              className="mt-3 text-xs px-4 py-2 rounded-lg border border-dashed border-gray-600 text-gray-400
                         hover:border-blue-500 hover:text-blue-300 transition-colors"
            >
              + Fahrzeug hinzufügen
            </button>
          )}
        </section>

        {/* ── System Config ───────────────────────────────────────────────── */}
        <section>
          <h3 className="text-sm font-semibold text-gray-300 mb-4 pb-1 border-b border-gray-800">
            Systemparameter
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

            {/* Demand & Routing */}
            <div className="space-y-3">
              <SysField
                conf={sysConf.find(c => c.key === 'population_per_item')}
                value={sysVal('population_per_item')}
                onChange={v => handleSysChange('population_per_item', v)}
              />
              <SysField
                conf={sysConf.find(c => c.key === 'max_catchment_km')}
                value={sysVal('max_catchment_km')}
                onChange={v => handleSysChange('max_catchment_km', v)}
              />
              <SysField
                conf={sysConf.find(c => c.key === 'vz_hard_radius_km')}
                value={sysVal('vz_hard_radius_km')}
                onChange={v => handleSysChange('vz_hard_radius_km', v)}
              />
              <SysField
                conf={sysConf.find(c => c.key === 'shift_hours')}
                value={sysVal('shift_hours')}
                onChange={v => handleSysChange('shift_hours', v)}
              />
              <SysField
                conf={sysConf.find(c => c.key === 'traffic_factor')}
                value={sysVal('traffic_factor')}
                onChange={v => handleSysChange('traffic_factor', v)}
              />
              <SysField
                conf={sysConf.find(c => c.key === 'co2_shadow_chf')}
                value={sysVal('co2_shadow_chf')}
                onChange={v => handleSysChange('co2_shadow_chf', v)}
              />
            </div>

            {/* Optimisation weights */}
            <div>
              <p className="text-xs text-gray-400 mb-3 font-medium">Optimierungsgewichte (Summe = 1.0)</p>
              <div className="space-y-3">
                {(['opt_weight_cost', 'opt_weight_time', 'opt_weight_env'] as const).map(key => (
                  <SysField
                    key={key}
                    conf={sysConf.find(c => c.key === key)}
                    value={sysVal(key)}
                    onChange={v => handleSysChange(key, v)}
                  />
                ))}
              </div>
              {/* Weight sum indicator */}
              {(() => {
                const sum = ['opt_weight_cost', 'opt_weight_time', 'opt_weight_env']
                  .reduce((acc, k) => acc + parseFloat(sysVal(k) || '0'), 0)
                const ok = Math.abs(sum - 1.0) < 0.01
                return (
                  <p className={`text-xs mt-2 ${ok ? 'text-green-400' : 'text-yellow-400'}`}>
                    Summe: {sum.toFixed(2)} {ok ? '✓' : '⚠ sollte 1.00 sein'}
                  </p>
                )
              })()}
              <div className="mt-4 p-3 bg-gray-800/60 rounded text-gray-400 text-xs leading-relaxed">
                <strong className="text-gray-300">Score-Formel:</strong><br/>
                = Gewicht_Kosten × (km × CHF/km)<br/>
                + Gewicht_Zeit × (h × Fahrerlohn)<br/>
                + Gewicht_Umwelt × (CO₂ × Schattenpreis)
              </div>
            </div>
          </div>

          <button
            onClick={saveSystemConfig}
            disabled={saving || Object.keys(sysEdits).length === 0}
            className={`mt-6 text-xs px-6 py-2.5 rounded-lg font-medium transition-colors ${
              Object.keys(sysEdits).length > 0
                ? 'bg-blue-600 hover:bg-blue-500 text-white'
                : 'bg-gray-700 text-gray-500 cursor-not-allowed'
            }`}
          >
            {saving ? 'Speichern…' : 'Einstellungen speichern'}
          </button>
        </section>

      </div>
    </div>
  )
}

// ── Sub-components ────────────────────────────────────────────────────────────

function Th({ children }: { children: React.ReactNode }) {
  return <th className="px-3 py-2 font-medium text-gray-400">{children}</th>
}
function Td({ children }: { children: React.ReactNode }) {
  return <td className="px-3 py-2 text-gray-300">{children}</td>
}

function VehicleEditRow({ buf, onChange, onSave, onCancel, saving }: {
  buf: Partial<VehicleConfigCreate>
  onChange: (b: Partial<VehicleConfigCreate>) => void
  onSave: () => void
  onCancel: () => void
  saving: boolean
}) {
  const set = (k: keyof VehicleConfigCreate) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const raw = e.target.value
    const numKeys: (keyof VehicleConfigCreate)[] = [
      'capacity','range_km','cost_per_km','co2_g_per_km','speed_kmh',
      'driver_chf_h','service_min','max_per_hub','restock_threshold','sort_order',
    ]
    onChange({ ...buf, [k]: numKeys.includes(k) ? (raw === '' ? null : parseFloat(raw)) : raw })
  }
  const setCheck = (k: keyof VehicleConfigCreate) => (e: React.ChangeEvent<HTMLInputElement>) =>
    onChange({ ...buf, [k]: e.target.checked })

  return (
    <tr className="bg-blue-900/20 border-b border-blue-800/40">
      <Td><In value={buf.name ?? ''} onChange={set('name')} placeholder="Name" /></Td>
      <Td>
        <select value={buf.vehicle_class ?? 'delivery'} onChange={set('vehicle_class')}
                className="bg-gray-800 text-gray-200 text-xs rounded px-1 py-0.5 border border-gray-600 w-full">
          <option value="delivery">Del.</option>
          <option value="backbone">BB</option>
        </select>
      </Td>
      <Td><In value={buf.capacity ?? ''} onChange={set('capacity')} type="number" placeholder="∞" /></Td>
      <Td><In value={buf.range_km ?? ''} onChange={set('range_km')} type="number" /></Td>
      <Td><In value={buf.cost_per_km ?? ''} onChange={set('cost_per_km')} type="number" step="0.01" /></Td>
      <Td><In value={buf.co2_g_per_km ?? ''} onChange={set('co2_g_per_km')} type="number" /></Td>
      <Td><In value={buf.speed_kmh ?? ''} onChange={set('speed_kmh')} type="number" /></Td>
      <Td><In value={buf.driver_chf_h ?? ''} onChange={set('driver_chf_h')} type="number" /></Td>
      <Td><In value={buf.service_min ?? ''} onChange={set('service_min')} type="number" /></Td>
      <Td><In value={buf.max_per_hub ?? ''} onChange={set('max_per_hub')} type="number" /></Td>
      <Td><In value={buf.sort_order ?? 0} onChange={set('sort_order')} type="number" /></Td>
      <Td>
        <input type="checkbox" checked={buf.enabled ?? true} onChange={setCheck('enabled')}
               className="accent-blue-500" />
      </Td>
      <Td>
        <div className="flex gap-2">
          <button onClick={onSave} disabled={saving}
                  className="text-green-400 hover:text-green-300 font-medium">
            {saving ? '…' : '✓'}
          </button>
          <button onClick={onCancel} className="text-gray-400 hover:text-gray-200">✗</button>
        </div>
      </Td>
    </tr>
  )
}

function In({ value, onChange, type = 'text', placeholder = '', step }: {
  value: string | number; onChange: React.ChangeEventHandler<HTMLInputElement>
  type?: string; placeholder?: string; step?: string
}) {
  return (
    <input
      type={type} value={value} onChange={onChange} placeholder={placeholder}
      step={step}
      className="w-full bg-gray-800 text-gray-200 text-xs rounded px-1.5 py-0.5 border border-gray-600
                 focus:outline-none focus:border-blue-500"
      style={{ minWidth: 50 }}
    />
  )
}

function SysField({ conf, value, onChange }: {
  conf?: { key: string; label?: string | null; description?: string | null }
  value: string
  onChange: (v: string) => void
}) {
  if (!conf) return null
  return (
    <div>
      <label className="block text-xs text-gray-400 mb-1">
        {conf.label ?? conf.key}
        {conf.description && <span className="text-gray-600 ml-1">— {conf.description}</span>}
      </label>
      <input
        type="number" step="any" value={value} onChange={e => onChange(e.target.value)}
        className="w-full bg-gray-800 text-gray-200 text-xs rounded px-3 py-2 border border-gray-700
                   focus:outline-none focus:border-blue-500 transition-colors"
      />
    </div>
  )
}
