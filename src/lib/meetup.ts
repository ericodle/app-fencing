// The meetup planner: given the people who said they are coming, where should
// the club meet?
//
// This is the whole feature. Everything above it — the poll, the map, the
// admin page — is plumbing around these functions, and every one of them is
// pure: points in, ranked candidates out. No supabase, no React, no config
// object. The knobs come in as arguments so the tests can pin them.
//
// The shape of the answer, and why it is a list rather than a point:
//
//   A club asking "where is the most convenient place to meet" is asking an
//   optimization question without having said what it is optimizing. There are
//   at least two defensible answers and they are often 2 km apart:
//
//     • least total travel   — the geometric median. Best on average. Will
//                              quietly place the meeting next door to the four
//                              people who live near each other and leave the
//                              fifth with an hour each way, forever.
//     • fairest              — the center of the smallest enclosing circle.
//                              Nobody has a terrible journey; everybody has a
//                              mediocre one, and the four who live together
//                              travel further than they need to.
//
//   Picking one silently would be making the club's decision for it. So both
//   are computed, both are scored with the same numbers, and the UI shows them
//   side by side with the tradeoff spelled out. `clubConfig.meetup.objective`
//   only decides which is highlighted first.
//
//   And then: a point in the road is not a place to fence. The real output is
//   the ranking of actual VENUES against those ideal points, which is what
//   `planMeetup` returns.

import {
  haversineKm, projectionFor, project, unproject, planeIsSafe, roundKm,
  type LatLng, type Projection,
} from './geo'
import {
  geometricMedian, smallestEnclosingCircle, centroid,
  type WeightedPoint,
} from './optimize'
import type { TravelMode } from '../config/club'

/** One person's journey, as the planner needs it. */
export interface Attendee {
  memberId: string
  name: string
  origin: LatLng
  /** Where `origin` came from, for the "why am I being asked to go there"
   *  explanation. 'home' is the profile pin; 'response' is a one-off origin
   *  they gave with this RSVP. */
  originSource: 'home' | 'response'
  travelMode: TravelMode
  /** People travelling with them on the same journey. Counts toward the total
   *  distance objective (three people in a car is three inconvenienced people)
   *  but not toward the fairness objective (the journey is not longer). */
  partySize: number
}

export interface CandidateVenue {
  id: string
  name: string
  point: LatLng
  kind: string
  capacity: number | null
  indoor: boolean
  hasScoring: boolean
}

export interface MeetupOptions {
  travelSpeedKmh: Record<TravelMode, number>
  /** Venues further than this from the better of the two ideal points are
   *  dropped rather than ranked — a venue at the wrong end of the city is not
   *  a worse option, it is not an option. */
  maxVenueDetourKm: number
  /** Below this many attendees the planner declines to answer. */
  minRespondents: number
}

/** One person's journey to one candidate point. */
export interface Journey {
  memberId: string
  name: string
  km: number
  minutes: number
  travelMode: TravelMode
}

/** The scores every candidate is measured by. Identical fields for an ideal
 *  point and for a real venue, so the two can sit in one sorted list. */
export interface JourneySummary {
  respondents: number
  totalKm: number
  meanKm: number
  maxKm: number
  /** Population standard deviation of the individual distances. The number
   *  that exposes "the average is fine, one person is being sacrificed". */
  stddevKm: number
  maxMinutes: number
  meanMinutes: number
  journeys: Journey[]
}

export type MeetupMethod = 'total' | 'fairest' | 'centroid' | 'venue'

export interface MeetupCandidate {
  method: MeetupMethod
  point: LatLng
  venue: CandidateVenue | null
  summary: JourneySummary
  /** How much further, in total km, than the best possible point. Zero for the
   *  geometric median itself; the honest cost of choosing anything else. */
  excessTotalKm: number
  /** How much longer the worst journey is than it has to be. Zero for the
   *  fairest point. */
  excessMaxKm: number
}

export interface MeetupPlan {
  /** Null when there is nothing to say — too few people, or nobody has told us
   *  where they come from. `reason` says which. */
  recommended: MeetupCandidate | null
  reason: MeetupPlanReason
  /** The two ideal points plus the plain mean, always in this order, for the
   *  side-by-side explanation. Empty when `recommended` is null. */
  idealPoints: MeetupCandidate[]
  /** Real venues, best first by the requested objective. */
  venues: MeetupCandidate[]
  /** Attendees who said yes but could not be placed — no home pin, no origin.
   *  Named so the club can go and ask them rather than quietly omitting them
   *  from a decision about where everyone meets. */
  unlocated: { memberId: string; name: string }[]
}

export type MeetupPlanReason =
  | 'ok'
  | 'too-few-respondents'
  | 'no-locations'
  | 'spread-too-wide'

/** Straight-line km converted to a door-to-door estimate in minutes.
 *
 *  The speeds in the config are deliberately slower than the vehicle's real
 *  speed, because a straight line is not the route: Taipei's MRT runs at
 *  ~35 km/h but the journey includes walking to the station, waiting, and the
 *  fact that the track does not go where the crow flies. Treating the whole
 *  journey as a slow straight line is a cruder model than routing, and an
 *  honest one — it does not pretend to know about traffic. */
export function estimateMinutes(km: number, mode: TravelMode, speeds: Record<TravelMode, number>): number {
  const kmh = speeds[mode] ?? speeds.transit
  if (!kmh || kmh <= 0) return 0
  return (km / kmh) * 60
}

/** Score a candidate point against everyone who is coming. */
export function summarizeJourneys(
  point: LatLng,
  attendees: readonly Attendee[],
  speeds: Record<TravelMode, number>,
): JourneySummary {
  const journeys: Journey[] = attendees.map(a => {
    const km = haversineKm(point, a.origin)
    return {
      memberId: a.memberId,
      name: a.name,
      km: roundKm(km),
      minutes: Math.round(estimateMinutes(km, a.travelMode, speeds)),
      travelMode: a.travelMode,
    }
  })

  const n = journeys.length
  if (n === 0) {
    return {
      respondents: 0, totalKm: 0, meanKm: 0, maxKm: 0, stddevKm: 0,
      maxMinutes: 0, meanMinutes: 0, journeys,
    }
  }

  // Weighted by party size for the totals — three people arriving in one car
  // are three journeys' worth of inconvenience — but not for the maximum,
  // which is about how long one person is on a train.
  const weights = attendees.map(a => Math.max(1, a.partySize))
  const weightTotal = weights.reduce((s, w) => s + w, 0)
  const totalKm = journeys.reduce((s, j, i) => s + j.km * weights[i], 0)
  const meanKm = totalKm / weightTotal
  const variance = journeys.reduce((s, j, i) => s + weights[i] * (j.km - meanKm) ** 2, 0) / weightTotal

  return {
    respondents: n,
    totalKm: roundKm(totalKm),
    meanKm: roundKm(meanKm),
    maxKm: roundKm(Math.max(...journeys.map(j => j.km))),
    stddevKm: roundKm(Math.sqrt(variance)),
    maxMinutes: Math.max(...journeys.map(j => j.minutes)),
    meanMinutes: Math.round(journeys.reduce((s, j, i) => s + j.minutes * weights[i], 0) / weightTotal),
    journeys: journeys.sort((a, b) => b.km - a.km),
  }
}

function toWeightedPlane(attendees: readonly Attendee[], proj: Projection): WeightedPoint[] {
  return attendees.map(a => ({
    ...project(a.origin, proj),
    weight: Math.max(1, a.partySize),
  }))
}

/**
 * The two ideal points — and the mean, for contrast — for a set of attendees.
 *
 * Exported separately from `planMeetup` because the map view draws these
 * whether or not there is a venue anywhere near them, and because they are the
 * part worth testing against hand-computed geometry.
 */
export function idealPoints(attendees: readonly Attendee[]): {
  total: LatLng
  fairest: LatLng
  centroid: LatLng
  projection: Projection
} {
  const origins = attendees.map(a => a.origin)
  const proj = projectionFor(origins)
  const plane = toWeightedPlane(attendees, proj)

  return {
    total: unproject(geometricMedian(plane), proj),
    fairest: unproject(smallestEnclosingCircle(plane).center, proj),
    centroid: unproject(centroid(plane), proj),
    projection: proj,
  }
}

/**
 * The whole plan: ideal points, then the real venues ranked against them.
 *
 * `objective` picks which candidate is returned as `recommended` and which key
 * the venue list is sorted by. Both objectives are always computed, because
 * the point of the feature is showing the club the tradeoff rather than hiding
 * it behind a single number.
 */
export function planMeetup(
  attendees: readonly Attendee[],
  venues: readonly CandidateVenue[],
  options: MeetupOptions,
  objective: 'total' | 'fairest' = 'total',
): MeetupPlan {
  const unlocated = attendees
    .filter(a => !Number.isFinite(a.origin?.lat) || !Number.isFinite(a.origin?.lng))
    .map(a => ({ memberId: a.memberId, name: a.name }))

  const located = attendees.filter(
    a => Number.isFinite(a.origin?.lat) && Number.isFinite(a.origin?.lng),
  )

  const empty = (reason: MeetupPlanReason): MeetupPlan =>
    ({ recommended: null, reason, idealPoints: [], venues: [], unlocated })

  if (located.length === 0) return empty('no-locations')
  if (located.length < options.minRespondents) return empty('too-few-respondents')

  const ideal = idealPoints(located)
  // The plane approximation is only honest over a region. A "club" whose
  // members are on three continents gets told so rather than given a confident
  // pin in the sea.
  if (!planeIsSafe(ideal.projection)) return empty('spread-too-wide')

  const score = (point: LatLng) => summarizeJourneys(point, located, options.travelSpeedKmh)

  const totalSummary = score(ideal.total)
  const fairestSummary = score(ideal.fairest)
  // The floors every other candidate's excess is measured against. By
  // construction no point can beat the median on total or the circle center on
  // maximum, so these are genuine lower bounds.
  const bestTotalKm = totalSummary.totalKm
  const bestMaxKm = fairestSummary.maxKm

  const asCandidate = (
    method: MeetupMethod,
    point: LatLng,
    venue: CandidateVenue | null,
    summary: JourneySummary,
  ): MeetupCandidate => ({
    method,
    point,
    venue,
    summary,
    excessTotalKm: roundKm(Math.max(0, summary.totalKm - bestTotalKm)),
    excessMaxKm: roundKm(Math.max(0, summary.maxKm - bestMaxKm)),
  })

  const idealCandidates: MeetupCandidate[] = [
    asCandidate('total', ideal.total, null, totalSummary),
    asCandidate('fairest', ideal.fairest, null, fairestSummary),
    asCandidate('centroid', ideal.centroid, null, score(ideal.centroid)),
  ]

  // A venue is in the running if it is near EITHER ideal point. Measuring
  // against only one would drop the venue that is the obvious answer under the
  // other objective, which is exactly the comparison the club came for.
  const reachable = venues.filter(v =>
    Math.min(
      haversineKm(v.point, ideal.total),
      haversineKm(v.point, ideal.fairest),
    ) <= options.maxVenueDetourKm,
  )

  const venueCandidates = reachable
    .map(v => asCandidate('venue', v.point, v, score(v.point)))
    .sort((a, b) =>
      objective === 'total'
        ? a.summary.totalKm - b.summary.totalKm || a.summary.maxKm - b.summary.maxKm
        : a.summary.maxKm - b.summary.maxKm || a.summary.totalKm - b.summary.totalKm,
    )

  // The recommendation is a real venue when there is one, because a club
  // cannot fence at a coordinate. The ideal point is the fallback, and the
  // thing to show on the map next to whichever venue won.
  const recommended = venueCandidates[0]
    ?? (objective === 'total' ? idealCandidates[0] : idealCandidates[1])

  return { recommended, reason: 'ok', idealPoints: idealCandidates, venues: venueCandidates, unlocated }
}

/** Why a candidate is or is not a good idea, in the words the UI prints. Kept
 *  here rather than in the component so the phrasing is testable and the
 *  thresholds live next to the math they describe. */
export function describeTradeoff(candidate: MeetupCandidate): string | null {
  const { summary, excessTotalKm, excessMaxKm } = candidate
  if (summary.respondents === 0) return null

  // One journey twice the mean, on a group whose journeys otherwise cluster:
  // somebody is carrying the group's convenience.
  if (summary.maxKm > summary.meanKm * 2 && summary.stddevKm > 1) {
    const worst = summary.journeys[0]
    return `${worst.name} travels ${worst.km.toFixed(1)} km — about ${worst.minutes} minutes — against a group average of ${summary.meanKm.toFixed(1)} km.`
  }
  if (excessMaxKm > 2 && excessTotalKm < 1) {
    return `Least total travel, but the longest single journey is ${excessMaxKm.toFixed(1)} km further than it needs to be.`
  }
  if (excessTotalKm > 3 && excessMaxKm < 0.5) {
    return `The fairest option: the longest journey is as short as it can be, at the cost of ${excessTotalKm.toFixed(1)} km of extra travel across the group.`
  }
  return null
}
