import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from '../../api/client'
import type { TrafficInfo } from '../../types'

interface Props {
  /** Step 4 already produced routes → toggling means results are now stale. */
  step4Done: boolean
  /** Called after a successful toggle so the parent can flag a needed re-run. */
  onChanged?: () => void
}

/** factor 1.42 → "+42 %"  ·  1.0 → "±0 %" */
const asDelay = (f: number) => `${f >= 1 ? '+' : '−'}${Math.round(Math.abs(f - 1) * 100)} %`

const congestionColor = (f: number) =>
  f >= 1.35 ? '#f87171' : f >= 1.12 ? '#fbbf24' : '#34d399'

const congestionLabel = (f: number) =>
  f >= 1.35 ? 'Dichter Verkehr' : f >= 1.12 ? 'Erhöhter Verkehr' : 'Freie Fahrt'

/**
 * Live-traffic switch, attached to the Routenoptimierung (Step 4) card.
 * When ON, Step 4 scales drive times by a time-of-day congestion model.
 */
export function TrafficToggle({ step4Done, onChanged }: Props) {
  const [info,    setInfo]    = useState<TrafficInfo | null>(null)
  const [busy,    setBusy]    = useState(false)
  const [stale,   setStale]   = useState(false)
  const mounted = useRef(true)

  const load = useCallback(() => {
    api.getTraffic().then(t => { if (mounted.current) setInfo(t) }).catch(() => {})
  }, [])

  useEffect(() => {
    mounted.current = true
    load()
    // Refresh the live "right now" congestion periodically.
    const id = setInterval(load, 60_000)
    return () => { mounted.current = false; clearInterval(id) }
  }, [load])

  const toggle = async () => {
    if (!info || busy) return
    setBusy(true)
    try {
      const next = await api.setTraffic(!info.enabled, info.peak_intensity)
      setInfo(next)
      if (step4Done) setStale(true)
      onChanged?.()
    } catch { /* keep previous state */ }
    finally { setBusy(false) }
  }

  const on   = !!info?.enabled
  const cong = info?.current_congestion ?? 1
  const eff  = info?.effective_factor ?? 1

  return (
    <div className={`-mt-1 mb-2 ml-4 rounded-b-lg rounded-tr-lg border border-t-0 px-3 py-2.5 transition-colors
      ${on ? 'border-amber-700/50 bg-amber-950/20' : 'border-slate-700/50 bg-slate-800/30'}`}>

      {/* Header row: label + switch */}
      <div className="flex items-center gap-2">
        <TrafficIcon className={`w-3.5 h-3.5 flex-shrink-0 ${on ? 'text-amber-400' : 'text-slate-500'}`} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className={`text-xs font-semibold ${on ? 'text-amber-200' : 'text-slate-300'}`}>Live-Verkehr</span>
            {on && (
              <span className="flex items-center gap-1 text-[10px] text-amber-300/90">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />LIVE
              </span>
            )}
          </div>
          <span className="text-[10px] text-slate-500">Tageszeit-Stau in Schritt 4</span>
        </div>

        {/* Switch */}
        <button
          onClick={toggle}
          disabled={busy || !info}
          role="switch"
          aria-checked={on}
          title={on ? 'Live-Verkehr ausschalten' : 'Live-Verkehr einschalten'}
          className={`relative flex-shrink-0 w-9 h-5 rounded-full transition-colors duration-200
            ${on ? 'bg-amber-500' : 'bg-slate-600'} ${busy ? 'opacity-60' : 'hover:brightness-110'}`}
        >
          <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform duration-200
            ${on ? 'translate-x-4' : 'translate-x-0'}`} />
        </button>
      </div>

      {/* Live detail (only when on) */}
      {on && info && (
        <div className="mt-2.5 pt-2 border-t border-amber-800/30 space-y-2">
          <div className="flex items-center justify-between text-[11px]">
            <span className="flex items-center gap-1.5 text-slate-400">
              <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: congestionColor(cong) }} />
              Jetzt
            </span>
            <span className="font-medium" style={{ color: congestionColor(cong) }}>
              {congestionLabel(cong)} · {asDelay(cong)}
            </span>
          </div>
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-slate-400">Schicht-Ø (angewandt)</span>
            <span className="font-mono font-semibold text-amber-200">×{eff.toFixed(2)} · {asDelay(eff)}</span>
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
