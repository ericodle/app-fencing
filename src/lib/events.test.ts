import { describe, it, expect } from 'vitest'
import { eventDays, firstDay, lastDay, hasFinished, runsOn, titleFor, calendarTitleFor, byWhen, type EventWithVenue } from './events'
import type { EventRow } from '../types/db'

function ev(over: Partial<EventRow> = {}): EventRow {
  return {
    id: 'e1', kind: 'practice', admin_title: 'Open training',
    display_title: null, calendar_title: null,
    start_date: '2026-09-21', end_date: null, start_time: '19:00:00', end_time: null,
    course_days: null, venue_id: null, original_venue_id: null,
    weapons: [], level: 'all', capacity: null, fully_booked: false,
    price: null, currency: null, full_payment_deadline: null,
    cancel_date: null, cancelled_at: null, cancellation_reason: null,
    polls_attendance: null, meetup_open: false, series_id: null,
    featured: false, featured_image: null, is_private: false,
    prereqs: null, included: null, notes: null, created_by: null,
    created_at: '2026-09-01T00:00:00Z', updated_at: '2026-09-01T00:00:00Z',
    ...over,
  } as EventRow
}

describe('eventDays', () => {
  it('is the one day for a single session', () => {
    expect(eventDays(ev())).toEqual(['2026-09-21'])
  })

  it('expands an envelope into every day it covers', () => {
    expect(eventDays(ev({ start_date: '2026-09-21', end_date: '2026-09-24' })))
      .toEqual(['2026-09-21', '2026-09-22', '2026-09-23', '2026-09-24'])
  })

  it('does not double the day when start and end are the same', () => {
    expect(eventDays(ev({ start_date: '2026-09-21', end_date: '2026-09-21' })))
      .toEqual(['2026-09-21'])
  })

  it('crosses a month and a year boundary correctly', () => {
    expect(eventDays(ev({ start_date: '2026-12-30', end_date: '2027-01-02' })))
      .toEqual(['2026-12-30', '2026-12-31', '2027-01-01', '2027-01-02'])
  })

  it('takes a course’s explicit day list, sorted, and ignores its envelope', () => {
    const course = ev({
      kind: 'course', start_date: null,
      course_days: ['2026-10-14', '2026-09-30', '2026-10-07'],
    })
    expect(eventDays(course)).toEqual(['2026-09-30', '2026-10-07', '2026-10-14'])
  })

  it('is empty for an event with neither shape', () => {
    expect(eventDays(ev({ start_date: null }))).toEqual([])
    expect(eventDays(ev({ kind: 'course', start_date: null, course_days: [] }))).toEqual([])
  })
})

describe('firstDay / lastDay / hasFinished', () => {
  const now = new Date('2026-10-07T04:00:00Z')  // noon in Taipei

  it('brackets an envelope', () => {
    const e = ev({ start_date: '2026-09-21', end_date: '2026-09-24' })
    expect(firstDay(e)).toBe('2026-09-21')
    expect(lastDay(e)).toBe('2026-09-24')
  })

  it('brackets a course by its day list', () => {
    const c = ev({ kind: 'course', start_date: null, course_days: ['2026-09-30', '2026-10-14'] })
    expect(firstDay(c)).toBe('2026-09-30')
    expect(lastDay(c)).toBe('2026-10-14')
  })

  it('does not call a course finished because its first evening has been', () => {
    // The exact bug the two-shape split exists to prevent.
    const c = ev({ kind: 'course', start_date: null, course_days: ['2026-09-30', '2026-10-14'] })
    expect(hasFinished(c, now)).toBe(false)
  })

  it('calls a course finished once its last day is past', () => {
    const c = ev({ kind: 'course', start_date: null, course_days: ['2026-09-30', '2026-10-06'] })
    expect(hasFinished(c, now)).toBe(true)
  })

  it('does not call today finished', () => {
    expect(hasFinished(ev({ start_date: '2026-10-07' }), now)).toBe(false)
    expect(hasFinished(ev({ start_date: '2026-10-06' }), now)).toBe(true)
  })

  it('is not finished when there are no days at all', () => {
    expect(hasFinished(ev({ start_date: null }), now)).toBe(false)
  })
})

describe('runsOn', () => {
  it('finds a day inside an envelope, and rejects one outside', () => {
    const e = ev({ start_date: '2026-09-21', end_date: '2026-09-24' })
    expect(runsOn(e, '2026-09-22')).toBe(true)
    expect(runsOn(e, '2026-09-25')).toBe(false)
  })

  it('matches a course only on the days it actually meets', () => {
    const c = ev({ kind: 'course', start_date: null, course_days: ['2026-09-30', '2026-10-14'] })
    expect(runsOn(c, '2026-09-30')).toBe(true)
    // Between the two evenings the course is not meeting, and a calendar that
    // filled the gap would show three weeks of sessions that do not happen.
    expect(runsOn(c, '2026-10-07')).toBe(false)
  })
})

describe('titles', () => {
  it('falls back rather than rendering a blank heading', () => {
    expect(titleFor(ev())).toBe('Open training')
    expect(titleFor(ev({ display_title: 'Tuesday night' }))).toBe('Tuesday night')
    expect(calendarTitleFor(ev({ display_title: 'Tuesday night', calendar_title: 'Tue' }))).toBe('Tue')
    expect(calendarTitleFor(ev({ display_title: 'Tuesday night' }))).toBe('Tuesday night')
    expect(calendarTitleFor(ev())).toBe('Open training')
  })
})

describe('byWhen', () => {
  const withVenue = (e: EventRow) => ({ ...e, venue: null }) as EventWithVenue

  it('orders by day, then by start time, then by title', () => {
    const rows = [
      withVenue(ev({ id: 'c', start_date: '2026-09-22', start_time: '19:00:00' })),
      withVenue(ev({ id: 'b', start_date: '2026-09-21', start_time: '19:00:00', admin_title: 'Saber' })),
      withVenue(ev({ id: 'a', start_date: '2026-09-21', start_time: '06:45:00' })),
      withVenue(ev({ id: 'd', start_date: '2026-09-21', start_time: '19:00:00', admin_title: 'Epee' })),
    ]
    expect(rows.sort(byWhen).map(r => r.id)).toEqual(['a', 'd', 'b', 'c'])
  })
})
