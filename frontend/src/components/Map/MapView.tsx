import { useCallback, useEffect, useRef } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import type { PipelineStatus, SelectedFeature } from '../../types'

// ── Colorblind-safe palette ───────────────────────────────────────────────────
export const COLORS = {
  hqFill:          '#7c3aed', // violet  — Hauptquartier
  vzFill:          '#0369a1', // deep blue — Verteilzentrum
  mvzFill:         '#d97706', // amber   — Mini-VZ
  assignmentVz:    '#0369a1',
  assignmentMvz:   '#d97706',
  sprinterRoute:   '#0891b2', // cyan    — Sprinter last-mile
  lkwRoute:        '#7c3aed', // violet  — LKW last-mile
  backboneHqVz:    '#dc2626', // red     — HQ → VZ (main artery)
  backboneVzMvz:   '#0d9488', // teal    — VZ → mVZ (regional)
  backbone:        '#94a3b8', // slate   — generic backbone color
  pharmacy:        '#3b82f6', // blue
  pharmacyNone:    '#64748b',
} as const

interface MapViewProps {
  pipelineStatus:   PipelineStatus
  onFeatureSelect:  (f: SelectedFeature | null) => void
  visibleLayers:    Set<string>
  isAnyRunning:     boolean
  focusedHub:       string | null
  vehicleTypeFilter: Set<string>  // empty = show all
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
      attribution: '© <a href="https://carto.com/">CARTO</a> © OpenStreetMap',
      maxzoom: 19,
    },
  },
  layers: [{ id: 'carto-base', type: 'raster', source: 'carto' }],
}

const DATA_SOURCES  = ['assignments', 'backbone', 'routes', 'pharmacies', 'hubs'] as const
const CLICK_LAYERS  = ['pharmacies-layer', 'hubs-layer', 'routes-layer',
                       'backbone-hq-vz-layer', 'backbone-vz-mvz-layer'] as const
const EMPTY: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] }

interface CacheEntry { data?: GeoJSON.FeatureCollection; fetching: boolean; key?: string }

export function MapView({
  pipelineStatus, onFeatureSelect, visibleLayers,
  isAnyRunning, focusedHub, vehicleTypeFilter,
}: MapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef       = useRef<maplibregl.Map | null>(null)
  const readyRef     = useRef(false)
  const dataRef      = useRef<Record<string, GeoJSON.FeatureCollection>>({})
  const popupRef     = useRef<maplibregl.Popup | null>(null)

  const onSelectRef        = useRef(onFeatureSelect)
  const visibleRef         = useRef(visibleLayers)
  const focusedHubRef      = useRef(focusedHub)
  const vehicleFilterRef   = useRef(vehicleTypeFilter)
  onSelectRef.current      = onFeatureSelect
  visibleRef.current       = visibleLayers
  focusedHubRef.current    = focusedHub
  vehicleFilterRef.current = vehicleTypeFilter

  // ── Init map ───────────────────────────────────────────────────────────────
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

      // ── Backbone: HQ → VZ  (red, thick, solid) ──────────────────────────
      map.addLayer({
        id: 'backbone-hq-vz-layer', type: 'line', source: 'backbone',
        filter: ['==', ['get', 'backbone_tier'], 'hq_vz'],
        layout: {
          visibility: visibleRef.current.has('backbone') ? 'visible' : 'none',
          'line-join': 'round', 'line-cap': 'round',
        },
        paint: { 'line-color': COLORS.backboneHqVz, 'line-width': 4, 'line-opacity': 0.85 },
      })

      // ── Backbone: VZ → mVZ  (teal, dashed) ──────────────────────────────
      map.addLayer({
        id: 'backbone-vz-mvz-layer', type: 'line', source: 'backbone',
        filter: ['==', ['get', 'backbone_tier'], 'vz_mvz'],
        layout: {
          visibility: visibleRef.current.has('backbone') ? 'visible' : 'none',
          'line-join': 'round', 'line-cap': 'round',
        },
        paint: {
          'line-color': COLORS.backboneVzMvz,
          'line-width': 2.5, 'line-opacity': 0.8,
          'line-dasharray': [6, 4],
        },
      })

      // ── Assignment lines  (hub → pharmacy) ──────────────────────────────
      map.addLayer({
        id: 'assignments-layer', type: 'line', source: 'assignments',
        layout: { visibility: visibleRef.current.has('assignments') ? 'visible' : 'none' },
        paint: {
          'line-color': ['case',
            ['==', ['slice', ['get', 'hub_name'], 0, 2], 'VZ'], COLORS.assignmentVz, COLORS.assignmentMvz],
          'line-width': 1.2, 'line-opacity': 0.4,
        },
      })

      // ── Last-mile vehicle routes ─────────────────────────────────────────
      map.addLayer({
        id: 'routes-layer', type: 'line', source: 'routes',
        layout: {
          visibility: visibleRef.current.has('routes') ? 'visible' : 'none',
          'line-join': 'round', 'line-cap': 'round',
        },
        paint: {
          // Default: cyan for Sprinter, violet for LKW, blue fallback
          'line-color': ['match', ['get', 'vehicle_type'],
            'Sprinter', COLORS.sprinterRoute,
            'LKW',      COLORS.lkwRoute,
            '#3b82f6'   // fallback for any added vehicle type
          ],
          'line-width': 3, 'line-opacity': 0.9,
        },
      })

      // ── Pharmacies ───────────────────────────────────────────────────────
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

      // ── Hubs ─────────────────────────────────────────────────────────────
      map.addLayer({
        id: 'hubs-layer', type: 'circle', source: 'hubs',
        layout: { visibility: visibleRef.current.has('hubs') ? 'visible' : 'none' },
        paint: {
          'circle-color': ['match', ['get', 'hub_type'],
            'HQ', COLORS.hqFill, 'VZ', COLORS.vzFill, COLORS.mvzFill],
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
          'text-color': ['match', ['get', 'hub_type'],
            'HQ', COLORS.hqFill, 'VZ', COLORS.vzFill, COLORS.mvzFill],
          'text-halo-color': '#ffffff', 'text-halo-width': 2,
        },
      })

      // ── Hover tooltip ────────────────────────────────────────────────────
      popupRef.current = new maplibregl.Popup({
        closeButton: false, closeOnClick: false,
        offset: 14, maxWidth: '260px', className: 'map-tooltip',
      })

      map.on('mousemove', e => {
        const existing = [...CLICK_LAYERS].filter(l => !!map.getLayer(l))
        const feats = existing.length
          ? map.queryRenderedFeatures(e.point, { layers: existing }) : []

        if (!feats.length) {
          map.getCanvas().style.cursor = ''
          popupRef.current?.remove()
          return
        }

        map.getCanvas().style.cursor = 'pointer'
        const feat = feats[0]
        const p    = feat.properties as Record<string, unknown>
        let html   = ''

        if (feat.layer.id === 'pharmacies-layer') {
          html = `<strong>${p.name || 'Apotheke'}</strong>`
          if (p.city) html += `<br/>${p.city}`
          if (p.hub_name) html += `<br/>Hub: <b>${p.hub_name}</b>`
          if (p.demand != null) html += `<br/>Bedarf: ${p.demand} Einheiten`
        } else if (feat.layer.id === 'hubs-layer') {
          const tl = p.hub_type === 'HQ' ? 'Hauptquartier' : p.hub_type === 'VZ' ? 'Verteilzentrum' : 'Mini-VZ'
          html = `<strong>${p.name}</strong><br/>${tl}`
          if (p.parent_hub) html += `<br/>Übergeordnet: ${p.parent_hub}`
          if (p.delivery_window) html += `<br/>Liefert: ${p.delivery_window}`
        } else if (feat.layer.id === 'routes-layer') {
          html = `<strong>${p.vehicle_id}</strong>`
          html += `<br/>${p.vehicle_type} · ${p.stop_count} Stops`
          html += `<br/>${p.total_km} km · ${(p.total_hours as number)?.toFixed(1)} h`
          html += `<br/>CHF ${p.total_cost_chf}`
        } else if (feat.layer.id === 'backbone-hq-vz-layer') {
          html = `<strong>HQ → VZ Versorgung</strong><br/>${p.vehicle_id}`
          html += `<br/>${p.total_km} km · ${p.total_items} Einheiten`
        } else if (feat.layer.id === 'backbone-vz-mvz-layer') {
          html = `<strong>VZ → mVZ Versorgung</strong><br/>${p.vehicle_id}`
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

      map.on('click', e => {
        const existing = [...CLICK_LAYERS].filter(l => !!map.getLayer(l))
        const feats = existing.length
          ? map.queryRenderedFeatures(e.point, { layers: existing }) : []
        if (!feats.length) { onSelectRef.current(null); return }
        const lid  = feats[0].layer.id
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
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(`${r.status}`))))
      .then((data: GeoJSON.FeatureCollection) => {
        if (cacheRef.current[url] !== entry) return
        entry.fetching = false; entry.data = data
        putOnMap(srcId, data)
      })
      .catch(err => {
        if (cacheRef.current[url] === entry) entry.fetching = false
        console.warn(`Map data load failed (${url}):`, err)
      })
  }, [putOnMap])

  const syncData = useCallback(() => {
    const s  = pipelineStatusRef.current
    const st = (n: number) => s[n]?.status ?? 'idle'
    const rk = (n: number) => `${st(n)}:${s[n]?.finished_at ?? s[n]?.started_at ?? 'none'}`

    if (st(1) === 'idle') {
      for (const u of ['/api/results/pharmacies', '/api/results/pharmacies?demand=1',
                        '/api/results/hubs', '/api/results/assignments',
                        '/api/results/routes', '/api/results/backbone']) {
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
      ? '/api/results/pharmacies?demand=1' : '/api/results/pharmacies'
    fetchUrl('pharmacies', pharmacyUrl, `ph:${rk(1)}:${rk(3)}`)
    if (st(1) === 'done') fetchUrl('hubs', '/api/results/hubs', rk(1))
    if (st(2) === 'done') fetchUrl('assignments', '/api/results/assignments', rk(2))
    if (st(4) === 'done') {
      fetchUrl('routes',   '/api/results/routes',   rk(4))
      fetchUrl('backbone', '/api/results/backbone', rk(4))
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
      backbone:    ['backbone-hq-vz-layer', 'backbone-vz-mvz-layer'],
      routes:      ['routes-layer'],
    }
    for (const [key, ids] of Object.entries(groups)) {
      const vis = visibleLayers.has(key) ? 'visible' : 'none'
      for (const id of ids) {
        if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', vis)
      }
    }
  }, [visibleLayers])

  // ── Hub focus + vehicle type filter on routes-layer ────────────────────────
  useEffect(() => {
    if (!mapRef.current || !readyRef.current) return
    const map = mapRef.current
    if (!map.getLayer('routes-layer')) return

    // Build combined filter
    const conditions: maplibregl.FilterSpecification[] = []
    if (focusedHub) {
      conditions.push(['==', ['get', 'hub_name'], focusedHub] as maplibregl.FilterSpecification)
    }
    if (vehicleTypeFilter.size > 0) {
      conditions.push(['in', ['get', 'vehicle_type'], ['literal', [...vehicleTypeFilter]]] as maplibregl.FilterSpecification)
    }

    const filter: maplibregl.FilterSpecification | null =
      conditions.length === 0 ? null
      : conditions.length === 1 ? conditions[0]
      : ['all', ...conditions] as maplibregl.FilterSpecification

    map.setFilter('routes-layer', filter ?? undefined)
  }, [focusedHub, vehicleTypeFilter])

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
