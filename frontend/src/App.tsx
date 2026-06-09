import { useEffect, useMemo, useRef, useState } from 'react'
import { MapView } from './components/Map/MapView'
import { PipelinePanel } from './components/Pipeline/PipelinePanel'
import { InfoSidebar } from './components/Sidebar/InfoSidebar'
import { LayerToggle } from './components/Sidebar/LayerToggle'
import { HubRoutesPanel } from './components/Sidebar/HubRoutesPanel'
import { SummaryPage } from './components/Summary/SummaryPage'
import { SettingsPage } from './components/Settings/SettingsPage'
import { ErrorModal } from './components/common/ErrorModal'
import { DetailModal, type DetailSubject } from './components/common/DetailModal'
import { usePipeline } from './hooks/usePipeline'
import { api } from './api/client'
import type { SelectedFeature, HighlightState } from './types'

type View = 'map' | 'summary' | 'settings'
interface HubInfo { type: string; parent: string | null }

export default function App() {
  const { status, runStep, reset, loading, error } = usePipeline()

  const [selected,          setSelected]          = useState<SelectedFeature | null>(null)
  const [view,              setView]              = useState<View>('map')
  const [trafficAlert,      setTrafficAlert]      = useState<string | null>(null)
  const [sidebarOpen,       setSidebarOpen]       = useState(true)
  const [detailSubject,     setDetailSubject]     = useState<DetailSubject | null>(null)

  // Hub-Focus-State
  const [focusedHub,        setFocusedHub]        = useState<string | null>(null)
  const [hubModalOpen,      setHubModalOpen]      = useState(false)
  const [hubModalName,      setHubModalName]      = useState<string | null>(null)

  // Vehicle- and Pharmacy-Focus
  const [focusedVehicleId,  setFocusedVehicleId]  = useState<string | null>(null)
  const [focusedVehicleHub, setFocusedVehicleHub] = useState<string | null>(null) // hub of focused vehicle
  const [focusedPharmacyId, setFocusedPharmacyId] = useState<number | null>(null)
  const [focusedPharmacyHub,setFocusedPharmacyHub]= useState<string | null>(null) // hub of focused pharmacy

  // Vehicle types and filter (last-mile + Hauptlauf/backbone)
  const [vehicleTypes,      setVehicleTypes]      = useState<string[]>([])
  const [vehicleTypeFilter, setVehicleTypeFilter] = useState<Set<string>>(new Set())
  const [backboneTypes,     setBackboneTypes]     = useState<string[]>([])
  const [backboneTypeFilter,setBackboneTypeFilter]= useState<Set<string>>(new Set())

  // Hub hierarchy for supply-chain highlight
  const [hubMap,            setHubMap]            = useState<Map<string, HubInfo>>(new Map())
  const [visibleLayers, setVisibleLayers] = useState(
    () => new Set(['pharmacies', 'hubs', 'assignments', 'backbone', 'routes']),
  )

  // Load last-mile + Hauptlauf (backbone) vehicle types
  useEffect(() => {
    api.getVehicles()
      .then(vs => {
        const lm = vs.filter(v => v.can_last_mile && v.enabled)
          .sort((a, b) => a.sort_order - b.sort_order).map(v => v.name)
        setVehicleTypes(lm); setVehicleTypeFilter(new Set(lm))
        const bb = vs.filter(v => v.can_backbone && v.enabled)
          .sort((a, b) => a.sort_order - b.sort_order).map(v => v.name)
        setBackboneTypes(bb); setBackboneTypeFilter(new Set(bb))
      })
      .catch(() => {
        setVehicleTypes(['Sprinter', 'Klein-LKW']); setVehicleTypeFilter(new Set(['Sprinter', 'Klein-LKW']))
        setBackboneTypes(['Zug', 'LKW']); setBackboneTypeFilter(new Set(['Zug', 'LKW']))
      })
  }, [])

  // Hub hierarchy for chain highlight
  const step1Key = status[1]?.finished_at ?? status[1]?.status
  useEffect(() => {
    if (status[1]?.status !== 'done') { setHubMap(new Map()); return }
    api.hubs().then(fc => {
      const m = new Map<string, HubInfo>()
      for (const f of fc.features) {
        const p = f.properties as any
        m.set(p.name, { type: p.hub_type, parent: p.parent_hub ?? null })
      }
      setHubMap(m)
    }).catch(() => {})
  }, [step1Key, status[1]?.status])

  const toggleLayer = (layer: string) =>
    setVisibleLayers(prev => { const n = new Set(prev); n.has(layer) ? n.delete(layer) : n.add(layer); return n })

  const toggleVehicleType = (type: string) => {
    setVehicleTypeFilter(prev => {
      if (prev.size === vehicleTypes.length || prev.size === 0) return new Set([type])
      const n = new Set(prev)
      if (n.has(type)) { n.delete(type); if (n.size === 0) return new Set(vehicleTypes) }
      else { n.add(type); if (n.size === vehicleTypes.length) return new Set(vehicleTypes) }
      return n
    })
  }

  const toggleBackboneType = (type: string) => {
    setBackboneTypeFilter(prev => {
      if (prev.size === backboneTypes.length || prev.size === 0) return new Set([type])
      const n = new Set(prev)
      if (n.has(type)) { n.delete(type); if (n.size === 0) return new Set(backboneTypes) }
      else { n.add(type); if (n.size === backboneTypes.length) return new Set(backboneTypes) }
      return n
    })
  }

  // Reset all focused state
  const clearAll = () => {
    setSelected(null); setFocusedHub(null); setHubModalOpen(false)
    setFocusedVehicleId(null); setFocusedVehicleHub(null)
    setFocusedPharmacyId(null); setFocusedPharmacyHub(null)
  }

  useEffect(() => { if (status[1]?.status === 'idle') clearAll() }, [status[1]?.status])

  // After a Step-4 run, surface any TomTom problem (invalid key / limit) as a popup.
  const lastStep4Fin = useRef<string | null>(null)
  useEffect(() => {
    const s4 = status[4]
    if (s4?.status === 'done' && s4.finished_at && s4.finished_at !== lastStep4Fin.current) {
      lastStep4Fin.current = s4.finished_at
      api.getTraffic().then(t => { if (t.last_error) setTrafficAlert(t.last_error) }).catch(() => {})
    }
  }, [status[4]?.status, status[4]?.finished_at])

  // ── Supply-chain highlight derivation ──────────────────────────────────────
  const chainOf = (name: string): string[] => {
    const info = hubMap.get(name)
    const hqEntry = [...hubMap.entries()].find(([, v]) => v.type === 'HQ')
    const hq = hqEntry ? [hqEntry[0]] : []
    if (!info) return [name, ...hq]
    if (info.type === 'HQ') return [name]
    if (info.type === 'VZ') {
      const children = [...hubMap.entries()]
        .filter(([, v]) => v.type === 'mVZ' && v.parent === name).map(([k]) => k)
      return [name, ...hq, ...children]
    }
    return [name, ...(info.parent ? [info.parent] : []), ...hq]
  }

  const activeHubForHighlight = focusedHub ?? (selected?.type === 'hub' ? (selected.properties.name as string) : null)

  const highlight: HighlightState | null = useMemo(() => {
    const base = { hubs: [] as string[], pharmacyId: null, servingPharmacyId: null, chainPharmacyId: null, routeId: null, vehicleId: null, primaryHub: null }
    if (focusedVehicleId) {
      // Use stored hub name — never derive from vehicle_id string (split would mangle "VZ_1")
      return { ...base, hubs: focusedVehicleHub ? chainOf(focusedVehicleHub) : [], vehicleId: focusedVehicleId }
    }
    if (focusedPharmacyId != null) {
      // "Lieferkette anzeigen" button → complete chain (serving route + assignment + backbone)
      return { ...base, hubs: focusedPharmacyHub ? chainOf(focusedPharmacyHub) : [], chainPharmacyId: focusedPharmacyId }
    }
    if (activeHubForHighlight) {
      // Pure hub focus → colour the hub's own (outbound) routes vs its inbound supply route
      return { ...base, hubs: chainOf(activeHubForHighlight), primaryHub: activeHubForHighlight }
    }
    if (selected?.type === 'pharmacy') {
      // Plain pharmacy click → show only the last-mile route that delivers it
      const p = selected.properties as any
      return { ...base, hubs: p.hub_name ? [p.hub_name] : [], servingPharmacyId: (p.id as number) ?? null }
    }
    if (selected?.type === 'route') {
      const p = selected.properties as any
      if (p.backbone_tier) {
        let to: string[] = []
        try { to = typeof p.to_hubs === 'string' ? JSON.parse(p.to_hubs) : (p.to_hubs ?? []) } catch { /* */ }
        return { ...base, hubs: [p.from_hub, ...to].filter(Boolean) }
      }
      return { ...base, hubs: p.hub_name ? [p.hub_name] : [], routeId: p.id ?? null }
    }
    return null
  }, [selected, focusedHub, focusedVehicleId, focusedPharmacyId, hubMap])

  // ── Hub click handler ──────────────────────────────────────────────────────
  const handleFeatureSelect = (f: SelectedFeature | null) => {
    setSelected(f)
    setFocusedVehicleId(null)
    setFocusedPharmacyId(null)
    setHubModalOpen(false)
    if (f?.type === 'hub') {
      const name = f.properties.name as string
      // Auto-focus hub: immediately filter routes + assignments to this hub
      setFocusedHub(name)
    } else {
      // Clicking elsewhere clears hub focus only if nothing else is focused
      if (!focusedVehicleId && !focusedPharmacyId) setFocusedHub(null)
    }
  }

  // ── Open hub modal ─────────────────────────────────────────────────────────
  const openHubPanel = (name: string) => {
    setHubModalName(name)
    setHubModalOpen(true)
    setSelected(null)
  }

  // ── Pharmacy chain button ──────────────────────────────────────────────────
  const handlePharmacyChain = (pharmacyId: number, hubName: string) => {
    setFocusedHub(hubName)
    setFocusedPharmacyId(pharmacyId)
    setFocusedPharmacyHub(hubName)  // store for highlight chain
    setSelected(null)
  }

  const step4Done    = status[4]?.status === 'done'
  const isAnyRunning = Object.values(status).some(s => s.status === 'running')
  const overall = isAnyRunning ? 'running'
    : Object.values(status).some(s => s.status === 'error') ? 'error'
    : step4Done ? 'done' : 'idle'

  const hasAnyFocus = !!(focusedHub || focusedVehicleId || focusedPharmacyId)

  return (
    <div className="flex flex-col h-screen bg-slate-950 text-slate-100 overflow-hidden">

      {/* ── Top bar ──────────────────────────────────────────────────────── */}
      <header className="flex-shrink-0 flex items-center h-12 px-4 bg-slate-900 border-b border-slate-700/60 z-30">
        <button
          onClick={() => setSidebarOpen(o => !o)}
          title={sidebarOpen ? 'Seitenleiste einklappen' : 'Seitenleiste ausklappen'}
          aria-label={sidebarOpen ? 'Seitenleiste einklappen' : 'Seitenleiste ausklappen'}
          className="flex items-center justify-center w-7 h-7 mr-3 rounded-md text-slate-400
                     hover:text-white hover:bg-slate-800 transition-colors">
          <SidebarIcon className="w-4 h-4" open={sidebarOpen} />
        </button>
        <div className="flex items-center gap-2.5 mr-6">
          <div className="flex items-center justify-center w-7 h-7 rounded-md bg-blue-600">
            <svg className="w-4 h-4 text-white" viewBox="0 0 20 20" fill="none">
              <path d="M10 2 L18 16 H2 Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
              <circle cx="10" cy="6" r="1.5" fill="currentColor"/>
            </svg>
          </div>
          <span className="text-sm font-bold text-white tracking-tight">Pharma Logistics <span className="text-slate-400 font-normal">CH</span></span>
        </div>

        <nav className="flex items-center gap-0.5 flex-1">
          {([
            { id: 'map', label: 'Karte', icon: MapIcon },
            { id: 'summary', label: 'Analyse', icon: ChartIcon, gate: !step4Done },
            { id: 'settings', label: 'Einstellungen', icon: GearIcon },
          ] as const).map(tab => (
            <button key={tab.id}
              onClick={() => !('gate' in tab && tab.gate) && setView(tab.id)}
              disabled={'gate' in tab && tab.gate}
              title={'gate' in tab && tab.gate ? 'Verfügbar nach Schritt 4' : undefined}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors
                ${view === tab.id ? 'bg-blue-600/20 text-blue-300 border border-blue-600/40'
                  : 'gate' in tab && tab.gate ? 'text-slate-600 cursor-not-allowed'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'}`}>
              <tab.icon className="w-3.5 h-3.5" />{tab.label}
            </button>
          ))}
        </nav>

        <div className="flex items-center gap-2 text-xs">
          <span className={`status-dot ${overall}`} />
          <span className="text-slate-400">
            {overall === 'running' ? 'Pipeline läuft…' : overall === 'done' ? 'Pipeline abgeschlossen'
              : overall === 'error' ? 'Fehler' : '400 Apotheken · Schweiz'}
          </span>
        </div>
      </header>

      {/* ── Body ─────────────────────────────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden">
        <aside className={`flex-shrink-0 flex flex-col bg-slate-900 overflow-hidden
                           transition-[width] duration-200 ease-in-out
                           ${sidebarOpen ? 'w-64 border-r border-slate-700/60' : 'w-0'}`}>
          <PipelinePanel status={status} onRunStep={runStep}
            onReset={() => { reset(); clearAll() }}
            loading={loading} error={error} />
        </aside>

        <main className="flex-1 relative overflow-hidden">
          <div className={view === 'map' ? 'absolute inset-0' : 'hidden'}>
            <MapView
              pipelineStatus={status}
              onFeatureSelect={handleFeatureSelect}
              visibleLayers={visibleLayers}
              isAnyRunning={isAnyRunning}
              focusedHub={focusedHub}
              focusedVehicleId={focusedVehicleId}
              focusedPharmacyId={focusedPharmacyId}
              vehicleTypeFilter={vehicleTypeFilter}
              backboneTypeFilter={backboneTypeFilter}
              highlight={highlight}
            />

            <div className="absolute bottom-8 left-4 z-10">
              <LayerToggle visibleLayers={visibleLayers} pipelineStatus={status} onToggle={toggleLayer}
                vehicleTypes={vehicleTypes} vehicleTypeFilter={vehicleTypeFilter} onToggleVehicle={toggleVehicleType}
                backboneTypes={backboneTypes} backboneTypeFilter={backboneTypeFilter} onToggleBackbone={toggleBackboneType} />
            </div>

            {/* Status banner */}
            {hasAnyFocus && (
              <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10
                              bg-slate-800/95 backdrop-blur border border-slate-600/60
                              rounded-full px-4 py-2 flex items-center gap-3 shadow-xl text-xs max-w-lg">
                <span className="w-2 h-2 rounded-full bg-blue-400 animate-pulse flex-shrink-0" />
                <span className="text-slate-200 font-medium truncate">
                  {focusedVehicleId
                    ? `Fahrzeug aktiv: ${focusedVehicleId}`
                    : focusedPharmacyId != null
                      ? `Lieferkette — Apotheke #${focusedPharmacyId}`
                      : `Routenfilter: ${focusedHub}`
                  }
                </span>
                {/* Reopen modal button */}
                {hubModalName && (focusedVehicleId || hubModalName === focusedHub) && (
                  <button onClick={() => setHubModalOpen(true)}
                          className="text-blue-300 hover:text-blue-200 flex-shrink-0 px-2 py-0.5 rounded
                                     border border-blue-600/40 hover:border-blue-500 transition-colors text-xs">
                    Übersicht
                  </button>
                )}
                <button onClick={clearAll}
                        className="text-slate-400 hover:text-white flex-shrink-0 ml-1 font-semibold">
                  ✕
                </button>
              </div>
            )}

            {/* InfoSidebar */}
            {selected && (
              <div className="absolute top-4 right-4 z-10">
                <InfoSidebar
                  feature={selected}
                  onClose={() => setSelected(null)}
                  focusedHub={focusedHub}
                  onFocusHub={h => { setFocusedHub(h); if (!h) { setFocusedVehicleId(null); setFocusedPharmacyId(null) } }}
                  onOpenHubPanel={openHubPanel}
                  onPharmacyChain={handlePharmacyChain}
                  onShowDetail={setDetailSubject}
                />
              </div>
            )}
          </div>

          {view === 'summary'  && <div className="absolute inset-0"><SummaryPage pipelineStatus={status} /></div>}
          {view === 'settings' && <div className="absolute inset-0"><SettingsPage /></div>}
        </main>
      </div>

      {/* ── Hub routes modal (portal-style overlay) ────────────────────── */}
      {hubModalOpen && hubModalName && (
        <HubRoutesPanel
          hubName={hubModalName}
          focusedVehicleId={focusedVehicleId}
          onSelectVehicle={vehicleId => {
            setFocusedVehicleId(vehicleId)
            setFocusedVehicleHub(hubModalName)  // store hub so chainOf works correctly
            setFocusedHub(hubModalName)
          }}
          onClose={() => setHubModalOpen(false)}
        />
      )}

      {detailSubject && (
        <DetailModal subject={detailSubject} onClose={() => setDetailSubject(null)} />
      )}

      {trafficAlert && (
        <ErrorModal
          title="TomTom Live-Verkehr"
          variant="warning"
          message={`Beim letzten Schritt-4-Lauf: ${trafficAlert} Die Routen wurden mit Freifluss-Zeiten berechnet.`}
          onClose={() => setTrafficAlert(null)}
        />
      )}
    </div>
  )
}

function SidebarIcon({ className, open }: { className?: string; open: boolean }) {
  return <svg className={className} viewBox="0 0 16 16" fill="none">
    <rect x="1.5" y="2.5" width="13" height="11" rx="1.5" stroke="currentColor" strokeWidth="1.3"/>
    <line x1="6" y1="2.5" x2="6" y2="13.5" stroke="currentColor" strokeWidth="1.3"/>
    {open
      ? <path d="M11.5 6 L9.5 8 L11.5 10" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
      : <path d="M9 6 L11 8 L9 10" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>}
  </svg>
}
function MapIcon({ className }: { className?: string }) {
  return <svg className={className} viewBox="0 0 16 16" fill="none">
    <path d="M5 2L1 4v10l4-2 6 2 4-2V2L15 4 9 2 5 2Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/>
    <path d="M5 2v10M11 4v10" stroke="currentColor" strokeWidth="1.3"/></svg>
}
function ChartIcon({ className }: { className?: string }) {
  return <svg className={className} viewBox="0 0 16 16" fill="none">
    <rect x="1" y="9" width="3" height="6" rx="1" fill="currentColor"/>
    <rect x="6" y="5" width="3" height="10" rx="1" fill="currentColor"/>
    <rect x="11" y="1" width="3" height="14" rx="1" fill="currentColor"/></svg>
}
function GearIcon({ className }: { className?: string }) {
  return <svg className={className} viewBox="0 0 16 16" fill="none">
    <circle cx="8" cy="8" r="2" stroke="currentColor" strokeWidth="1.3"/>
    <path d="M8 1.5v2M8 12.5v2M1.5 8h2M12.5 8h2M3.4 3.4l1.4 1.4M11.2 11.2l1.4 1.4M3.4 12.6l1.4-1.4M11.2 4.8l1.4-1.4"
          stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg>
}
