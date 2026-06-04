import type { PipelineStatus, Summary } from '../types'

async function json<T>(path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(path, init)
  if (!r.ok) {
    const text = await r.text()
    throw new Error(`${r.status} ${r.statusText}: ${text}`)
  }
  return r.json() as Promise<T>
}

export const api = {
  status: () => json<PipelineStatus>('/api/pipeline/status'),
  runStep: (step: number) => json<{ message: string }>(`/api/pipeline/run/${step}`, { method: 'POST' }),
  reset: () => json<{ message: string }>('/api/pipeline/reset', { method: 'POST' }),
  summary: () => json<Summary>('/api/results/summary'),
  pharmacies: () => json<GeoJSON.FeatureCollection>('/api/results/pharmacies'),
  hubs: () => json<GeoJSON.FeatureCollection>('/api/results/hubs'),
  assignments: () => json<GeoJSON.FeatureCollection>('/api/results/assignments'),
  routes: () => json<GeoJSON.FeatureCollection>('/api/results/routes'),
}
