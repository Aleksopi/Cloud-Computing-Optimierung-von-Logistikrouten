import { useCallback, useEffect, useRef } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import type { PipelineStatus, SelectedFeature } from '../../types'

// ── Colorblind-safe palette (blue / amber / violet — avoids red-green) ────────
export const COLORS = {
  hqFill:         '#7c3aed', // violet
  vzFill:         '#0369a1', // deep blue
  mvzFill:        '#d97706', // amber
  assignmentVz:   '#0369a1',
  assignmentMvz:  '#d97706',
  evanRoute:      '#0891b2', // cyan/teal
  lkwRoute:       '#7c3aed', // violet
  backbone:       '#94a3b8', // slate gray
  pharmacy:       '#3b82f6', // blue
  pharmacyNone:   '#64748b',
} as const

interface MapViewProps {
  pipelineStatus: PipelineStatus
  onFeatureSelect: (f: SelectedFeature | null) => void
  visibleLayers: Set<string>
  isAnyRunning: boolean
}

const MAP_STYLE: maplibregl.StyleSpecification = {
  version: 8,
  glyphs: 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf',
  sources: {
    carto: {
      type: 'raster',
      tiles: [
        'https://a.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png',
        'https://b.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png',
        'https://c.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png',
      ],
      tileSize: 256,
      attribution: '© <a href="https://carto.com/">CARTO</a> © <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxzoom: 19,
    },
  },
  layers: [{ id: 'carto-base', type: 'raster', source: 'carto' }],
}

const DATA_SOURCES = ['assignments', 'backbone', 'routes', 'pharmacies', 'hubs'] as const
const CLICK_LAYERS = ['pharmacies-layer', 'hubs-layer', 'routes-layer', 'backbone-layer'] as const
const EMPTY: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] }

interface CacheEntry {
  data?: GeoJSON.FeatureCollection
  fetching: boolean
  key?: string
}

export function MapView({ pipelineStatus, onFeatureSelect, visibleLayers, isAnyRunning }: MapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef       = useRef<maplibregl.Map | null>(null)
  const readyRef     = useRef(false)
  const dataRef      = useRef<Record<string, GeoJSON.FeatureCollection>>({})
  const popupRef     = useRef<maplibregl.Popup | null>(null)

  const onSelectRef  = useRef(onFeatureSelect)
  const visibleRef   = useRef(visibleLayers)
  onSelectRef.current = onFeatureSelect
  visibleRef.current  = visibleLayers

  // ── Init map (once) ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current) return

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: MAP_STYLE,
      center: [8.2275, 46.8182],
      zoom: 7.5,
    })

    map.addControl(new maplibregl.NavigationControl(), 'top-right')
    map.addControl(new maplibregl.ScaleControl({ unit: 'metric' }), 'bottom-right')

    map.on('load', () => {
      for (const id of DATA_SOURCES) {
        map.addSource(id, { type: 'geojson', data: dataRef.current[id] ?? EMPTY })
      }

      // ── Layers bottom → top ───────────────────────────────────────────────

      // Backbone supply chain (dashed, behind everything)
      map.addLayer({
        id: 'backbone-layer', type: 'line', source: 'backbone',
        layout: {
          visibility: visibleRef.current.has('backbone') ? 'visible' : 'none',
          'line-join': 'round', 'line-cap': 'round',
        },
        paint: {
          'line-color': COLORS.backbone,
          'line-width': 2.5,
          'line-opacity': 0.75,
          'line-dasharray': [5, 4],
        },
      })

      // Assignment lines (hub → pharmacy)
      map.addLayer({
        id: 'assignments-layer', type: 'line', source: 'assignments',
        layout: { visibility: visibleRef.current.has('assignments') ? 'visible' : 'none' },
        paint: {
          'line-color': ['case',
            ['==', ['slice', ['get', 'hub_name'], 0, 2], 'VZ'], COLORS.assignmentVz, COLORS.assignmentMvz],
          'line-width': 1.2, 'line-opacity': 0.45,
        },
      })

      // Last-mile vehicle routes
      map.addLayer({
        id: 'routes-layer', type: 'line', source: 'routes',
        layout: {
          visibility: visibleRef.current.has('routes') ? 'visible' : 'none',
          'line-join': 'round', 'line-cap': 'round',
        },
        paint: {
          'line-color': ['match', ['get', 'vehicle_type'], 'EVan', COLORS.evanRoute, COLORS.lkwRoute],
          'line-width': 3, 'line-opacity': 0.9,
        },
      })

      // Pharmacies
      map.addLayer({
        id: 'pharmacies-layer', type: 'circle', source: 'pharmacies',
        layout: { visibility: visibleRef.current.has('pharmacies') ? 'visible' : 'none' },
        paint: {
          'circle-color': ['case', ['has', 'demand'], COLORS.pharmacy, COLORS.pharmacyNone],
          'circle-radius': [
            'interpolate', ['linear'], ['zoom'],
            6,  ['case', ['has', 'demand'],
                  ['interpolate', ['linear'], ['get', 'demand'], 1, 2, 5, 3, 15, 5], 2],
            10, ['case', ['has', 'demand'],
                  ['interpolate', ['linear'], ['get', 'demand'], 1, 4, 5, 7, 15, 12], 4],
          ],
          'circle-stroke-color': '#ffffff', 'circle-stroke-width': 1.5,
        },
      })

      // Hubs (top, always visible)
      map.addLayer({
        id: 'hubs-layer', type: 'circle', source: 'hubs',
        layout: { visibility: visibleRef.current.has('hubs') ? 'visible' : 'none' },
        paint: {
          'circle-color': ['match', ['get', 'hub_type'], 'HQ', COLORS.hqFill, 'VZ', COLORS.vzFill, COLORS.mvzFill],
          'circle-radius': ['match', ['get', 'hub_type'], 'HQ', 16, 'VZ', 13, 9],
          'circle-stroke-color': '#ffffff',
          'circle-stroke-width': ['match', ['get', 'hub_type'], 'HQ', 3, 'VZ', 2.5, 2],
        },
      })

      map.addLayer({
        id: 'hubs-labels', type: 'symbol', source: 'hubs',
        layout: {
          visibility: visibleRef.current.has('hubs') ? 'visible' : 'none',
          'text-field':  ['get', 'name'],
          'text-size':   ['match', ['get', 'hub_type'], 'HQ', 13, 'VZ', 12, 10],
          'text-offset': [0, 1.8], 'text-anchor': 'top',
          'text-font':   ['Open Sans Semibold'],
          'text-allow-overlap': false,
        },
        paint: {
          'text-color':      ['match', ['get', 'hub_type'], 'HQ', COLORS.hqFill, 'VZ', COLORS.vzFill, COLORS.mvzFill],
          'text-halo-color': '#ffffff', 'text-halo-width': 2,
        },
      })

      // ── Hover tooltip ─────────────────────────────────────────────────────
      popupRef.current = new maplibregl.Popup({
        closeButton: false,
        closeOnClick: false,
        offset: 14,
        maxWidth: '240px',
        className: 'map-tooltip',
      })

      map.on('mousemove', e => {
        const existing = [...CLICK_LAYERS].filter(l => !!map.getLayer(l))
        const feats = existing.length
          ? map.queryRenderedFeatures(e.point, { layers: existing })
          : []

        if (!feats.length) {
          map.getCanvas().style.cursor = ''
          popupRef.current?.remove()
          return
        }

        map.getCanvas().style.cursor = 'pointer'
        const feat = feats[0]
        const p = feat.properties as Record<string, unknown>
        let html = ''

        if (feat.layer.id === 'pharmacies-layer') {
          html = `<strong>${p.name || 'Apotheke'}</strong>`
          if (p.city) html += `<br/>${p.city}`
          if (p.hub_name) html += `<br/>Hub: ${p.hub_name}`
          if (p.demand != null) html += `<br/>Bedarf: ${p.demand} Einheiten`
        } else if (feat.layer.id === 'hubs-layer') {
          const typeLabel = p.hub_type === 'HQ' ? 'Hauptquartier' : p.hub_type === 'VZ' ? 'Verteilzentrum' : 'Mini-VZ'
          html = `<strong>${p.name}</strong><br/>${typeLabel}`
          if (p.parent_hub) html += `<br/>Übergeordnet: ${p.parent_hub}`
        } else if (feat.layer.id === 'routes-layer') {
          html = `<strong>${p.vehicle_id}</strong>`
          html += `<br/>${p.vehicle_type} · ${p.stop_count} Stops`
          html += `<br/>${p.total_km} km · ${(p.total_hours as number)?.toFixed(1)} h`
          html += `<br/>CHF ${p.total_cost_chf}`
        } else if (feat.layer.id === 'backbone-layer') {
          html = `<strong>Lieferkette</strong><br/>${p.vehicle_id}`
          html += `<br/>${p.total_km} km · ${p.total_items} Einheiten`
        }

        popupRef.current
          ?.setLngLat(e.lngLat)
          .setHTML(`<div style="font-size:12px;line-height:1.6;color:#1e293b">${html}</div>`)
          .addTo(map)
      })

      map.on('mouseleave', () => {
        map.getCanvas().style.cursor = ''
        popupRef.current?.remove()
      })

      // ── Click handler ─────────────────────────────────────────────────────
      map.on('click', e => {
        const existing = [...CLICK_LAYERS].filter(l => !!map.getLayer(l))
        const feats = existing.length
          ? map.queryRenderedFeatures(e.point, { layers: existing })
          : []
        if (!feats.length) { onSelectRef.current(null); return }
        const lid = feats[0].layer.id
        const type: SelectedFeature['type'] =
          lid === 'pharmacies-layer' ? 'pharmacy'
          : lid === 'hubs-layer'     ? 'hub'
          : 'route'
        onSelectRef.current({ type, properties: feats[0].properties as Record<string, unknown> })
      })

      readyRef.current = true

      for (const id of DATA_SOURCES) {
        if (dataRef.current[id]) {
          (map.getSource(id) as maplibregl.GeoJSONSource).setData(dataRef.current[id])
        }
      }

      syncDataRef.current()
    })

    mapRef.current = map
    return () => {
      readyRef.current = false
      popupRef.current?.remove()
      map.remove()
      mapRef.current = null
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Data loading ───────────────────────────────────────────────────────────
  const pipelineStatusRef = useRef(pipelineStatus)
  pipelineStatusRef.current = pipelineStatus

  const cacheRef = useRef<Record<string, CacheEntry>>({})

  const putOnMap = useCallback((srcId: string, data: GeoJSON.FeatureCollection) => {
    dataRef.current[srcId] = data
    if (readyRef.current && mapRef.current) {
      const src = mapRef.current.getSource(srcId) as maplibregl.GeoJSONSource | undefined
      src?.setData(data)
    }
  }, [])

  const fetchUrl = useCallback((srcId: string, url: string, key = url) => {
    const cached = cacheRef.current[url]
    if (cached?.data && cached.key === key) { putOnMap(srcId, cached.data); return }
    if (cached?.fetching && cached.key === key) return

    const entry: CacheEntry = { fetching: true, key }
    cacheRef.current[url] = entry

    fetch(url, { cache: 'no-store' })
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(`${r.status} ${r.statusText}`))))
      .then((data: GeoJSON.FeatureCollection) => {
        if (cacheRef.current[url] !== entry) return
        entry.fetching = false
        entry.data = data
        putOnMap(srcId, data)
      })
      .catch(error => {
        if (cacheRef.current[url] === entry) entry.fetching = false
        console.warn(`Failed to load map data from ${url}`, error)
      })
  }, [putOnMap])

  const syncData = useCallback(() => {
    const s = pipelineStatusRef.current
    const st = (n: number) => s[n]?.status ?? 'idle'
    const resultKey = (step: number) =>
      `${st(step)}:${s[step]?.finished_at ?? s[step]?.started_at ?? 'none'}`

    if (st(1) === 'idle') {
      for (const u of [
        '/api/results/pharmacies',
        '/api/results/pharmacies?demand=1',
        '/api/results/hubs',
        '/api/results/assignments',
        '/api/results/routes',
        '/api/results/backbone',
      ]) {
        if (cacheRef.current[u]) cacheRef.current[u] = { fetching: false }
      }
      for (const id of ['hubs', 'assignments', 'backbone', 'routes'] as const) {
        delete dataRef.current[id]
        if (readyRef.current && mapRef.current?.getSource(id)) {
          (mapRef.current.getSource(id) as maplibregl.GeoJSONSource).setData(EMPTY)
        }
      }
    }

    const pharmacyUrl = st(3) === 'done'
      ? '/api/results/pharmacies?demand=1'
      : '/api/results/pharmacies'

    fetchUrl('pharmacies', pharmacyUrl, `pharmacies:${resultKey(1)}:${resultKey(3)}`)
    if (st(1) === 'done') fetchUrl('hubs', '/api/results/hubs', resultKey(1))
    if (st(2) === 'done') fetchUrl('assignments', '/api/results/assignments', resultKey(2))
    if (st(4) === 'done') {
      fetchUrl('routes',   '/api/results/routes',   resultKey(4))
      fetchUrl('backbone', '/api/results/backbone', resultKey(4))
    }
  }, [fetchUrl])

  const syncDataRef = useRef(syncData)
  syncDataRef.current = syncData

  useEffect(() => { syncDataRef.current() }, [pipelineStatus])

  // ── Layer visibility ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!mapRef.current || !readyRef.current) return
    const map = mapRef.current
    const groups: Record<string, string[]> = {
      pharmacies:  ['pharmacies-layer'],
      hubs:        ['hubs-layer', 'hubs-labels'],
      assignments: ['assignments-layer'],
      backbone:    ['backbone-layer'],
      routes:      ['routes-layer'],
    }
    for (const [key, ids] of Object.entries(groups)) {
      const vis = visibleLayers.has(key) ? 'visible' : 'none'
      for (const id of ids) {
        if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', vis)
      }
    }
  }, [visibleLayers])

  return (
    <div className="w-full h-full relative">
      <div ref={containerRef} className="w-full h-full" />
      {isAnyRunning && (
        <div className="absolute top-0 left-0 right-0 h-1 z-20 overflow-hidden bg-gray-800">
          <div className="h-full bg-blue-500 animate-[loading-bar_1.5s_ease-in-out_infinite]" />
        </div>
      )}
    </div>
  )
}
