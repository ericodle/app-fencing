import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { t } from '../i18n'
import { titleFor, firstDay, hasFinished, type EventWithVenue } from '../lib/events'
import { fetchJuniors, fetchPaymentMethods, type MemberBrief } from '../lib/bookings'
import { formatMoney } from '../lib/money'
import { formatDate, formatInstant } from '../lib/dates'
import { bookingStatusLabel } from '../lib/labels'
import { PageLoading } from '../components/ui/Spinner'
import { Plate } from '../components/ui/Plate'
import { PaymentBadge } from '../components/register/PaymentBadge'
import type { Booking, BookingBalance, Credit, PaymentMethod } from '../types/db'

// Everything a member has registered for — theirs and their juniors' — with
// where the money stands, and their account credit.
//
// The details and the buttons (pay from credit, cancel, ask for a refund) are
// on each event's own page; this is the list that gets them there.

type Row = Booking & { event: EventWithVenue | null; money: BookingBalance | null; who: MemberBrief | null }

const SELECT = '*, event:events!bookings_event_id_fkey(*, venue:venues!events_venue_id_fkey(*))'

export function BookingsPage() {
  const { profile } = useAuth()
  const [rows, setRows] = useState<Row[]>([])
  const [credits, setCredits] = useState<Credit[]>([])
  const [methods, setMethods] = useState<PaymentMethod[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    if (!profile) return
    const kids = await fetchJuniors(profile.id)
    const people: MemberBrief[] = [profile, ...kids]
    const ids = people.map(p => p.id)
    const [b, c, m] = await Promise.all([
      supabase.from('bookings').select(SELECT).in('member_id', ids).order('created_at', { ascending: false }),
      supabase.from('credits').select('*').in('member_id', ids).eq('status', 'open').order('created_at'),
      fetchPaymentMethods(),
    ])
    const bookings = (b.data ?? []) as unknown as (Booking & { event: EventWithVenue | null })[]
    const { data: balances } = bookings.length
      ? await supabase.from('booking_balances').select('*').in('booking_id', bookings.map(x => x.id))
      : { data: [] as BookingBalance[] }
    setRows(bookings.map(x => ({
      ...x,
      money: (balances ?? []).find(bb => bb.booking_id === x.id) ?? null,
      who: people.find(p => p.id === x.member_id) ?? null,
    })))
    setCredits(c.data ?? [])
    setMethods(m)
    setLoading(false)
  }, [profile])

  useEffect(() => { void load() }, [load])

  if (loading || !profile) return <PageLoading />

  const upcoming = rows.filter(r => r.status !== 'cancelled' && r.event && !hasFinished(r.event))
    .sort((a, b) => (firstDay(a.event!) ?? '').localeCompare(firstDay(b.event!) ?? ''))
  const rest = rows.filter(r => !upcoming.includes(r))
  const creditTotal = credits.reduce((s, c) => s + Number(c.amount), 0)
  const outstanding = upcoming.reduce((s, r) => s + Math.max(Number(r.money?.balance ?? 0), 0), 0)

  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-display text-2xl text-gold">{t.bookings.title}</h1>

      {(outstanding > 0 || creditTotal > 0) && (
        <Plate>
          <dl className="figures grid gap-4 sm:grid-cols-2">
            {outstanding > 0 && (
              <div>
                <dt className="font-display text-xs uppercase tracking-widest text-silver">{t.bookings.outstanding}</dt>
                <dd className="mt-1 text-xl text-signal-amber">{formatMoney(outstanding)}</dd>
              </div>
            )}
            {creditTotal > 0 && (
              <div>
                <dt className="font-display text-xs uppercase tracking-widest text-silver">{t.bookings.accountCredit}</dt>
                <dd className="mt-1 text-xl text-signal-green">{formatMoney(creditTotal)}</dd>
                <dd className="text-sm text-muted-dim">{t.bookings.accountCreditNote}</dd>
              </div>
            )}
          </dl>
          {outstanding > 0 && methods.length > 0 && (
            <details className="mt-4 text-sm">
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
        </Plate>
      )}

      <Plate title={t.bookings.upcoming}>
        {upcoming.length === 0 ? <p className="text-muted">{t.bookings.none}</p> : (
          <ul className="flex flex-col">{upcoming.map(r => <Line key={r.id} row={r} selfId={profile.id} />)}</ul>
        )}
      </Plate>

      {rest.length > 0 && (
        <Plate title={t.bookings.past}>
          <ul className="flex flex-col">{rest.map(r => <Line key={r.id} row={r} selfId={profile.id} />)}</ul>
        </Plate>
      )}

      {credits.length > 0 && (
        <Plate title={t.bookings.accountCredit}>
          <ul className="flex flex-col text-sm">
            {credits.map(c => (
              <li key={c.id} className="flex flex-wrap justify-between gap-2 border-b border-rule-faint py-2 last:border-b-0">
                <span className="text-muted">{c.reason} · {formatInstant(c.created_at)}</span>
                <span className="figures text-paper">{formatMoney(c.amount)}</span>
              </li>
            ))}
          </ul>
        </Plate>
      )}
    </div>
  )
}

function Line({ row, selfId }: { row: Row; selfId: string }) {
  const day = row.event ? firstDay(row.event) : null
  return (
    <li className="border-b border-rule-faint py-2.5 last:border-b-0">
      <Link to={`/calendar/${row.event_id}`} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 hover:text-gold">
        <span className="flex min-w-0 flex-wrap items-baseline gap-2">
          <span className="text-paper">{row.event ? titleFor(row.event) : '—'}</span>
          {row.member_id !== selfId && row.who && <span className="text-sm text-silver-deep">{row.who.name}</span>}
          <span className="font-display text-[0.6rem] uppercase tracking-widest text-silver">
            {bookingStatusLabel(row.status)}
          </span>
          {row.money && row.status !== 'cancelled' && <PaymentBadge row={row.money} />}
        </span>
        <span className="figures text-sm text-muted">{day ? formatDate(day) : ''}</span>
      </Link>
    </li>
  )
}
