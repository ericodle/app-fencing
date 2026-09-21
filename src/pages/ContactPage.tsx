import { useClubContact } from '../hooks/useClubContact'
import { clubConfig } from '../config/club'
import { t } from '../i18n'
import { PageLoading } from '../components/ui/Spinner'
import { Plate } from '../components/ui/Plate'

export function ContactPage() {
  const { details, channels, loading } = useClubContact()
  if (loading) return <PageLoading />

  const mapQuery = details?.map_query || details?.address

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="font-display text-2xl text-gold">{clubConfig.identity.clubName}</h1>
        {clubConfig.identity.nativeName && (
          <p className="text-silver-deep">{clubConfig.identity.nativeName}</p>
        )}
      </header>

      <Plate title={t.nav.contact} edge="gold">
        <dl className="flex flex-col gap-3">
          {details?.address && (
            <div>
              <dt className="font-display text-xs uppercase tracking-widest text-silver">Where</dt>
              <dd className="text-paper">{details.address}</dd>
              {details.native_address && <dd className="text-silver-deep">{details.native_address}</dd>}
              {mapQuery && (
                <dd>
                  <a
                    href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(mapQuery)}`}
                    target="_blank" rel="noreferrer"
                    className="text-sm text-gold hover:text-gold-soft"
                  >
                    Open map
                  </a>
                </dd>
              )}
            </div>
          )}
          {details?.hours && (
            <div>
              <dt className="font-display text-xs uppercase tracking-widest text-silver">When</dt>
              <dd className="text-paper">{details.hours}</dd>
            </div>
          )}
          {details?.phone && (
            <div>
              <dt className="font-display text-xs uppercase tracking-widest text-silver">Phone</dt>
              <dd><a href={`tel:${details.phone}`} className="text-gold hover:text-gold-soft">{details.phone}</a></dd>
            </div>
          )}
          {details?.email && (
            <div>
              <dt className="font-display text-xs uppercase tracking-widest text-silver">Email</dt>
              <dd><a href={`mailto:${details.email}`} className="text-gold hover:text-gold-soft">{details.email}</a></dd>
            </div>
          )}
        </dl>

        {channels.length > 0 && (
          <div className="mt-5 flex flex-wrap gap-3 border-t border-rule-faint pt-4">
            {channels.map(c => (
              <a
                key={c.id}
                href={c.url ?? '#'}
                target="_blank" rel="noreferrer"
                className="min-h-11 border border-rule px-3 py-2 font-display text-xs uppercase tracking-widest text-silver hover:border-gold hover:text-gold"
              >
                {c.label}
                {c.handle && <span className="ml-2 normal-case tracking-normal text-muted-dim">{c.handle}</span>}
              </a>
            ))}
          </div>
        )}
      </Plate>

      <Plate title="The club">
        <p className="text-muted">
          <a href={clubConfig.urls.site} target="_blank" rel="noreferrer" className="text-gold hover:text-gold-soft">
            {clubConfig.urls.site.replace(/^https?:\/\//, '')}
          </a>
        </p>
        {/* AGPL §13 — running a modified version over a network obliges you to
            offer users the source. Keeping the link in the app is how that
            promise stays kept without anyone having to remember it. */}
        <p className="mt-3 text-sm text-muted-dim">
          This app is free software under the GNU AGPL v3. The source is at{' '}
          <a href="https://github.com/ericodle/app-fencing" className="text-silver hover:text-gold">
            github.com/ericodle/app-fencing
          </a>.
        </p>
      </Plate>
    </div>
  )
}
