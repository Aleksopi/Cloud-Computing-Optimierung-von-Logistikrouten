import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from '../../api/client'
import { ErrorModal } from '../common/ErrorModal'
import type { TrafficInfo } from '../../types'

interface Props {
  /** Step 4 already produced routes → switching means results are now stale. */
  step4Done: boolean
  /** Called after a successful change so the parent can flag a needed re-run. */
  onChanged?: () => void
}

/** factor 1.42 → "+42 %"  ·  1.0 → "±0 %" */
const asDelay = (f: number) => `${f >= 1 ? '+' : '−'}${Math.round(Math.abs(f - 1) * 100)} %`
const congColor = (f: number) => (f >= 1.35 ? '#f87171' : f >= 1.12 ? '#fbbf24' : '#34d399')
const congLabel = (f: number) => (f >= 1.35 ? 'Dichter Verkehr' : f >= 1.12 ? 'Erhöhter Verkehr' : 'Freie Fahrt')

/**
 * Map-sidebar traffic switch (attached to the Routenoptimierung / Step 4 card).
 * ON  → TomTom Live-Verkehr · OFF → Verkehrsmodell (Tageszeit-Simulation).
 * The contextual info below loads asynchronously and reflects the active source.
 */
export function TrafficToggle({ step4Done, onChanged }: Props) {
  const [info,  setInfo]  = useState<TrafficInfo | null>(null)
  const [busy,  setBusy]  = useState(false)
  const [stale, setStale] = useState(false)
  const [err,   setErr]   = useState<string | null>(null)
  const mounted = useRef(true)

  const load = useCallback(() => {
    api.getTraffic().then(t => { if (mounted.current) setInfo(t) }).catch(() => {})
  }, [])

  useEffect(() => {
    mounted.current = true
    load()
    const id = setInterval(load, 60_000)   // refresh the live/modelled value
    return () => { mounted.current = false; clearInterval(id) }
  }, [load])

  // Switch reflects the chosen mode; both states keep the model enabled.
  const live = info?.mode === 'tomtom'
  const isLive = info?.source === 'tomtom'   // live data actually applied
  const cong = info?.current_congestion ?? 1
  const eff  = info?.effective_factor ?? 1

  const setMode = async (toLive: boolean) => {
    if (!info || busy) return
    const mode = toLive ? 'tomtom' : 'simulation'
    if (info.mode === mode && info.enabled) return
    setBusy(true)
    try {
      const next = await api.setTraffic(true, info.peak_intensity, mode)   // always enabled
      setInfo(next)
      if (step4Done) setStale(true)
      onChanged?.()
      if (toLive) {
        const t = await api.testTomTom()        // surface key/limit problems immediately
        if (!t.ok) setErr(t.message)
      }
    } catch { /* keep previous state */ }
    finally { setBusy(false) }
  }

  return (
    <div className={`-mt-1 mb-2 ml-4 rounded-b-lg rounded-tr-lg border border-t-0 px-3 py-2.5 transition-colors
      ${live ? 'border-emerald-700/50 bg-emerald-950/20' : 'border-amber-700/40 bg-amber-950/10'}`}>

      {/* Header: label + switch */}
      <div className="flex items-center gap-2">
        <TrafficIcon className={`w-3.5 h-3.5 flex-shrink-0 ${live ? 'text-emerald-400' : 'text-amber-400'}`} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-semibold text-slate-200">Verkehr</span>
            <span className={`text-[9px] font-semibold rounded px-1 py-px border ${
              live
                ? (isLive ? 'text-emerald-300 bg-emerald-950/50 border-emerald-800/50'
                          : 'text-amber-300 bg-amber-950/50 border-amber-800/50')
                : 'text-amber-300 bg-amber-950/50 border-amber-800/50'}`}>
              {live ? (isLive ? 'LIVE' : 'LIVE?') : 'MODELL'}
            </span>
          </div>
          <span className="text-[10px] text-slate-500">
            {live ? 'TomTom Live-Verkehr' : 'Verkehrsmodell (Simulation)'}
          </span>
        </div>

        {/* Switch: ON = Live, OFF = Verkehrsmodell */}
        <button
          onClick={() => setMode(!live)}
          disabled={busy || !info}
          role="switch"
          aria-checked={live}
          title={live ? 'Auf Verkehrsmodell umschalten' : 'Auf TomTom Live umschalten'}
          className={`relative flex-shrink-0 w-9 h-5 rounded-full transition-colors duration-200
            ${live ? 'bg-emerald-500' : 'bg-slate-600'} ${busy ? 'opacity-60' : 'hover:brightness-110'}`}
        >
          <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform duration-200
            ${live ? 'translate-x-4' : 'translate-x-0'}`} />
        </button>
      </div>

      {/* Contextual info — loads asynchronously, depends on the active source */}
      {!info ? (
        <div className="mt-2 text-[10px] text-slate-600">lädt…</div>
      ) : live ? (
        <div className="mt-2.5 pt-2 border-t border-emerald-800/30 text-[11px]">
          {isLive ? (
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-slate-400">
                <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: congColor(eff) }} />
                Live-Faktor
              </span>
              <span className="font-medium" style={{ color: congColor(eff) }}>×{eff.toFixed(2)} · {asDelay(eff)}</span>
            </div>
          ) : (
            <div className="text-amber-400 leading-snug">
              {info.error ?? 'Kein API-Key — Live nutzt Freifluss.'}
              <span className="text-slate-500"> · Key unter Einstellungen → Verkehrsmodell.</span>
            </div>
          )}
        </div>
      ) : (
        <div className="mt-2.5 pt-2 border-t border-amber-800/30 space-y-1.5 text-[11px]">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-slate-400">
              <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: congColor(cong) }} />
              Modell · jetzt
            </span>
            <span className="font-medium" style={{ color: congColor(cong) }}>{congLabel(cong)} · {asDelay(cong)}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-slate-400">Schicht-Ø (angewandt)</span>
            <span className="font-mono font-semibold text-amber-200">×{eff.toFixed(2)}</span>
          </div>
        </div>
      )}

      {/* Re-run hint */}
      <div className="mt-2 text-[10px] leading-snug">
        {stale && step4Done ? (
          <span className="text-amber-400/90">⟳ Schritt 4 erneut ausführen, um Routen zu aktualisieren.</span>
        ) : (
          <span className="text-slate-600">Wirkt beim nächsten Lauf von Schritt 4.</span>
        )}
      </div>

      {err && <ErrorModal title="TomTom-Verbindung" message={err} onClose={() => setErr(null)} />}
    </div>
  )
}

function TrafficIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none">
      <rect x="4.5" y="1" width="7" height="14" rx="2" stroke="currentColor" strokeWidth="1.3" />
      <circle cx="8" cy="4.2" r="1.4" fill="currentColor" />
      <circle cx="8" cy="8"   r="1.4" fill="currentColor" opacity="0.6" />
      <circle cx="8" cy="11.8" r="1.4" fill="currentColor" opacity="0.35" />
    </svg>
  )
}
