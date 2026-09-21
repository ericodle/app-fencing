import type { ReactNode } from 'react'

// The one container in the app. A printed plate: an opaque ground, a hairline
// rule, and a second rule set outside it with outline-offset — which costs
// nothing and reads as a plate border rather than a drop shadow.
//
// `edge` draws the specular metal ramp along the top. Used sparingly: it is the
// only place the gradients survive, because a 2px ramped edge reads as metal
// where the same ramp across a face reads as plastic.

export function Plate({
  children, title, subtitle, edge, actions, className = '',
}: {
  children: ReactNode
  title?: ReactNode
  subtitle?: ReactNode
  edge?: 'gold' | 'silver'
  actions?: ReactNode
  className?: string
}) {
  return (
    <section
      className={`plate p-5 sm:p-6 ${edge === 'gold' ? 'edge-gold' : edge === 'silver' ? 'edge-silver' : ''} ${className}`}
    >
      {(title || actions) && (
        <header className="mb-4 flex flex-wrap items-baseline justify-between gap-3 border-b border-rule-faint pb-3">
          <div>
            {title && <h2 className="text-xl text-paper">{title}</h2>}
            {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
          </div>
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </header>
      )}
      {children}
    </section>
  )
}
