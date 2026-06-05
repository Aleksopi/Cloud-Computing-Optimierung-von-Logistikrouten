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

  // Load delivery vehicle types from settings (for filter UI)
  useEffect(() => {
    api.getVehicles()
      .then(vehicles => {
        const types = vehicles
          .filter(v => v.vehicle_class === 'delivery' && v.enabled)
          .sort((a, b) => a.sort_order - b.sort_order)
          .map(v => v.name)
        setVehicleTypes(types)
        setVehicleTypeFilter(new Set(types)) // default: all visible
      })
      .catch(() => {
        // Settings not yet seeded — use defaults
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
      // If all are selected, clicking one means "show only this one"
      if (prev.size === vehicleTypes.length || prev.size === 0) {
        return new Set([type])
      }
      const next = new Set(prev)
      if (next.has(type)) {
        next.delete(type)
        // If none left, reset to all
        if (next.size === 0) return new Set(vehicleTypes)
      } else {
        next.add(type)
        // If all selected again, reset to "show all" (empty = no filter)
        if (next.size === vehicleTypes.length) return new Set(vehicleTypes)
      }
      return next
    })
  }

  // When pipeline resets (step 1 goes idle), clear focus
  useEffect(() => {
    if (status[1]?.status === 'idle') {
      setFocusedHub(null)
    }
  }, [status[1]?.status])

  const step4Done = status[4]?.status === 'done'
  const isAnyRunning = Object.values(status).some(s => s.status === 'running')

  return (
    <div className="flex h-screen bg-gray-950 text-white overflow-hidden">

      {/* ── Left sidebar ───────────────────────────────────────────────── */}
      <aside className="w-64 flex-shrink-0 flex flex-col bg-gray-900 border-r border-gray-800">
        <header className="px-4 py-3 border-b border-gray-800 flex-shrink-0">
          <h1 className="text-base font-bold text-white leading-tight">Pharma Logistics CH</h1>
          <p className="text-xs text-gray-500 mt-0.5">Schweizer Apothekenlogistik</p>
        </header>

        <PipelinePanel
          status={status}
          onRunStep={runStep}
          onReset={() => { reset(); setFocusedHub(null) }}
          loading={loading}
          error={error}
        />

        {/* ── Tab navigation ─────────────────────────────────────────────── */}
        <div className="px-3 py-3 border-t border-gray-800 flex-shrink-0 flex gap-1.5">
          <TabBtn active={view === 'map'}      onClick={() => setView('map')}      label="Karte"        icon="🗺" />
          <TabBtn active={view === 'summary'}  onClick={() => setView('summary')}  label="Analyse"      icon="📊"
                  disabled={!step4Done} title={!step4Done ? 'Verfügbar nach Schritt 4' : undefined} />
          <TabBtn active={view === 'settings'} onClick={() => setView('settings')} label="Einstellungen" icon="⚙️" />
        </div>
      </aside>

      {/* ── Main area ──────────────────────────────────────────────────── */}
      <main className="flex-1 relative overflow-hidden">

        {/* Map — always mounted, hidden when other views active */}
        <div className={view === 'map' ? 'absolute inset-0' : 'hidden'}>
          <MapView
            pipelineStatus={status}
            onFeatureSelect={setSelected}
            visibleLayers={visibleLayers}
            isAnyRunning={isAnyRunning}
            focusedHub={focusedHub}
            vehicleTypeFilter={vehicleTypeFilter}
          />

          {/* Layer toggle + legend */}
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

          {/* Focused hub banner */}
          {focusedHub && (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10
                            bg-blue-600/90 backdrop-blur rounded-full px-4 py-1.5 flex items-center gap-3 shadow-lg">
              <span className="text-xs text-white font-medium">Routen von: {focusedHub}</span>
              <button onClick={() => setFocusedHub(null)}
                      className="text-blue-200 hover:text-white text-xs">✕ Alle zeigen</button>
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
  )
}

function TabBtn({ active, onClick, label, icon, disabled, title }: {
  active: boolean; onClick: () => void; label: string; icon: string
  disabled?: boolean; title?: string
}) {
  return (
    <button
      onClick={onClick} disabled={disabled} title={title}
      className={`
        flex-1 flex items-center justify-center gap-1 text-xs py-2 rounded-lg
        font-medium transition-colors
        ${active
          ? 'bg-blue-600 text-white'
          : disabled
            ? 'text-gray-600 cursor-not-allowed'
            : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800'
        }
      `}
    >
      <span>{icon}</span>
      <span className="truncate">{label}</span>
    </button>
  )
}
