import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { clientFor, serviceClient, anonClient, ACCOUNTS } from '../helpers'
import type { Database } from '../../src/types/database'
import { clubConfig } from '../../src/config/club'

// Registration, deposits, payments and the four cancellation cases, tried
// against the real triggers.
//
// Every rule here is the database's, not the form's: a member with the anon
// key and a curl command meets exactly these. So each assertion reads the row
// back rather than trusting the response — RLS refuses by filtering, and a
// trigger that quietly rewrote a value returns 201 either way.
//
// Mei (the `fencer` account) has signed her waivers in the seed, so she can
// register for anything that is not a junior's. Waivers themselves are in
// waivers.test.ts.

type Client = SupabaseClient<Database>
const service = serviceClient()
let mei: Client
let admin: Client
let coach: Client

const events: string[] = []
const prices: string[] = []
const policies: string[] = []

beforeAll(async () => {
  ;[mei, admin, coach] = await Promise.all([clientFor('fencer'), clientFor('admin'), clientFor('coach')])
}, 30_000)

afterAll(async () => {
  // Payments, credits and bookings first: an event with bookings cannot be
  // deleted, by design, and the service role is only arranging here.
  const { data: bookings } = await service.from('bookings').select('id').in('event_id', events)
  const ids = (bookings ?? []).map(b => b.id)
  if (ids.length) {
    await service.from('payments').delete().in('booking_id', ids)
    await service.from('credits').delete().in('booking_id', ids)
  }
  await service.from('credits').delete().eq('member_id', ACCOUNTS.fencer.id).eq('source', 'carry_forward')
  await service.from('notifications').delete().in('url', events.map(e => `/calendar/${e}`))
  await service.from('bookings').delete().in('event_id', events)
  await service.from('events').delete().in('id', events)
  await service.from('prices').delete().in('id', prices)
  await service.from('cancellation_policies').delete().in('id', policies)
})

const inDays = (n: number) => {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

async function price(amount: number, deposit: number | null = null) {
  const { data, error } = await service.from('prices')
    .insert({ label: `Test tier ${amount}`, amount, deposit_amount: deposit }).select().single()
  if (error) throw error
  prices.push(data.id)
  return data.id
}

async function policy(depositRefundable: boolean) {
  const { data, error } = await service.from('cancellation_policies')
    .insert({ title: 'Test policy', body: 'Test policy text.', deposit_refundable: depositRefundable })
    .select().single()
  if (error) throw error
  policies.push(data.id)
  return data.id
}

async function event(over: Record<string, unknown> = {}) {
  const { data, error } = await service.from('events')
    .insert({ kind: 'practice', admin_title: 'Registration test', start_date: inDays(10), ...over })
    .select().single()
  if (error) throw error
  events.push(data.id)
  return data
}

async function book(client: Client, eventId: string, extra: Record<string, unknown> = {}) {
  const { data, error } = await client.from('bookings')
    .insert({ event_id: eventId, member_id: ACCOUNTS.fencer.id, policy_acked_at: new Date().toISOString(), ...extra })
    .select().single()
  if (error) throw error
  return data
}

async function reread(bookingId: string) {
  const { data } = await service.from('bookings').select('*').eq('id', bookingId).single()
  return data!
}

async function balance(bookingId: string) {
  const { data } = await service.from('booking_balances').select('*').eq('booking_id', bookingId).single()
  return data!
}

async function pay(bookingId: string, amount: number, method = 'cash') {
  const { data, error } = await coach.from('payments').insert({
    member_id: ACCOUNTS.fencer.id, booking_id: bookingId, amount, method,
    recorded_by: ACCOUNTS.coach.id,
  }).select().single()
  if (error) throw error
  return data
}

describe('the club clock', () => {
  it('is the timezone piste.config.ts names', async () => {
    const { data } = await service.rpc('club_timezone')
    expect(data).toBe(clubConfig.locale.timezone)
  })
})

describe('making a booking', () => {
  it('confirms a free event at once', async () => {
    const e = await event()
    const b = await book(mei, e.id)
    expect(b.status).toBe('confirmed')
    expect(Number(b.amount_due)).toBe(0)
  })

  it('freezes the price and deposit from the tier, whatever the member sent', async () => {
    const e = await event({ price_id: await price(3000, 1000) })
    const b = await book(mei, e.id, { amount_due: 1, deposit: 0, status: 'confirmed' })
    const row = await reread(b.id)
    expect(row.status).toBe('pending')
    expect(Number(row.amount_due)).toBe(3000)
    expect(Number(row.deposit)).toBe(1000)
  })

  it('keeps what was agreed when the price list changes later', async () => {
    const tier = await price(500)
    const e = await event({ price_id: tier })
    const b = await book(mei, e.id)
    await service.from('prices').update({ amount: 900 }).eq('id', tier)
    expect(Number((await reread(b.id)).amount_due)).toBe(500)
  })

  it('refuses a second live booking, and allows one after cancelling', async () => {
    const e = await event()
    const first = await book(mei, e.id)
    const { error } = await mei.from('bookings').insert({ event_id: e.id, member_id: ACCOUNTS.fencer.id })
    expect(error?.message).toMatch(/one_live_per_member/)
    await mei.from('bookings').update({ status: 'cancelled' }).eq('id', first.id)
    const again = await book(mei, e.id)
    expect(again.status).toBe('confirmed')
  })

  it('refuses a member when registration is closed, or the event has passed', async () => {
    const closed = await event({ registration_open: false })
    const past = await event({ start_date: inDays(-3) })
    for (const e of [closed, past]) {
      const { error } = await mei.from('bookings').insert({ event_id: e.id, member_id: ACCOUNTS.fencer.id })
      expect(error?.message).toMatch(/closed|already happened/)
    }
  })

  it('asks for the cancellation policy to be agreed when the event has one', async () => {
    const e = await event({ cancel_policy_id: await policy(true) })
    const { error } = await mei.from('bookings').insert({ event_id: e.id, member_id: ACCOUNTS.fencer.id })
    expect(error?.message).toMatch(/cancellation policy/)
  })

  it('refuses a cancelled event', async () => {
    const e = await event({ cancelled_at: new Date().toISOString() })
    const { error } = await mei.from('bookings').insert({ event_id: e.id, member_id: ACCOUNTS.fencer.id })
    expect(error?.message).toMatch(/cancelled/)
  })

  it('does not let a member book somebody else', async () => {
    const e = await event()
    const { error } = await mei.from('bookings').insert({ event_id: e.id, member_id: ACCOUNTS.lefty.id })
    expect(error).not.toBeNull()
    const { data } = await service.from('bookings').select('id').eq('event_id', e.id)
    expect(data).toEqual([])
  })

  it('lets staff book a member in, past the paperwork', async () => {
    const e = await event({ registration_open: false })
    const { data, error } = await admin.from('bookings')
      .insert({ event_id: e.id, member_id: ACCOUNTS.lefty.id }).select().single()
    expect(error).toBeNull()
    expect(data!.status).toBe('confirmed')
  })

  it('is invisible to a stranger', async () => {
    const { data } = await anonClient().from('booking_balances').select('*')
    expect(data ?? []).toEqual([])
  })
})

describe('the waitlist', () => {
  it('waitlists past capacity, and moves up when a place frees', async () => {
    const e = await event({ capacity: 1 })
    const held = await admin.from('bookings')
      .insert({ event_id: e.id, member_id: ACCOUNTS.lefty.id }).select().single()
    const waiting = await book(mei, e.id)
    expect(waiting.status).toBe('waitlisted')

    await admin.from('bookings').update({ status: 'cancelled' }).eq('id', held.data!.id)
    expect((await reread(waiting.id)).status).toBe('confirmed')

    const { data: told } = await service.from('notifications')
      .select('title').eq('member_id', ACCOUNTS.fencer.id).eq('url', `/calendar/${e.id}`)
    expect(told?.[0]?.title).toBe('A place opened up')
  })

  it('moves up when the admin makes room', async () => {
    const e = await event({ capacity: 1 })
    await admin.from('bookings').insert({ event_id: e.id, member_id: ACCOUNTS.lefty.id })
    const waiting = await book(mei, e.id)
    await admin.from('events').update({ capacity: 2 }).eq('id', e.id)
    expect((await reread(waiting.id)).status).toBe('confirmed')
  })
})

describe('deposits and payments', () => {
  it('confirms once the deposit is paid, and un-confirms if that payment is voided', async () => {
    const e = await event({ price_id: await price(3000, 1000) })
    const b = await book(mei, e.id)

    await pay(b.id, 600)
    expect((await reread(b.id)).status).toBe('pending')
    const second = await pay(b.id, 400)
    expect((await reread(b.id)).status).toBe('confirmed')
    expect(await balance(b.id)).toMatchObject({ owed: 3000, paid: 1000, deposit_due: 0, balance: 2000 })

    await coach.from('payments').update({ voided_at: new Date().toISOString() }).eq('id', second.id)
    expect((await reread(b.id)).status).toBe('pending')
    expect(await balance(b.id)).toMatchObject({ paid: 600, deposit_due: 400 })
  })

  it('needs the whole price when the tier has no deposit', async () => {
    const e = await event({ price_id: await price(400) })
    const b = await book(mei, e.id)
    await pay(b.id, 200)
    expect((await reread(b.id)).status).toBe('pending')
    await pay(b.id, 200)
    expect((await reread(b.id)).status).toBe('confirmed')
  })

  it('clamps the deposit to what is owed after a discount', async () => {
    const e = await event({ price_id: await price(3000, 1000) })
    const b = await book(mei, e.id)
    const { error } = await admin.from('booking_amendments')
      .insert({ booking_id: b.id, amount: -2500, note: 'Coach discount', created_by: ACCOUNTS.admin.id })
    expect(error).toBeNull()
    expect(await balance(b.id)).toMatchObject({ owed: 500, deposit: 500, deposit_due: 500 })
    await pay(b.id, 500)
    expect((await reread(b.id)).status).toBe('confirmed')
  })

  it('does not let a coach edit a payment, only void it — and nobody deletes one', async () => {
    const e = await event({ price_id: await price(400) })
    const b = await book(mei, e.id)
    const p = await pay(b.id, 400)

    const { error } = await coach.from('payments').update({ amount: 1 }).eq('id', p.id)
    expect(error?.message).toMatch(/voided, not edited/)
    await admin.from('payments').delete().eq('id', p.id)
    const { data } = await service.from('payments').select('amount').eq('id', p.id).single()
    expect(Number(data!.amount)).toBe(400)
  })

  it('does not let a member record a payment or an amendment', async () => {
    const e = await event({ price_id: await price(400) })
    const b = await book(mei, e.id)
    await mei.from('payments').insert({ member_id: ACCOUNTS.fencer.id, booking_id: b.id, amount: 400, method: 'cash' })
    await mei.from('booking_amendments').insert({ booking_id: b.id, amount: -400, note: 'Free please', created_by: ACCOUNTS.fencer.id })
    expect(await balance(b.id)).toMatchObject({ owed: 400, paid: 0 })
  })
})

describe('what a member may do to their own booking', () => {
  it('does not let them confirm it or change what it costs', async () => {
    const e = await event({ price_id: await price(400) })
    const b = await book(mei, e.id)
    for (const patch of [{ status: 'confirmed' }, { amount_due: 0 }, { deposit: 0 }]) {
      const { error } = await mei.from('bookings').update(patch).eq('id', b.id)
      expect(error, `member changed ${Object.keys(patch)[0]}`).not.toBeNull()
    }
    const row = await reread(b.id)
    expect(row).toMatchObject({ status: 'pending', amount_due: 400 })
  })

  it('lets them cancel an unpaid booking, and not a paid one', async () => {
    const e = await event({ price_id: await price(400) })
    const b = await book(mei, e.id)
    await pay(b.id, 100)
    const { error } = await mei.from('bookings').update({ status: 'cancelled' }).eq('id', b.id)
    expect(error?.message).toMatch(/request a refund/)
    expect((await reread(b.id)).status).toBe('pending')
  })

  it('lets them ask for a refund once something is paid, and not withdraw it themselves', async () => {
    const e = await event({ price_id: await price(400) })
    const b = await book(mei, e.id)
    const early = await mei.from('bookings').update({ refund_requested_at: new Date().toISOString() }).eq('id', b.id)
    expect(early.error?.message).toMatch(/nothing has been paid/)

    await pay(b.id, 400)
    await mei.from('bookings').update({ refund_requested_at: '2000-01-01T00:00:00Z' }).eq('id', b.id)
    const asked = await reread(b.id)
    // Stamped with now, whatever they sent.
    expect(new Date(asked.refund_requested_at!).getFullYear()).toBe(new Date().getFullYear())

    const { error } = await mei.from('bookings').update({ refund_requested_at: null }).eq('id', b.id)
    expect(error?.message).toMatch(/withdrawn by the club/)
  })
})

describe('cancelling, and the four cases', () => {
  it('1. the club cancels the event: everything comes back, deposit included', async () => {
    const e = await event({ price_id: await price(3000, 1000), cancel_policy_id: await policy(false) })
    const b = await book(mei, e.id)
    await pay(b.id, 3000)

    await admin.from('events').update({ cancelled_at: new Date().toISOString() }).eq('id', e.id)
    const row = await reread(b.id)
    expect(row.status).toBe('cancelled')
    expect(row.status_before_event_cancel).toBe('confirmed')
    const { data: credit } = await service.from('credits').select('*').eq('booking_id', b.id)
    expect(credit).toHaveLength(1)
    expect(credit![0]).toMatchObject({ amount: 3000, source: 'event_cancellation', status: 'open' })
    expect((await balance(b.id)).unsettled).toBe(0)
  })

  it('restoring the event restores its bookings and takes the refund back', async () => {
    const e = await event({ price_id: await price(400) })
    const b = await book(mei, e.id)
    await pay(b.id, 400)
    await admin.from('events').update({ cancelled_at: new Date().toISOString() }).eq('id', e.id)
    await admin.from('events').update({ cancelled_at: null }).eq('id', e.id)

    const row = await reread(b.id)
    expect(row.status).toBe('confirmed')
    expect(row.status_before_event_cancel).toBeNull()
    const { data: credit } = await service.from('credits').select('source, status').eq('booking_id', b.id)
    expect(credit).toEqual([{ source: 'return_reclaimed', status: 'settled' }])
  })

  it('2. asked in time: everything back except a non-refundable deposit', async () => {
    const e = await event({
      price_id: await price(3000, 1000), cancel_policy_id: await policy(false), cancel_date: inDays(5),
    })
    const b = await book(mei, e.id)
    await pay(b.id, 3000)
    await mei.from('bookings').update({ refund_requested_at: new Date().toISOString() }).eq('id', b.id)
    await admin.from('bookings').update({ status: 'cancelled' }).eq('id', b.id)

    const { data: credit } = await service.from('credits').select('amount, source').eq('booking_id', b.id)
    expect(credit).toEqual([{ amount: 2000, source: 'booking_cancellation_return' }])
    const row = await reread(b.id)
    expect(row.cancellation_settled_at).not.toBeNull()
    expect((await balance(b.id)).unsettled).toBe(0)
  })

  it('2. asked in time with a refundable deposit: all of it', async () => {
    const e = await event({
      price_id: await price(3000, 1000), cancel_policy_id: await policy(true), cancel_date: inDays(5),
    })
    const b = await book(mei, e.id)
    await pay(b.id, 1000)
    await mei.from('bookings').update({ refund_requested_at: new Date().toISOString() }).eq('id', b.id)
    await admin.from('bookings').update({ status: 'cancelled' }).eq('id', b.id)
    const { data: credit } = await service.from('credits').select('amount').eq('booking_id', b.id)
    expect(credit).toEqual([{ amount: 1000 }])
  })

  it('3. asked after the cancel-by date: cash stays until an admin decides', async () => {
    const e = await event({ price_id: await price(400), cancel_date: inDays(-1) })
    const b = await book(mei, e.id)
    await pay(b.id, 400)
    await mei.from('bookings').update({ refund_requested_at: new Date().toISOString() }).eq('id', b.id)
    await admin.from('bookings').update({ status: 'cancelled' }).eq('id', b.id)

    const { data: credit } = await service.from('credits').select('*').eq('booking_id', b.id)
    expect(credit).toEqual([])
    expect((await balance(b.id)).unsettled).toBe(400)

    // The admin keeps it as a fee: settled, and off the to-do list.
    await admin.from('bookings').update({
      cancellation_settled_at: new Date().toISOString(),
      cancellation_settled_note: 'Kept as a late-cancellation fee',
    }).eq('id', b.id)
    expect((await balance(b.id)).unsettled).toBe(0)
  })

  it('4. an admin cancels unasked: only spent account credit comes back', async () => {
    await service.from('credits').insert({
      member_id: ACCOUNTS.fencer.id, amount: 150, reason: 'Test credit', source: 'manual',
    })
    const e = await event({ price_id: await price(400) })
    const b = await book(mei, e.id)
    const { data: applied } = await mei.rpc('apply_credit_to_booking', { p_booking_id: b.id, p_amount: 150 })
    expect(Number(applied)).toBe(150)
    await pay(b.id, 250)
    expect((await reread(b.id)).status).toBe('confirmed')

    await admin.from('bookings').update({ status: 'cancelled' }).eq('id', b.id)
    const { data: credit } = await service.from('credits').select('amount').eq('booking_id', b.id)
    expect(credit!.map(c => Number(c.amount))).toEqual([150])
    expect((await balance(b.id)).unsettled).toBe(250)
  })
})

describe('account credit', () => {
  it('pays a booking from credit, oldest first, carrying the remainder forward', async () => {
    // Refunds from the tests above are Mei's open credit too; start clean.
    await service.from('credits').delete().eq('member_id', ACCOUNTS.fencer.id).eq('status', 'open')
    const { data: grant } = await service.from('credits').insert({
      member_id: ACCOUNTS.fencer.id, amount: 1000, reason: 'Test credit, large', source: 'manual',
    }).select().single()
    const e = await event({ price_id: await price(300) })
    const b = await book(mei, e.id)

    const { data: applied, error } = await mei.rpc('apply_credit_to_booking', { p_booking_id: b.id })
    expect(error).toBeNull()
    expect(Number(applied)).toBe(300)
    expect((await reread(b.id)).status).toBe('confirmed')

    const { data: open } = await service.from('credits').select('amount, source')
      .eq('member_id', ACCOUNTS.fencer.id).eq('status', 'open')
    expect(open).toEqual([{ amount: 700, source: 'carry_forward' }])
    const { data: spent } = await service.from('credits').select('status').eq('id', grant!.id).single()
    expect(spent!.status).toBe('settled')

    await service.from('credits').delete().eq('member_id', ACCOUNTS.fencer.id).in('source', ['manual', 'carry_forward'])
  })

  it('will not spend somebody else’s credit', async () => {
    const e = await event({ price_id: await price(300) })
    const b = await admin.from('bookings').insert({ event_id: e.id, member_id: ACCOUNTS.lefty.id }).select().single()
    const { error } = await mei.rpc('apply_credit_to_booking', { p_booking_id: b.data!.id })
    expect(error?.message).toMatch(/not your booking/)
  })
})

describe('what cannot be deleted', () => {
  it('an event with bookings', async () => {
    const e = await event()
    await book(mei, e.id)
    const { error } = await service.from('events').delete().eq('id', e.id)
    expect(error?.message).toMatch(/bookings_event_id_fkey/)
  })

  it('a venue an event is held at', async () => {
    const { data: v } = await service.from('venues').insert({ name: 'Test hall', lat: 25, lng: 121.5 }).select().single()
    const e = await event({ venue_id: v!.id })
    const { error } = await service.from('venues').delete().eq('id', v!.id)
    expect(error?.message).toMatch(/events_venue_id_fkey/)
    await service.from('events').delete().eq('id', e.id)
    await service.from('venues').delete().eq('id', v!.id)
  })

  it('a booking, by staff', async () => {
    const e = await event()
    const b = await book(mei, e.id)
    await admin.from('bookings').delete().eq('id', b.id)
    expect(await reread(b.id)).toBeTruthy()
  })
})
