import { useCallback, useEffect, useRef } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import type { PipelineStatus, SelectedFeature } from '../../types'

interface MapViewProps {
  pipelineStatus: PipelineStatus
  onFeatureSelect: (f: SelectedFeature | null) => void
  visibleLayers: Set<string>
}

// ── Single map style (CartoDB Light + roads, inline — no external JSON fetch) ─

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

const DATA_SOURCES = ['assignments', 'routes', 'pharmacies', 'hubs'] as const
const CLICK_LAYERS = ['pharmacies-layer', 'hubs-layer', 'routes-layer'] as const
const EMPTY: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] }

interface CacheEntry {
  data?: GeoJSON.FeatureCollection
  fetching: boolean
  key?: string
}

// ── Component ─────────────────────────────────────────────────────────────────

export function MapView({ pipelineStatus, onFeatureSelect, visibleLayers }: MapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef       = useRef<maplibregl.Map | null>(null)
  const readyRef     = useRef(false)           // true once map.on('load') has fired
  const dataRef      = useRef<Record<string, GeoJSON.FeatureCollection>>({})

  // Always-current refs (no stale closures in callbacks)
  const onSelectRef  = useRef(onFeatureSelect)
  const visibleRef   = useRef(visibleLayers)
  onSelectRef.current = onFeatureSelect
  visibleRef.current  = visibleLayers

  // ── Init map (once) ───────────────────────────────────────────────────────
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
      // ── Add data sources (with any already-cached data) ───────────────
      for (const id of DATA_SOURCES) {
        map.addSource(id, { type: 'geojson', data: dataRef.current[id] ?? EMPTY })
      }

      // ── Paint layers (bottom → top) ───────────────────────────────────

      map.addLayer({
        id: 'assignments-layer', type: 'line', source: 'assignments',
        layout: { visibility: visibleRef.current.has('assignments') ? 'visible' : 'none' },
        paint: {
          'line-color': ['case',
            ['==', ['slice', ['get', 'hub_name'], 0, 2], 'VZ'], '#f97316', '#22c55e'],
          'line-width': 1.2, 'line-opacity': 0.5,
        },
      })

      map.addLayer({
        id: 'routes-layer', type: 'line', source: 'routes',
        layout: {
          visibility: visibleRef.current.has('routes') ? 'visible' : 'none',
          'line-join': 'round', 'line-cap': 'round',
        },
        paint: {
          'line-color': ['match', ['get', 'vehicle_type'], 'EVan', '#16a34a', '#2563eb'],
          'line-width': 3, 'line-opacity': 0.9,
        },
      })

      map.addLayer({
        id: 'pharmacies-layer', type: 'circle', source: 'pharmacies',
        layout: { visibility: visibleRef.current.has('pharmacies') ? 'visible' : 'none' },
        paint: {
          'circle-color': ['case', ['!=', ['get', 'demand'], null], '#3b82f6', '#94a3b8'],
          'circle-radius': [
            'interpolate', ['linear'], ['zoom'],
            6,  ['case', ['!=', ['get', 'demand'], null],
                  ['interpolate', ['linear'], ['get', 'demand'], 1, 2, 5, 3, 15, 5], 2],
            10, ['case', ['!=', ['get', 'demand'], null],
                  ['interpolate', ['linear'], ['get', 'demand'], 1, 4, 5, 7, 15, 12], 4],
          ],
          'circle-stroke-color': '#ffffff', 'circle-stroke-width': 1.5,
        },
      })

      map.addLayer({
        id: 'hubs-layer', type: 'circle', source: 'hubs',
        layout: { visibility: visibleRef.current.has('hubs') ? 'visible' : 'none' },
        paint: {
          'circle-color':        ['match', ['get', 'hub_type'], 'HQ', '#dc2626', 'VZ', '#ea580c', '#16a34a'],
          'circle-radius':       ['match', ['get', 'hub_type'], 'HQ', 16, 'VZ', 13, 9],
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
          'text-color':      ['match', ['get', 'hub_type'], 'HQ', '#dc2626', 'VZ', '#c2410c', '#15803d'],
          'text-halo-color': '#ffffff', 'text-halo-width': 2,
        },
      })

      // ── Event handlers (registered once here, never duplicated) ──────
      map.on('click', e => {
        const existing = [...CLICK_LAYERS].filter(l => !!map.getLayer(l))
        const feats = existing.length
          ? map.queryRenderedFeatures(e.point, { layers: existing })
          : []
        if (!feats.length) { onSelectRef.current(null); return }
        const lid  = feats[0].layer.id
        const type: SelectedFeature['type'] =
          lid === 'pharmacies-layer' ? 'pharmacy'
          : lid === 'hubs-layer'     ? 'hub'
          : 'route'
        onSelectRef.current({ type, properties: feats[0].properties as Record<string, unknown> })
      })

      map.on('mousemove', e => {
        const existing = [...CLICK_LAYERS].filter(l => !!map.getLayer(l))
        const feats = existing.length
          ? map.queryRenderedFeatures(e.point, { layers: existing })
          : []
        map.getCanvas().style.cursor = feats.length ? 'pointer' : ''
      })

      readyRef.current = true

      // Apply any data that arrived before the map was ready
      for (const id of DATA_SOURCES) {
        if (dataRef.current[id]) {
          (map.getSource(id) as maplibregl.GeoJSONSource).setData(dataRef.current[id])
        }
      }

      // Trigger fetches for any steps that were already done before the map loaded
      syncDataRef.current()
    })

    mapRef.current = map
    return () => {
      readyRef.current = false
      map.remove()
      mapRef.current = null
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Data loading ──────────────────────────────────────────────────────────
  //
  // Central syncData() is called from TWO places:
  //   1. useEffect([pipelineStatus]) — whenever status changes
  //   2. map.on('load') via syncDataRef — after map initialises
  //
  // This guarantees data is loaded regardless of which event arrives first.
  // Per-URL in-flight flag prevents duplicate concurrent requests.
  // On reset (step 1 → idle) cached data is cleared so fresh results show.

  const pipelineStatusRef = useRef(pipelineStatus)
  pipelineStatusRef.current = pipelineStatus

  // { url -> cached response }. Pipeline results use a step-based key so reruns
  // replace stale data instead of reusing an old empty FeatureCollection.
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

    // Reset: clear cached pipeline data when step 1 goes back to idle
    if (st(1) === 'idle') {
      for (const u of [
        '/api/results/pharmacies',
        '/api/results/pharmacies?demand=1',
        '/api/results/hubs',
        '/api/results/assignments',
        '/api/results/routes',
      ]) {
        if (cacheRef.current[u]) cacheRef.current[u] = { fetching: false }
      }
      for (const id of ['hubs', 'assignments', 'routes'] as const) {
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
    if (st(4) === 'done') fetchUrl('routes',      '/api/results/routes', resultKey(4))
  }, [fetchUrl])

  // Keep a ref so map.on('load') can call the latest version
  const syncDataRef = useRef(syncData)
  syncDataRef.current = syncData

  useEffect(() => { syncDataRef.current() }, [pipelineStatus])

  // ── Layer visibility ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!mapRef.current || !readyRef.current) return
    const map = mapRef.current
    const groups: Record<string, string[]> = {
      pharmacies:  ['pharmacies-layer'],
      hubs:        ['hubs-layer', 'hubs-labels'],
      assignments: ['assignments-layer'],
      routes:      ['routes-layer'],
    }
    for (const [key, ids] of Object.entries(groups)) {
      const vis = visibleLayers.has(key) ? 'visible' : 'none'
      for (const id of ids) {
        if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', vis)
      }
    }
  }, [visibleLayers])

  return <div ref={containerRef} className="w-full h-full" />
}
