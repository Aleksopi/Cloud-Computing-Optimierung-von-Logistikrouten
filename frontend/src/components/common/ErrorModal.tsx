import { useState } from 'react'

/** Small centered modal for surfacing errors (e.g. TomTom key invalid / limit).
 *  When `detail` is given, a "mehr Info" arrow reveals the full message. */
interface ErrorModalProps {
  title?: string
  message: string
  detail?: string | null
  variant?: 'error' | 'warning' | 'success'
  onClose: () => void
}

const ACCENTS = {
  error:   { ring: 'border-red-700/60',     dot: 'bg-red-500',     text: 'text-red-300',     btn: 'bg-red-600 hover:bg-red-500' },
  warning: { ring: 'border-amber-700/60',   dot: 'bg-amber-500',   text: 'text-amber-300',   btn: 'bg-amber-600 hover:bg-amber-500' },
  success: { ring: 'border-emerald-700/60', dot: 'bg-emerald-500', text: 'text-emerald-300', btn: 'bg-emerald-600 hover:bg-emerald-500' },
} as const

export function ErrorModal({ title = 'Fehler', message, detail, variant = 'error', onClose }: ErrorModalProps) {
  const [open, setOpen] = useState(false)
  const accent = ACCENTS[variant]

  return (
    <div onClick={onClose}
         className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div onClick={e => e.stopPropagation()}
           className={`w-[440px] max-w-[92vw] rounded-2xl border ${accent.ring} bg-slate-900 shadow-2xl shadow-black/70 overflow-hidden`}>
        <div className="flex items-center gap-2.5 px-5 py-3.5 border-b border-slate-700/60 bg-slate-800/50">
          <span className={`w-2.5 h-2.5 rounded-full ${accent.dot} animate-pulse`} />
          <span className={`text-sm font-semibold ${accent.text}`}>{title}</span>
          <button onClick={onClose}
                  className="ml-auto w-7 h-7 flex items-center justify-center rounded-md text-slate-500 hover:text-slate-200 hover:bg-slate-700 transition-colors">
            ×
          </button>
        </div>

        <div className="px-5 py-4 text-sm text-slate-300 leading-relaxed">
          {message}

          {detail && (
            <div className="mt-3">
              <button onClick={() => setOpen(o => !o)}
                      className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-200 transition-colors">
                <span className={`transition-transform ${open ? 'rotate-90' : ''}`}>▸</span>
                {open ? 'Weniger' : 'Mehr Info'}
              </button>
              {open && (
                <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-words rounded-lg border border-slate-700/60 bg-slate-950/70 p-2.5 text-[11px] leading-snug text-slate-400">
                  {detail}
                </pre>
              )}
            </div>
          )}
        </div>

        <div className="px-5 pb-4 flex justify-end">
          <button onClick={onClose}
                  className={`text-xs px-4 py-2 rounded-lg font-semibold text-white transition-colors ${accent.btn}`}>
            Verstanden
          </button>
        </div>
      </div>
    </div>
  )
}
