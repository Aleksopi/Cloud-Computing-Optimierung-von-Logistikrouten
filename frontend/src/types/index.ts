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

// ── Analytics Dashboard Types ─────────────────────────────────────────────────

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

export interface VehicleSpecEntry {
  capacity?: number
  range_km?: number
  cost_per_km: number
  co2_g_per_km: number
  speed_kmh: number
  driver_chf_h?: number
  service_min?: number
  label: string
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
  fleet: {
    evan: FleetStats
    lkw: FleetStats
    backbone: FleetStats
  }
  vehicle_specs: {
    evan: VehicleSpecEntry
    lkw: VehicleSpecEntry
    backbone: Omit<VehicleSpecEntry, 'capacity' | 'range_km' | 'driver_chf_h' | 'service_min'>
  }
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
