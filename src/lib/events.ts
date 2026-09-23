// Fetching events, and the two questions every screen asks about one: when is
// it, and has it happened?
//
// A course runs on an explicit list of days and everything else on a start
// date with an optional end. `usesDateEnvelope` in event-kinds.ts is the split,
// and these functions are where it actually bites — the old shape of this bug,
// in the app this was ported from, was a query filtered by `kind` directly, so
// a newly-added kind was simply never fetched and vanished from the calendar
// with no error anywhere.

import { supabase } from './supabase'
import { usesCourseDays, type EventKind } from './event-kinds'
import { todayInClub, parseDate } from './dates'
import type { EventRow, Venue } from '../types/db'

export interface EventWithVenue extends EventRow {
  venue: Venue | null
}

/** Every day this event runs on, club-local, ascending. One entry for a single
 *  session; the whole list for a course; the full span for a multi-day event. */
export function eventDays(event: Pick<EventRow, 'kind' | 'start_date' | 'end_date' | 'course_days'>): string[] {
  if (usesCourseDays(event.kind as EventKind)) {
    return [...(event.course_days ?? [])].sort()
  }
  if (!event.start_date) return []
  if (!event.end_date || event.end_date === event.start_date) return [event.start_date]

  const days: string[] = []
  const end = new Date(`${event.end_date}T12:00:00Z`)
  for (let d = new Date(`${event.start_date}T12:00:00Z`); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
    days.push(d.toISOString().slice(0, 10))
  }
  return days
}

/** The first day. What a list sorts by. */
export function firstDay(event: Pick<EventRow, 'kind' | 'start_date' | 'end_date' | 'course_days'>): string | null {
  return eventDays(event)[0] ?? null
}

/** The last day. What decides whether it is over — a four-week course is not
 *  past because its first evening has been. */
export function lastDay(event: Pick<EventRow, 'kind' | 'start_date' | 'end_date' | 'course_days'>): string | null {
  const days = eventDays(event)
  return days[days.length - 1] ?? null
}

export function hasFinished(
  event: Pick<EventRow, 'kind' | 'start_date' | 'end_date' | 'course_days'>,
  now: Date = new Date(),
): boolean {
  const last = lastDay(event)
  return last !== null && last < todayInClub(now)
}

/** Does this event run on this club-local day? */
export function runsOn(
  event: Pick<EventRow, 'kind' | 'start_date' | 'end_date' | 'course_days'>,
  day: string,
): boolean {
  return eventDays(event).includes(day)
}

/** Sort key: first day, then start time, then title — so two sessions on the
 *  same evening come out in the order they run rather than at random. */
export function byWhen(a: EventWithVenue, b: EventWithVenue): number {
  return (firstDay(a) ?? '').localeCompare(firstDay(b) ?? '')
    || (a.start_time ?? '').localeCompare(b.start_time ?? '')
    || a.admin_title.localeCompare(b.admin_title)
}

/** What a member sees on the event page. Falls back through the three titles
 *  rather than rendering a blank heading. */
export function titleFor(event: EventRow): string {
  return event.display_title || event.admin_title
}

export function calendarTitleFor(event: EventRow): string {
  return event.calendar_title || event.display_title || event.admin_title
}

const SELECT = '*, venue:venues!events_venue_id_fkey(*)'

export async function fetchUpcoming(limit = 20): Promise<EventWithVenue[]> {
  // Deliberately NOT filtered by kind. A course has a null start_date, so the
  // filter is on the envelope OR the day list, and a new kind joins whichever
  // it answers to without this query being touched.
  const today = todayInClub()
  const [dated, courses] = await Promise.all([
    supabase.from('events').select(SELECT)
      .is('cancelled_at', null)
      .gte('start_date', today)
      .order('start_date').limit(limit),
    supabase.from('events').select(SELECT)
      .is('cancelled_at', null)
      .not('course_days', 'is', null)
      .limit(limit),
  ])

  const rows = [...(dated.data ?? []), ...(courses.data ?? [])] as EventWithVenue[]
  // De-duplicate: an event could in principle satisfy both queries.
  const seen = new Set<string>()
  return rows
    .filter(e => (seen.has(e.id) ? false : (seen.add(e.id), true)))
    .filter(e => !hasFinished(e))
    .sort(byWhen)
    .slice(0, limit)
}

export async function fetchEvent(id: string): Promise<EventWithVenue | null> {
  const { data } = await supabase.from('events').select(SELECT).eq('id', id).maybeSingle()
  return data as EventWithVenue | null
}

export async function fetchMonth(year: number, month: number): Promise<EventWithVenue[]> {
  // A generous window: an event whose envelope STARTS before the month can
  // still run inside it, and one starting in the last days can run past it.
  const from = new Date(Date.UTC(year, month - 1, 1)).toISOString().slice(0, 10)
  const to = new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10)

  const [dated, courses] = await Promise.all([
    supabase.from('events').select(SELECT).lte('start_date', to).or(`end_date.gte.${from},end_date.is.null`),
    supabase.from('events').select(SELECT).not('course_days', 'is', null),
  ])

  const rows = [...(dated.data ?? []), ...(courses.data ?? [])] as EventWithVenue[]
  const seen = new Set<string>()
  return rows
    .filter(e => (seen.has(e.id) ? false : (seen.add(e.id), true)))
    .filter(e => eventDays(e).some(d => d >= from && d <= to))
    .sort(byWhen)
}

/** What the admin's events list shows: everything from the last few weeks on,
 *  cancelled ones included — a cancelled event is still somewhere refunds are
 *  settled, and the only place it can be restored from. */
export async function fetchForAdmin(sinceDays = 30): Promise<EventWithVenue[]> {
  const since = new Date(parseDate(todayInClub()).getTime() - sinceDays * 86_400_000).toISOString().slice(0, 10)
  const [dated, courses] = await Promise.all([
    supabase.from('events').select(SELECT).gte('start_date', since).order('start_date'),
    supabase.from('events').select(SELECT).not('course_days', 'is', null),
  ])
  const rows = [...(dated.data ?? []), ...(courses.data ?? [])] as EventWithVenue[]
  const seen = new Set<string>()
  return rows
    .filter(e => (seen.has(e.id) ? false : (seen.add(e.id), true)))
    .filter(e => (lastDay(e) ?? '') >= since)
    .sort(byWhen)
}
