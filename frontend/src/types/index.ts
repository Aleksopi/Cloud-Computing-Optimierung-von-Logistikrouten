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
