// Reading registrations and their money. The rules — what a booking costs,
// when it is confirmed, what a cancellation refunds — are the database's; this
// file only fetches rows and stitches the balance view onto them, so every
// screen reads money from `booking_balances` and nowhere else.

import { supabase } from './supabase'
import type {
  Booking, BookingBalance, BookingAmendment, Payment, PaymentMethod, Profile,
} from '../types/db'

export type MemberBrief = Pick<Profile, 'id' | 'name' | 'email' | 'parent_account' | 'date_of_birth'>

export interface BookingWithMoney extends Booking {
  member: MemberBrief | null
  money: BookingBalance | null
  payments: Payment[]
  amendments: BookingAmendment[]
}

const MEMBER = 'member:profiles!bookings_member_id_fkey(id, name, email, parent_account, date_of_birth)'

/** Every registration for one event, oldest first, with its money. What the
 *  admin's registrations page shows and what a waitlist is ordered by. */
export async function fetchEventBookings(eventId: string): Promise<BookingWithMoney[]> {
  const { data } = await supabase.from('bookings').select(`*, ${MEMBER}`)
    .eq('event_id', eventId).order('created_at')
  return withMoney((data ?? []) as unknown as (Booking & { member: MemberBrief | null })[])
}

/** A member's own bookings for one event — theirs and their juniors'. */
export async function fetchMyBookingsFor(eventId: string, memberIds: string[]): Promise<BookingWithMoney[]> {
  if (memberIds.length === 0) return []
  const { data } = await supabase.from('bookings').select(`*, ${MEMBER}`)
    .eq('event_id', eventId).in('member_id', memberIds).order('created_at')
  return withMoney((data ?? []) as unknown as (Booking & { member: MemberBrief | null })[])
}

async function withMoney(rows: (Booking & { member: MemberBrief | null })[]): Promise<BookingWithMoney[]> {
  const ids = rows.map(r => r.id)
  if (ids.length === 0) return []
  const [balances, payments, amendments] = await Promise.all([
    supabase.from('booking_balances').select('*').in('booking_id', ids),
    supabase.from('payments').select('*').in('booking_id', ids).order('created_at'),
    supabase.from('booking_amendments').select('*').in('booking_id', ids).order('created_at'),
  ])
  const byBooking = <T extends { booking_id: string | null }>(list: T[] | null, id: string) =>
    (list ?? []).filter(x => x.booking_id === id)
  return rows.map(r => ({
    ...r,
    money: (balances.data ?? []).find(b => b.booking_id === r.id) ?? null,
    payments: byBooking(payments.data, r.id),
    amendments: byBooking(amendments.data, r.id),
  }))
}

export async function fetchPaymentMethods(activeOnly = true): Promise<PaymentMethod[]> {
  let q = supabase.from('payment_methods').select('*').order('sort_order')
  if (activeOnly) q = q.eq('active', true)
  const { data } = await q
  return data ?? []
}

/** How a payment was made, in words. `account_credit` is the database's own
 *  method, for credit applied to a booking, and has no row. */
export function methodLabel(key: string | null, methods: readonly PaymentMethod[]): string {
  if (key === 'account_credit') return 'Account credit'
  return methods.find(m => m.key === key)?.label ?? key ?? ''
}

/** The member's juniors, so a parent can register and sign for them. */
export async function fetchJuniors(parentId: string): Promise<MemberBrief[]> {
  const { data } = await supabase.from('profiles')
    .select('id, name, email, parent_account, date_of_birth')
    .eq('parent_account', parentId).eq('status', 'active').order('name')
  return data ?? []
}
