import { useState, type FormEvent, type ReactNode } from 'react'
import { supabase } from '../../lib/supabase'
import { formatMoney } from '../../lib/money'
import { formatDate, formatInstant } from '../../lib/dates'
import { bookingStatusLabel } from '../../lib/labels'
import { methodLabel, type BookingWithMoney } from '../../lib/bookings'
import { Button } from '../ui/Button'
import { inputClass } from '../ui/Field'
import { PaymentBadge } from '../register/PaymentBadge'
import type { Discount, PaymentMethod, Waiver } from '../../types/db'

// One registration on the admin's list: who, where their money stands, and
// everything staff do to it — record a payment, void one, adjust the price,
// answer a refund request, settle money left on a cancellation, record a
// paper waiver.
//
// Every one of those is a row the database checks. A coach can record and
// void payments and change a status; adjusting a price, granting credit and
// recording a paper waiver are an admin's, and the controls are hidden from a
// coach because the policies would refuse them anyway.

const STATUSES = ['pending', 'confirmed', 'waitlisted', 'cancelled', 'no_show'] as const

export function RegistrationRow({ booking, missing, methods, discounts, isAdmin, staffId, onChanged }: {
  booking: BookingWithMoney
  missing: Waiver[]
  methods: PaymentMethod[]
  discounts: Discount[]
  isAdmin: boolean
  staffId: string
  onChanged: () => Promise<void>
}) {
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const money = booking.money
  const name = booking.member?.name ?? booking.member?.email ?? 'Unknown member'
  const unsettled = Number(money?.unsettled ?? 0)

  async function run(fn: () => PromiseLike<{ error: { message: string } | null }>) {
    setBusy(true)
    setError(null)
    const { error } = await fn()
    setBusy(false)
    if (error) { setError(error.message); return false }
    await onChanged()
    return true
  }

  function setStatus(status: string) {
    if (status === 'cancelled' && !window.confirm(
      'Cancel this registration? Anything paid is refunded as credit by the cancellation rules, or left for you to settle.',
    )) return
    void run(() => supabase.from('bookings').update({ status }).eq('id', booking.id))
  }

  return (
    <li className="border-b border-rule-faint py-3 last:border-b-0">
      <button type="button" onClick={() => setOpen(o => !o)} aria-expanded={open}
              className="flex w-full flex-wrap items-baseline justify-between gap-x-4 gap-y-1 text-left">
        <span className="flex min-w-0 flex-wrap items-baseline gap-2">
          <span className="text-paper">{name}</span>
          <span className="font-display text-[0.6rem] uppercase tracking-widest text-silver">
            {bookingStatusLabel(booking.status)}
          </span>
          {money && <PaymentBadge row={money} />}
          {booking.refund_requested_at && booking.status !== 'cancelled' && (
            <span className="border border-signal-amber px-1.5 font-display text-[0.6rem] uppercase tracking-widest text-signal-amber">
              refund asked
            </span>
          )}
          {unsettled > 0 && (
            <span className="border border-signal-amber px-1.5 font-display text-[0.6rem] uppercase tracking-widest text-signal-amber">
              {formatMoney(unsettled)} to settle
            </span>
          )}
          {missing.length > 0 && booking.status !== 'cancelled' && (
            <span className="border border-signal-red px-1.5 font-display text-[0.6rem] uppercase tracking-widest text-signal-red">
              {missing.length} waiver{missing.length === 1 ? '' : 's'} missing
            </span>
          )}
        </span>
        {money && Number(money.owed) > 0 && (
          <span className="figures text-sm text-muted">
            {formatMoney(money.paid)} of {formatMoney(money.owed)}
          </span>
        )}
      </button>

      {open && (
        <div className="mt-3 flex flex-col gap-4 border-l-2 border-rule pl-4">
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <label className="flex items-center gap-2">
              <span className="text-silver">Status</span>
              <select className="border border-rule bg-ink-900 px-2 py-1 text-paper" value={booking.status}
                      disabled={busy} onChange={e => setStatus(e.target.value)}>
                {STATUSES.map(s => <option key={s} value={s}>{bookingStatusLabel(s)}</option>)}
              </select>
            </label>
            <span className="text-muted-dim">
              Registered {formatInstant(booking.created_at)}
              {booking.cancelled_at && ` · cancelled ${formatInstant(booking.cancelled_at)}`}
            </span>
          </div>

          {booking.refund_requested_at && booking.status !== 'cancelled' && (
            <Section title="Refund request">
              <p className="text-sm text-muted">
                Asked {formatInstant(booking.refund_requested_at)}. Approving cancels the registration;
                what comes back as credit follows the event's cancel-by date and policy.
              </p>
              <div className="flex gap-2">
                <Button busy={busy} onClick={() => void run(() =>
                  supabase.from('bookings').update({ status: 'cancelled' }).eq('id', booking.id))}>
                  Approve and cancel
                </Button>
                <Button variant="ghost" busy={busy} onClick={() => void run(() =>
                  supabase.from('bookings').update({ refund_requested_at: null }).eq('id', booking.id))}>
                  Decline
                </Button>
              </div>
            </Section>
          )}

          {unsettled > 0 && (
            <Settle booking={booking} amount={unsettled} methods={methods} isAdmin={isAdmin}
                    staffId={staffId} busy={busy} run={run} />
          )}

          <Section title="Payments">
            {booking.payments.length === 0 ? (
              <p className="text-sm text-muted">Nothing recorded yet.</p>
            ) : (
              <ul className="flex flex-col text-sm">
                {booking.payments.map(p => (
                  <li key={p.id} className={`flex flex-wrap items-baseline justify-between gap-2 py-1 ${p.voided_at ? 'text-muted-dim line-through' : ''}`}>
                    <span>
                      <span className="figures text-paper">{formatMoney(p.amount)}</span>
                      {' · '}{methodLabel(p.method, methods)} · {formatDate(p.paid_on)}
                      {p.reference && ` · ref ${p.reference}`}
                      {p.note && ` · ${p.note}`}
                    </span>
                    {!p.voided_at && p.method !== 'account_credit' && (
                      <button type="button" className="text-muted-dim hover:text-signal-red" disabled={busy}
                              onClick={() => {
                                if (!window.confirm('Void this payment? It stays on the record, struck through.')) return
                                void run(() => supabase.from('payments')
                                  .update({ voided_at: new Date().toISOString() }).eq('id', p.id))
                              }}>
                        Void
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
            {booking.status !== 'cancelled' && (
              <RecordPayment booking={booking} methods={methods} staffId={staffId} busy={busy} run={run} />
            )}
          </Section>

          {(isAdmin || booking.amendments.length > 0) && (
            <Section title="Adjustments">
              {booking.amendments.length > 0 && (
                <ul className="flex flex-col text-sm">
                  {booking.amendments.map(a => (
                    <li key={a.id}>
                      <span className="figures text-paper">{Number(a.amount) > 0 ? '+' : ''}{formatMoney(a.amount)}</span>
                      {' · '}{a.note}
                    </li>
                  ))}
                </ul>
              )}
              {isAdmin && booking.status !== 'cancelled' && (
                <Adjust booking={booking} discounts={discounts} staffId={staffId} busy={busy} run={run} />
              )}
            </Section>
          )}

          {missing.length > 0 && booking.status !== 'cancelled' && (
            <Section title="Waivers not signed">
              <ul className="flex flex-col gap-1 text-sm">
                {missing.map(w => (
                  <li key={w.id} className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="text-paper">{w.title}</span>
                    {isAdmin && (
                      <button type="button" className="text-gold hover:text-gold-soft" disabled={busy}
                              onClick={() => {
                                const signed = window.prompt('Name as signed on the paper form', booking.member?.name ?? '')
                                if (!signed) return
                                const guardian = w.requires_guardian
                                  ? window.prompt('Parent or guardian who signed') ?? '' : undefined
                                void run(() => supabase.rpc('record_paper_waiver', {
                                  p_waiver_id: w.id, p_member_id: booking.member_id, p_signed_name: signed,
                                  p_guardian_name: guardian, p_event_id: booking.event_id,
                                }))
                              }}>
                        Record paper form
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </Section>
          )}

          {error && <p role="alert" className="text-sm text-signal-red">{error}</p>}
        </div>
      )}
    </li>
  )
}

type Run = (fn: () => PromiseLike<{ error: { message: string } | null }>) => Promise<boolean>

function RecordPayment({ booking, methods, staffId, busy, run }: {
  booking: BookingWithMoney; methods: PaymentMethod[]; staffId: string; busy: boolean; run: Run
}) {
  const due = Math.max(Number(booking.money?.balance ?? 0), 0)
  const [amount, setAmount] = useState(due ? String(due) : '')
  const [method, setMethod] = useState(methods[0]?.key ?? 'cash')
  const [reference, setReference] = useState('')
  const [note, setNote] = useState('')

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    const value = Number(amount)
    if (!value) return
    const ok = await run(() => supabase.from('payments').insert({
      member_id: booking.member_id,
      payer_id: booking.payer_id,
      booking_id: booking.id,
      amount: value,
      method,
      reference: reference.trim() || null,
      note: note.trim() || null,
      recorded_by: staffId,
    }))
    if (ok) { setReference(''); setNote('') }
  }

  return (
    <form onSubmit={onSubmit} className="mt-2 grid gap-2 sm:grid-cols-[8rem_10rem_1fr_1fr_auto]">
      <input aria-label="Amount" type="number" step="any" className={inputClass} value={amount}
             onChange={e => setAmount(e.target.value)} placeholder="Amount" />
      <select aria-label="Method" className={inputClass} value={method} onChange={e => setMethod(e.target.value)}>
        {methods.map(m => <option key={m.key} value={m.key}>{m.label}</option>)}
      </select>
      <input aria-label="Reference" className={inputClass} value={reference}
             onChange={e => setReference(e.target.value)} placeholder="Reference (transfer no.)" />
      <input aria-label="Note" className={inputClass} value={note}
             onChange={e => setNote(e.target.value)} placeholder="Note" />
      <Button type="submit" busy={busy}>Record</Button>
    </form>
  )
}

function Adjust({ booking, discounts, staffId, busy, run }: {
  booking: BookingWithMoney; discounts: Discount[]; staffId: string; busy: boolean; run: Run
}) {
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')

  function applyDiscount(id: string) {
    const d = discounts.find(x => x.id === id)
    if (!d) return
    const base = Number(booking.amount_due)
    const off = d.kind === 'percent' ? Math.round(base * Number(d.value) / 100) : Number(d.value)
    setAmount(String(-Math.min(off, Number(booking.money?.owed ?? base))))
    setNote(d.kind === 'percent' ? `${d.label} (${d.value}%)` : d.label)
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    const value = Number(amount)
    if (!value || !note.trim()) return
    const ok = await run(() => supabase.from('booking_amendments').insert({
      booking_id: booking.id, amount: value, note: note.trim(), created_by: staffId,
    }))
    if (ok) { setAmount(''); setNote('') }
  }

  return (
    <form onSubmit={onSubmit} className="mt-2 flex flex-col gap-2">
      {discounts.length > 0 && (
        <select aria-label="Apply a discount" className={`${inputClass} sm:max-w-sm`} value=""
                onChange={e => applyDiscount(e.target.value)}>
          <option value="">Apply a discount…</option>
          {discounts.map(d => <option key={d.id} value={d.id}>{d.label}</option>)}
        </select>
      )}
      <div className="grid gap-2 sm:grid-cols-[8rem_1fr_auto]">
        <input aria-label="Adjustment" type="number" step="any" className={inputClass} value={amount}
               onChange={e => setAmount(e.target.value)} placeholder="−500" />
        <input aria-label="Reason" className={inputClass} value={note}
               onChange={e => setNote(e.target.value)} placeholder="Reason (members see this)" />
        <Button type="submit" variant="ghost" busy={busy}>Adjust</Button>
      </div>
      <p className="text-xs text-muted-dim">Negative lowers what they owe; positive adds to it. Adjustments cannot be edited — add another to correct one.</p>
    </form>
  )
}

// Money paid on a cancelled booking that the cancellation rules did not give
// back. Exactly one of three endings, and the admin picks it.
function Settle({ booking, amount, methods, isAdmin, staffId, busy, run }: {
  booking: BookingWithMoney; amount: number; methods: PaymentMethod[]; isAdmin: boolean
  staffId: string; busy: boolean; run: Run
}) {
  const [reference, setReference] = useState('')
  const [method, setMethod] = useState(methods[0]?.key ?? 'cash')

  return (
    <Section title={`${formatMoney(amount)} still held from this cancellation`}>
      <p className="text-sm text-muted">
        Paid in and not refunded automatically — asked for after the cancel-by date, or cancelled without a
        request. Refund it, turn it into credit, or keep it.
      </p>
      <div className="grid gap-2 sm:grid-cols-[10rem_1fr_auto]">
        <select aria-label="Refund method" className={inputClass} value={method} onChange={e => setMethod(e.target.value)}>
          {methods.map(m => <option key={m.key} value={m.key}>{m.label}</option>)}
        </select>
        <input aria-label="Refund reference" className={inputClass} value={reference}
               onChange={e => setReference(e.target.value)} placeholder="Reference" />
        <Button busy={busy} onClick={() => void run(() => supabase.from('payments').insert({
          member_id: booking.member_id, payer_id: booking.payer_id, booking_id: booking.id,
          amount: -amount, method, reference: reference.trim() || null,
          note: 'Refund of a cancellation', recorded_by: staffId,
        }))}>
          Refund {formatMoney(amount)}
        </Button>
      </div>
      {isAdmin && (
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" busy={busy} onClick={() => void run(() => supabase.from('credits').insert({
            member_id: booking.payer_id ?? booking.member_id, booking_id: booking.id, amount,
            reason: 'Refund for cancelling, granted by the club', source: 'booking_cancellation_return',
            created_by: staffId,
          }))}>
            Give as credit
          </Button>
          <Button variant="ghost" busy={busy} onClick={() => void run(() => supabase.from('bookings').update({
            cancellation_settled_at: new Date().toISOString(),
            cancellation_settled_note: `Kept ${formatMoney(amount)} as a cancellation fee`,
          }).eq('id', booking.id))}>
            Keep as a fee
          </Button>
        </div>
      )}
    </Section>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h3 className="font-display text-xs uppercase tracking-widest text-silver">{title}</h3>
      {children}
    </section>
  )
}

