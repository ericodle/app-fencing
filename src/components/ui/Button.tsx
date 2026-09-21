import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { Spinner } from './Spinner'

// Flat ink with a hard edge. No radius, no gradient across the face.
//
// Gold is the primary fill and it is a LIGHT metal, so the label on it is onyx,
// not paper. That inversion is the single easiest thing to get wrong in this
// palette — light text on gold is invisible.

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'

const VARIANTS: Record<Variant, string> = {
  primary:   'bg-gold text-onyx hover:bg-gold-soft disabled:bg-gold-deep disabled:text-ink-800',
  secondary: 'bg-silver text-onyx hover:bg-silver-soft disabled:bg-silver-deep',
  ghost:     'border border-rule text-paper hover:border-gold hover:text-gold',
  danger:    'border border-signal-red text-signal-red hover:bg-signal-red hover:text-onyx',
}

export function Button({
  children, variant = 'primary', busy = false, className = '', ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant
  busy?: boolean
  children: ReactNode
}) {
  return (
    <button
      {...rest}
      disabled={rest.disabled || busy}
      className={`inline-flex min-h-11 items-center justify-center gap-2 px-4 py-2 font-display text-sm tracking-wide uppercase transition-colors disabled:cursor-not-allowed ${VARIANTS[variant]} ${className}`}
    >
      {busy && <Spinner />}
      {children}
    </button>
  )
}
