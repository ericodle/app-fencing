import type { ReactNode } from 'react'

// A labelled control. `help` is for the sentence that explains WHY the app is
// asking — the arm-span field and the home-area field both need one, and a
// tooltip is not where anybody reads it.

export function Field({
  label, help, error, htmlFor, children, className = '',
}: {
  label: ReactNode
  help?: ReactNode
  error?: string | null
  htmlFor?: string
  children: ReactNode
  className?: string
}) {
  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      <label htmlFor={htmlFor} className="font-display text-xs uppercase tracking-widest text-silver">
        {label}
      </label>
      {children}
      {help && <p className="text-sm leading-snug text-muted-dim">{help}</p>}
      {error && <p className="text-sm text-signal-red">{error}</p>}
    </div>
  )
}

export const inputClass =
  'w-full border border-rule bg-ink-900 px-3 py-2 text-paper placeholder:text-muted-dim focus:border-gold'
