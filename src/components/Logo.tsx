import { clubConfig } from '../config/club'

// The lockup: the mark, then the club's name in both scripts.
//
// The mark is the Sagittarius arrow crossing Taiwan — the sign the club is
// named for, over the ground it fences on. Below roughly 40px the coastline
// stops resolving and the mark is noise, so the lockup is set at 44px and the
// bare arrow is used anywhere smaller. That limit is inherited from the
// marketing site, where it was found the hard way.

export function Logo({ size = 44, showName = true }: { size?: number; showName?: boolean }) {
  return (
    <span className="inline-flex items-center gap-3">
      <img
        src={clubConfig.assets.logo}
        alt={showName ? '' : clubConfig.identity.logoAlt}
        aria-hidden={showName || undefined}
        width={size}
        height={size}
        className="shrink-0"
      />
      {showName && (
        <span className="flex flex-col leading-tight">
          <span className="font-display text-base tracking-wide text-gold">
            {clubConfig.identity.shortName}
          </span>
          {clubConfig.identity.nativeName && (
            <span className="text-sm text-silver-deep">{clubConfig.identity.nativeName}</span>
          )}
        </span>
      )}
    </span>
  )
}
