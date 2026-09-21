// Dates, in the club's timezone.
//
// Every date in this app is a club-local date. An event on the 21st is on the
// 21st in Taipei, whatever timezone the phone reading it is in, and a member
// travelling is still coming to Tuesday's session. So `date` columns are plain
// YYYY-MM-DD strings and are formatted with an explicit timeZone, never with
// `new Date(string)` — which parses a bare date as UTC midnight and shows the
// day before to anyone west of Greenwich.

import { clubConfig } from '../config/club'

const TZ = clubConfig.locale.timezone
const LOCALE = clubConfig.locale.language === 'zh-TW' ? 'zh-TW' : 'en-GB'

/** Parse a plain YYYY-MM-DD as noon UTC. Noon, not midnight: it puts the
 *  instant far enough from either boundary that no timezone in the world can
 *  round it to a different day. */
export function parseDate(iso: string): Date {
  return new Date(`${iso}T12:00:00Z`)
}

/** Today, as the club sees it. */
export function todayInClub(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(now)
}

export function formatDate(iso: string, opts: Intl.DateTimeFormatOptions = {}): string {
  return new Intl.DateTimeFormat(LOCALE, {
    timeZone: 'UTC',   // the string was parsed at noon UTC; keep it there
    weekday: 'short', day: 'numeric', month: 'short',
    ...opts,
  }).format(parseDate(iso))
}

export function formatDateLong(iso: string): string {
  return formatDate(iso, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
}

/** A `time` column — "19:00:00" — as "19:00". Times are stored without a zone
 *  because they are wall-clock times at a venue, not instants. */
export function formatTime(time: string | null): string {
  if (!time) return ''
  return time.slice(0, 5)
}

export function formatTimeRange(start: string | null, end: string | null): string {
  if (!start) return ''
  return end ? `${formatTime(start)}–${formatTime(end)}` : formatTime(start)
}

/** A timestamptz, in the club's zone. Used for poll deadlines, which ARE
 *  instants — "answers close at 9pm Friday" is a moment. */
export function formatInstant(iso: string | null): string {
  if (!iso) return ''
  return new Intl.DateTimeFormat(LOCALE, {
    timeZone: TZ, weekday: 'short', day: 'numeric', month: 'short',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(new Date(iso))
}

/** Whole days from today to `iso`, club-local. Negative for the past. */
export function daysUntil(iso: string, now: Date = new Date()): number {
  const from = parseDate(todayInClub(now)).getTime()
  const to = parseDate(iso).getTime()
  return Math.round((to - from) / 86_400_000)
}

/** "Today", "Tomorrow", "In 3 days", "6 days ago" — the phrasing a person
 *  uses. Falls back to a date once the relative form stops being useful. */
export function relativeDay(iso: string, now: Date = new Date()): string {
  const days = daysUntil(iso, now)
  if (days === 0) return 'Today'
  if (days === 1) return 'Tomorrow'
  if (days === -1) return 'Yesterday'
  if (days > 1 && days <= 13) return `In ${days} days`
  if (days < -1 && days >= -13) return `${-days} days ago`
  return formatDate(iso)
}

export function isPast(iso: string, now: Date = new Date()): boolean {
  return daysUntil(iso, now) < 0
}
