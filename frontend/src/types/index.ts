export type StepStatus = 'idle' | 'running' | 'done' | 'error'

export interface StepInfo {
  status: StepStatus
  started_at: string | null
  finished_at: string | null
  error_message: string | null
}

export type PipelineStatus = Record<number, StepInfo>

export interface SelectedFeature {
  type: 'pharmacy' | 'hub' | 'route'
  properties: Record<string, unknown>
}

/** Drives map dimming: only related features stay opaque. */
export interface HighlightState {
  hubs: string[]              // relevant hub names (the chain)
  pharmacyId: number | null   // highlight a single assignment line (supply-chain view)
  servingPharmacyId: number | null // show only the last-mile route delivering this pharmacy
  routeId: number | null      // highlight a single vehicle route (numeric id)
  vehicleId: string | null    // highlight/filter a single vehicle_id string
  primaryHub: string | null   // clicked hub → colour its outbound vs inbound supply distinctly
}

export type TrafficSource = 'tomtom' | 'simulation' | 'static'

export interface RouteSummary {
  id: number
  hub_name: string
  vehicle_id: string
  vehicle_type: string
  total_km: number
  total_hours: number
  total_items: number
  total_cost_chf: number
  co2_kg: number | null
  stops?: number[]
  stop_count: number
  restock_count: number
  traffic_factor?: number | null
  traffic_source?: TrafficSource | null
  free_flow_hours?: number | null
  traffic_delay_min?: number | null
}

export interface Summary {
  hubs: number
  pharmacies_total: number
  pharmacies_assigned: number
  total_demand: number
  total_routes: number
  total_cost_chf: number
  total_km: number
  evan_routes: number
  lkw_routes: number
}

// ── Vehicle Fleet Config ──────────────────────────────────────────────────────

export interface VehicleConfig {
  id: number
  name: string
  vehicle_class: string | null
  can_last_mile: boolean
  can_backbone: boolean
  capacity: number | null
  range_km: number
  cost_per_km: number
  co2_g_per_km: number
  speed_kmh: number
  driver_chf_h: number | null
  service_min: number | null
  max_per_hub: number | null
  restock_threshold: number | null
  sort_order: number
  enabled: boolean
}

export interface VehicleConfigCreate extends Omit<VehicleConfig, 'id'> {}

// ── System Config ─────────────────────────────────────────────────────────────

export interface SystemConfigEntry {
  key: string
  value: string
  label: string | null
  description: string | null
}

// ── Live Traffic ──────────────────────────────────────────────────────────────

export interface TrafficInfo {
  enabled:            boolean
  mode:               'simulation' | 'tomtom'    // configured data source
  source:             TrafficSource              // what was actually applied
  peak_intensity:     number
  static_factor:      number   // factor applied when live traffic is OFF
  effective_factor:   number   // factor Step 4 actually applies
  current_congestion: number   // multiplier for the current moment (simulated or live)
  shift_start:        number
  shift_hours:        number
  profile:            number[] // 24 hourly congestion multipliers (simulation)
}

export interface TomTomConfig {
  mode:       'simulation' | 'tomtom'
  key_source: 'file' | 'db' | 'none'
  key_masked: string
  can_edit:   boolean          // false when a .env key takes precedence
}

// ── Analytics Dashboard ───────────────────────────────────────────────────────

export interface FleetStats {
  count: number
  total_km: number
  total_hours: number
  total_cost_chf: number
  total_co2_kg: number
  total_items: number
}

export interface MvzStats {
  name: string
  pharmacy_count: number
  total_items: number
  backbone_km: number | null
  backbone_cost_chf: number | null
  backbone_co2_kg: number | null
}

export interface VzStats {
  name: string
  direct_pharmacies: number
  mvz_count: number
  total_pharmacies: number
  total_items: number
  distance_to_hq_km: number
  backbone_km: number | null
  backbone_cost_chf: number | null
  backbone_co2_kg: number | null
  mvz: MvzStats[]
}

export interface IndividualRoute {
  vehicle_id:    string
  vehicle_type:  string
  hub_name:      string
  stop_count:    number
  total_km:      number
  total_hours:   number
  total_items:   number
  total_cost_chf: number
  co2_kg:        number
  restock_count: number
  traffic_factor?:    number | null
  traffic_source?:    TrafficSource | null
  traffic_delay_min?: number | null
}

export interface HubLoad {
  name:     string
  hub_type: string
  load:     number
  capacity: number
  pct:      number
  warehouse_cost: number | null
}

export interface BackboneRoute extends IndividualRoute {
  from_hub: string
  to_hubs:  string[]
  tier:     'hq_vz' | 'vz_mvz'
}

export interface FleetUtilization {
  total_available: number
  actually_used:   number
  utilization_pct: number
}

export interface FullSummary {
  overview: {
    total_cost_chf: number
    warehouse_cost_chf: number
    total_cost_incl_warehouse_chf: number
    total_co2_kg: number
    total_km: number
    total_last_mile_routes: number
    total_backbone_routes: number
    pharmacies_total: number
    pharmacies_assigned: number
    hubs_total: number
    traffic_total_delay_min?: number
  }
  fleet_by_type: Record<string, FleetStats>
  backbone_by_type: Record<string, FleetStats>
  fleet: {
    last_mile: FleetStats
    backbone: FleetStats
  }
  vehicle_specs: VehicleConfig[]
  optimization: {
    weights: { cost: number; time: number; environment: number }
    traffic_factor: number               // factor actually applied by Step 4
    static_traffic_factor: number
    live_traffic_enabled: boolean
    traffic_mode: 'simulation' | 'tomtom'
    traffic_source: TrafficSource
    traffic_peak_intensity: number
    effective_traffic_factor: number
    traffic_profile: number[] | null     // 24h curve when live traffic was on
    co2_shadow_chf_per_kg: number
    shift_hours: number
    shift_start: number
  }
  supply_chain: {
    hq_name: string | null
    vz_count: number
    mvz_count: number
    pharmacy_count: number
    hierarchy: VzStats[]
  }
  metrics: {
    avg_stops_per_route: number
    avg_km_per_route: number
    cost_per_item_chf: number
    co2_per_km_kg: number
    total_driver_hours: number
    unrouted_pharmacies: number
    hub_loads: HubLoad[]
  }
  fleet_utilization: Record<string, FleetUtilization>
  individual_routes: IndividualRoute[]
  individual_backbone_routes: BackboneRoute[]
}
