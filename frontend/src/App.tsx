import { useState } from 'react'
import { MapView } from './components/Map/MapView'
import { PipelinePanel } from './components/Pipeline/PipelinePanel'
import { InfoSidebar } from './components/Sidebar/InfoSidebar'
import { LayerToggle } from './components/Sidebar/LayerToggle'
import { SummaryPage } from './components/Summary/SummaryPage'
import { usePipeline } from './hooks/usePipeline'
import type { SelectedFeature } from './types'

type View = 'map' | 'summary'

export default function App() {
  const { status, runStep, reset, loading, error } = usePipeline()
  const [selected, setSelected]     = useState<SelectedFeature | null>(null)
  const [view, setView]             = useState<View>('map')
  const [visibleLayers, setVisibleLayers] = useState(
    () => new Set(['pharmacies', 'hubs', 'assignments', 'backbone', 'routes']),
  )

  const toggleLayer = (layer: string) =>
    setVisibleLayers(prev => {
      const next = new Set(prev)
      next.has(layer) ? next.delete(layer) : next.add(layer)
      return next
    })

  const step4Done = status[4]?.status === 'done'

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
          onReset={reset}
          loading={loading}
          error={error}
        />

        {/* ── View tab switcher ─────────────────────────────────────────── */}
        <div className="px-3 py-3 border-t border-gray-800 flex-shrink-0 flex gap-1.5">
          <TabBtn
            active={view === 'map'}
            onClick={() => setView('map')}
            label="Karte"
            icon="🗺"
          />
          <TabBtn
            active={view === 'summary'}
            onClick={() => setView('summary')}
            label="Analyse"
            icon="📊"
            disabled={!step4Done}
            title={!step4Done ? 'Verfügbar nach Schritt 4' : undefined}
          />
        </div>
      </aside>

      {/* ── Main area ──────────────────────────────────────────────────── */}
      <main className="flex-1 relative overflow-hidden">

        {/* Map view — always mounted but hidden when summary is active */}
        <div className={view === 'map' ? 'absolute inset-0' : 'hidden'}>
          <MapView
            pipelineStatus={status}
            onFeatureSelect={setSelected}
            visibleLayers={visibleLayers}
            isAnyRunning={Object.values(status).some(s => s.status === 'running')}
          />

          <div className="absolute bottom-8 left-4 z-10">
            <LayerToggle
              visibleLayers={visibleLayers}
              pipelineStatus={status}
              onToggle={toggleLayer}
            />
          </div>

          {selected && (
            <div className="absolute top-4 right-4 z-10">
              <InfoSidebar feature={selected} onClose={() => setSelected(null)} />
            </div>
          )}
        </div>

        {/* Summary view */}
        {view === 'summary' && (
          <div className="absolute inset-0">
            <SummaryPage pipelineStatus={status} />
          </div>
        )}

      </main>
    </div>
  )
}

function TabBtn({ active, onClick, label, icon, disabled, title }: {
  active: boolean
  onClick: () => void
  label: string
  icon: string
  disabled?: boolean
  title?: string
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`
        flex-1 flex items-center justify-center gap-1.5 text-xs py-2 rounded-lg
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
      <span>{label}</span>
    </button>
  )
}
