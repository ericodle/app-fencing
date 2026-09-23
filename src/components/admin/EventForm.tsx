import { useState, type FormEvent, type ReactNode } from 'react'
import { supabase } from '../../lib/supabase'
import { t } from '../../i18n'
import { clubConfig } from '../../config/club'
import { WEAPONS, type Weapon } from '../../config/weapons'
import {
  EVENT_KINDS, usesCourseDays, venueIsNegotiable, pollsAttendance, type EventKind,
} from '../../lib/event-kinds'
import { eventKindLabel, weaponLabel } from '../../lib/labels'
import { formatMoney } from '../../lib/money'
import { todayInClub } from '../../lib/dates'
import { Plate } from '../ui/Plate'
import { Button } from '../ui/Button'
import { Field, inputClass } from '../ui/Field'
import { CatalogForm } from './CatalogManager'
import { VENUE_FIELDS, PRICE_FIELDS, POLICY_FIELDS, type CatalogRow } from './catalog'
import type { EventRow, Venue, Price, CancellationPolicy } from '../../types/db'

// Adding or editing an event. The venue, the price tier and the cancellation
// policy are each picked from the club's lists, and each can be created on the
// spot without leaving the form — an admin putting on a one-off session at a
// new park should not have to abandon the event to go and add the park.

export function EventForm({ initial, venues, prices, policies, createdBy, onDone }: {
  initial?: EventRow | null
  venues: Venue[]
  prices: Price[]
  policies: CancellationPolicy[]
  createdBy: string
  onDone: (saved: EventRow | null) => void | Promise<void>
}) {
  const [venueList, setVenueList] = useState(venues)
  const [priceList, setPriceList] = useState(prices)
  const [policyList, setPolicyList] = useState(policies)

  const [kind, setKind] = useState<EventKind>((initial?.kind as EventKind) ?? 'practice')
  const [title, setTitle] = useState(initial?.admin_title ?? '')
  const [displayTitle, setDisplayTitle] = useState(initial?.display_title ?? '')
  const [venueId, setVenueId] = useState(initial?.venue_id ?? '')
  const [startDate, setStartDate] = useState(initial?.start_date ?? todayInClub())
  const [endDate, setEndDate] = useState(initial?.end_date ?? '')
  const [courseDays, setCourseDays] = useState<string[]>(initial?.course_days ?? [todayInClub()])
  const [startTime, setStartTime] = useState(initial?.start_time?.slice(0, 5) ?? '19:00')
  const [endTime, setEndTime] = useState(initial?.end_time?.slice(0, 5) ?? '21:00')
  const [weapons, setWeapons] = useState<Weapon[]>((initial?.weapons as Weapon[]) ?? [])
  const [capacity, setCapacity] = useState(initial?.capacity?.toString() ?? '')
  const [priceId, setPriceId] = useState(initial?.price_id ?? '')
  const [policyId, setPolicyId] = useState(initial?.cancel_policy_id ?? '')
  const [cancelDate, setCancelDate] = useState(initial?.cancel_date ?? '')
  const [paymentDeadline, setPaymentDeadline] = useState(initial?.full_payment_deadline ?? '')
  const [registrationOpen, setRegistrationOpen] = useState(initial?.registration_open ?? true)
  const [meetupOpen, setMeetupOpen] = useState(initial?.meetup_open ?? false)
  const [notes, setNotes] = useState(initial?.notes ?? '')
  const [creating, setCreating] = useState<'venue' | 'price' | 'policy' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const isCourse = usesCourseDays(kind)
  const canMove = venueIsNegotiable(kind)
  const price = priceList.find(p => p.id === priceId)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (!title.trim()) { setError('Give it a title.'); return }
    if (isCourse && courseDays.filter(Boolean).length === 0) {
      setError('A course runs on a list of days. Add at least one.')
      return
    }

    const row = {
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
      price_id: priceId || null,
      cancel_policy_id: policyId || null,
      cancel_date: cancelDate || null,
      full_payment_deadline: paymentDeadline || null,
      registration_open: registrationOpen,
      meetup_open: canMove && meetupOpen,
      notes: notes.trim() || null,
    }

    setBusy(true)
    const { data, error } = initial
      ? await supabase.from('events').update(row).eq('id', initial.id).select().single()
      : await supabase.from('events')
          .insert({ ...row, polls_attendance: pollsAttendance(kind), created_by: createdBy })
          .select().single()
    setBusy(false)
    if (error) { setError(error.message); return }
    await onDone(data)
  }

  return (
    <Plate title={initial ? 'Edit event' : 'Add an event'} edge="gold">
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Kind" htmlFor="ekind">
            <select id="ekind" className={inputClass} value={kind}
                    onChange={e => setKind(e.target.value as EventKind)}>
              {EVENT_KINDS.map(k => <option key={k} value={k}>{eventKindLabel(k)}</option>)}
            </select>
          </Field>
          <Picker
            id="evenue" label="Venue" value={venueId} onChange={setVenueId}
            empty={t.calendar.venueTbd}
            options={venueList.filter(v => v.status === 'active' || v.id === venueId)
              .map(v => ({ value: v.id, label: v.name }))}
            onNew={() => setCreating(creating === 'venue' ? null : 'venue')} newLabel="New venue"
          />
          <Field label="Title (staff)" htmlFor="etitle">
            <input id="etitle" className={inputClass} value={title} onChange={e => setTitle(e.target.value)} />
          </Field>
          <Field label="Title (members see this)" htmlFor="edisplay"
                 help="Leave blank to use the staff title.">
            <input id="edisplay" className={inputClass} value={displayTitle}
                   onChange={e => setDisplayTitle(e.target.value)} />
          </Field>
        </div>

        {creating === 'venue' && (
          <Inline title="New venue">
            <CatalogForm nested table="venues" noun="venue" fields={VENUE_FIELDS}
                         defaults={{ kind: 'salle', status: 'active', indoor: true }}
                         onCancel={() => setCreating(null)}
                         onSaved={row => {
                           setVenueList(list => [...list, row as unknown as Venue])
                           setVenueId(row.id)
                           setCreating(null)
                         }} />
          </Inline>
        )}

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

        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Starts" htmlFor="estarttime">
            <input id="estarttime" type="time" className={inputClass} value={startTime}
                   onChange={e => setStartTime(e.target.value)} />
          </Field>
          <Field label="Ends" htmlFor="eendtime">
            <input id="eendtime" type="time" className={inputClass} value={endTime}
                   onChange={e => setEndTime(e.target.value)} />
          </Field>
          <Field label="Places" htmlFor="ecapacity" help="Blank for no limit. Past it, registrations waitlist.">
            <input id="ecapacity" type="number" min={0} className={inputClass} value={capacity}
                   onChange={e => setCapacity(e.target.value)} />
          </Field>
        </div>

        <fieldset className="flex flex-col gap-4 border-t border-rule-faint pt-4">
          <legend className="sr-only">Registration and payment</legend>
          <label className="flex items-start gap-2 text-sm text-paper">
            <input type="checkbox" checked={registrationOpen} className="mt-1 size-4"
                   onChange={e => setRegistrationOpen(e.target.checked)} />
            <span>
              Members can register from the calendar
              <span className="block text-muted-dim">Untick to take registrations only from staff.</span>
            </span>
          </label>

          <div className="grid gap-4 sm:grid-cols-2">
            <Picker
              id="eprice" label="Price" value={priceId} onChange={setPriceId}
              empty="Free"
              options={priceList.filter(p => p.active || p.id === priceId).map(p => ({
                value: p.id,
                label: `${p.label} — ${formatMoney(p.amount)}${p.deposit_amount ? `, deposit ${formatMoney(p.deposit_amount)}` : ''}`,
              }))}
              onNew={() => setCreating(creating === 'price' ? null : 'price')} newLabel="New price"
              help={price
                ? (price.deposit_amount
                    ? 'Members pay the deposit to hold their place, and the rest by the payment deadline.'
                    : 'No deposit: the booking is confirmed once the full price is paid.')
                : 'Nothing to pay. Registrations are confirmed at once.'}
            />
            <Picker
              id="epolicy" label="Cancellation policy" value={policyId} onChange={setPolicyId}
              empty="None"
              options={policyList.filter(p => p.active || p.id === policyId)
                .map(p => ({ value: p.id, label: p.title }))}
              onNew={() => setCreating(creating === 'policy' ? null : 'policy')} newLabel="New policy"
              help="Members tick that they agree to it when they register."
            />
          </div>

          {creating === 'price' && (
            <Inline title="New price">
              <CatalogForm nested table="prices" noun="price" fields={PRICE_FIELDS}
                           defaults={{ unit: 'session', active: true, applies_to: [kind], currency: clubConfig.locale.currency }}
                           onCancel={() => setCreating(null)}
                           onSaved={(row: CatalogRow) => {
                             setPriceList(list => [...list, row as unknown as Price])
                             setPriceId(row.id)
                             setCreating(null)
                           }} />
            </Inline>
          )}
          {creating === 'policy' && (
            <Inline title="New cancellation policy">
              <CatalogForm nested table="cancellation_policies" noun="policy" fields={POLICY_FIELDS}
                           defaults={{ deposit_refundable: true, active: true }}
                           onCancel={() => setCreating(null)}
                           onSaved={(row: CatalogRow) => {
                             setPolicyList(list => [...list, row as unknown as CancellationPolicy])
                             setPolicyId(row.id)
                             setCreating(null)
                           }} />
            </Inline>
          )}

          {price && (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Cancel by" htmlFor="ecanceldate"
                     help="A refund asked for on or before this day comes back as credit. Blank means any time before the event.">
                <input id="ecanceldate" type="date" className={inputClass} value={cancelDate}
                       onChange={e => setCancelDate(e.target.value)} />
              </Field>
              <Field label="Pay in full by" htmlFor="edeadline"
                     help={`Blank means ${clubConfig.club.paymentDeadlineFallbackDays} days before it starts.`}>
                <input id="edeadline" type="date" className={inputClass} value={paymentDeadline}
                       onChange={e => setPaymentDeadline(e.target.value)} />
              </Field>
            </div>
          )}
        </fieldset>

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
          <Button type="button" variant="ghost" onClick={() => void onDone(null)}>{t.common.cancel}</Button>
        </div>
      </form>
    </Plate>
  )
}

/** A select from one of the club's lists, with a link to add to the list. */
function Picker({ id, label, value, onChange, empty, options, onNew, newLabel, help }: {
  id: string
  label: string
  value: string
  onChange: (v: string) => void
  empty: string
  options: { value: string; label: string }[]
  onNew: () => void
  newLabel: string
  help?: string
}) {
  return (
    <Field label={label} htmlFor={id} help={help}>
      <div className="flex gap-2">
        <select id={id} className={inputClass} value={value} onChange={e => onChange(e.target.value)}>
          <option value="">{empty}</option>
          {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <button type="button" onClick={onNew}
                className="shrink-0 border border-rule px-3 text-sm text-gold hover:border-gold">
          {newLabel}
        </button>
      </div>
    </Field>
  )
}

function Inline({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="border border-rule-faint bg-ink-900 p-4">
      <h3 className="mb-3 font-display text-sm uppercase tracking-widest text-silver">{title}</h3>
      {children}
    </section>
  )
}
