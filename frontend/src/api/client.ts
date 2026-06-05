import type {
  FullSummary, PipelineStatus, Summary,
  VehicleConfig, VehicleConfigCreate, SystemConfigEntry,
} from '../types'

async function json<T>(path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(path, init)
  if (!r.ok) {
    const text = await r.text()
    throw new Error(`${r.status} ${r.statusText}: ${text}`)
  }
  return r.json() as Promise<T>
}

const jsonBody = (body: unknown) => ({
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
})

const jsonPut = (body: unknown) => ({
  method: 'PUT',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
})

export const api = {
  // Pipeline
  status:    () => json<PipelineStatus>('/api/pipeline/status'),
  runStep:   (step: number) => json<{ message: string }>(`/api/pipeline/run/${step}`, { method: 'POST' }),
  reset:     () => json<{ message: string }>('/api/pipeline/reset', { method: 'POST' }),

  // Results
  summary:     () => json<Summary>('/api/results/summary'),
  fullSummary: () => json<FullSummary>('/api/results/summary/full'),
  pharmacies:  () => json<GeoJSON.FeatureCollection>('/api/results/pharmacies'),
  hubs:        () => json<GeoJSON.FeatureCollection>('/api/results/hubs'),
  assignments: () => json<GeoJSON.FeatureCollection>('/api/results/assignments'),
  routes:      () => json<GeoJSON.FeatureCollection>('/api/results/routes'),
  backbone:    () => json<GeoJSON.FeatureCollection>('/api/results/backbone'),

  // Settings — vehicle fleet
  getVehicles:    () => json<VehicleConfig[]>('/api/settings/vehicles'),
  createVehicle:  (v: VehicleConfigCreate) => json<VehicleConfig>('/api/settings/vehicles', jsonBody(v)),
  updateVehicle:  (id: number, v: VehicleConfigCreate) =>
    json<VehicleConfig>(`/api/settings/vehicles/${id}`, jsonPut(v)),
  deleteVehicle:  (id: number) =>
    fetch(`/api/settings/vehicles/${id}`, { method: 'DELETE' }),

  // Settings — system config
  getSystemConfig:    () => json<SystemConfigEntry[]>('/api/settings/system'),
  updateSystemConfig: (updates: Record<string, string>) =>
    json<SystemConfigEntry[]>('/api/settings/system', jsonPut({ updates })),
}
