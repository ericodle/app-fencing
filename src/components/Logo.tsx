import { clubConfig } from '../config/club'

// The club emblem: crossed épée and saber over Taiwan, with KUOU interlaced
// across them and the club's name beneath. It carries the name itself, so it
// stands alone — no text lockup beside it. `size` is its width; the emblem is
// very slightly taller than wide.

export function Logo({ size = 56, className = '' }: { size?: number; className?: string }) {
  return (
    <img
      src={clubConfig.assets.logo}
      alt={clubConfig.identity.logoAlt}
      width={size}
      height={Math.round(size * 1350 / 1312)}
      className={`shrink-0 ${className}`}
    />
  )
}
