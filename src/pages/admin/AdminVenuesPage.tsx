import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { supabase } from '../../lib/supabase'
import { t } from '../../i18n'
import { clubConfig } from '../../config/club'
import { haversineKm } from '../../lib/geo'
import { PageLoading } from '../../components/ui/Spinner'
import { Plate } from '../../components/ui/Plate'
import { Button } from '../../components/ui/Button'
import { Field, inputClass } from '../../components/ui/Field'
import type { Venue } from '../../types/db'

// The places the club fences.
//
// Coordinates are required, not optional, and the form says why: a venue with
// no pin cannot be ranked by the meetup planner, and a venue the planner cannot
// see is one the club will quietly stop using without ever deciding to.

const KINDS = ['salle', 'gym', 'school', 'park', 'community', 'competition', 'other'] as const

export function AdminVenuesPage() {
  const [venues, setVenues] = useState<Venue[]>([])
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState(false)

  const load = useCallback(async () => {
    const { data } = await supabase.from('venues').select('*').order('status').order('name')
    setVenues(data ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { void load() }, [load])

  async function archive(id: string, status: string) {
    await supabase.from('venues').update({ status: status === 'active' ? 'archived' : 'active' }).eq('id', id)
    await load()
  }

  if (loading) return <PageLoading />

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-baseline justify-between gap-3">
        <h1 className="font-display text-2xl text-gold">{t.admin.venues}</h1>
        <Button onClick={() => setAdding(v => !v)}>
          {adding ? t.common.cancel : 'Add a venue'}
        </Button>
      </div>

      {adding && <VenueForm onDone={async saved => { setAdding(false); if (saved) await load() }} />}

      <Plate>
        <ul className="flex flex-col">
          {venues.map(v => {
            const fromClub = haversineKm(
              { lat: Number(v.lat), lng: Number(v.lng) },
              { lat: clubConfig.club.home.latitude, lng: clubConfig.club.home.longitude })
            return (
              <li key={v.id} className={`flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-rule-faint py-2.5 last:border-b-0 ${
                v.status === 'archived' ? 'opacity-50' : ''
              }`}>
                <div className="min-w-0">
                  <p className="flex items-baseline gap-2">
                    <span className="text-paper">{v.name}</span>
                    {v.native_name && <span className="text-sm text-silver-deep">{v.native_name}</span>}
                    <span className="font-display text-[0.55rem] uppercase tracking-widest text-gold-deep">
                      {v.kind}
                    </span>
                  </p>
                  {v.address && <p className="text-sm text-muted">{v.address}</p>}
                  {v.notes && <p className="text-sm text-muted-dim">{v.notes}</p>}
                </div>
                <div className="figures flex items-baseline gap-4 text-sm text-muted">
                  <span>{fromClub.toFixed(1)} km from the club</span>
                  {v.pistes !== null && <span>{v.pistes} strips</span>}
                  <span className={v.has_scoring ? 'text-signal-green' : 'text-muted-dim'}>
                    {v.has_scoring ? 'scoring' : 'no scoring'}
                  </span>
                  <button type="button" onClick={() => void archive(v.id, v.status)}
                          className="text-muted-dim hover:text-signal-amber">
                    {v.status === 'active' ? 'Archive' : 'Restore'}
                  </button>
                </div>
              </li>
            )
          })}
        </ul>
      </Plate>
    </div>
  )
}

function VenueForm({ onDone }: { onDone: (saved: boolean) => void | Promise<void> }) {
  const [name, setName] = useState('')
  const [nativeName, setNativeName] = useState('')
  const [kind, setKind] = useState<typeof KINDS[number]>('salle')
  const [address, setAddress] = useState('')
  const [lat, setLat] = useState('')
  const [lng, setLng] = useState('')
  const [pistes, setPistes] = useState('')
  const [capacity, setCapacity] = useState('')
  const [indoor, setIndoor] = useState(true)
  const [hasScoring, setHasScoring] = useState(false)
  const [notes, setNotes] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    const latitude = Number(lat)
    const longitude = Number(lng)
    if (!name.trim()) { setError('Name it.'); return }
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      setError('A venue needs coordinates. Without them the meetup planner cannot rank it, and it will quietly stop being offered.')
      return
    }
    setBusy(true)
    const { error } = await supabase.from('venues').insert({
      name: name.trim(),
      native_name: nativeName.trim() || null,
      kind, address: address.trim() || null,
      lat: latitude, lng: longitude,
      pistes: pistes ? Number(pistes) : null,
      capacity: capacity ? Number(capacity) : null,
      indoor, has_scoring: hasScoring,
      notes: notes.trim() || null,
    })
    setBusy(false)
    if (error) { setError(t.errors.saveFailed); return }
    await onDone(true)
  }

  return (
    <Plate title="Add a venue" edge="gold">
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Name" htmlFor="vname">
            <input id="vname" className={inputClass} value={name} onChange={e => setName(e.target.value)} />
          </Field>
          <Field label="Name in Chinese" htmlFor="vnative">
            <input id="vnative" className={inputClass} value={nativeName} onChange={e => setNativeName(e.target.value)} />
          </Field>
          <Field label="Kind" htmlFor="vkind">
            <select id="vkind" className={inputClass} value={kind}
                    onChange={e => setKind(e.target.value as typeof KINDS[number])}>
              {KINDS.map(k => <option key={k} value={k}>{k[0].toUpperCase() + k.slice(1)}</option>)}
            </select>
          </Field>
          <Field label="Address" htmlFor="vaddress">
            <input id="vaddress" className={inputClass} value={address} onChange={e => setAddress(e.target.value)} />
          </Field>
          <Field label="Latitude" htmlFor="vlat"
                 help="From a maps app: long-press the spot and copy the numbers.">
            <input id="vlat" className={inputClass} inputMode="decimal" value={lat}
                   onChange={e => setLat(e.target.value)} />
          </Field>
          <Field label="Longitude" htmlFor="vlng">
            <input id="vlng" className={inputClass} inputMode="decimal" value={lng}
                   onChange={e => setLng(e.target.value)} />
          </Field>
          <Field label="Strips" htmlFor="vpistes">
            <input id="vpistes" type="number" min={0} className={inputClass} value={pistes}
                   onChange={e => setPistes(e.target.value)} />
          </Field>
          <Field label="Capacity" htmlFor="vcapacity">
            <input id="vcapacity" type="number" min={0} className={inputClass} value={capacity}
                   onChange={e => setCapacity(e.target.value)} />
          </Field>
        </div>

        <div className="flex flex-wrap gap-4">
          <label className="flex items-center gap-2 text-sm text-paper">
            <input type="checkbox" checked={indoor} onChange={e => setIndoor(e.target.checked)} className="size-4" />
            Indoor
          </label>
          <label className="flex items-center gap-2 text-sm text-paper">
            <input type="checkbox" checked={hasScoring} onChange={e => setHasScoring(e.target.checked)} className="size-4" />
            Boxes and reels on site
          </label>
        </div>

        <Field label="Notes" htmlFor="vnotes">
          <textarea id="vnotes" rows={2} className={inputClass} value={notes} onChange={e => setNotes(e.target.value)} />
        </Field>

        {error && <p role="alert" className="text-sm text-signal-red">{error}</p>}

        <div className="flex gap-2">
          <Button type="submit" busy={busy}>{t.common.save}</Button>
          <Button type="button" variant="ghost" onClick={() => void onDone(false)}>{t.common.cancel}</Button>
        </div>
      </form>
    </Plate>
  )
}
