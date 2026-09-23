import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth'
import { t } from '../../i18n'
import { fetchEvent, titleFor, eventDays, type EventWithVenue } from '../../lib/events'
import { fetchEventBookings, fetchPaymentMethods, type BookingWithMoney } from '../../lib/bookings'
import { formatMoney } from '../../lib/money'
import { formatDateLong, formatTimeRange, formatDate } from '../../lib/dates'
import { eventKindLabel } from '../../lib/labels'
import { PageLoading } from '../../components/ui/Spinner'
import { Plate } from '../../components/ui/Plate'
import { Button } from '../../components/ui/Button'
import { inputClass } from '../../components/ui/Field'
import { EventForm } from '../../components/admin/EventForm'
import { RegistrationRow } from '../../components/admin/RegistrationRow'
import type {
  Venue, Price, CancellationPolicy, PaymentMethod, Discount, Waiver, RosterEntry,
} from '../../types/db'

// One event, from the club's side: its registrations and where each one's
// money stands, and the event's own lifecycle — edit, cancel, restore, delete.
//
// Cancelling an event cancels every registration on it and refunds everything
// paid as account credit, deposits included; restoring it puts back exactly
// the registrations it cancelled and takes the credit back. Both are the
// database's doing (events_cascade_cancellation). An event with registrations
// cannot be deleted at all — it is cancelled.

export function AdminEventDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { profile } = useAuth()
  const navigate = useNavigate()
  const [event, setEvent] = useState<EventWithVenue | null>(null)
  const [bookings, setBookings] = useState<BookingWithMoney[]>([])
  const [missing, setMissing] = useState<Record<string, Waiver[]>>({})
  const [methods, setMethods] = useState<PaymentMethod[]>([])
  const [discounts, setDiscounts] = useState<Discount[]>([])
  const [venues, setVenues] = useState<Venue[]>([])
  const [prices, setPrices] = useState<Price[]>([])
  const [policies, setPolicies] = useState<CancellationPolicy[]>([])
  const [roster, setRoster] = useState<RosterEntry[]>([])
  const [editing, setEditing] = useState(false)
  const [adding, setAdding] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)

  const isAdmin = profile?.role === 'admin'

  const load = useCallback(async () => {
    if (!id) return
    const [e, b, m, d, v, p, c, r] = await Promise.all([
      fetchEvent(id),
      fetchEventBookings(id),
      fetchPaymentMethods(false),
      supabase.from('discounts').select('*').eq('active', true).order('label'),
      supabase.from('venues').select('*').order('name'),
      supabase.from('prices').select('*').order('sort_order'),
      supabase.from('cancellation_policies').select('*').order('title'),
      supabase.from('roster').select('*').order('name'),
    ])
    const live = b.filter(x => x.status !== 'cancelled')
    const waivers = await Promise.all(live.map(x =>
      supabase.rpc('my_missing_waivers', { p_member_id: x.member_id, p_event_id: id })))
    setEvent(e)
    setBookings(b)
    setMissing(Object.fromEntries(live.map((x, i) => [x.id, waivers[i].data ?? []])))
    setMethods(m)
    setDiscounts(d.data ?? [])
    setVenues(v.data ?? [])
    setPrices(p.data ?? [])
    setPolicies(c.data ?? [])
    setRoster(r.data ?? [])
    setLoading(false)
  }, [id])

  useEffect(() => { void load() }, [load])

  if (loading) return <PageLoading />
  if (!event || !profile) return <p className="text-muted">{t.errors.notFound}</p>

  const days = eventDays(event)
  const price = prices.find(p => p.id === event.price_id)
  const policy = policies.find(p => p.id === event.cancel_policy_id)
  const live = bookings.filter(b => b.status === 'pending' || b.status === 'confirmed' || b.status === 'no_show')
  const waiting = bookings.filter(b => b.status === 'waitlisted')
  const gone = bookings.filter(b => b.status === 'cancelled')
  // Money still owed counts only what is owed; an overpaid booking is not
  // negative debt that cancels out someone else's.
  const sum = (rows: BookingWithMoney[], key: 'paid' | 'balance' | 'unsettled') =>
    rows.reduce((s, b) => {
      const v = Number(b.money?.[key] ?? 0)
      return s + (key === 'balance' ? Math.max(v, 0) : v)
    }, 0)
  const unbooked = roster.filter(r => r.id && !bookings.some(b => b.member_id === r.id && b.status !== 'cancelled'))

  async function run(fn: () => PromiseLike<{ error: { message: string } | null }>) {
    setBusy(true)
    setError(null)
    const { error } = await fn()
    setBusy(false)
    if (error) { setError(error.message); return false }
    await load()
    return true
  }

  function cancelEvent() {
    const reason = window.prompt(
      'Cancel this event? Every registration is cancelled and everything paid comes back as account credit, deposits included.\n\nReason (members see it):')
    if (reason === null) return
    void run(() => supabase.from('events')
      .update({ cancelled_at: new Date().toISOString(), cancellation_reason: reason.trim() || null })
      .eq('id', event!.id))
  }

  async function deleteEvent() {
    if (!window.confirm('Delete this event? This cannot be undone.')) return
    setError(null)
    const { error } = await supabase.from('events').delete().eq('id', event!.id)
    if (error) {
      setError(error.code === '23503'
        ? 'This event has registrations, so it cannot be deleted. Cancel it instead — that refunds everyone as credit.'
        : error.message)
      return
    }
    void navigate('/manage/events')
  }

  if (editing) {
    return (
      <EventForm initial={event} venues={venues} prices={prices} policies={policies} createdBy={profile.id}
                 onDone={async saved => { setEditing(false); if (saved) await load() }} />
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <Link to="/manage/events" className="text-sm text-silver hover:text-gold">← {t.admin.events}</Link>
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h1 className="font-display text-2xl text-gold">{titleFor(event)}</h1>
          <div className="flex flex-wrap gap-2">
            <Link to={`/calendar/${event.id}`} className="self-center text-sm text-gold hover:text-gold-soft">
              Member view →
            </Link>
            {isAdmin && <Button variant="ghost" onClick={() => setEditing(true)}>{t.common.edit}</Button>}
            {isAdmin && (event.cancelled_at ? (
              <Button variant="ghost" busy={busy} onClick={() => void run(() => supabase.from('events')
                .update({ cancelled_at: null, cancellation_reason: null }).eq('id', event.id))}>
                Restore event
              </Button>
            ) : (
              <Button variant="danger" busy={busy} onClick={cancelEvent}>Cancel event</Button>
            ))}
            {isAdmin && bookings.length === 0 && (
              <Button variant="danger" onClick={() => void deleteEvent()}>{t.common.delete}</Button>
            )}
          </div>
        </div>
        <p className="flex flex-wrap gap-x-3 text-muted">
          <span className="font-display text-xs uppercase tracking-widest text-gold-deep">{eventKindLabel(event.kind)}</span>
          {days[0] && <span>{days.length === 1 ? formatDateLong(days[0]) : `${days.length} days from ${formatDateLong(days[0])}`}</span>}
          {event.start_time && <span className="figures">{formatTimeRange(event.start_time, event.end_time)}</span>}
          <span>{event.venue?.name ?? t.calendar.venueTbd}</span>
        </p>
        <p className="flex flex-wrap gap-x-3 text-sm text-muted-dim">
          <span>{price ? `${price.label}: ${formatMoney(price.amount)}${price.deposit_amount ? `, deposit ${formatMoney(price.deposit_amount)}` : ''}` : 'Free'}</span>
          {policy && <span>Policy: {policy.title}</span>}
          {event.cancel_date && <span>Cancel by {formatDate(event.cancel_date)}</span>}
          <span>{event.registration_open ? 'Members register themselves' : 'Staff registration only'}</span>
        </p>
        {event.cancelled_at && (
          <p className="border-l-2 border-signal-red pl-3 text-signal-red">
            {t.calendar.cancelled}{event.cancellation_reason && ` — ${event.cancellation_reason}`}
          </p>
        )}
      </header>

      {error && <p role="alert" className="text-sm text-signal-red">{error}</p>}

      <Plate>
        <dl className="figures grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
          <Stat label="Registered" value={`${live.length}${event.capacity !== null ? ` / ${event.capacity}` : ''}`} />
          <Stat label="Waitlist" value={String(waiting.length)} />
          <Stat label="Paid in" value={formatMoney(sum([...live, ...gone], 'paid'))} />
          <Stat label="Still owed" value={formatMoney(sum(live, 'balance'))} />
        </dl>
      </Plate>

      <Plate title={`${t.admin.registrations} — ${live.length}`}>
        {live.length === 0 ? <p className="text-muted">Nobody yet.</p> : (
          <ul className="flex flex-col">
            {live.map(b => (
              <RegistrationRow key={b.id} booking={b} missing={missing[b.id] ?? []} methods={methods}
                               discounts={discounts} isAdmin={isAdmin} staffId={profile.id} onChanged={load} />
            ))}
          </ul>
        )}

        {!event.cancelled_at && (
          <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-rule-faint pt-4">
            <select aria-label="Member to register" className={`${inputClass} sm:max-w-xs`} value={adding}
                    onChange={e => setAdding(e.target.value)}>
              <option value="">Register a member…</option>
              {unbooked.map(r => <option key={r.id!} value={r.id!}>{r.name}</option>)}
            </select>
            <Button variant="ghost" busy={busy} disabled={!adding}
                    onClick={async () => {
                      const ok = await run(() => supabase.from('bookings')
                        .insert({ event_id: event.id, member_id: adding, created_by: profile.id }))
                      if (ok) setAdding('')
                    }}>
              Register
            </Button>
            <span className="text-xs text-muted-dim">
              Staff registrations skip the waiver and policy checks; the waivers still show as missing until signed.
            </span>
          </div>
        )}
      </Plate>

      {waiting.length > 0 && (
        <Plate title={`Waitlist — ${waiting.length}`} subtitle="In order. The first moves up automatically when a place frees.">
          <ul className="flex flex-col">
            {waiting.map(b => (
              <RegistrationRow key={b.id} booking={b} missing={missing[b.id] ?? []} methods={methods}
                               discounts={discounts} isAdmin={isAdmin} staffId={profile.id} onChanged={load} />
            ))}
          </ul>
        </Plate>
      )}

      {gone.length > 0 && (
        <Plate title={`Cancelled — ${gone.length}`}
               subtitle={sum(gone, 'unsettled') > 0 ? `${formatMoney(sum(gone, 'unsettled'))} still to settle.` : undefined}>
          <ul className="flex flex-col">
            {gone.map(b => (
              <RegistrationRow key={b.id} booking={b} missing={[]} methods={methods}
                               discounts={discounts} isAdmin={isAdmin} staffId={profile.id} onChanged={load} />
            ))}
          </ul>
        </Plate>
      )}
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="font-display text-[0.6rem] uppercase tracking-widest text-silver">{label}</dt>
      <dd className="mt-0.5 text-lg text-paper">{value}</dd>
    </div>
  )
}
