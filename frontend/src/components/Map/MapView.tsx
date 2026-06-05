import { useCallback, useEffect, useRef } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import type { PipelineStatus, SelectedFeature, HighlightState } from '../../types'

// ── Colorblind-safe palette ───────────────────────────────────────────────────
export const COLORS = {
  hqFill:          '#7c3aed', // violet
  vzFill:          '#0369a1', // deep blue
  mvzFill:         '#d97706', // amber
  assignmentVz:    '#0369a1',
  assignmentMvz:   '#d97706',
  sprinterRoute:   '#0891b2', // cyan
  kleinLkwRoute:   '#16a34a', // green
  lkwRoute:        '#7c3aed', // violet
  zugRoute:        '#db2777', // pink
  routeFallback:   '#3b82f6',
  backboneHqVz:    '#dc2626', // red    — HQ → VZ
  backboneVzMvz:   '#0d9488', // teal   — VZ → mVZ
  backbone:        '#94a3b8',
  pharmacy:        '#3b82f6',
  pharmacyNone:    '#64748b',
} as const

// Stable color per vehicle type (for routes-layer match expression)
export const VEHICLE_ROUTE_COLOR: Array<[string, string]> = [
  ['Sprinter',  COLORS.sprinterRoute],
  ['Klein-LKW', COLORS.kleinLkwRoute],
  ['LKW',       COLORS.lkwRoute],
  ['Zug',       COLORS.zugRoute],
]

const DIM = 0.07

interface MapViewProps {
  pipelineStatus:    PipelineStatus
  onFeatureSelect:   (f: SelectedFeature | null) => void
  visibleLayers:     Set<string>
  isAnyRunning:      boolean
  focusedHub:        string | null
  focusedVehicleId:  string | null      // show only this vehicle's route
  focusedPharmacyId: number | null      // show only this pharmacy's assignment
  vehicleTypeFilter: Set<string>
  highlight:         HighlightState | null
}

const MAP_STYLE: maplibregl.StyleSpecification = {
  version: 8,
  glyphs: 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf',
  sources: {
    carto: {
      type: 'raster',
      tiles: [
        'https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png',
        'https://b.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png',
        'https://c.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png',
      ],
      tileSize: 256,
      attribution: '© <a href="https://carto.com/">CARTO</a> © OpenStreetMap',
      maxzoom: 19,
    },
  },
  layers: [{ id: 'carto-base', type: 'raster', source: 'carto' }],
}

const DATA_SOURCES = ['assignments', 'backbone', 'routes', 'pharmacies', 'hubs'] as const
const CLICK_LAYERS = ['pharmacies-layer', 'hubs-layer', 'routes-layer',
                      'backbone-hq-vz-layer', 'backbone-vz-mvz-layer'] as const
const EMPTY: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] }

interface CacheEntry { data?: GeoJSON.FeatureCollection; fetching: boolean; key?: string }

export function MapView({
  pipelineStatus, onFeatureSelect, visibleLayers,
  isAnyRunning, focusedHub, focusedVehicleId, focusedPharmacyId,
  vehicleTypeFilter, highlight,
}: MapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef       = useRef<maplibregl.Map | null>(null)
  const readyRef     = useRef(false)
  const dataRef      = useRef<Record<string, GeoJSON.FeatureCollection>>({})
  const popupRef     = useRef<maplibregl.Popup | null>(null)

  const onSelectRef = useRef(onFeatureSelect); onSelectRef.current = onFeatureSelect
  const visibleRef  = useRef(visibleLayers);   visibleRef.current  = visibleLayers

  // ── Init map ───────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current) return

    const map = new maplibregl.Map({
      container: containerRef.current, style: MAP_STYLE,
      center: [8.2275, 46.8182], zoom: 7.5,
    })
    map.addControl(new maplibregl.NavigationControl(), 'top-right')
    map.addControl(new maplibregl.ScaleControl({ unit: 'metric' }), 'bottom-right')

    const routeColor: any = ['match', ['get', 'vehicle_type'],
      ...VEHICLE_ROUTE_COLOR.flat(), COLORS.routeFallback]

    map.on('load', () => {
      for (const id of DATA_SOURCES) {
        map.addSource(id, { type: 'geojson', data: dataRef.current[id] ?? EMPTY })
      }

      map.addLayer({
        id: 'backbone-hq-vz-layer', type: 'line', source: 'backbone',
        filter: ['==', ['get', 'backbone_tier'], 'hq_vz'],
        layout: { visibility: vis('backbone'), 'line-join': 'round', 'line-cap': 'round' },
        paint: { 'line-color': COLORS.backboneHqVz, 'line-width': 4, 'line-opacity': 0.85 },
      })
      map.addLayer({
        id: 'backbone-vz-mvz-layer', type: 'line', source: 'backbone',
        filter: ['==', ['get', 'backbone_tier'], 'vz_mvz'],
        layout: { visibility: vis('backbone'), 'line-join': 'round', 'line-cap': 'round' },
        paint: { 'line-color': COLORS.backboneVzMvz, 'line-width': 2.5, 'line-opacity': 0.8, 'line-dasharray': [6, 4] },
      })
      map.addLayer({
        id: 'assignments-layer', type: 'line', source: 'assignments',
        layout: { visibility: vis('assignments') },
        paint: {
          'line-color': ['case', ['==', ['slice', ['get', 'hub_name'], 0, 2], 'VZ'],
            COLORS.assignmentVz, COLORS.assignmentMvz],
          'line-width': 1.2, 'line-opacity': 0.35,
        },
      })
      map.addLayer({
        id: 'routes-layer', type: 'line', source: 'routes',
        layout: { visibility: vis('routes'), 'line-join': 'round', 'line-cap': 'round' },
        paint: { 'line-color': routeColor, 'line-width': 3, 'line-opacity': 0.9 },
      })
      map.addLayer({
        id: 'pharmacies-layer', type: 'circle', source: 'pharmacies',
        layout: { visibility: vis('pharmacies') },
        paint: {
          'circle-color': ['case', ['has', 'demand'], COLORS.pharmacy, COLORS.pharmacyNone],
          'circle-radius': [
            'interpolate', ['linear'], ['zoom'],
            6,  ['case', ['has', 'demand'], ['interpolate', ['linear'], ['get', 'demand'], 1, 2.5, 5, 4, 15, 6], 2.5],
            10, ['case', ['has', 'demand'], ['interpolate', ['linear'], ['get', 'demand'], 1, 5, 5, 8, 15, 13], 5],
          ],
          'circle-stroke-color': '#0f172a', 'circle-stroke-width': 1.2, 'circle-opacity': 1,
        },
      })
      map.addLayer({
        id: 'hubs-layer', type: 'circle', source: 'hubs',
        layout: { visibility: vis('hubs') },
        paint: {
          'circle-color': ['match', ['get', 'hub_type'], 'HQ', COLORS.hqFill, 'VZ', COLORS.vzFill, COLORS.mvzFill],
          // Radius reflects warehouse capacity (HQ fixed largest)
          'circle-radius': ['case', ['==', ['get', 'hub_type'], 'HQ'], 17,
            ['interpolate', ['linear'], ['coalesce', ['get', 'capacity'], 90], 60, 8, 350, 16]],
          'circle-stroke-color': '#ffffff',
          'circle-stroke-width': ['match', ['get', 'hub_type'], 'HQ', 3, 'VZ', 2.5, 2],
          'circle-opacity': 1,
        },
      })
      map.addLayer({
        id: 'hubs-labels', type: 'symbol', source: 'hubs',
        layout: {
          visibility: vis('hubs'),
          'text-field': ['get', 'name'],
          'text-size': ['match', ['get', 'hub_type'], 'HQ', 13, 'VZ', 12, 10],
          'text-offset': [0, 1.8], 'text-anchor': 'top',
          'text-font': ['Open Sans Semibold'], 'text-allow-overlap': false,
        },
        paint: {
          'text-color': ['match', ['get', 'hub_type'], 'HQ', '#c4b5fd', 'VZ', '#7dd3fc', '#fcd34d'],
          'text-halo-color': '#0f172a', 'text-halo-width': 1.5,
        },
      })

      // ── Hover tooltip ────────────────────────────────────────────────────
      popupRef.current = new maplibregl.Popup({
        closeButton: false, closeOnClick: false, offset: 14, maxWidth: '280px', className: 'map-tooltip',
      })

      map.on('mousemove', e => {
        const layers = [...CLICK_LAYERS].filter(l => !!map.getLayer(l))
        const feats = layers.length ? map.queryRenderedFeatures(e.point, { layers }) : []
        if (!feats.length) { map.getCanvas().style.cursor = ''; popupRef.current?.remove(); return }
        map.getCanvas().style.cursor = 'pointer'
        popupRef.current?.setLngLat(e.lngLat).setHTML(tooltipHtml(feats[0])).addTo(map)
      })
      map.on('mouseleave', () => { map.getCanvas().style.cursor = ''; popupRef.current?.remove() })

      map.on('click', e => {
        const layers = [...CLICK_LAYERS].filter(l => !!map.getLayer(l))
        const feats = layers.length ? map.queryRenderedFeatures(e.point, { layers }) : []
        if (!feats.length) { onSelectRef.current(null); return }
        const lid = feats[0].layer.id
        const type: SelectedFeature['type'] =
          lid === 'pharmacies-layer' ? 'pharmacy' : lid === 'hubs-layer' ? 'hub' : 'route'
        onSelectRef.current({ type, properties: feats[0].properties as Record<string, unknown> })
      })

      readyRef.current = true
      for (const id of DATA_SOURCES) {
        if (dataRef.current[id]) (map.getSource(id) as maplibregl.GeoJSONSource).setData(dataRef.current[id])
      }
      syncDataRef.current()
      applyHighlightRef.current()
      applyFilterRef.current()
    })

    mapRef.current = map
    return () => { readyRef.current = false; popupRef.current?.remove(); map.remove(); mapRef.current = null }

    function vis(k: string): 'visible' | 'none' { return visibleRef.current.has(k) ? 'visible' : 'none' }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Data loading ───────────────────────────────────────────────────────────
  const pipelineStatusRef = useRef(pipelineStatus); pipelineStatusRef.current = pipelineStatus
  const cacheRef = useRef<Record<string, CacheEntry>>({})

  const putOnMap = useCallback((srcId: string, data: GeoJSON.FeatureCollection) => {
    dataRef.current[srcId] = data
    if (readyRef.current && mapRef.current) {
      (mapRef.current.getSource(srcId) as maplibregl.GeoJSONSource | undefined)?.setData(data)
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
        entry.fetching = false; entry.data = data; putOnMap(srcId, data)
      })
      .catch(err => { if (cacheRef.current[url] === entry) entry.fetching = false
        console.warn(`Map data load failed (${url}):`, err) })
  }, [putOnMap])

  const syncData = useCallback(() => {
    const s = pipelineStatusRef.current
    const st = (n: number) => s[n]?.status ?? 'idle'
    const rk = (n: number) => `${st(n)}:${s[n]?.finished_at ?? s[n]?.started_at ?? 'none'}`
    if (st(1) === 'idle') {
      for (const u of ['/api/results/pharmacies', '/api/results/pharmacies?demand=1',
                       '/api/results/hubs', '/api/results/assignments', '/api/results/routes', '/api/results/backbone'])
        if (cacheRef.current[u]) cacheRef.current[u] = { fetching: false }
      for (const id of ['hubs', 'assignments', 'backbone', 'routes'] as const) {
        delete dataRef.current[id]
        if (readyRef.current && mapRef.current?.getSource(id))
          (mapRef.current.getSource(id) as maplibregl.GeoJSONSource).setData(EMPTY)
      }
    }
    const purl = st(3) === 'done' ? '/api/results/pharmacies?demand=1' : '/api/results/pharmacies'
    fetchUrl('pharmacies', purl, `ph:${rk(1)}:${rk(3)}`)
    if (st(1) === 'done') fetchUrl('hubs', '/api/results/hubs', rk(1))
    if (st(2) === 'done') fetchUrl('assignments', '/api/results/assignments', rk(2))
    if (st(4) === 'done') { fetchUrl('routes', '/api/results/routes', rk(4)); fetchUrl('backbone', '/api/results/backbone', rk(4)) }
  }, [fetchUrl])
  const syncDataRef = useRef(syncData); syncDataRef.current = syncData
  useEffect(() => { syncDataRef.current() }, [pipelineStatus])

  // ── Layer visibility ─────────────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current
    if (!map || !readyRef.current) return
    const groups: Record<string, string[]> = {
      pharmacies: ['pharmacies-layer'], hubs: ['hubs-layer', 'hubs-labels'],
      assignments: ['assignments-layer'], backbone: ['backbone-hq-vz-layer', 'backbone-vz-mvz-layer'],
      routes: ['routes-layer'],
    }
    for (const [k, ids] of Object.entries(groups))
      for (const id of ids) if (map.getLayer(id))
        map.setLayoutProperty(id, 'visibility', visibleLayers.has(k) ? 'visible' : 'none')
  }, [visibleLayers])

  // ── Hard filters ─────────────────────────────────────────────────────────
  const applyFilter = useCallback(() => {
    const map = mapRef.current
    if (!map || !readyRef.current) return

    // routes-layer: vehicle_id > hub_name > vehicle_type
    if (map.getLayer('routes-layer')) {
      const conds: any[] = []
      if (focusedVehicleId) {
        conds.push(['==', ['get', 'vehicle_id'], focusedVehicleId])
      } else if (focusedHub) {
        conds.push(['==', ['get', 'hub_name'], focusedHub])
        if (vehicleTypeFilter.size > 0) conds.push(['in', ['get', 'vehicle_type'], ['literal', [...vehicleTypeFilter]]])
      } else if (vehicleTypeFilter.size > 0) {
        conds.push(['in', ['get', 'vehicle_type'], ['literal', [...vehicleTypeFilter]]])
      }
      map.setFilter('routes-layer', conds.length === 0 ? null : conds.length === 1 ? conds[0] : ['all', ...conds])
    }

    // assignments-layer: filter to single pharmacy or single hub
    if (map.getLayer('assignments-layer')) {
      if (focusedPharmacyId != null) {
        map.setFilter('assignments-layer', ['==', ['get', 'pharmacy_id'], focusedPharmacyId])
      } else if (focusedHub) {
        map.setFilter('assignments-layer', ['==', ['get', 'hub_name'], focusedHub])
      } else {
        map.setFilter('assignments-layer', null)
      }
    }
  }, [focusedHub, focusedVehicleId, focusedPharmacyId, vehicleTypeFilter])
  const applyFilterRef = useRef(applyFilter); applyFilterRef.current = applyFilter
  useEffect(() => { applyFilter() }, [applyFilter])

  // ── Highlight / dimming ────────────────────────────────────────────────────
  const highlightRef = useRef(highlight); highlightRef.current = highlight
  const applyHighlight = useCallback(() => {
    const map = mapRef.current
    if (!map || !readyRef.current) return
    const h = highlightRef.current
    const set = (layer: string, prop: string, val: any) => {
      if (map.getLayer(layer)) map.setPaintProperty(layer, prop, val)
    }

    const inactive = !h || (h.hubs.length === 0 && h.routeId == null && h.pharmacyId == null)
    if (inactive) {
      set('routes-layer', 'line-opacity', 0.9); set('routes-layer', 'line-width', 3)
      set('backbone-hq-vz-layer', 'line-opacity', 0.85)
      set('backbone-vz-mvz-layer', 'line-opacity', 0.8)
      set('assignments-layer', 'line-opacity', 0.35)
      set('pharmacies-layer', 'circle-opacity', 1); set('pharmacies-layer', 'circle-stroke-opacity', 1)
      set('hubs-layer', 'circle-opacity', 1); set('hubs-layer', 'circle-stroke-opacity', 1)
      set('hubs-labels', 'text-opacity', 1)
      return
    }

    const hubs = h.hubs
    const inHubs = (key: string) => ['in', ['get', key], ['literal', hubs]]
    // backbone relevant if from_hub in chain OR any chain hub is a stop
    const bbRelevant: any = ['any', inHubs('from_hub'), ...hubs.map(hn => ['in', hn, ['get', 'to_hubs']])]

    if (h.routeId != null) {
      set('routes-layer', 'line-opacity', ['case', ['==', ['get', 'id'], h.routeId], 0.95, DIM])
      set('routes-layer', 'line-width', ['case', ['==', ['get', 'id'], h.routeId], 6, 2.5])
    } else if (hubs.length) {
      set('routes-layer', 'line-opacity', ['case', inHubs('hub_name'), 0.95, DIM])
      set('routes-layer', 'line-width', ['case', inHubs('hub_name'), 4, 2.5])
    }

    set('backbone-hq-vz-layer', 'line-opacity', ['case', bbRelevant, 0.95, DIM])
    set('backbone-vz-mvz-layer', 'line-opacity', ['case', bbRelevant, 0.9, DIM])

    if (h.pharmacyId != null)
      set('assignments-layer', 'line-opacity', ['case', ['==', ['get', 'pharmacy_id'], h.pharmacyId], 0.9, DIM])
    else
      set('assignments-layer', 'line-opacity', hubs.length ? ['case', inHubs('hub_name'), 0.7, DIM] : 0.35)

    const phMatch: any = hubs.length ? ['case', inHubs('hub_name'), 1, 0.12] : 1
    set('pharmacies-layer', 'circle-opacity', phMatch)
    set('pharmacies-layer', 'circle-stroke-opacity', phMatch)
    const hubMatch: any = hubs.length ? ['case', inHubs('name'), 1, 0.22] : 1
    set('hubs-layer', 'circle-opacity', hubMatch)
    set('hubs-layer', 'circle-stroke-opacity', hubMatch)
    set('hubs-labels', 'text-opacity', hubMatch)
  }, [])
  const applyHighlightRef = useRef(applyHighlight); applyHighlightRef.current = applyHighlight
  useEffect(() => { applyHighlight() }, [highlight, applyHighlight])

  return (
    <div className="w-full h-full relative">
      <div ref={containerRef} className="w-full h-full" />
      {isAnyRunning && (
        <div className="absolute top-0 left-0 right-0 h-1 z-20 overflow-hidden bg-slate-800">
          <div className="h-full bg-blue-500 animate-loading-bar" />
        </div>
      )}
    </div>
  )
}

// ── Tooltip HTML builder ────────────────────────────────────────────────────
function tooltipHtml(feat: maplibregl.MapGeoJSONFeature): string {
  const p = feat.properties as Record<string, any>
  const lid = feat.layer.id
  let h = ''
  if (lid === 'pharmacies-layer') {
    h = `<strong>${esc(p.name) || 'Apotheke'}</strong>`
    if (p.city) h += `<div class="t-row">${esc(p.city)}</div>`
    if (p.hub_name) h += `<div class="t-row">Hub: <b>${esc(p.hub_name)}</b></div>`
    h += `<div class="t-row">Bedarf: ${p.demand != null ? p.demand + ' Einheiten' : 'noch nicht berechnet'}</div>`
  } else if (lid === 'hubs-layer') {
    const tl = p.hub_type === 'HQ' ? 'Hauptquartier' : p.hub_type === 'VZ' ? 'Verteilzentrum' : 'Mini-VZ'
    h = `<strong>${esc(p.name)}</strong><div class="t-row">${tl}</div>`
    if (p.capacity != null) h += `<div class="t-row">Lager: ${p.load ?? 0} / ${p.capacity} Einh.</div>`
    if (p.parent_hub) h += `<div class="t-row">Über: ${esc(p.parent_hub)}</div>`
  } else if (lid === 'routes-layer') {
    h = `<strong>${esc(p.vehicle_id)}</strong>`
    h += `<div class="t-row">${esc(p.vehicle_type)} · ${p.stop_count} Stops</div>`
    h += `<div class="t-row">${p.total_km} km · CHF ${p.total_cost_chf}</div>`
  } else if (lid === 'backbone-hq-vz-layer' || lid === 'backbone-vz-mvz-layer') {
    const t = lid.includes('hq') ? 'HQ → VZ' : 'VZ → mVZ'
    h = `<strong>Lieferkette ${t}</strong>`
    h += `<div class="t-row">${esc(p.vehicle_type)} · ${p.stop_count} Ziele</div>`
    h += `<div class="t-row">${p.total_km} km · ${p.total_items} Einheiten</div>`
  }
  return `<div class="t-wrap">${h}</div>`
}
function esc(s: unknown): string {
  return String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!))
}
