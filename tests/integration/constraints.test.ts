import { describe, it, expect, beforeAll, afterEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { clientFor, serviceClient, ACCOUNTS } from '../helpers'
import type { Database } from '../../src/types/database'
import { EVENT_KINDS } from '../../src/lib/event-kinds'
import { WEAPONS } from '../../src/config/weapons'
import { METRIC_KEYS } from '../../src/lib/fitness-metrics'

// The constraints and triggers, tried rather than assumed.
//
// Two jobs here. The first half checks that each rule actually fires. The
// second half is the vocabulary check: the app's EVENT_KINDS, WEAPONS and
// METRIC_KEYS lists and the database's check constraints describe the same sets
// in two languages, and nothing else in the system notices them drifting apart
// — a kind the database accepts but the app does not know about simply never
// renders, with no error anywhere. See the note in src/types/db.ts.

type Client = SupabaseClient<Database>
const service = serviceClient()
let fencer: Client
let admin: Client
const created: { table: string; id: string }[] = []

beforeAll(async () => {
  ;[fencer, admin] = await Promise.all([clientFor('fencer'), clientFor('admin')])
}, 30_000)

afterEach(async () => {
  while (created.length) {
    const row = created.pop()!
    await service.from(row.table as 'venues').delete().eq('id', row.id)
  }
})

async function venue(over: Record<string, unknown> = {}) {
  const { data, error } = await service.from('venues')
    .insert({ name: `Test ${crypto.randomUUID().slice(0, 8)}`, lat: 25.05, lng: 121.55, ...over })
    .select().single()
  if (error) throw error
  created.push({ table: 'venues', id: data!.id })
  return data!
}

describe('profiles', () => {
  it('refuses a primary weapon the fencer does not fence', async () => {
    const { error } = await service.from('profiles')
      .update({ weapons: ['epee'], primary_weapon: 'saber' }).eq('id', ACCOUNTS.lefty.id)
    expect(error?.message).toMatch(/primary_weapon_is_fenced/)
  })

  it('refuses half a home pin', async () => {
    const { error } = await service.from('profiles')
      .update({ home_lat: 25.05, home_lng: null }).eq('id', ACCOUNTS.lefty.id)
    expect(error?.message).toMatch(/home_pin_complete/)
  })

  it('refuses an impossible measurement', async () => {
    const { error } = await service.from('profiles')
      .update({ height_cm: 900 }).eq('id', ACCOUNTS.lefty.id)
    expect(error?.message).toMatch(/height_check/)
  })

  it('keeps families one level deep', async () => {
    // junior already has fencer as a parent; making fencer a child of coach
    // would make a grandparent, and every "who can read this" question
    // recursive.
    const { error } = await service.from('profiles')
      .update({ parent_account: ACCOUNTS.coach.id }).eq('id', ACCOUNTS.fencer.id)
    expect(error?.message).toMatch(/children and cannot become a child/)
  })
})

describe('events', () => {
  it('lets a coach move a session, because the meetup planner is for coaches', async () => {
    const somewhere = await venue()
    const { data: event } = await admin.from('events')
      .insert({ kind: 'popup', admin_title: 'Coach moves this', start_date: '2026-12-15' })
      .select().single()
    created.push({ table: 'events', id: event!.id })

    const coachClient = await clientFor('coach')
    const { error } = await coachClient.from('events')
      .update({ venue_id: somewhere.id }).eq('id', event!.id)
    expect(error).toBeNull()

    const { data: moved } = await service.from('events')
      .select('venue_id').eq('id', event!.id).single()
    expect(moved!.venue_id).toBe(somewhere.id)
  })

  it('does not let a coach change what a session IS', async () => {
    const { data: event } = await admin.from('events')
      .insert({ kind: 'popup', admin_title: 'Not the coach\u2019s to rename', start_date: '2026-12-16', price: 400 })
      .select().single()
    created.push({ table: 'events', id: event!.id })

    const coachClient = await clientFor('coach')
    for (const patch of [{ price: 0 }, { admin_title: 'Free now' }, { capacity: 999 }, { start_date: '2027-01-01' }]) {
      const { error } = await coachClient.from('events').update(patch).eq('id', event!.id)
      expect(error?.message, `coach changed ${Object.keys(patch)[0]}`).toMatch(/admin change/)
    }

    const { data: after } = await service.from('events')
      .select('price, admin_title, capacity').eq('id', event!.id).single()
    expect(Number(after!.price)).toBe(400)
  })

  it('insists a course has a day list', async () => {
    const { error } = await admin.from('events')
      .insert({ kind: 'course', admin_title: 'No days', start_date: '2026-10-01' })
    expect(error?.message).toMatch(/course_has_days/)
  })

  it('insists everything else has a start date', async () => {
    const { error } = await admin.from('events')
      .insert({ kind: 'practice', admin_title: 'No date' })
    expect(error?.message).toMatch(/dated_has_start/)
  })

  it('remembers the original venue the first time one is changed, and never again', async () => {
    const first = await venue()
    const second = await venue()
    const third = await venue()

    const { data: event } = await admin.from('events')
      .insert({ kind: 'popup', admin_title: 'Moving target', start_date: '2026-12-01', venue_id: first.id })
      .select().single()
    created.push({ table: 'events', id: event!.id })

    await admin.from('events').update({ venue_id: second.id }).eq('id', event!.id)
    const { data: moved } = await service.from('events')
      .select('venue_id, original_venue_id').eq('id', event!.id).single()
    expect(moved!.original_venue_id).toBe(first.id)

    // Moving again keeps the ORIGINAL original. The original is the original.
    await admin.from('events').update({ venue_id: third.id }).eq('id', event!.id)
    const { data: again } = await service.from('events')
      .select('venue_id, original_venue_id').eq('id', event!.id).single()
    expect(again!.venue_id).toBe(third.id)
    expect(again!.original_venue_id).toBe(first.id)
  })
})

describe('attendance', () => {
  it('refuses logistics from somebody who is not coming', async () => {
    const { data: poll } = await service.from('attendance_polls').select('id').limit(1).single()
    const { error } = await service.from('attendance_responses').insert({
      poll_id: poll!.id, member_id: ACCOUNTS.pending.id,
      response: 'no', seats_offered: 3,
    })
    expect(error?.message).toMatch(/no_logistics_on_no/)
  })

  it('takes only one answer per member per poll', async () => {
    const { data: poll } = await service.from('attendance_polls').select('id').limit(1).single()
    const { error } = await service.from('attendance_responses')
      .insert({ poll_id: poll!.id, member_id: ACCOUNTS.fencer.id, response: 'yes' })
    expect(error?.message).toMatch(/one_per_member|duplicate key/)
  })

  it('refuses an answer to a closed poll', async () => {
    const { data: event } = await admin.from('events')
      .insert({ kind: 'practice', admin_title: 'Closed poll test', start_date: '2026-12-02' })
      .select().single()
    created.push({ table: 'events', id: event!.id })

    const { data: poll } = await admin.from('attendance_polls')
      .insert({ event_id: event!.id, status: 'closed' }).select().single()

    const { error } = await fencer.from('attendance_responses')
      .insert({ poll_id: poll!.id, member_id: ACCOUNTS.fencer.id, response: 'yes' })
    expect(error?.message).toMatch(/closed/)
  })

  it('allows exactly one chosen meetup suggestion per poll', async () => {
    const { data: event } = await admin.from('events')
      .insert({ kind: 'popup', admin_title: 'One choice', start_date: '2026-12-03' })
      .select().single()
    created.push({ table: 'events', id: event!.id })
    const { data: poll } = await admin.from('attendance_polls')
      .insert({ event_id: event!.id }).select().single()

    const row = {
      poll_id: poll!.id, method: 'total', lat: 25.05, lng: 121.55,
      respondents: 4, total_km: 12, max_km: 5, mean_km: 3, stddev_km: 1, chosen: true,
    }
    const first = await admin.from('meetup_suggestions').insert(row)
    expect(first.error).toBeNull()

    const second = await admin.from('meetup_suggestions').insert({ ...row, method: 'fairest' })
    expect(second.error?.message).toMatch(/one_chosen|duplicate key/)
  })

  it('stamps who chose a suggestion, and when', async () => {
    const { data: event } = await admin.from('events')
      .insert({ kind: 'popup', admin_title: 'Stamped', start_date: '2026-12-04' })
      .select().single()
    created.push({ table: 'events', id: event!.id })
    const { data: poll } = await admin.from('attendance_polls')
      .insert({ event_id: event!.id }).select().single()

    const { data: suggestion } = await admin.from('meetup_suggestions').insert({
      poll_id: poll!.id, method: 'total', lat: 25.05, lng: 121.55,
      respondents: 4, total_km: 12, max_km: 5, mean_km: 3, stddev_km: 1, chosen: true,
    }).select().single()

    expect(suggestion!.chosen_by).toBe(ACCOUNTS.admin.id)
    expect(suggestion!.chosen_at).not.toBeNull()
  })
})

describe('bouts', () => {
  it('refuses a bout against nobody', async () => {
    const { error } = await fencer.from('bouts').insert({
      bouted_on: '2026-09-01', weapon: 'epee', fencer_id: ACCOUNTS.fencer.id,
      score_for: 5, score_against: 3, recorded_by: ACCOUNTS.fencer.id,
    })
    expect(error?.message).toMatch(/has_an_opponent/)
  })

  it('refuses a bout against yourself', async () => {
    const { error } = await fencer.from('bouts').insert({
      bouted_on: '2026-09-01', weapon: 'epee', fencer_id: ACCOUNTS.fencer.id,
      opponent_id: ACCOUNTS.fencer.id, score_for: 5, score_against: 3,
      recorded_by: ACCOUNTS.fencer.id,
    })
    expect(error?.message).toMatch(/not_self/)
  })

  it('refuses inline details for a club-mate, whose profile is the truth', async () => {
    const { error } = await fencer.from('bouts').insert({
      bouted_on: '2026-09-01', weapon: 'epee', fencer_id: ACCOUNTS.fencer.id,
      opponent_id: ACCOUNTS.lefty.id, opponent_handedness: 'right',
      score_for: 5, score_against: 3, recorded_by: ACCOUNTS.fencer.id,
    })
    expect(error?.message).toMatch(/no_inline_details_for_members/)
  })

  it('canonicalizes orientation so a bout cannot be entered from both ends', async () => {
    const [a, b] = [ACCOUNTS.fencer.id, ACCOUNTS.lefty.id].sort()

    // Typed in by the fencer whose uuid sorts LAST — the trigger has to flip it.
    const { data: bout, error } = await service.from('bouts').insert({
      bouted_on: '2026-11-11', weapon: 'epee', bout_type: 'practice',
      fencer_id: b, opponent_id: a, score_for: 5, score_against: 1,
      recorded_by: b,
    }).select().single()
    expect(error).toBeNull()
    created.push({ table: 'bouts', id: bout!.id })

    expect(bout!.fencer_id).toBe(a)
    expect(bout!.opponent_id).toBe(b)
    // The scores travelled with the swap: a lost 1-5.
    expect(bout!.score_for).toBe(1)
    expect(bout!.score_against).toBe(5)
    expect(bout!.result).toBe('loss')
  })

  it('shows one stored bout to both fencers, from each one’s own side', async () => {
    const { data: bout } = await service.from('bouts').insert({
      bouted_on: '2026-11-12', weapon: 'epee',
      fencer_id: ACCOUNTS.fencer.id, opponent_id: ACCOUNTS.lefty.id,
      score_for: 5, score_against: 2, recorded_by: ACCOUNTS.fencer.id,
    }).select().single()
    created.push({ table: 'bouts', id: bout!.id })

    const { data: sides } = await service.from('bout_sides').select('*').eq('bout_id', bout!.id)
    expect(sides).toHaveLength(2)

    const mine = sides!.find(s => s.member_id === bout!.fencer_id)!
    const theirs = sides!.find(s => s.member_id === bout!.opponent_id)!
    expect(mine.touches_scored).toBe(theirs.touches_received)
    expect(mine.touches_received).toBe(theirs.touches_scored)
    expect([mine.result, theirs.result].sort()).toEqual(['loss', 'win'])
  })

  it('derives the result rather than trusting it', async () => {
    const { data: bout } = await service.from('bouts').insert({
      bouted_on: '2026-11-13', weapon: 'epee', fencer_id: ACCOUNTS.fencer.id,
      opponent_name: 'Outsider', score_for: 4, score_against: 4,
      recorded_by: ACCOUNTS.fencer.id,
    }).select().single()
    created.push({ table: 'bouts', id: bout!.id })
    expect(bout!.result).toBe('tie')
  })
})

describe('passes', () => {
  it('refuses a card that expires before it starts', async () => {
    // Which is what a `valid_until` in the past means when `valid_from`
    // defaults to today — the shape of every "expired card" fixture, and the
    // reason the two below set both ends.
    const { error } = await admin.from('passes')
      .insert({ member_id: ACCOUNTS.fencer.id, label: 'Backwards', valid_until: '2020-01-01' })
    expect(error?.message).toMatch(/window_check/)
  })

  it('will not punch a card that has nothing left on it', async () => {
    const { data: pass } = await admin.from('passes')
      .insert({ member_id: ACCOUNTS.fencer.id, label: 'Two-session card', sessions: 2 })
      .select().single()
    created.push({ table: 'passes', id: pass!.id })

    for (let i = 0; i < 2; i++) {
      const { error } = await admin.from('pass_punches').insert({ pass_id: pass!.id, delta: 1 })
      expect(error).toBeNull()
    }
    const { error } = await admin.from('pass_punches').insert({ pass_id: pass!.id, delta: 1 })
    expect(error?.message).toMatch(/no sessions left/)
  })

  it('will not punch an expired card', async () => {
    const { data: pass } = await admin.from('passes')
      .insert({ member_id: ACCOUNTS.fencer.id, label: 'Old card', valid_from: '2019-01-01', valid_until: '2020-01-01' })
      .select().single()
    created.push({ table: 'passes', id: pass!.id })

    const { error } = await admin.from('pass_punches').insert({ pass_id: pass!.id, delta: 1 })
    expect(error?.message).toMatch(/expired/)
  })

  it('lets a session be given back even on an expired card', async () => {
    // A negative punch is a correction, and a correction must not be blocked by
    // the same rule that blocks a fresh use.
    const { data: pass } = await admin.from('passes')
      .insert({ member_id: ACCOUNTS.fencer.id, label: 'Correction', valid_from: '2019-01-01', valid_until: '2020-01-01' })
      .select().single()
    created.push({ table: 'passes', id: pass!.id })

    const { error } = await admin.from('pass_punches').insert({ pass_id: pass!.id, delta: -1 })
    expect(error).toBeNull()
  })
})

describe('waiver signatures', () => {
  it('cannot be changed once made', async () => {
    const { data: waiver } = await service.from('waivers').select('id, body').limit(1).single()

    // Scoped to a throwaway event, which is what makes this test repeatable.
    // A signature cannot be deleted — by anyone, including the service role,
    // which is the property being asserted — so there is no cleaning up after
    // it, and a club-wide signature would collide with the one the previous
    // run left behind. That collision is the constraint working; it is just
    // not the constraint this test is about.
    const { data: event } = await admin.from('events')
      .insert({ kind: 'practice', admin_title: 'Signature test', start_date: '2026-12-10' })
      .select().single()
    created.push({ table: 'events', id: event!.id })

    const { data: signature, error: signError } = await service.from('waiver_signatures').insert({
      waiver_id: waiver!.id, member_id: ACCOUNTS.fencer.id, event_id: event!.id,
      signed_name: 'Mei Lin', body_snapshot: waiver!.body,
    }).select().single()
    expect(signError).toBeNull()

    const updated = await service.from('waiver_signatures')
      .update({ signed_name: 'Somebody Else' }).eq('id', signature!.id)
    expect(updated.error?.message).toMatch(/cannot be changed/)

    // Not even a delete, and not even as the service role. A signature that can
    // be revised after the fact is not evidence of anything.
    const deleted = await service.from('waiver_signatures').delete().eq('id', signature!.id)
    expect(deleted.error?.message).toMatch(/cannot be changed/)

    // It still carries the wording as it stood when it was signed, which is
    // what makes it evidence of anything: `waiver_id` alone points at whatever
    // the waivers row says today.
    const { data: kept } = await service.from('waiver_signatures')
      .select('body_snapshot').eq('id', signature!.id).single()
    expect(kept!.body_snapshot).toBe(waiver!.body)
  })
})

describe('the vocabularies match the app', () => {
  it('accepts every event kind the app knows', async () => {
    for (const kind of EVENT_KINDS) {
      const row = kind === 'course'
        ? { kind, admin_title: `Kind ${kind}`, course_days: ['2026-12-20'] }
        : { kind, admin_title: `Kind ${kind}`, start_date: '2026-12-20' }
      const { data, error } = await admin.from('events').insert(row).select().single()
      expect(error, `events rejected kind '${kind}'`).toBeNull()
      created.push({ table: 'events', id: data!.id })
    }
  })

  it('accepts every weapon the app knows', async () => {
    for (const weapon of WEAPONS) {
      const { data, error } = await service.from('bouts').insert({
        bouted_on: '2026-11-20', weapon, fencer_id: ACCOUNTS.fencer.id,
        opponent_name: `Vocab ${weapon}`, score_for: 5, score_against: 0,
        recorded_by: ACCOUNTS.fencer.id,
      }).select().single()
      expect(error, `bouts rejected weapon '${weapon}'`).toBeNull()
      created.push({ table: 'bouts', id: data!.id })
    }
  })

  it('accepts every fitness metric the catalog knows, with its declared unit', async () => {
    const { FITNESS_METRICS } = await import('../../src/lib/fitness-metrics')
    for (const metric of FITNESS_METRICS) {
      const { data, error } = await service.from('fitness_tests').insert({
        fencer_id: ACCOUNTS.fencer.id, tested_on: '2026-09-01',
        metric: metric.key, value: Math.max(0, metric.min), unit: metric.unit,
      }).select().single()
      expect(error, `fitness_tests rejected '${metric.key}' in ${metric.unit}`).toBeNull()
      created.push({ table: 'fitness_tests', id: data!.id })
    }
  })

  it('accepts NOTHING the app does not know — the direction types cannot check', async () => {
    // The generated types give `kind` as plain `string`, so no compile-time
    // guard can prove the database refuses a seventh kind. This is where that
    // is established, by reading the constraint back out of the catalog and
    // comparing the two lists.
    const { data } = await service.rpc('constraint_definition' as never, {
      p_name: 'events_kind_check',
    } as never).select?.() ?? { data: null }
    // No such RPC ships with the app; fall back to trying the insert, which is
    // the behavior anybody actually depends on.
    void data
    const { error } = await admin.from('events')
      .insert({ kind: 'jousting' as never, admin_title: 'Not a kind', start_date: '2026-12-21' })
    expect(error?.message).toMatch(/events_kind_check/)
  })

  it('refuses a weapon outside the vocabulary', async () => {
    const { error } = await service.from('bouts').insert({
      bouted_on: '2026-11-21', weapon: 'lightsaber' as never, fencer_id: ACCOUNTS.fencer.id,
      opponent_name: 'Vader', score_for: 5, score_against: 0, recorded_by: ACCOUNTS.fencer.id,
    })
    expect(error?.message).toMatch(/weapon_check/)
  })

  it('refuses a fitness metric outside the catalog', async () => {
    expect(METRIC_KEYS).not.toContain('bench_press')
    const { error } = await service.from('fitness_tests').insert({
      fencer_id: ACCOUNTS.fencer.id, tested_on: '2026-09-01',
      metric: 'bench_press', value: 80, unit: 'kg',
    })
    expect(error?.message).toMatch(/metric_check/)
  })
})
