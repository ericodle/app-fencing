import { describe, it, expect } from 'vitest'
import {
  planMeetup, idealPoints, summarizeJourneys, estimateMinutes, describeTradeoff,
  type Attendee, type CandidateVenue, type MeetupOptions,
} from './meetup'
import { haversineKm } from './geo'
import type { TravelMode } from '../config/club'

const SPEEDS: Record<TravelMode, number> = { walk: 4.5, bike: 13, transit: 18, drive: 24 }

const OPTIONS: MeetupOptions = {
  travelSpeedKmh: SPEEDS,
  maxVenueDetourKm: 8,
  minRespondents: 3,
}

// Real Taipei districts, so the numbers in a failure mean something to anyone
// who knows the city.
const PLACES = {
  taipei101:  { lat: 25.0339, lng: 121.5645 },  // Xinyi
  main:       { lat: 25.0478, lng: 121.5170 },  // Zhongzheng
  shilin:     { lat: 25.0880, lng: 121.5250 },
  banqiao:    { lat: 25.0143, lng: 121.4672 },
  nangang:    { lat: 25.0538, lng: 121.6066 },
  tamsui:     { lat: 25.1677, lng: 121.4406 },  // far out
  daan:       { lat: 25.0263, lng: 121.5436 },
  zhongshan:  { lat: 25.0640, lng: 121.5260 },
}

let seq = 0
function fencer(name: string, origin: { lat: number; lng: number }, over: Partial<Attendee> = {}): Attendee {
  return {
    memberId: `m${++seq}`,
    name,
    origin,
    originSource: 'home',
    travelMode: 'transit',
    partySize: 1,
    ...over,
  }
}

function venue(name: string, point: { lat: number; lng: number }, over: Partial<CandidateVenue> = {}): CandidateVenue {
  return {
    id: `v-${name}`,
    name,
    point,
    kind: 'salle',
    capacity: 20,
    indoor: true,
    hasScoring: true,
    ...over,
  }
}

describe('estimateMinutes', () => {
  it('divides distance by the mode speed', () => {
    expect(estimateMinutes(9, 'transit', SPEEDS)).toBeCloseTo(30, 6)
    expect(estimateMinutes(4.5, 'walk', SPEEDS)).toBeCloseTo(60, 6)
  })

  it('puts a walker on the road longer than a driver over the same ground', () => {
    expect(estimateMinutes(5, 'walk', SPEEDS)).toBeGreaterThan(estimateMinutes(5, 'drive', SPEEDS))
  })

  it('falls back rather than returning Infinity for an unknown mode', () => {
    const broken = { ...SPEEDS, drive: 0 }
    expect(Number.isFinite(estimateMinutes(5, 'drive', broken))).toBe(true)
  })
})

describe('summarizeJourneys', () => {
  const attendees = [
    fencer('A', PLACES.taipei101),
    fencer('B', PLACES.main),
    fencer('C', PLACES.shilin),
  ]

  it('measures every journey from the candidate point', () => {
    const s = summarizeJourneys(PLACES.main, attendees, SPEEDS)
    expect(s.respondents).toBe(3)
    expect(s.journeys).toHaveLength(3)
    // B lives at the point, so B's journey is zero.
    expect(s.journeys.find(j => j.name === 'B')!.km).toBe(0)
    expect(s.totalKm).toBeCloseTo(
      haversineKm(PLACES.main, PLACES.taipei101) + haversineKm(PLACES.main, PLACES.shilin),
      2,
    )
  })

  it('sorts the journeys worst first, because that is the one being argued about', () => {
    const s = summarizeJourneys(PLACES.main, attendees, SPEEDS)
    expect(s.journeys[0].km).toBeGreaterThanOrEqual(s.journeys[1].km)
    expect(s.journeys[1].km).toBeGreaterThanOrEqual(s.journeys[2].km)
    expect(s.maxKm).toBe(s.journeys[0].km)
  })

  it('counts a party of three as three journeys for the total, one for the worst', () => {
    const solo  = summarizeJourneys(PLACES.main, [fencer('A', PLACES.tamsui)], SPEEDS)
    const party = summarizeJourneys(PLACES.main, [fencer('A', PLACES.tamsui, { partySize: 3 })], SPEEDS)
    expect(party.totalKm).toBeCloseTo(solo.totalKm * 3, 3)
    expect(party.maxKm).toBeCloseTo(solo.maxKm, 6)
  })

  it('reports a spread that exposes one person carrying the group', () => {
    const lopsided = summarizeJourneys(PLACES.main, [
      fencer('A', PLACES.main), fencer('B', PLACES.main), fencer('C', PLACES.tamsui),
    ], SPEEDS)
    expect(lopsided.stddevKm).toBeGreaterThan(5)

    const even = summarizeJourneys(PLACES.main, [
      fencer('A', PLACES.main), fencer('B', PLACES.main), fencer('C', PLACES.main),
    ], SPEEDS)
    expect(even.stddevKm).toBe(0)
  })

  it('returns zeros rather than NaN for nobody', () => {
    const s = summarizeJourneys(PLACES.main, [], SPEEDS)
    expect(s).toMatchObject({ respondents: 0, totalKm: 0, meanKm: 0, maxKm: 0, stddevKm: 0 })
  })
})

describe('idealPoints', () => {
  it('puts all three on top of each other when everyone lives in one place', () => {
    const together = [1, 2, 3].map(i => fencer(`F${i}`, PLACES.daan))
    const { total, fairest, centroid } = idealPoints(together)
    for (const p of [total, fairest, centroid]) {
      expect(haversineKm(p, PLACES.daan)).toBeLessThan(0.01)
    }
  })

  it('separates the median from the mean when one member lives far out', () => {
    const attendees = [
      fencer('A', PLACES.daan),
      fencer('B', PLACES.daan),
      fencer('C', PLACES.taipei101),
      fencer('D', PLACES.main),
      fencer('E', PLACES.tamsui),
    ]
    const { total, centroid, fairest } = idealPoints(attendees)
    // The median stays with the four in town; the mean is dragged toward Tamsui.
    expect(haversineKm(total, PLACES.daan)).toBeLessThan(haversineKm(centroid, PLACES.daan))
    // And the fairness point goes further still, to shorten the Tamsui journey.
    expect(haversineKm(fairest, PLACES.tamsui)).toBeLessThan(haversineKm(total, PLACES.tamsui))
  })

  it('agrees with the objectives it claims to optimize', () => {
    const attendees = [
      fencer('A', PLACES.banqiao), fencer('B', PLACES.nangang),
      fencer('C', PLACES.shilin),  fencer('D', PLACES.daan),
      fencer('E', PLACES.main),
    ]
    const { total, fairest, centroid } = idealPoints(attendees)
    const sum  = (p: { lat: number; lng: number }) => summarizeJourneys(p, attendees, SPEEDS).totalKm
    const worst = (p: { lat: number; lng: number }) => summarizeJourneys(p, attendees, SPEEDS).maxKm

    expect(sum(total)).toBeLessThanOrEqual(sum(fairest) + 1e-6)
    expect(sum(total)).toBeLessThanOrEqual(sum(centroid) + 1e-6)
    expect(worst(fairest)).toBeLessThanOrEqual(worst(total) + 1e-6)
    expect(worst(fairest)).toBeLessThanOrEqual(worst(centroid) + 1e-6)
  })
})

describe('planMeetup', () => {
  const venues = [
    venue('Bade Road', PLACES.taipei101),
    venue('Zhongshan salle', PLACES.zhongshan),
    venue('Banqiao gym', PLACES.banqiao),
    venue('Minsheng Park', PLACES.shilin, { kind: 'park', indoor: false, hasScoring: false, capacity: null }),
  ]

  it('declines to answer for too few people', () => {
    const plan = planMeetup([fencer('A', PLACES.daan), fencer('B', PLACES.main)], venues, OPTIONS)
    expect(plan.recommended).toBeNull()
    expect(plan.reason).toBe('too-few-respondents')
    expect(plan.venues).toEqual([])
  })

  it('declines when nobody has said where they come from', () => {
    const nowhere = [1, 2, 3].map(i =>
      fencer(`F${i}`, { lat: Number.NaN, lng: Number.NaN }))
    const plan = planMeetup(nowhere, venues, OPTIONS)
    expect(plan.reason).toBe('no-locations')
    expect(plan.unlocated).toHaveLength(3)
  })

  it('names the people it could not place instead of silently dropping them', () => {
    const attendees = [
      fencer('A', PLACES.daan),
      fencer('B', PLACES.main),
      fencer('C', PLACES.shilin),
      fencer('Nomad', { lat: Number.NaN, lng: Number.NaN }),
    ]
    const plan = planMeetup(attendees, venues, OPTIONS)
    expect(plan.reason).toBe('ok')
    expect(plan.unlocated.map(u => u.name)).toEqual(['Nomad'])
    expect(plan.recommended!.summary.respondents).toBe(3)
  })

  it('refuses to plan for a group spread across the planet', () => {
    const scattered = [
      fencer('Taipei', PLACES.daan),
      fencer('London', { lat: 51.5, lng: -0.12 }),
      fencer('Lima',   { lat: -12.0, lng: -77.0 }),
    ]
    const plan = planMeetup(scattered, venues, OPTIONS)
    expect(plan.reason).toBe('spread-too-wide')
    expect(plan.recommended).toBeNull()
  })

  it('recommends a real venue rather than a point in the road', () => {
    const attendees = [
      fencer('A', PLACES.daan), fencer('B', PLACES.taipei101),
      fencer('C', PLACES.nangang), fencer('D', PLACES.main),
    ]
    const plan = planMeetup(attendees, venues, OPTIONS)
    expect(plan.recommended!.method).toBe('venue')
    expect(plan.recommended!.venue).not.toBeNull()
  })

  it('ranks venues by total travel under the total objective', () => {
    const attendees = [
      fencer('A', PLACES.daan), fencer('B', PLACES.taipei101),
      fencer('C', PLACES.nangang), fencer('D', PLACES.main),
    ]
    const plan = planMeetup(attendees, venues, OPTIONS, 'total')
    const totals = plan.venues.map(v => v.summary.totalKm)
    expect(totals).toEqual([...totals].sort((a, b) => a - b))
  })

  it('ranks venues by the worst journey under the fairest objective', () => {
    const attendees = [
      fencer('A', PLACES.daan), fencer('B', PLACES.taipei101),
      fencer('C', PLACES.nangang), fencer('D', PLACES.main),
    ]
    const plan = planMeetup(attendees, venues, OPTIONS, 'fairest')
    const worsts = plan.venues.map(v => v.summary.maxKm)
    expect(worsts).toEqual([...worsts].sort((a, b) => a - b))
  })

  it('can pick a different venue for each objective, which is the point', () => {
    // Four together in Xinyi, one stranded in Tamsui. Least total travel keeps
    // everyone in Xinyi; fairest drags the meeting north.
    const attendees = [
      fencer('A', PLACES.taipei101), fencer('B', PLACES.taipei101),
      fencer('C', PLACES.daan),      fencer('D', PLACES.taipei101),
      fencer('E', PLACES.tamsui),
    ]
    const spread = [
      venue('Xinyi salle', PLACES.taipei101),
      venue('Shilin gym',  PLACES.shilin),
      venue('Zhongshan',   PLACES.zhongshan),
    ]
    const byTotal   = planMeetup(attendees, spread, { ...OPTIONS, maxVenueDetourKm: 25 }, 'total')
    const byFairest = planMeetup(attendees, spread, { ...OPTIONS, maxVenueDetourKm: 25 }, 'fairest')

    expect(byTotal.recommended!.venue!.name).toBe('Xinyi salle')
    expect(byFairest.recommended!.venue!.name).not.toBe('Xinyi salle')
    // And each wins on its own measure.
    expect(byTotal.recommended!.summary.totalKm)
      .toBeLessThan(byFairest.recommended!.summary.totalKm)
    expect(byFairest.recommended!.summary.maxKm)
      .toBeLessThan(byTotal.recommended!.summary.maxKm)
  })

  it('drops venues at the wrong end of the city instead of ranking them last', () => {
    const attendees = [
      fencer('A', PLACES.taipei101), fencer('B', PLACES.daan), fencer('C', PLACES.nangang),
    ]
    const withFarVenue = [...venues, venue('Keelung', { lat: 25.128, lng: 121.741 })]
    const plan = planMeetup(attendees, withFarVenue, { ...OPTIONS, maxVenueDetourKm: 5 })
    expect(plan.venues.map(v => v.venue!.name)).not.toContain('Keelung')
  })

  it('reports the cost of every option against the best possible one', () => {
    const attendees = [
      fencer('A', PLACES.banqiao), fencer('B', PLACES.nangang),
      fencer('C', PLACES.shilin),  fencer('D', PLACES.daan),
    ]
    const plan = planMeetup(attendees, venues, OPTIONS)
    const [total, fairest] = plan.idealPoints
    // Each ideal point is by definition free on its own measure.
    expect(total.excessTotalKm).toBe(0)
    expect(fairest.excessMaxKm).toBe(0)
    // And every venue costs something against at least one of them.
    for (const v of plan.venues) {
      expect(v.excessTotalKm).toBeGreaterThanOrEqual(0)
      expect(v.excessMaxKm).toBeGreaterThanOrEqual(0)
    }
  })

  it('always returns the three ideal points in a fixed order', () => {
    const attendees = [
      fencer('A', PLACES.daan), fencer('B', PLACES.main), fencer('C', PLACES.shilin),
    ]
    const plan = planMeetup(attendees, [], OPTIONS)
    expect(plan.idealPoints.map(p => p.method)).toEqual(['total', 'fairest', 'centroid'])
  })

  it('falls back to an ideal point when no venue is close enough', () => {
    const attendees = [
      fencer('A', PLACES.daan), fencer('B', PLACES.main), fencer('C', PLACES.shilin),
    ]
    const plan = planMeetup(attendees, [venue('Kaohsiung', { lat: 22.63, lng: 120.30 })], OPTIONS)
    expect(plan.venues).toEqual([])
    expect(plan.recommended!.method).toBe('total')
    expect(plan.recommended!.venue).toBeNull()
  })

  it('plans from the origin it is handed, wherever that came from', () => {
    // Same fencer, coming straight from the office in Nangang rather than from
    // home in Banqiao. Which pin won is decided upstream, when the Attendee is
    // built; the planner's job is to use the one it was given, and the ideal
    // point — continuous, unlike the venue list — is where that shows.
    const base = [fencer('B', PLACES.daan), fencer('C', PLACES.taipei101)]
    const fromHome = planMeetup([...base, fencer('A', PLACES.banqiao)], venues, OPTIONS)
    const fromWork = planMeetup(
      [...base, fencer('A', PLACES.nangang, { originSource: 'response' })], venues, OPTIONS)

    expect(fromWork.idealPoints[0].point.lng)
      .toBeGreaterThan(fromHome.idealPoints[0].point.lng)
    // And the journey list measures against the origin that was supplied.
    const aFromWork = fromWork.idealPoints[0].summary.journeys.find(j => j.name === 'A')!
    expect(aFromWork.km).toBeCloseTo(
      haversineKm(fromWork.idealPoints[0].point, PLACES.nangang), 3)
  })
})

describe('describeTradeoff', () => {
  it('names the person carrying the group when one journey dwarfs the rest', () => {
    const attendees = [
      fencer('Near1', PLACES.daan), fencer('Near2', PLACES.daan),
      fencer('Wei',   PLACES.tamsui),
    ]
    const plan = planMeetup(attendees, [], { ...OPTIONS, minRespondents: 3 })
    const text = describeTradeoff(plan.idealPoints[0])
    expect(text).toContain('Wei')
    expect(text).toMatch(/minutes/)
  })

  it('says nothing when everybody travels about the same', () => {
    const attendees = [
      fencer('A', PLACES.daan), fencer('B', PLACES.main), fencer('C', PLACES.zhongshan),
    ]
    const plan = planMeetup(attendees, [], OPTIONS)
    expect(describeTradeoff(plan.idealPoints[2])).toBeNull()
  })

  it('says nothing about an empty summary', () => {
    expect(describeTradeoff({
      method: 'total',
      point: PLACES.daan,
      venue: null,
      summary: summarizeJourneys(PLACES.daan, [], SPEEDS),
      excessTotalKm: 0,
      excessMaxKm: 0,
    })).toBeNull()
  })
})
