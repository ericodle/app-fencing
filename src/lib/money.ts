// Money, as the member and the admin see it.
//
// The arithmetic lives in the database — `booking_balances` is the one
// definition of owed, paid and due, and the triggers decide when a booking is
// confirmed and what a cancellation refunds. These helpers only read those
// numbers and turn them into the words on the screen: which badge, which
// button, which date. Nothing here computes a balance the view has not.

import { clubConfig } from '../config/club'
import { addDays } from './dates'

/** A row of the `booking_balances` view, as far as these helpers care. */
export interface BalanceRow {
  status: string | null
  owed: number | null
  paid: number | null
  deposit: number | null
  deposit_due: number | null
  balance: number | null
  unsettled: number | null
}

/** "NTD 1,200". The currency is whatever the club writes on a price; nothing
 *  here machine-reads it, so no Intl currency formatting. */
export function formatMoney(amount: number | null | undefined): string {
  const n = Number(amount ?? 0)
  const digits = Number.isInteger(n) ? 0 : 2
  return `${clubConfig.locale.currency} ${n.toLocaleString('en-US', {
    minimumFractionDigits: digits, maximumFractionDigits: digits,
  })}`
}

export type PaymentState = 'free' | 'unpaid' | 'deposit_due' | 'partial' | 'paid' | 'credit' | 'cancelled'

/** Which badge a booking wears. Deposit first: until it is in, the place is
 *  not held, and that is the thing a member needs to be told. */
export function paymentState(row: BalanceRow): PaymentState {
  if (row.status === 'cancelled') return 'cancelled'
  const owed = Number(row.owed ?? 0)
  const paid = Number(row.paid ?? 0)
  const balance = Number(row.balance ?? owed - paid)
  if (owed <= 0 && paid <= 0) return 'free'
  if (balance < 0) return 'credit'
  if (balance === 0) return 'paid'
  if (paid <= 0) return 'unpaid'
  if (Number(row.deposit_due ?? 0) > 0) return 'deposit_due'
  return 'partial'
}

/** A member cancels a booking themselves only while nothing has been paid on
 *  it. Once something has, they ask for a refund and an admin decides — the
 *  same rule the database enforces in `bookings_guard_member_edits`. */
export function canSelfCancel(row: { status: string | null; paid: number | null }): boolean {
  return row.status !== 'cancelled' && row.status !== 'no_show' && Number(row.paid ?? 0) <= 0
}

export function canRequestRefund(row: {
  status: string | null; paid: number | null; refund_requested_at?: string | null
}): boolean {
  return row.status !== 'cancelled' && Number(row.paid ?? 0) > 0 && !row.refund_requested_at
}

/** When the rest is due: the event's own deadline, or N days before it starts
 *  (`club.paymentDeadlineFallbackDays`). The deposit is always due now. */
export function fullPaymentDeadline(
  event: { full_payment_deadline: string | null },
  firstDay: string | null,
): string | null {
  if (event.full_payment_deadline) return event.full_payment_deadline
  if (!firstDay) return null
  return addDays(firstDay, -clubConfig.club.paymentDeadlineFallbackDays)
}

/** Is a refund asked for today still in time? On or before the cancel-by date,
 *  club-local — the same comparison `bookings_credit_on_cancel` makes. */
export function refundInTime(cancelDate: string | null, today: string): boolean {
  return cancelDate === null || today <= cancelDate
}
