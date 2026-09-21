import { describe, it, expect } from 'vitest'
import {
  parseDate, todayInClub, formatDate, formatTime, formatTimeRange,
  daysUntil, relativeDay, isPast,
} from './dates'

describe('parseDate', () => {
  it('lands at noon UTC, far from any timezone boundary', () => {
    // Midnight would be the day before in every zone west of Greenwich, which
    // is the classic off-by-one this exists to prevent.
    expect(parseDate('2026-09-21').toISOString()).toBe('2026-09-21T12:00:00.000Z')
  })

  it('reads the same calendar day in Taipei and in Los Angeles', () => {
    const d = parseDate('2026-09-21')
    const inTaipei = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Taipei', dateStyle: 'short' }).format(d)
    const inLA     = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles', dateStyle: 'short' }).format(d)
    expect(inTaipei).toBe(inLA)
  })
})

describe('todayInClub', () => {
  it('is the club’s calendar day, not the machine’s', () => {
    // 16:00 UTC on the 20th is already the 21st in Taipei (UTC+8).
    expect(todayInClub(new Date('2026-09-20T16:30:00Z'))).toBe('2026-09-21')
    expect(todayInClub(new Date('2026-09-20T15:30:00Z'))).toBe('2026-09-20')
  })
})

describe('formatDate', () => {
  it('shows the day that was asked for', () => {
    expect(formatDate('2026-09-21')).toMatch(/21/)
    expect(formatDate('2026-09-21')).toMatch(/Sep/)
  })

  it('does not slip a day at the start of a month', () => {
    expect(formatDate('2026-10-01')).toMatch(/1 Oct/)
    expect(formatDate('2026-01-01')).toMatch(/1 Jan/)
  })
})

describe('formatTime', () => {
  it('drops the seconds a time column carries', () => {
    expect(formatTime('19:00:00')).toBe('19:00')
    expect(formatTime('06:45:00')).toBe('06:45')
  })

  it('is empty for no time', () => {
    expect(formatTime(null)).toBe('')
    expect(formatTimeRange(null, '21:00:00')).toBe('')
  })

  it('joins a range, and shows a lone start on its own', () => {
    expect(formatTimeRange('19:00:00', '21:30:00')).toBe('19:00–21:30')
    expect(formatTimeRange('19:00:00', null)).toBe('19:00')
  })
})

describe('daysUntil / relativeDay / isPast', () => {
  const now = new Date('2026-09-21T04:00:00Z')  // noon in Taipei

  it('counts whole club-local days', () => {
    expect(daysUntil('2026-09-21', now)).toBe(0)
    expect(daysUntil('2026-09-22', now)).toBe(1)
    expect(daysUntil('2026-09-20', now)).toBe(-1)
    expect(daysUntil('2026-10-01', now)).toBe(10)
  })

  it('says it the way a person would', () => {
    expect(relativeDay('2026-09-21', now)).toBe('Today')
    expect(relativeDay('2026-09-22', now)).toBe('Tomorrow')
    expect(relativeDay('2026-09-20', now)).toBe('Yesterday')
    expect(relativeDay('2026-09-24', now)).toBe('In 3 days')
    expect(relativeDay('2026-09-15', now)).toBe('6 days ago')
  })

  it('falls back to a date once the relative form stops helping', () => {
    expect(relativeDay('2026-11-01', now)).toMatch(/Nov/)
    expect(relativeDay('2026-01-01', now)).toMatch(/Jan/)
  })

  it('knows what is past', () => {
    expect(isPast('2026-09-20', now)).toBe(true)
    expect(isPast('2026-09-21', now)).toBe(false)   // today is not past
    expect(isPast('2026-09-22', now)).toBe(false)
  })

  it('uses the club’s midnight, not UTC’s', () => {
    // 20:00 UTC on the 21st is 04:00 on the 22nd in Taipei, so the 22nd is
    // "today" and the 21st is already yesterday.
    const lateUtc = new Date('2026-09-21T20:00:00Z')
    expect(daysUntil('2026-09-22', lateUtc)).toBe(0)
    expect(isPast('2026-09-21', lateUtc)).toBe(true)
  })
})
