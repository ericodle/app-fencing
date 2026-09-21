// The app's handle on the database schema.
//
// src/types/database.ts is generated and overwritten by `npm run db:types`; this file
// is hand-written and sits beside it, holding two things:
//
//   1. Short aliases for the row types, so app code says `Profile` rather than
//      `Database['public']['Tables']['profiles']['Row']`.
//   2. Compile-time guards pinning the app's own vocabularies — event kinds,
//      weapons, fitness metrics, roles — to the check constraints they mirror.
//
// The guards are the point. `events_kind_check` in SQL and EVENT_KINDS in
// TypeScript describe the same set in two languages, and nothing else in the
// system would notice them drifting apart: a kind added to the database but not
// to the app does not fail, it just silently never appears on the calendar.

import type { Database } from './database'
import type { EventKind } from '../lib/event-kinds'
import type { Weapon } from '../config/weapons'
import type { MetricKey } from '../lib/fitness-metrics'

type T = Database['public']['Tables']
type V = Database['public']['Views']

export type Profile           = T['profiles']['Row']
export type ProfileUpdate     = T['profiles']['Update']
export type RosterEntry       = V['roster']['Row']
export type Venue             = T['venues']['Row']
export type VenueInsert       = T['venues']['Insert']
export type EventRow          = T['events']['Row']
export type EventInsert       = T['events']['Insert']
export type Booking           = T['bookings']['Row']
export type BookingInsert     = T['bookings']['Insert']
export type AttendancePoll    = T['attendance_polls']['Row']
export type AttendanceResponse       = T['attendance_responses']['Row']
export type AttendanceResponseInsert = T['attendance_responses']['Insert']
export type AttendanceTally   = V['attendance_tally']['Row']
export type MeetupSuggestion  = T['meetup_suggestions']['Row']
export type MeetupSuggestionInsert = T['meetup_suggestions']['Insert']
export type Vehicle           = T['vehicles']['Row']
export type EventRide         = T['event_rides']['Row']
export type RideSeat          = T['ride_seats']['Row']
export type Bout              = T['bouts']['Row']
export type BoutInsert        = T['bouts']['Insert']
export type BoutSideRow       = V['bout_sides']['Row']
export type Competition       = T['competitions']['Row']
export type CompetitionResultRow    = T['competition_results']['Row']
export type CompetitionResultInsert = T['competition_results']['Insert']
export type FitnessTest       = T['fitness_tests']['Row']
export type FitnessTestInsert = T['fitness_tests']['Insert']
export type Price             = T['prices']['Row']
export type Payment           = T['payments']['Row']
export type Pass              = T['passes']['Row']
export type PassBalance       = V['pass_balances']['Row']
export type MemberBalance     = V['member_balances']['Row']
export type Discount          = T['discounts']['Row']
export type BookingDiscount   = T['booking_discounts']['Row']
export type Waiver            = T['waivers']['Row']
export type WaiverSignature   = T['waiver_signatures']['Row']
export type Terms             = T['terms']['Row']
export type ClubProfile       = T['club_profile']['Row']
export type ClubContactRow    = T['club_contact']['Row']
export type ContactChannel    = T['contact_channels']['Row']
export type Duty              = T['duties']['Row']
export type MemberNote        = T['member_notes']['Row']
export type Notification      = T['notifications']['Row']
export type PushSubscriptionRow = T['push_subscriptions']['Row']
export type AuditEntry        = T['admin_audit_log']['Row']

export type Role         = 'fencer' | 'coach' | 'admin'
export type MemberStatus = 'pending' | 'active' | 'rejected' | 'on_hold' | 'closed'
export type PollResponse = 'yes' | 'no' | 'maybe'
export type RideSeatStatus = 'claimed' | 'waitlisted' | 'cancelled'
export type BookingStatus  = 'confirmed' | 'waitlisted' | 'cancelled' | 'no_show'

// ── compile-time guards ──────────────────────────────────────────────────────
//
// `Assert<T>` fails to compile unless T resolves to exactly `true`, so each
// line below is a claim the type checker has to prove. They cost nothing at
// runtime, and they are exported only because `noUnusedLocals` would otherwise
// delete the point of them.
//
// What these CAN check: that every value the app is willing to send is a value
// the column's TypeScript type accepts.
//
// What they CANNOT check, and this is the important limitation: a SQL check
// constraint does not survive into the generated types. `events.kind` comes
// back as plain `string`, not a union of the six kinds, so nothing here can
// prove the reverse direction — that every kind the DATABASE accepts is one
// the app knows about. That drift is the silent one (a kind added in a
// migration simply never renders), so it is covered where it can be: the
// integration suite inserts one row per vocabulary member and asserts the
// database takes all of them, and reads `pg_get_constraintdef` back to assert
// it takes no others. See tests/integration/vocabularies.test.ts.
//
// If one of these errors, do NOT widen the guard. Fix whichever side is behind.

type Assert<Claim extends true> = Claim
type Extends<A, B> = [A] extends [B] ? true : false

export type _AppKindsFitColumn = Assert<Extends<EventKind, NonNullable<EventRow['kind']>>>
export type _WeaponFitsColumn  = Assert<Extends<Weapon, NonNullable<Bout['weapon']>>>
export type _MetricFitsColumn  = Assert<Extends<MetricKey, NonNullable<FitnessTest['metric']>>>
export type _RoleFitsColumn    = Assert<Extends<Role, NonNullable<Profile['role']>>>
export type _StatusFitsColumn  = Assert<Extends<MemberStatus, NonNullable<Profile['status']>>>
export type _ResponseFitsCol   = Assert<Extends<PollResponse, NonNullable<AttendanceResponse['response']>>>
export type _BookingStatusFits = Assert<Extends<BookingStatus, NonNullable<Booking['status']>>>
export type _RideStatusFits    = Assert<Extends<RideSeatStatus, NonNullable<RideSeat['status']>>>
