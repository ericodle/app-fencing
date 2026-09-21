// The event-kind vocabulary and the questions the code asks about it.
//
// Deliberately import-free: the Deno edge functions and the push worker both
// need this vocabulary, and neither can load a module that reaches into the
// app's config or i18n. Anything needing a translated label lives in
// event-kind-labels.ts instead. src/types/database.ts carries a compile-time
// guard that this list covers the generated `events.kind` union, so the two
// cannot drift from the DB's events_kind_check constraint.
//
// Branch on what the code actually cares about — the temporal shape, whether
// there is bouting to score, whether the venue can move — never on
// `kind === 'practice'`. With five kinds an else-branch is a trap: a new kind
// inherits someone else's behavior with no compile error and often no visible
// symptom (an event that is simply never fetched).

export const EVENT_KINDS = [
  // A regular weekly session on the club's own calendar: open training, club
  // night, saber night. The default.
  'practice',
  // A taught group course that runs on an explicit list of days — the adult
  // beginner term, the kids' term. Registration is for the whole course.
  'course',
  // A one-off session at a venue that is not the regular one: park footwork,
  // a borrowed salle, a pop-up. The kind the meetup planner exists for.
  'popup',
  // A competition, ours or someone else's. Produces competition results, not
  // practice bouts.
  'tournament',
  // A visit to or from another club. Bouts count as practice bouts, but the
  // opponents are not on our roster.
  'interclub',
  // Dinner, the end-of-term party, a demo. No bouting, no kit.
  'social',
] as const

export type EventKind = typeof EVENT_KINDS[number]

/**
 * True when the event's dates are an envelope (start_date .. end_date) rather
 * than an explicit list of days. Courses run on `course_days`; everything else
 * carries a start and an optional end.
 *
 * This is the most load-bearing distinction in the codebase: it decides how an
 * event is fetched, expanded into calendar entries, rescheduled, and tested
 * for having passed.
 */
export function usesDateEnvelope(kind: EventKind): boolean {
  return kind !== 'course'
}

/** True when the event runs on an explicit `course_days` list. */
export function usesCourseDays(kind: EventKind): boolean {
  return kind === 'course'
}

// The two temporal groups as value lists, for the queries that filter by shape.
// Derived from the helpers rather than written out, so a new kind joins the
// right query the moment it answers `usesDateEnvelope`.
export const DATE_ENVELOPE_KINDS: readonly EventKind[] = EVENT_KINDS.filter(usesDateEnvelope)
export const COURSE_DAY_KINDS: readonly EventKind[] = EVENT_KINDS.filter(usesCourseDays)

/**
 * True when the event is held at the club's regular venue, so a calendar entry
 * for it has no location of its own and takes the club address.
 *
 * Deliberately NOT a question about carpools or the meetup planner: a regular
 * session at the regular salle can still have someone offering a lift, and
 * `event_vehicles` accepts any event. Whether a ride is on offer is a question
 * about the cars assigned to an event, and only the tally can answer it.
 */
export function heldAtHomeVenue(kind: EventKind): boolean {
  return kind === 'practice' || kind === 'course'
}

/**
 * True when the club picks *where* to meet rather than inheriting it — the
 * only kinds the meetup planner will offer a suggestion for. A tournament is
 * at the organizer's hall and a course is in the club's own salle; neither
 * moves because six people happen to live north this week.
 */
export function venueIsNegotiable(kind: EventKind): boolean {
  return kind === 'popup'
}

/**
 * True when fencing happens and individual bouts are worth recording. Drives
 * whether the event detail page offers the bout sheet.
 */
export function hasBouting(kind: EventKind): boolean {
  return kind !== 'social'
}

/**
 * True when the event's outcome is a competition result (a placement in a
 * field) rather than a list of practice bouts. Only tournaments produce a
 * finishing place; an interclub produces bouts against outside opponents.
 */
export function producesCompetitionResults(kind: EventKind): boolean {
  return kind === 'tournament'
}

/**
 * True when fencers need to bring — or borrow — full kit. Park footwork is
 * done in running shoes, and nobody brings a mask to dinner.
 */
export function requiresKit(kind: EventKind): boolean {
  return kind !== 'social' && kind !== 'popup'
}

/**
 * True when the club asks the roster in advance who is coming. Every kind
 * except a course, where registration for the term already answers it.
 */
export function pollsAttendance(kind: EventKind): boolean {
  return kind !== 'course'
}

/** Kinds the calendar offers as a simple on/off filter toggle. Courses are
 *  excluded: they filter by course instead, one row per term. */
export const NON_COURSE_KINDS: readonly EventKind[] = EVENT_KINDS.filter(k => !usesCourseDays(k))

/** Kinds the meetup planner can move. */
export const MOVABLE_KINDS: readonly EventKind[] = EVENT_KINDS.filter(venueIsNegotiable)

/** Narrowing guard for values arriving from the database or a URL. */
export function isEventKind(value: unknown): value is EventKind {
  return typeof value === 'string' && (EVENT_KINDS as readonly string[]).includes(value)
}
