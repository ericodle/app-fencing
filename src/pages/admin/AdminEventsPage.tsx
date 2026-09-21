import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth'
import { t } from '../../i18n'
import { clubConfig } from '../../config/club'
import { WEAPONS, type Weapon } from '../../config/weapons'
import {
  EVENT_KINDS, usesCourseDays, venueIsNegotiable, pollsAttendance, type EventKind,
} from '../../lib/event-kinds'
import { fetchUpcoming, titleFor, eventDays, type EventWithVenue } from '../../lib/events'
import { relativeDay, formatTimeRange, todayInClub } from '../../lib/dates'
import { eventKindLabel, weaponLabel } from '../../lib/labels'
import { PageLoading } from '../../components/ui/Spinner'
import { Plate } from '../../components/ui/Plate'
import { Button } from '../../components/ui/Button'
import { Field, inputClass } from '../../components/ui/Field'
import type { Venue } from '../../types/db'

export function AdminEventsPage() {
  const { profile } = useAuth()
  const [events, setEvents] = useState<EventWithVenue[]>([])
  const [venues, setVenues] = useState<Venue[]>([])
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState(false)

  const load = useCallback(async () => {
    const [upcoming, v] = await Promise.all([
      fetchUpcoming(40),
      supabase.from('venues').select('*').eq('status', 'active').order('name'),
    ])
    setEvents(upcoming)
    setVenues(v.data ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { void load() }, [load])

  if (loading) return <PageLoading />
  const isAdmin = profile?.role === 'admin'

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-baseline justify-between gap-3">
        <h1 className="font-display text-2xl text-gold">{t.admin.events}</h1>
        {isAdmin && (
          <Button onClick={() => setAdding(v => !v)}>
            {adding ? t.common.cancel : 'Add a session'}
          </Button>
        )}
      </div>

      {adding && (
        <EventForm
          venues={venues}
          createdBy={profile!.id}
          onDone={async saved => { setAdding(false); if (saved) await load() }}
        />
      )}

      <Plate>
        {events.length === 0 ? (
          <p className="text-muted">{t.dashboard.nothingScheduled}</p>
        ) : (
          <ul className="flex flex-col">
            {events.map(e => (
              <li key={e.id} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-rule-faint py-2.5 last:border-b-0">
                <span className="min-w-0">
                  <Link to={`/calendar/${e.id}`} className="text-paper hover:text-gold">{titleFor(e)}</Link>
                  <span className="ml-2 font-display text-[0.55rem] uppercase tracking-widest text-gold-deep">
                    {eventKindLabel(e.kind)}
                  </span>
                  {e.meetup_open && (
                    <span className="ml-2 border border-signal-blue px-1.5 font-display text-[0.55rem] uppercase tracking-widest text-signal-blue">
                      planner on
                    </span>
                  )}
                </span>
                <span className="figures text-sm text-muted">
                  {relativeDay(eventDays(e)[0])}
                  {e.start_time && ` · ${formatTimeRange(e.start_time, e.end_time)}`}
                  {e.venue?.name && ` · ${e.venue.name}`}
                  {e.capacity !== null && ` · ${e.capacity} places`}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Plate>
    </div>
  )
}

function EventForm({ venues, createdBy, onDone }: {
  venues: Venue[]
  createdBy: string
  onDone: (saved: boolean) => void | Promise<void>
}) {
  const [kind, setKind] = useState<EventKind>('practice')
  const [title, setTitle] = useState('')
  const [displayTitle, setDisplayTitle] = useState('')
  const [venueId, setVenueId] = useState('')
  const [startDate, setStartDate] = useState(todayInClub())
  const [endDate, setEndDate] = useState('')
  const [courseDays, setCourseDays] = useState<string[]>([todayInClub()])
  const [startTime, setStartTime] = useState('19:00')
  const [endTime, setEndTime] = useState('21:00')
  const [weapons, setWeapons] = useState<Weapon[]>([])
  const [capacity, setCapacity] = useState('')
  const [price, setPrice] = useState('')
  const [meetupOpen, setMeetupOpen] = useState(false)
  const [notes, setNotes] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const isCourse = usesCourseDays(kind)
  const canMove = venueIsNegotiable(kind)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (!title.trim()) { setError('Give it a title.'); return }
    if (isCourse && courseDays.filter(Boolean).length === 0) {
      setError('A course runs on a list of days. Add at least one.')
      return
    }

    setBusy(true)
    const { error } = await supabase.from('events').insert({
      kind,
      admin_title: title.trim(),
      display_title: displayTitle.trim() || null,
      venue_id: venueId || null,
      // The two temporal shapes are mutually exclusive, and the database has a
      // constraint for each. Sending both would satisfy neither cleanly.
      start_date: isCourse ? null : startDate,
      end_date: isCourse ? null : (endDate || null),
      course_days: isCourse ? courseDays.filter(Boolean) : null,
      start_time: startTime || null,
      end_time: endTime || null,
      weapons,
      capacity: capacity ? Number(capacity) : null,
      price: price ? Number(price) : null,
      currency: price ? clubConfig.locale.currency : null,
      polls_attendance: pollsAttendance(kind),
      meetup_open: canMove && meetupOpen,
      notes: notes.trim() || null,
      created_by: createdBy,
    })
    setBusy(false)
    if (error) { setError(error.message); return }
    await onDone(true)
  }

  return (
    <Plate title="Add a session" edge="gold">
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Kind" htmlFor="ekind">
            <select id="ekind" className={inputClass} value={kind}
                    onChange={e => setKind(e.target.value as EventKind)}>
              {EVENT_KINDS.map(k => <option key={k} value={k}>{eventKindLabel(k)}</option>)}
            </select>
          </Field>
          <Field label="Venue" htmlFor="evenue">
            <select id="evenue" className={inputClass} value={venueId}
                    onChange={e => setVenueId(e.target.value)}>
              <option value="">{t.calendar.venueTbd}</option>
              {venues.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
            </select>
          </Field>
          <Field label="Title (staff)" htmlFor="etitle">
            <input id="etitle" className={inputClass} value={title} onChange={e => setTitle(e.target.value)} />
          </Field>
          <Field label="Title (members see this)" htmlFor="edisplay"
                 help="Leave blank to use the staff title.">
            <input id="edisplay" className={inputClass} value={displayTitle}
                   onChange={e => setDisplayTitle(e.target.value)} />
          </Field>
        </div>

        {isCourse ? (
          <fieldset>
            <legend className="font-display text-xs uppercase tracking-widest text-silver">
              The days it runs
            </legend>
            <p className="mt-1 text-sm text-muted-dim">
              A course is defined by its day list, not by a start and end — so a
              three-week gap in the middle of a term shows as a gap.
            </p>
            <div className="mt-2 flex flex-col gap-2">
              {courseDays.map((day, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input
                    type="date" className={`${inputClass} max-w-48`} value={day}
                    onChange={e => setCourseDays(days => days.map((d, j) => j === i ? e.target.value : d))}
                    aria-label={`Course day ${i + 1}`}
                  />
                  {courseDays.length > 1 && (
                    <button type="button" className="text-sm text-muted-dim hover:text-signal-red"
                            onClick={() => setCourseDays(days => days.filter((_, j) => j !== i))}>
                      Remove
                    </button>
                  )}
                </div>
              ))}
              <button type="button" className="self-start text-sm text-gold hover:text-gold-soft"
                      onClick={() => setCourseDays(days => [...days, ''])}>
                Add a day
              </button>
            </div>
          </fieldset>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Date" htmlFor="estart">
              <input id="estart" type="date" className={inputClass} value={startDate}
                     onChange={e => setStartDate(e.target.value)} />
            </Field>
            <Field label="Last day" htmlFor="eend" help="Only for something that runs over several days.">
              <input id="eend" type="date" className={inputClass} value={endDate}
                     onChange={e => setEndDate(e.target.value)} />
            </Field>
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-4">
          <Field label="Starts" htmlFor="estarttime">
            <input id="estarttime" type="time" className={inputClass} value={startTime}
                   onChange={e => setStartTime(e.target.value)} />
          </Field>
          <Field label="Ends" htmlFor="eendtime">
            <input id="eendtime" type="time" className={inputClass} value={endTime}
                   onChange={e => setEndTime(e.target.value)} />
          </Field>
          <Field label="Places" htmlFor="ecapacity">
            <input id="ecapacity" type="number" min={0} className={inputClass} value={capacity}
                   onChange={e => setCapacity(e.target.value)} />
          </Field>
          <Field label={`Price (${clubConfig.locale.currency})`} htmlFor="eprice">
            <input id="eprice" type="number" min={0} className={inputClass} value={price}
                   onChange={e => setPrice(e.target.value)} />
          </Field>
        </div>

        <fieldset>
          <legend className="font-display text-xs uppercase tracking-widest text-silver">
            {t.profile.weapons}
          </legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {WEAPONS.filter(w => (clubConfig.club.weapons as readonly Weapon[]).includes(w)).map(w => (
              <button
                key={w} type="button" aria-pressed={weapons.includes(w)}
                onClick={() => setWeapons(prev => prev.includes(w) ? prev.filter(x => x !== w) : [...prev, w])}
                className={`min-h-11 border px-4 py-2 font-display text-sm uppercase tracking-wide transition-colors ${
                  weapons.includes(w) ? 'border-gold bg-gold text-onyx' : 'border-rule text-silver hover:border-silver'
                }`}
              >
                {weaponLabel(w)}
              </button>
            ))}
          </div>
        </fieldset>

        {/* Offered only for the kinds whose venue can actually move. A
            tournament is at the organizer's hall; promising to relocate it
            would be promising something the app cannot deliver. */}
        {canMove && (
          <label className="flex items-start gap-2 text-sm text-paper">
            <input type="checkbox" checked={meetupOpen} className="mt-1 size-4"
                   onChange={e => setMeetupOpen(e.target.checked)} />
            <span>
              Let the meetup planner propose where to meet
              <span className="block text-muted-dim">
                Works out the most convenient point from everyone who says yes,
                and ranks the club's venues against it.
              </span>
            </span>
          </label>
        )}

        <Field label="Notes" htmlFor="enotes">
          <textarea id="enotes" rows={2} className={inputClass} value={notes}
                    onChange={e => setNotes(e.target.value)} />
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
