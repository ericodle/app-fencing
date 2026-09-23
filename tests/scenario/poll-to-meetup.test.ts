import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { clientFor, serviceClient, ACCOUNTS } from '../helpers'
import type { Database } from '../../src/types/database'
import { attendeesFrom, tally, pollIsOpen, type ResponseWithMember } from '../../src/lib/attendance'
import { planMeetup, type CandidateVenue } from '../../src/lib/meetup'
import { haversineKm } from '../../src/lib/geo'

// The whole feature, once, as a journey rather than as a set of rules:
//
//   a coach schedules cross-training → opens a poll → four members answer from four
//   corners of the city → the planner ranks the club's venues → the coach picks
//   one → the session moves, and the app can still say where it started.
//
// This is the test that would catch the class of break no unit test can: the
// planner is right, every policy is right, and the pieces still do not add up
// because the data arrives in a shape one of them did not expect.

type Client = SupabaseClient<Database>
const service = serviceClient()
let coach: Client
let admin: Client

// Real Taipei coordinates, spread deliberately: three members clustered in the
// east and one stranded in the west. That is the shape where the two objectives
// disagree, which is the case the feature exists to make visible.
const ORIGINS = {
  [ACCOUNTS.fencer.id]: { label: 'Xinyi',   lat: 25.0330, lng: 121.5650 },
  [ACCOUNTS.coach.id]:  { label: 'Songshan',lat: 25.0600, lng: 121.5580 },
  [ACCOUNTS.admin.id]:  { label: 'Daan',    lat: 25.0263, lng: 121.5436 },
  [ACCOUNTS.lefty.id]:  { label: 'Banqiao', lat: 25.0143, lng: 121.4672 },
}

let eventId: string
let pollId: string
const venueIds: string[] = []
const savedProfiles: Record<string, { lat: number | null; lng: number | null; label: string | null }> = {}

beforeAll(async () => {
  ;[coach, admin] = await Promise.all([clientFor('coach'), clientFor('admin')])

  // Remember where everyone actually lives, so the suite puts it back.
  const { data: before } = await service.from('profiles')
    .select('id, home_lat, home_lng, home_label').in('id', Object.keys(ORIGINS))
  for (const row of before ?? []) {
    savedProfiles[row.id] = {
      lat: row.home_lat as number | null,
      lng: row.home_lng as number | null,
      label: row.home_label,
    }
  }
  for (const [id, origin] of Object.entries(ORIGINS)) {
    await service.from('profiles')
      .update({ home_lat: origin.lat, home_lng: origin.lng, home_label: origin.label, travel_mode: 'transit' })
      .eq('id', id)
  }
}, 40_000)

afterAll(async () => {
  for (const [id, saved] of Object.entries(savedProfiles)) {
    await service.from('profiles')
      .update({ home_lat: saved.lat, home_lng: saved.lng, home_label: saved.label }).eq('id', id)
  }
  if (eventId) await service.from('events').delete().eq('id', eventId)
  for (const id of venueIds) await service.from('venues').delete().eq('id', id)
}, 30_000)

describe('from "who is coming?" to "we are meeting here"', () => {
  it('a coach schedules cross-training with the planner switched on', async () => {
    const { data, error } = await admin.from('events').insert({
      kind: 'cross_training',
      admin_title: 'Saturday conditioning — venue TBD',
      display_title: 'Park conditioning',
      start_date: '2026-12-05',
      start_time: '06:45',
      meetup_open: true,
      polls_attendance: true,
    }).select().single()

    expect(error).toBeNull()
    expect(data!.meetup_open).toBe(true)
    eventId = data!.id
  })

  it('and opens a poll on it', async () => {
    const { data, error } = await coach.from('attendance_polls')
      .insert({ event_id: eventId, question: 'Coming Saturday?', created_by: ACCOUNTS.coach.id })
      .select().single()
    expect(error).toBeNull()
    expect(pollIsOpen(data)).toBe(true)
    pollId = data!.id
  })

  it('refuses a second poll on the same event', async () => {
    const { error } = await coach.from('attendance_polls').insert({ event_id: eventId })
    expect(error?.message).toMatch(/one_per_event|duplicate key/)
  })

  it('four members answer, each as themselves', async () => {
    for (const [account, answer] of [
      ['fencer', { response: 'yes', travel_mode: 'transit' }],
      ['coach',  { response: 'yes', travel_mode: 'drive', seats_offered: 3 }],
      ['admin',  { response: 'yes', travel_mode: 'drive', seats_offered: 4 }],
      ['lefty',  { response: 'yes', travel_mode: 'transit', needs_ride: true }],
      ['junior', { response: 'no' }],
    ] as const) {
      const client = await clientFor(account)
      const { error } = await client.from('attendance_responses').insert({
        poll_id: pollId, member_id: ACCOUNTS[account].id, ...answer,
      })
      expect(error, `${account} could not answer`).toBeNull()
    }
  })

  it('the tally counts them, and the view agrees with the client-side helper', async () => {
    const { data: view } = await service.from('attendance_tally').select('*').eq('poll_id', pollId).single()
    expect(Number(view!.yes)).toBe(4)
    expect(Number(view!.no)).toBe(1)
    expect(Number(view!.seats_offered)).toBe(7)
    expect(Number(view!.needs_ride)).toBe(1)

    const rows = await fetchRows()
    const local = tally(rows)
    expect(local.yes).toBe(Number(view!.yes))
    expect(local.seatsOffered).toBe(Number(view!.seats_offered))
  })

  it('the planner reads the home pins and places everyone', async () => {
    const attendees = attendeesFrom(await fetchRows())
    expect(attendees).toHaveLength(4)
    expect(attendees.every(a => Number.isFinite(a.origin.lat))).toBe(true)
    expect(attendees.every(a => a.originSource === 'home')).toBe(true)
  })

  it('a member coming from somewhere else today moves the answer', async () => {
    const before = attendeesFrom(await fetchRows())
    const beforePlan = planMeetup(before, [], OPTIONS)

    // The fencer is coming straight from Tamsui, far to the north-west.
    const fencerClient = await clientFor('fencer')
    await fencerClient.from('attendance_responses')
      .update({ origin_lat: 25.1677, origin_lng: 121.4406, origin_label: 'Tamsui' })
      .eq('poll_id', pollId).eq('member_id', ACCOUNTS.fencer.id)

    const after = attendeesFrom(await fetchRows())
    expect(after.find(a => a.memberId === ACCOUNTS.fencer.id)!.originSource).toBe('response')

    const afterPlan = planMeetup(after, [], OPTIONS)
    expect(afterPlan.idealPoints[0].point.lat).toBeGreaterThan(beforePlan.idealPoints[0].point.lat)

    // Put it back — the rest of the journey is about where people live.
    await fencerClient.from('attendance_responses')
      .update({ origin_lat: null, origin_lng: null, origin_label: null })
      .eq('poll_id', pollId).eq('member_id', ACCOUNTS.fencer.id)
  })

  it('ranks the club’s real venues against the ideal point', async () => {
    const { data } = await service.from('venues').select('*').eq('status', 'active')
    const venues: CandidateVenue[] = (data ?? []).map(toCandidate)

    const plan = planMeetup(attendeesFrom(await fetchRows()), venues, { ...OPTIONS, maxVenueDetourKm: 25 })
    expect(plan.reason).toBe('ok')
    expect(plan.recommended!.method).toBe('venue')
    expect(plan.venues.length).toBeGreaterThan(1)

    // Sorted by the objective, and every candidate scored against everyone.
    const totals = plan.venues.map(v => v.summary.totalKm)
    expect(totals).toEqual([...totals].sort((a, b) => a - b))
    expect(plan.venues.every(v => v.summary.respondents === 4)).toBe(true)
  })

  it('shows the two objectives disagreeing, which is the whole point', async () => {
    const attendees = attendeesFrom(await fetchRows())
    const plan = planMeetup(attendees, [], OPTIONS)
    const [total, fairest] = plan.idealPoints

    // Three in the east, one in Banqiao: the median stays east, the 1-center
    // moves west to shorten the worst journey.
    expect(fairest.point.lng).toBeLessThan(total.point.lng)
    expect(fairest.summary.maxKm).toBeLessThan(total.summary.maxKm)
    expect(total.summary.totalKm).toBeLessThan(fairest.summary.totalKm)
  })

  it('the coach picks a venue, and it is recorded with the numbers behind it', async () => {
    const { data } = await service.from('venues').select('*').eq('status', 'active')
    const venues: CandidateVenue[] = (data ?? []).map(toCandidate)
    const plan = planMeetup(attendeesFrom(await fetchRows()), venues, { ...OPTIONS, maxVenueDetourKm: 25 })
    const pick = plan.recommended!

    const { data: saved, error } = await coach.from('meetup_suggestions').insert({
      poll_id: pollId,
      method: 'venue',
      lat: pick.point.lat, lng: pick.point.lng,
      venue_id: pick.venue!.id,
      respondents: pick.summary.respondents,
      total_km: pick.summary.totalKm,
      max_km: pick.summary.maxKm,
      mean_km: pick.summary.meanKm,
      stddev_km: pick.summary.stddevKm,
      max_minutes: pick.summary.maxMinutes,
      chosen: true,
    }).select().single()

    expect(error).toBeNull()
    expect(saved!.chosen_by).toBe(ACCOUNTS.coach.id)
    // Frozen at the moment of the decision, so the answer cannot change under
    // somebody's feet after it has been announced.
    expect(Number(saved!.total_km)).toBeCloseTo(pick.summary.totalKm, 2)
    expect(Number(saved!.respondents)).toBe(4)

    await coach.from('events').update({ venue_id: pick.venue!.id }).eq('id', eventId)
  })

  it('the session has moved, and still knows where it started', async () => {
    const { data: event } = await service.from('events')
      .select('venue_id, original_venue_id').eq('id', eventId).single()
    expect(event!.venue_id).not.toBeNull()
    // It started with no venue at all, so there is nothing to have moved from —
    // and the trigger correctly records that rather than inventing one.
    expect(event!.original_venue_id).toBeNull()

    // Move it a second time: now there is an original.
    const { data: elsewhere } = await service.from('venues')
      .select('id').eq('status', 'active').neq('id', event!.venue_id!).limit(1).single()
    await coach.from('events').update({ venue_id: elsewhere!.id }).eq('id', eventId)

    const { data: moved } = await service.from('events')
      .select('venue_id, original_venue_id').eq('id', eventId).single()
    expect(moved!.venue_id).toBe(elsewhere!.id)
    expect(moved!.original_venue_id).toBe(event!.venue_id)
  })

  it('a member cannot overwrite somebody else’s answer', async () => {
    const fencerClient = await clientFor('fencer')
    await fencerClient.from('attendance_responses')
      .update({ response: 'no' }).eq('poll_id', pollId).eq('member_id', ACCOUNTS.lefty.id)

    const { data } = await service.from('attendance_responses')
      .select('response').eq('poll_id', pollId).eq('member_id', ACCOUNTS.lefty.id).single()
    expect(data!.response).toBe('yes')
  })

  it('once the poll closes, no more answers land', async () => {
    await coach.from('attendance_polls').update({ status: 'closed' }).eq('id', pollId)

    const juniorClient = await clientFor('junior')
    const { error } = await juniorClient.from('attendance_responses')
      .update({ response: 'yes' }).eq('poll_id', pollId).eq('member_id', ACCOUNTS.junior.id)
    expect(error?.message).toMatch(/closed/)

    // And the chosen suggestion survives the poll closing, because the whole
    // reason it is stored is that people are going to turn up on Saturday.
    const { data } = await service.from('meetup_suggestions')
      .select('*').eq('poll_id', pollId).eq('chosen', true)
    expect(data).toHaveLength(1)
  })

  it('every journey it reported is a real distance to the venue it chose', async () => {
    const { data: chosen } = await service.from('meetup_suggestions')
      .select('*').eq('poll_id', pollId).eq('chosen', true).single()

    const attendees = attendeesFrom(await fetchRows())
    const furthest = Math.max(...attendees.map(a =>
      haversineKm({ lat: Number(chosen!.lat), lng: Number(chosen!.lng) }, a.origin)))

    expect(Number(chosen!.max_km)).toBeCloseTo(furthest, 1)
  })
})

const OPTIONS = {
  travelSpeedKmh: { walk: 4.5, bike: 13, transit: 18, drive: 24 },
  maxVenueDetourKm: 8,
  minRespondents: 3,
}

function toCandidate(v: { id: string; name: string; lat: number; lng: number; kind: string; capacity: number | null; indoor: boolean; has_scoring: boolean }): CandidateVenue {
  return {
    id: v.id, name: v.name,
    point: { lat: Number(v.lat), lng: Number(v.lng) },
    kind: v.kind, capacity: v.capacity, indoor: v.indoor, hasScoring: v.has_scoring,
  }
}

/** The responses joined to their members, exactly as the app fetches them. */
async function fetchRows(): Promise<ResponseWithMember[]> {
  const { data: responses } = await service.from('attendance_responses').select('*').eq('poll_id', pollId)
  const { data: members } = await service.from('profiles')
    .select('id, name, nickname, home_label, home_lat, home_lng, travel_mode')
    .in('id', (responses ?? []).map(r => r.member_id))
  const byId = new Map((members ?? []).map(m => [m.id, m]))
  return (responses ?? [])
    .map(response => {
      const member = byId.get(response.member_id)
      return member ? { response, member } : null
    })
    .filter((r): r is ResponseWithMember => r !== null)
}
