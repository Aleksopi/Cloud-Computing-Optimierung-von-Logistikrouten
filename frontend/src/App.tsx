import { useState } from 'react'
import { MapView } from './components/Map/MapView'
import { PipelinePanel } from './components/Pipeline/PipelinePanel'
import { InfoSidebar } from './components/Sidebar/InfoSidebar'
import { LayerToggle } from './components/Sidebar/LayerToggle'
import { usePipeline } from './hooks/usePipeline'
import type { SelectedFeature } from './types'

export default function App() {
  const { status, runStep, reset, loading, error } = usePipeline()
  const [selected, setSelected] = useState<SelectedFeature | null>(null)
  const [visibleLayers, setVisibleLayers] = useState(
    () => new Set(['pharmacies', 'hubs', 'assignments', 'routes']),
  )

  const toggleLayer = (layer: string) =>
    setVisibleLayers(prev => {
      const next = new Set(prev)
      next.has(layer) ? next.delete(layer) : next.add(layer)
      return next
    })

  return (
    <div className="flex h-screen bg-gray-950 text-white overflow-hidden">
      {/* ── Left sidebar ─────────────────────────────────────────────── */}
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
      </aside>

      {/* ── Map ──────────────────────────────────────────────────────── */}
      <main className="flex-1 relative">
        <MapView
          pipelineStatus={status}
          onFeatureSelect={setSelected}
          visibleLayers={visibleLayers}
        />

        {/* Layer toggles — bottom left */}
        <div className="absolute bottom-8 left-4 z-10">
          <LayerToggle
            visibleLayers={visibleLayers}
            pipelineStatus={status}
            onToggle={toggleLayer}
          />
        </div>

        {/* Feature info — top right */}
        {selected && (
          <div className="absolute top-4 right-4 z-10">
            <InfoSidebar feature={selected} onClose={() => setSelected(null)} />
          </div>
        )}
      </main>
    </div>
  )
}
