import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth'
import { t } from '../../i18n'
import { titleFor, firstDay, type EventWithVenue } from '../../lib/events'
import { formatMoney } from '../../lib/money'
import { formatDate, formatInstant } from '../../lib/dates'
import { bookingStatusLabel } from '../../lib/labels'
import { PageLoading } from '../../components/ui/Spinner'
import { Plate } from '../../components/ui/Plate'
import { PaymentBadge } from '../../components/register/PaymentBadge'
import type { Booking, BookingBalance, Credit, Profile } from '../../types/db'

// Who has paid, across every event: what is still owed, the refund requests
// waiting for a decision, money on cancelled registrations nobody has settled,
// and the credit the club is holding for members.
//
// Each line opens its event's registrations page, where the actions are. This
// page is the to-do list; the event page is where it gets done.

type Member = Pick<Profile, 'id' | 'name' | 'email'>
type Row = Booking & { event: EventWithVenue | null; member: Member | null; money: BookingBalance }

const SELECT = '*, event:events!bookings_event_id_fkey(*), member:profiles!bookings_member_id_fkey(id, name, email)'

export function AdminPaymentsPage() {
  const { profile } = useAuth()
  const [owing, setOwing] = useState<Row[]>([])
  const [requests, setRequests] = useState<Row[]>([])
  const [unsettled, setUnsettled] = useState<Row[]>([])
  const [credits, setCredits] = useState<(Credit & { member: Member | null })[]>([])
  const [loading, setLoading] = useState(true)
  const isAdmin = profile?.role === 'admin'

  const load = useCallback(async () => {
    const [due, settle, asked, held] = await Promise.all([
      supabase.from('booking_balances').select('*').gt('balance', 0).in('status', ['pending', 'confirmed']),
      supabase.from('booking_balances').select('*').gt('unsettled', 0),
      supabase.from('bookings').select('id').not('refund_requested_at', 'is', null).neq('status', 'cancelled'),
      supabase.from('credits').select('*, member:profiles!credits_member_id_fkey(id, name, email)')
        .eq('status', 'open').order('created_at'),
    ])
    const ids = [...new Set([
      ...(due.data ?? []).map(b => b.booking_id!),
      ...(settle.data ?? []).map(b => b.booking_id!),
      ...(asked.data ?? []).map(b => b.id),
    ])]
    const { data: bookings } = ids.length
      ? await supabase.from('bookings').select(SELECT).in('id', ids)
      : { data: [] }
    const balances = [...(due.data ?? []), ...(settle.data ?? [])]
    const { data: askedMoney } = (asked.data ?? []).length
      ? await supabase.from('booking_balances').select('*').in('booking_id', (asked.data ?? []).map(b => b.id))
      : { data: [] as BookingBalance[] }
    const moneyOf = (id: string) =>
      [...balances, ...(askedMoney ?? [])].find(b => b.booking_id === id)!
    const rows = ((bookings ?? []) as unknown as Omit<Row, 'money'>[]).map(b => ({ ...b, money: moneyOf(b.id) }))
    const byDate = (a: Row, b: Row) =>
      (a.event ? firstDay(a.event) ?? '' : '').localeCompare(b.event ? firstDay(b.event) ?? '' : '')

    setOwing(rows.filter(r => (due.data ?? []).some(d => d.booking_id === r.id)).sort(byDate))
    setUnsettled(rows.filter(r => (settle.data ?? []).some(d => d.booking_id === r.id)).sort(byDate))
    setRequests(rows.filter(r => (asked.data ?? []).some(d => d.id === r.id)).sort(byDate))
    setCredits((held.data ?? []) as unknown as (Credit & { member: Member | null })[])
    setLoading(false)
  }, [])

  useEffect(() => { void load() }, [load])

  if (loading) return <PageLoading />

  const totalOwed = owing.reduce((s, r) => s + Number(r.money.balance ?? 0), 0)
  const creditByMember = new Map<string, { member: Member | null; total: number }>()
  for (const c of credits) {
    const entry = creditByMember.get(c.member_id) ?? { member: c.member, total: 0 }
    entry.total += Number(c.amount)
    creditByMember.set(c.member_id, entry)
  }

  async function payOut(memberId: string, amount: number) {
    if (!window.confirm(`Record that ${formatMoney(amount)} of credit was paid back in cash?`)) return
    await supabase.from('credits').insert({
      member_id: memberId, amount: -amount, source: 'admin_refund',
      reason: 'Credit paid back in cash', created_by: profile!.id,
    })
    await load()
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-display text-2xl text-gold">{t.admin.payments}</h1>

      {requests.length > 0 && (
        <Plate title={`Refund requests — ${requests.length}`} edge="gold"
               subtitle="Approve or decline on the event's registrations page.">
          <List rows={requests} extra={r => `asked ${formatInstant(r.refund_requested_at)}`} />
        </Plate>
      )}

      {unsettled.length > 0 && (
        <Plate title={`To settle — ${unsettled.length}`}
               subtitle="Paid on a registration that was cancelled, and not refunded automatically. Refund it, credit it, or keep it.">
          <List rows={unsettled} extra={r => `${formatMoney(r.money.unsettled)} held`} />
        </Plate>
      )}

      <Plate title="Still owed" subtitle={owing.length ? `${formatMoney(totalOwed)} across ${owing.length} registrations.` : undefined}>
        {owing.length === 0 ? <p className="text-muted">Everyone is paid up.</p> : <List rows={owing} />}
      </Plate>

      {creditByMember.size > 0 && (
        <Plate title="Credit held for members"
               subtitle="Refunds from cancellations. Members spend it on their next registration.">
          <ul className="flex flex-col text-sm">
            {[...creditByMember.entries()].map(([id, { member, total }]) => (
              <li key={id} className="flex flex-wrap items-baseline justify-between gap-2 border-b border-rule-faint py-2 last:border-b-0">
                <span className="text-paper">{member?.name ?? member?.email}</span>
                <span className="flex items-baseline gap-4">
                  <span className="figures text-signal-green">{formatMoney(total)}</span>
                  {isAdmin && total > 0 && (
                    <button type="button" className="text-muted-dim hover:text-gold" onClick={() => void payOut(id, total)}>
                      Paid back in cash
                    </button>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </Plate>
      )}
    </div>
  )
}

function List({ rows, extra }: { rows: Row[]; extra?: (r: Row) => ReactNode }) {
  return (
    <ul className="flex flex-col">
      {rows.map(r => {
        const day = r.event ? firstDay(r.event) : null
        return (
          <li key={r.id} className="border-b border-rule-faint py-2.5 last:border-b-0">
            <Link to={`/manage/events/${r.event_id}`}
                  className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 hover:text-gold">
              <span className="flex min-w-0 flex-wrap items-baseline gap-2">
                <span className="text-paper">{r.member?.name ?? r.member?.email}</span>
                <span className="text-sm text-muted">{r.event ? titleFor(r.event) : ''}{day && ` · ${formatDate(day)}`}</span>
                <span className="font-display text-[0.6rem] uppercase tracking-widest text-silver">
                  {bookingStatusLabel(r.status)}
                </span>
                {r.status !== 'cancelled' && <PaymentBadge row={r.money} />}
              </span>
              <span className="figures text-sm text-muted">
                {extra ? extra(r) : `${formatMoney(r.money.balance)} of ${formatMoney(r.money.owed)}`}
              </span>
            </Link>
          </li>
        )
      })}
    </ul>
  )
}
