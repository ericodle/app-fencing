// Reading and writing the attendance poll, and turning its answers into the
// shape the meetup planner wants.
//
// The interesting function here is `attendeesFrom`: it resolves each person's
// origin, and the rule it encodes is the one the whole planner rests on.

import { supabase } from './supabase'
import { clubConfig, type TravelMode } from '../config/club'
import type { Attendee } from './meetup'
import type { AttendancePoll, AttendanceResponse, PollResponse } from '../types/db'

/** A response with the member it belongs to, which is how every screen wants
 *  it and how `attendeesFrom` needs it.
 *
 *  Spelled out rather than Pick'd from a row type: this is read from `profiles`
 *  (the home pin is not on the `roster` view — the view exists to keep
 *  coordinates off the general roster read), and every column on a Postgres
 *  VIEW generates as nullable, which would make `id` a `string | null` that
 *  every caller then has to narrow for no reason. */
export interface ResponseWithMember {
  response: AttendanceResponse
  member: {
    id: string
    name: string | null
    nickname: string | null
    home_label: string | null
    home_lat: number | null
    home_lng: number | null
    travel_mode: string | null
  }
}

/**
 * Turn poll answers into the planner's input.
 *
 * Three rules, and each of them is a decision somebody could reasonably make
 * differently:
 *
 *  1. **Only 'yes' counts.** A maybe is not a person to be central to. Planning
 *     around people who then do not come produces a venue chosen for nobody,
 *     and the failure is invisible — the numbers still look convincing.
 *
 *  2. **A one-off origin on the response beats the profile's home pin.** If
 *     somebody said they are coming straight from the office, the office is
 *     where they are coming from, whatever their profile says.
 *
 *  3. **Somebody with neither is left out, and named.** Silently substituting
 *     the club's address would place them at the answer and drag it toward the
 *     venue the planner was supposed to be questioning. They are returned in
 *     `planMeetup`'s `unlocated` list instead, so the club can go and ask.
 */
export function attendeesFrom(rows: readonly ResponseWithMember[]): Attendee[] {
  return rows
    .filter(r => r.response.response === 'yes')
    .map(({ response, member }) => {
      const useResponseOrigin = response.origin_lat !== null && response.origin_lng !== null
      const lat = useResponseOrigin ? response.origin_lat : member.home_lat
      const lng = useResponseOrigin ? response.origin_lng : member.home_lng

      return {
        memberId: response.member_id,
        name: member.nickname || member.name || 'A member',
        // NaN rather than a default: planMeetup filters on Number.isFinite and
        // reports these as unlocated, which is the honest outcome.
        origin: { lat: lat ?? Number.NaN, lng: lng ?? Number.NaN },
        originSource: useResponseOrigin ? 'response' as const : 'home' as const,
        travelMode: (response.travel_mode ?? member.travel_mode ?? 'transit') as TravelMode,
        // A guest travels the same journey as the member bringing them, so
        // they weight the total-distance objective without adding a pin.
        partySize: 1 + (response.guests ?? 0),
      }
    })
}

export async function fetchPoll(eventId: string): Promise<AttendancePoll | null> {
  const { data } = await supabase
    .from('attendance_polls').select('*').eq('event_id', eventId).maybeSingle()
  return data
}

export async function fetchResponses(pollId: string): Promise<ResponseWithMember[]> {
  const { data: responses, error } = await supabase
    .from('attendance_responses').select('*').eq('poll_id', pollId)
  if (error || !responses || responses.length === 0) return []

  // Straight from `profiles`, not the `roster` view: the planner needs the home
  // coordinates and the view deliberately does not carry them. RLS is what
  // decides whether this caller gets any rows back.
  const { data: members } = await supabase
    .from('profiles')
    .select('id, name, nickname, home_label, home_lat, home_lng, travel_mode')
    .in('id', responses.map(r => r.member_id))

  const byId = new Map((members ?? []).map(m => [m.id, m]))
  return responses
    .map(response => {
      const member = byId.get(response.member_id)
      return member ? { response, member } : null
    })
    .filter((r): r is ResponseWithMember => r !== null)
}

export interface AnswerInput {
  response: PollResponse
  arrivingAt?: string | null
  guests?: number
  travelMode?: TravelMode | null
  seatsOffered?: number
  needsRide?: boolean
  note?: string | null
  origin?: { lat: number; lng: number; label: string } | null
}

/** Upsert the signed-in member's answer. One row per member per poll, enforced
 *  by a unique constraint, so this is an upsert rather than an insert-or-update
 *  dance that two taps could race. */
export async function answerPoll(pollId: string, memberId: string, input: AnswerInput) {
  const notComing = input.response === 'no'
  return supabase.from('attendance_responses').upsert({
    poll_id: pollId,
    member_id: memberId,
    response: input.response,
    arriving_at: input.arrivingAt ?? null,
    // The DB refuses logistics on a 'no' (you are not offering three seats in
    // a car you are not driving), so clear them here rather than letting a
    // stale form value bounce off a constraint the member cannot read.
    guests: notComing ? 0 : (input.guests ?? 0),
    seats_offered: notComing ? 0 : (input.seatsOffered ?? 0),
    needs_ride: notComing ? false : (input.needsRide ?? false),
    travel_mode: input.travelMode ?? null,
    note: input.note ?? null,
    origin_lat: input.origin?.lat ?? null,
    origin_lng: input.origin?.lng ?? null,
    origin_label: input.origin?.label ?? null,
  }, { onConflict: 'poll_id,member_id' })
}

/** Is this poll still taking answers? Mirrors the database trigger — the check
 *  exists twice on purpose: here so the form can say so before somebody fills
 *  it in, and in the database because the form is not the only way a row gets
 *  in. */
export function pollIsOpen(poll: AttendancePoll | null, now: Date = new Date()): boolean {
  if (!poll || poll.status !== 'open') return false
  if (poll.closes_at && new Date(poll.closes_at) <= now) return false
  return true
}

/** Counts for a badge, from rows already in hand. The `attendance_tally` view
 *  answers the same question server-side for lists; this is for the page that
 *  has already fetched the responses and should not fetch again. */
export function tally(rows: readonly ResponseWithMember[]) {
  const count = (r: PollResponse) => rows.filter(x => x.response.response === r).length
  return {
    yes: count('yes'),
    maybe: count('maybe'),
    no: count('no'),
    guests: rows
      .filter(r => r.response.response === 'yes')
      .reduce((s, r) => s + (r.response.guests ?? 0), 0),
    seatsOffered: rows
      .filter(r => r.response.response !== 'no')
      .reduce((s, r) => s + (r.response.seats_offered ?? 0), 0),
    needRide: rows.filter(r => r.response.needs_ride && r.response.response !== 'no').length,
  }
}

/** The planner options this club is configured with. One place, so the page
 *  and the tests cannot disagree about the thresholds. */
export const meetupOptions = {
  travelSpeedKmh: clubConfig.meetup.travelSpeedKmh,
  maxVenueDetourKm: clubConfig.meetup.maxVenueDetourKm,
  minRespondents: clubConfig.meetup.minRespondents,
}
