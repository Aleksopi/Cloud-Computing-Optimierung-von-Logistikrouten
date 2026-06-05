import { useEffect, useState } from 'react'
import { MapView } from './components/Map/MapView'
import { PipelinePanel } from './components/Pipeline/PipelinePanel'
import { InfoSidebar } from './components/Sidebar/InfoSidebar'
import { LayerToggle } from './components/Sidebar/LayerToggle'
import { SummaryPage } from './components/Summary/SummaryPage'
import { SettingsPage } from './components/Settings/SettingsPage'
import { usePipeline } from './hooks/usePipeline'
import { api } from './api/client'
import type { SelectedFeature } from './types'

type View = 'map' | 'summary' | 'settings'

export default function App() {
  const { status, runStep, reset, loading, error } = usePipeline()

  const [selected,          setSelected]          = useState<SelectedFeature | null>(null)
  const [view,              setView]              = useState<View>('map')
  const [focusedHub,        setFocusedHub]        = useState<string | null>(null)
  const [vehicleTypes,      setVehicleTypes]      = useState<string[]>([])
  const [vehicleTypeFilter, setVehicleTypeFilter] = useState<Set<string>>(new Set())
  const [visibleLayers, setVisibleLayers] = useState(
    () => new Set(['pharmacies', 'hubs', 'assignments', 'backbone', 'routes']),
  )

  useEffect(() => {
    api.getVehicles()
      .then(vehicles => {
        const types = vehicles
          .filter(v => v.vehicle_class === 'delivery' && v.enabled)
          .sort((a, b) => a.sort_order - b.sort_order)
          .map(v => v.name)
        setVehicleTypes(types)
        setVehicleTypeFilter(new Set(types))
      })
      .catch(() => {
        setVehicleTypes(['Sprinter', 'LKW'])
        setVehicleTypeFilter(new Set(['Sprinter', 'LKW']))
      })
  }, [])

  const toggleLayer = (layer: string) =>
    setVisibleLayers(prev => {
      const next = new Set(prev)
      next.has(layer) ? next.delete(layer) : next.add(layer)
      return next
    })

  const toggleVehicleType = (type: string) => {
    setVehicleTypeFilter(prev => {
      if (prev.size === vehicleTypes.length || prev.size === 0) return new Set([type])
      const next = new Set(prev)
      if (next.has(type)) {
        next.delete(type)
        if (next.size === 0) return new Set(vehicleTypes)
      } else {
        next.add(type)
        if (next.size === vehicleTypes.length) return new Set(vehicleTypes)
      }
      return next
    })
  }

  useEffect(() => {
    if (status[1]?.status === 'idle') setFocusedHub(null)
  }, [status[1]?.status])

  const step4Done    = status[4]?.status === 'done'
  const isAnyRunning = Object.values(status).some(s => s.status === 'running')
  const overallStatus = isAnyRunning ? 'running'
    : Object.values(status).some(s => s.status === 'error') ? 'error'
    : step4Done ? 'done' : 'idle'

  return (
    <div className="flex flex-col h-screen bg-slate-950 text-slate-100 overflow-hidden">

      {/* ── Top navigation bar ─────────────────────────────────────────── */}
      <header className="flex-shrink-0 flex items-center h-12 px-4 bg-slate-900 border-b border-slate-700/60 z-30">
        {/* Brand */}
        <div className="flex items-center gap-2.5 mr-6">
          <div className="flex items-center justify-center w-7 h-7 rounded-md bg-blue-600">
            <svg className="w-4 h-4 text-white" viewBox="0 0 20 20" fill="none">
              <path d="M10 2 L18 16 H2 Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
              <circle cx="10" cy="6" r="1.5" fill="currentColor"/>
            </svg>
          </div>
          <div>
            <span className="text-sm font-bold text-white tracking-tight">Pharma Logistics</span>
            <span className="text-xs text-slate-400 ml-1.5">CH</span>
          </div>
        </div>

        {/* View tabs */}
        <nav className="flex items-center gap-0.5 flex-1">
          {([
            { id: 'map',      label: 'Karte',          icon: MapIcon },
            { id: 'summary',  label: 'Analyse',        icon: ChartIcon, gate: !step4Done, gateLabel: 'nach Schritt 4' },
            { id: 'settings', label: 'Einstellungen',  icon: GearIcon },
          ] as const).map(tab => (
            <button
              key={tab.id}
              onClick={() => !('gate' in tab && tab.gate) && setView(tab.id)}
              disabled={'gate' in tab && tab.gate}
              title={'gate' in tab && tab.gate ? tab.gateLabel : undefined}
              className={`
                flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors
                ${ view === tab.id
                  ? 'bg-blue-600/20 text-blue-300 border border-blue-600/40'
                  : 'gate' in tab && tab.gate
                    ? 'text-slate-600 cursor-not-allowed'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                }
              `}
            >
              <tab.icon className="w-3.5 h-3.5" />
              {tab.label}
              {'gate' in tab && tab.gate && (
                <span className="text-slate-600 text-xs">⋯</span>
              )}
            </button>
          ))}
        </nav>

        {/* System status */}
        <div className="flex items-center gap-2 text-xs">
          <span className={`status-dot ${overallStatus}`} />
          <span className="text-slate-400">
            {overallStatus === 'running' ? 'Pipeline läuft…'
            : overallStatus === 'done'    ? 'Pipeline abgeschlossen'
            : overallStatus === 'error'   ? 'Fehler'
            : '400 Apotheken · Schweiz'}
          </span>
        </div>
      </header>

      {/* ── Body ───────────────────────────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden">

        {/* ── Sidebar ──────────────────────────────────────────────────── */}
        <aside className="w-64 flex-shrink-0 flex flex-col bg-slate-900 border-r border-slate-700/60 overflow-hidden">
          <PipelinePanel
            status={status}
            onRunStep={runStep}
            onReset={() => { reset(); setFocusedHub(null) }}
            loading={loading}
            error={error}
          />
        </aside>

        {/* ── Main area ─────────────────────────────────────────────────── */}
        <main className="flex-1 relative overflow-hidden">

          {/* Map view */}
          <div className={view === 'map' ? 'absolute inset-0' : 'hidden'}>
            <MapView
              pipelineStatus={status}
              onFeatureSelect={setSelected}
              visibleLayers={visibleLayers}
              isAnyRunning={isAnyRunning}
              focusedHub={focusedHub}
              vehicleTypeFilter={vehicleTypeFilter}
            />

            {/* Layer toggle */}
            <div className="absolute bottom-8 left-4 z-10">
              <LayerToggle
                visibleLayers={visibleLayers}
                pipelineStatus={status}
                onToggle={toggleLayer}
                vehicleTypes={vehicleTypes}
                vehicleTypeFilter={vehicleTypeFilter}
                onToggleVehicle={toggleVehicleType}
              />
            </div>

            {/* Hub focus banner */}
            {focusedHub && (
              <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10
                              bg-blue-700/95 backdrop-blur border border-blue-500/40
                              rounded-full px-4 py-1.5 flex items-center gap-3 shadow-xl text-xs">
                <span className="w-2 h-2 rounded-full bg-blue-300 animate-pulse" />
                <span className="text-white font-medium">Routen: {focusedHub}</span>
                <button onClick={() => setFocusedHub(null)}
                        className="text-blue-200 hover:text-white ml-1 font-medium">
                  ✕ Alle
                </button>
              </div>
            )}

            {/* Feature info panel */}
            {selected && (
              <div className="absolute top-4 right-4 z-10">
                <InfoSidebar
                  feature={selected}
                  onClose={() => setSelected(null)}
                  focusedHub={focusedHub}
                  onFocusHub={setFocusedHub}
                />
              </div>
            )}
          </div>

          {/* Summary page */}
          {view === 'summary' && (
            <div className="absolute inset-0">
              <SummaryPage pipelineStatus={status} />
            </div>
          )}

          {/* Settings page */}
          {view === 'settings' && (
            <div className="absolute inset-0">
              <SettingsPage />
            </div>
          )}

        </main>
      </div>
    </div>
  )
}

/* ── Icon components ─────────────────────────────────────────────────────── */
function MapIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none">
      <path d="M5 2L1 4v10l4-2 6 2 4-2V2L15 4 9 2 5 2Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/>
      <path d="M5 2v10M11 4v10" stroke="currentColor" strokeWidth="1.3"/>
    </svg>
  )
}
function ChartIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none">
      <rect x="1" y="9" width="3" height="6" rx="1" fill="currentColor"/>
      <rect x="6" y="5" width="3" height="10" rx="1" fill="currentColor"/>
      <rect x="11" y="1" width="3" height="14" rx="1" fill="currentColor"/>
    </svg>
  )
}
function GearIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none">
      <circle cx="8" cy="8" r="2" stroke="currentColor" strokeWidth="1.3"/>
      <path d="M8 1.5v2M8 12.5v2M1.5 8h2M12.5 8h2M3.4 3.4l1.4 1.4M11.2 11.2l1.4 1.4M3.4 12.6l1.4-1.4M11.2 4.8l1.4-1.4"
            stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
    </svg>
  )
}
