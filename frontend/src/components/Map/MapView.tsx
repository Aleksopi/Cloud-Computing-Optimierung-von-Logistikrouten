import { useEffect, useRef, useState } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import type { PipelineStatus, SelectedFeature } from '../../types'

interface MapViewProps {
  pipelineStatus: PipelineStatus
  onFeatureSelect: (f: SelectedFeature | null) => void
  visibleLayers: Set<string>
}

const EMPTY_FC: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] }

// Layer render order (bottom → top)
const LAYER_ORDER = ['assignments', 'routes', 'pharmacies', 'hubs'] as const

export function MapView({ pipelineStatus, onFeatureSelect, visibleLayers }: MapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)
  const [mapReady, setMapReady] = useState(false)
  // Track which data versions we've loaded to avoid redundant fetches
  const loadedRef = useRef<Record<string, string>>({})

  // ── Init map ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current) return
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: {
        version: 8,
        glyphs: 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf',
        sources: {
          osm: {
            type: 'raster',
            tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
            tileSize: 256,
            attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
          },
        },
        layers: [{ id: 'osm-tiles', type: 'raster', source: 'osm' }],
      },
      center: [8.2275, 46.8182],
      zoom: 7.5,
    })

    map.addControl(new maplibregl.NavigationControl(), 'top-right')
    map.addControl(new maplibregl.ScaleControl({ unit: 'metric' }), 'bottom-right')

    map.on('load', () => {
      // Add all sources as empty upfront to control layer order
      for (const id of LAYER_ORDER) {
        map.addSource(id, { type: 'geojson', data: EMPTY_FC })
      }

      // Assignments: thin coloured lines (hub influence zones)
      map.addLayer({
        id: 'assignments-layer',
        type: 'line',
        source: 'assignments',
        paint: {
          'line-color': [
            'case',
            ['==', ['slice', ['get', 'hub_name'], 0, 2], 'VZ'], '#f97316',
            '#22c55e',
          ],
          'line-width': 1.2,
          'line-opacity': 0.55,
        },
      })

      // Routes: thicker vehicle route lines
      map.addLayer({
        id: 'routes-layer',
        type: 'line',
        source: 'routes',
        paint: {
          'line-color': ['match', ['get', 'vehicle_type'], 'EVan', '#16a34a', '#2563eb'],
          'line-width': 2.5,
          'line-opacity': 0.85,
        },
      })

      // Pharmacies: blue/grey circles, size scales with demand
      map.addLayer({
        id: 'pharmacies-layer',
        type: 'circle',
        source: 'pharmacies',
        paint: {
          'circle-color': [
            'case',
            ['!=', ['get', 'demand'], null], '#3b82f6',
            '#94a3b8',
          ],
          'circle-radius': [
            'case',
            ['!=', ['get', 'demand'], null],
            ['interpolate', ['linear'], ['get', 'demand'], 1, 4, 5, 7, 15, 11],
            5,
          ],
          'circle-stroke-color': '#fff',
          'circle-stroke-width': 1,
        },
      })

      // Hubs: large coloured circles by type
      map.addLayer({
        id: 'hubs-layer',
        type: 'circle',
        source: 'hubs',
        paint: {
          'circle-color': [
            'match', ['get', 'hub_type'],
            'HQ', '#dc2626',
            'VZ', '#ea580c',
            '#16a34a',
          ],
          'circle-radius': ['match', ['get', 'hub_type'], 'HQ', 14, 'VZ', 12, 8],
          'circle-stroke-color': '#fff',
          'circle-stroke-width': 2.5,
        },
      })

      // Click handlers
      map.on('click', 'pharmacies-layer', e => {
        if (e.features?.[0]) onFeatureSelect({ type: 'pharmacy', properties: e.features[0].properties as Record<string, unknown> })
      })
      map.on('click', 'hubs-layer', e => {
        if (e.features?.[0]) onFeatureSelect({ type: 'hub', properties: e.features[0].properties as Record<string, unknown> })
      })
      map.on('click', 'routes-layer', e => {
        if (e.features?.[0]) onFeatureSelect({ type: 'route', properties: e.features[0].properties as Record<string, unknown> })
      })
      map.on('click', e => {
        const hit = map.queryRenderedFeatures(e.point, {
          layers: ['pharmacies-layer', 'hubs-layer', 'routes-layer'],
        })
        if (hit.length === 0) onFeatureSelect(null)
      })

      for (const layer of ['pharmacies-layer', 'hubs-layer', 'routes-layer']) {
        map.on('mouseenter', layer, () => { map.getCanvas().style.cursor = 'pointer' })
        map.on('mouseleave', layer, () => { map.getCanvas().style.cursor = '' })
      }

      setMapReady(true)
    })

    mapRef.current = map
    return () => map.remove()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Load / refresh data as pipeline steps complete ────────────────────────
  useEffect(() => {
    if (!mapReady || !mapRef.current) return
    const map = mapRef.current

    const setSource = (id: string, url: string) => {
      fetch(url)
        .then(r => r.json())
        .then(data => (map.getSource(id) as maplibregl.GeoJSONSource)?.setData(data))
        .catch(() => {})
    }

    // Pharmacies: always load
    const pKey = 'pharmacies'
    if (loadedRef.current[pKey] !== 'loaded') {
      setSource('pharmacies', '/api/results/pharmacies')
      loadedRef.current[pKey] = 'loaded'
    }

    // Hubs: after step 1
    if (pipelineStatus[1]?.status === 'done' && loadedRef.current['hubs'] !== 'done') {
      setSource('hubs', '/api/results/hubs')
      loadedRef.current['hubs'] = 'done'
    }

    // Assignments: after step 2
    if (pipelineStatus[2]?.status === 'done' && loadedRef.current['assignments'] !== 'done') {
      setSource('assignments', '/api/results/assignments')
      loadedRef.current['assignments'] = 'done'
    }

    // Routes: after step 4
    if (pipelineStatus[4]?.status === 'done' && loadedRef.current['routes'] !== 'done') {
      setSource('routes', '/api/results/routes')
      loadedRef.current['routes'] = 'done'
    }

    // Refresh pharmacies after step 3 to pick up demand values
    if (pipelineStatus[3]?.status === 'done' && loadedRef.current['pharmacies-demand'] !== 'done') {
      setSource('pharmacies', '/api/results/pharmacies')
      loadedRef.current['pharmacies-demand'] = 'done'
    }
  }, [mapReady, pipelineStatus])

  // ── Layer visibility ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!mapReady || !mapRef.current) return
    const map = mapRef.current
    const layerMap: Record<string, string> = {
      pharmacies: 'pharmacies-layer',
      hubs: 'hubs-layer',
      assignments: 'assignments-layer',
      routes: 'routes-layer',
    }
    for (const [key, layerId] of Object.entries(layerMap)) {
      if (map.getLayer(layerId)) {
        map.setLayoutProperty(layerId, 'visibility', visibleLayers.has(key) ? 'visible' : 'none')
      }
    }
  }, [mapReady, visibleLayers])

  return <div ref={containerRef} className="w-full h-full" />
}
