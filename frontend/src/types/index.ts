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
  pharmacyId: number | null   // highlight a single assignment line
  routeId: number | null      // highlight a single vehicle route (numeric id)
  vehicleId: string | null    // highlight/filter a single vehicle_id string
}

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
  stop_count: number
  restock_count: number
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

export interface FullSummary {
  overview: {
    total_cost_chf: number
    total_co2_kg: number
    total_km: number
    total_last_mile_routes: number
    pharmacies_total: number
    pharmacies_assigned: number
    hubs_total: number
  }
  fleet_by_type: Record<string, FleetStats>
  fleet: {
    last_mile: FleetStats
    backbone: FleetStats
  }
  vehicle_specs: VehicleConfig[]
  optimization: {
    weights: { cost: number; time: number; environment: number }
    traffic_factor: number
    co2_shadow_chf_per_kg: number
    shift_hours: number
  }
  supply_chain: {
    hq_name: string | null
    vz_count: number
    mvz_count: number
    pharmacy_count: number
    hierarchy: VzStats[]
  }
}
