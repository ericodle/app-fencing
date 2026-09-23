import { t } from '../../i18n'
import { clubConfig } from '../../config/club'
import { haversineKm } from '../../lib/geo'
import { CatalogManager } from '../../components/admin/CatalogManager'
import { VENUE_FIELDS } from '../../components/admin/catalog'

// The places the club fences.
//
// Coordinates are required, not optional, and the form says why: a venue with
// no pin cannot be ranked by the meetup planner, and a venue the planner cannot
// see is one the club will quietly stop using without ever deciding to.
//
// A venue an event is held at cannot be deleted — the event would silently
// become "venue to be decided" — so the page offers Archive for those, and
// the database refuses the delete.

export function AdminVenuesPage() {
  const home = { lat: clubConfig.club.home.latitude, lng: clubConfig.club.home.longitude }
  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-display text-2xl text-gold">{t.admin.venues}</h1>
      <CatalogManager
        title="Venues"
        subtitle="Archived venues stay on past events but are not offered for new ones."
        table="venues" noun="venue" fields={VENUE_FIELDS} orderBy="name" inactiveKey="status"
        defaults={{ kind: 'salle', status: 'active', indoor: true }}
        rowLabel={v => (
          <span className="flex flex-wrap items-baseline gap-2">
            {String(v.name)}
            {v.native_name ? <span className="text-sm text-silver-deep">{String(v.native_name)}</span> : null}
            <span className="font-display text-[0.55rem] uppercase tracking-widest text-gold-deep">{String(v.kind)}</span>
          </span>
        )}
        rowDetail={v => [
          v.address ? String(v.address) : null,
          `${haversineKm({ lat: Number(v.lat), lng: Number(v.lng) }, home).toFixed(1)} km from the club`,
          v.pistes !== null ? `${String(v.pistes)} strips` : null,
          v.has_scoring ? 'scoring' : 'no scoring',
        ].filter(Boolean).join(' · ')}
      />
    </div>
  )
}
