import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { t } from '../../i18n'
import { hasFinished, eventDays, type EventWithVenue } from '../../lib/events'
import {
  fetchMyBookingsFor, fetchJuniors, fetchPaymentMethods, type BookingWithMoney, type MemberBrief,
} from '../../lib/bookings'
import {
  formatMoney, fullPaymentDeadline, canSelfCancel, canRequestRefund,
} from '../../lib/money'
import { formatDate, todayInClub } from '../../lib/dates'
import { bookingStatusLabel } from '../../lib/labels'
import { Plate } from '../ui/Plate'
import { Button } from '../ui/Button'
import { PageLoading } from '../ui/Spinner'
import { WaiverSign } from '../waivers/WaiverSign'
import { PaymentBadge } from './PaymentBadge'
import type { CancellationPolicy, PaymentMethod, Price, Profile, Waiver } from '../../types/db'

// Signing up for an event, from its page.
//
// What it costs, what the deposit is and when the rest is due, what happens
// if you cancel — then the waivers you still owe, signed in place, the policy
// ticked, and Register. Once registered, the same panel shows where the money
// stands and how to pay it.
//
// None of the rules live here. The price is frozen from the tier by the
// database, the waivers and the policy tick are checked by the booking
// trigger, and a cancellation's refund is the database's to work out. This
// panel shows what the database will do and asks it to.

export function RegisterPanel({ event, profile }: { event: EventWithVenue; profile: Profile }) {
  const [price, setPrice] = useState<Price | null>(null)
  const [policy, setPolicy] = useState<CancellationPolicy | null>(null)
  const [juniors, setJuniors] = useState<MemberBrief[]>([])
  const [bookings, setBookings] = useState<BookingWithMoney[]>([])
  const [methods, setMethods] = useState<PaymentMethod[]>([])
  const [taken, setTaken] = useState(0)
  const [credit, setCredit] = useState<Record<string, number>>({})
  const [who, setWho] = useState(profile.id)
  const [missing, setMissing] = useState<Waiver[]>([])
  const [acked, setAcked] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    const kids = await fetchJuniors(profile.id)
    const ids = [profile.id, ...kids.map(k => k.id)]
    const [p, pol, mine, m, places, balances] = await Promise.all([
      event.price_id ? supabase.from('prices').select('*').eq('id', event.price_id).maybeSingle() : null,
      event.cancel_policy_id
        ? supabase.from('cancellation_policies').select('*').eq('id', event.cancel_policy_id).maybeSingle()
        : null,
      fetchMyBookingsFor(event.id, ids),
      fetchPaymentMethods(),
      supabase.rpc('event_places_taken', { p_event_ids: [event.id] }),
      supabase.from('member_balances').select('member_id, account_credit').in('member_id', ids),
    ])
    setJuniors(kids)
    setPrice(p?.data ?? null)
    setPolicy(pol?.data ?? null)
    setBookings(mine)
    setMethods(m)
    setTaken(places.data?.[0]?.taken ?? 0)
    setCredit(Object.fromEntries((balances.data ?? []).map(b => [b.member_id, Number(b.account_credit ?? 0)])))
    setLoading(false)
  }, [event.id, event.price_id, event.cancel_policy_id, profile.id])

  const loadWaivers = useCallback(async (memberId: string) => {
    const { data } = await supabase.rpc('my_missing_waivers', { p_member_id: memberId, p_event_id: event.id })
    setMissing(data ?? [])
  }, [event.id])

  const people: MemberBrief[] = [
    { id: profile.id, name: profile.name, email: profile.email, parent_account: profile.parent_account, date_of_birth: profile.date_of_birth },
    ...juniors,
  ]
  const live = bookings.filter(b => b.status !== 'cancelled')
  const unbooked = people.filter(p => !live.some(b => b.member_id === p.id))
  // Whoever is picked, or the first person not yet registered once they are.
  const selected = unbooked.find(p => p.id === who) ?? unbooked[0]
  const selectedId = selected?.id

  useEffect(() => { void load() }, [load])
  useEffect(() => { if (selectedId) void loadWaivers(selectedId) }, [loadWaivers, selectedId])

  if (loading) return <Plate title={t.register.title}><PageLoading /></Plate>

  const past = hasFinished(event)
  const canRegister = !past && !event.cancelled_at && event.registration_open && selected !== undefined
  const full = event.capacity !== null && taken >= event.capacity
  const firstDay = eventDays(event)[0] ?? null
  const due = price ? fullPaymentDeadline(event, firstDay) : null
  // A fallback deadline a week before an event three days away has already
  // passed; "due in full" says enough without a date in the past.
  const deadline = due && due >= todayInClub() ? due : null
  const ready = missing.length === 0 && (!policy || acked)

  async function register() {
    if (!selected) return
    setBusy('register')
    setError(null)
    const { error } = await supabase.from('bookings').insert({
      event_id: event.id,
      member_id: selected.id,
      policy_acked_at: policy ? new Date().toISOString() : null,
    })
    setBusy(null)
    if (error) { setError(error.message); return }
    setAcked(false)
    await load()
  }

  async function act(id: string, run: () => PromiseLike<{ error: { message: string } | null }>) {
    setBusy(id)
    setError(null)
    const { error } = await run()
    setBusy(null)
    if (error) { setError(error.message); return }
    await load()
  }

  return (
    <Plate title={t.register.title} edge="gold">
      <div className="flex flex-col gap-5">
        <Terms price={price} policy={policy} deadline={deadline} cancelDate={event.cancel_date} />

        {live.map(b => (
          <BookingCard
            key={b.id}
            booking={b}
            name={b.member_id === profile.id ? null : (b.member?.name ?? '')}
            methods={methods}
            credit={credit[b.member_id] ?? 0}
            busy={busy === b.id}
            onCancel={() => {
              if (!window.confirm(t.booking.cancelConfirm)) return
              void act(b.id, () => supabase.from('bookings').update({ status: 'cancelled' }).eq('id', b.id))
            }}
            onRefund={() => {
              if (!window.confirm(t.booking.refundConfirm)) return
              void act(b.id, () => supabase.from('bookings')
                .update({ refund_requested_at: new Date().toISOString() }).eq('id', b.id))
            }}
            onApplyCredit={() => void act(b.id, () => supabase.rpc('apply_credit_to_booking', { p_booking_id: b.id }))}
          />
        ))}

        {past ? (
          live.length === 0 && <p className="text-muted">{t.register.past}</p>
        ) : event.cancelled_at ? null : !event.registration_open ? (
          live.length === 0 && <p className="text-muted">{t.register.closed}</p>
        ) : canRegister && selected && (
          <div className="flex flex-col gap-4 border-t border-rule-faint pt-4">
            {unbooked.length > 1 && (
              <fieldset>
                <legend className="font-display text-xs uppercase tracking-widest text-silver">{t.register.who}</legend>
                <div className="mt-2 flex flex-wrap gap-2">
                  {unbooked.map(p => (
                    <button key={p.id} type="button" aria-pressed={selected.id === p.id}
                            onClick={() => { setWho(p.id); setAcked(false) }}
                            className={`min-h-11 border px-4 py-2 text-sm transition-colors ${
                              selected.id === p.id ? 'border-gold bg-gold text-onyx' : 'border-rule text-silver hover:border-silver'
                            }`}>
                      {p.id === profile.id ? t.register.me : p.name}
                    </button>
                  ))}
                </div>
              </fieldset>
            )}

            {missing.length > 0 && (
              <div className="flex flex-col gap-2">
                <p className="font-display text-xs uppercase tracking-widest text-signal-amber">{t.register.signFirst}</p>
                {missing.map(w => (
                  <WaiverSign key={w.id} waiver={w} memberId={selected.id} memberName={selected.name ?? ''}
                              eventId={event.id} onSigned={() => loadWaivers(selected.id)} />
                ))}
              </div>
            )}

            {policy && (
              <label className="flex items-start gap-2 text-sm text-paper">
                <input type="checkbox" className="mt-0.5 size-4" checked={acked}
                       onChange={e => setAcked(e.target.checked)} />
                <span>{t.register.policyAck}</span>
              </label>
            )}

            {full && <p className="text-sm text-signal-amber">{t.register.full}</p>}

            <div>
              <Button onClick={() => void register()} busy={busy === 'register'} disabled={!ready}>
                {selected.id === profile.id ? t.register.register : t.register.registerFor(selected.name ?? '')}
              </Button>
            </div>
          </div>
        )}

        {error && <p role="alert" className="text-sm text-signal-red">{error}</p>}
      </div>
    </Plate>
  )
}

function Terms({ price, policy, deadline, cancelDate }: {
  price: Price | null
  policy: CancellationPolicy | null
  deadline: string | null
  cancelDate: string | null
}) {
  return (
    <div className="flex flex-col gap-2 text-sm">
      <p className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <span>
          <span className="font-display text-xs uppercase tracking-widest text-silver">{t.register.price} </span>
          <span className="figures text-paper">{price ? formatMoney(price.amount) : t.register.free}</span>
        </span>
        {price?.deposit_amount ? (
          <span>
            <span className="font-display text-xs uppercase tracking-widest text-silver">{t.register.deposit} </span>
            <span className="figures text-paper">{formatMoney(price.deposit_amount)}</span>
          </span>
        ) : null}
      </p>
      {price && (
        <p className="text-muted">
          {price.deposit_amount ? t.register.depositNow : t.register.payInFull}
          {deadline && ` ${price.deposit_amount ? t.register.payRestBy(formatDate(deadline)) : t.register.payBy(formatDate(deadline))}`}
        </p>
      )}
      {policy && (
        <details className="border-l-2 border-rule pl-3">
          <summary className="cursor-pointer text-silver hover:text-paper">
            {t.register.policy}: {policy.title}
          </summary>
          <p className="mt-2 whitespace-pre-wrap text-muted">{policy.body}</p>
        </details>
      )}
      {price && (
        <p className="text-muted-dim">
          {cancelDate ? t.register.cancelBy(formatDate(cancelDate)) : t.register.cancelAnyTime}
          {policy && !policy.deposit_refundable && price.deposit_amount ? ` ${t.register.depositKept}` : ''}
        </p>
      )}
    </div>
  )
}

// Also the card on the member's My events page.
export function BookingCard({ booking, name, methods, credit, busy, onCancel, onRefund, onApplyCredit }: {
  booking: BookingWithMoney
  name: string | null
  methods: PaymentMethod[]
  credit: number
  busy: boolean
  onCancel: () => void
  onRefund: () => void
  onApplyCredit: () => void
}) {
  const money = booking.money
  const paid = Number(money?.paid ?? 0)
  const balance = Number(money?.balance ?? 0)
  const owes = balance > 0 && booking.status !== 'waitlisted'
  const row = { status: booking.status, paid, refund_requested_at: booking.refund_requested_at }

  return (
    <div className="flex flex-col gap-3 border border-rule-faint p-4">
      <p className="flex flex-wrap items-baseline gap-2">
        <span className="font-display text-sm uppercase tracking-widest text-gold">
          {name ? `${name} · ` : ''}{bookingStatusLabel(booking.status)}
        </span>
        {money && <PaymentBadge row={money} />}
      </p>

      {money && Number(money.owed) > 0 && (
        <dl className="figures grid grid-cols-3 gap-2 text-sm">
          <Amount label={t.booking.owed} value={money.owed} />
          <Amount label={t.booking.paid} value={money.paid} />
          <Amount label={Number(money.deposit_due) > 0 ? t.booking.depositDue : t.booking.balance}
                  value={Number(money.deposit_due) > 0 ? money.deposit_due : Math.max(balance, 0)} />
        </dl>
      )}

      {booking.status === 'waitlisted' && <p className="text-sm text-muted">{t.booking.waitlistNote}</p>}

      {owes && methods.length > 0 && (
        <details className="text-sm" open={paid === 0}>
          <summary className="cursor-pointer text-silver hover:text-paper">{t.booking.howToPay}</summary>
          <ul className="mt-2 flex flex-col gap-2">
            {methods.map(m => (
              <li key={m.id}>
                <span className="text-paper">{m.label}</span>
                {m.instructions && <span className="block whitespace-pre-wrap text-muted">{m.instructions}</span>}
              </li>
            ))}
          </ul>
        </details>
      )}

      {booking.refund_requested_at && <p className="text-sm text-signal-amber">{t.booking.refundRequested}</p>}

      <div className="flex flex-wrap gap-2">
        {owes && credit > 0 && (
          <Button variant="secondary" busy={busy} onClick={onApplyCredit}>
            {t.booking.applyCredit(formatMoney(Math.min(credit, balance)))}
          </Button>
        )}
        {canSelfCancel(row) && (
          <Button variant="ghost" busy={busy} onClick={onCancel}>{t.booking.cancel}</Button>
        )}
        {canRequestRefund(row) && (
          <Button variant="ghost" busy={busy} onClick={onRefund}>{t.booking.requestRefund}</Button>
        )}
      </div>
    </div>
  )
}

function Amount({ label, value }: { label: string; value: number | null }) {
  return (
    <div>
      <dt className="font-display text-[0.6rem] uppercase tracking-widest text-silver">{label}</dt>
      <dd className="text-paper">{formatMoney(value)}</dd>
    </div>
  )
}
