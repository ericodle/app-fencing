import { describe, it, expect } from 'vitest'
import {
  seasonOf, ratingStatus, formatRating, parseRating, compareRatings, bestRating,
  yearsSince, ageFrom, RATING_VALID_SEASONS,
} from './ratings'

const utc = (iso: string) => new Date(`${iso}T12:00:00Z`)

describe('seasonOf', () => {
  it('names a season by the year it ends in', () => {
    expect(seasonOf(utc('2026-05-14'))).toBe(2026)
    expect(seasonOf(utc('2026-07-31'))).toBe(2026)
  })

  it('rolls over on the first of August', () => {
    expect(seasonOf(utc('2026-08-01'))).toBe(2027)
    expect(seasonOf(utc('2026-12-31'))).toBe(2027)
    expect(seasonOf(utc('2027-01-01'))).toBe(2027)
  })
})

describe('ratingStatus', () => {
  it('keeps a letter alive for four seasons after the one it was earned in', () => {
    const b2024 = { letter: 'B' as const, year: 2024 }
    // Earned in the 2024 season, valid through 2028.
    expect(ratingStatus(b2024, utc('2025-01-01')).expired).toBe(false)
    expect(ratingStatus(b2024, utc('2028-05-01')).expired).toBe(false)
    expect(ratingStatus(b2024, utc('2028-09-01')).expired).toBe(true)
    expect(ratingStatus(b2024, utc('2025-01-01')).validThrough).toBe(2024 + RATING_VALID_SEASONS)
  })

  it('seeds an expired fencer as unrated, which is what will actually happen', () => {
    const lapsed = ratingStatus({ letter: 'A', year: 2015 }, utc('2026-09-21'))
    expect(lapsed.letter).toBe('A')        // what they earned
    expect(lapsed.effective).toBe('U')     // what they get on Sunday
    expect(lapsed.expired).toBe(true)
    expect(lapsed.seasonsLeft).toBe(0)
  })

  it('counts the seasons left inclusively', () => {
    // Earned 2024, valid through 2028. During the 2028 season one is left.
    expect(ratingStatus({ letter: 'C', year: 2024 }, utc('2028-05-01')).seasonsLeft).toBe(1)
    expect(ratingStatus({ letter: 'C', year: 2024 }, utc('2027-05-01')).seasonsLeft).toBe(2)
  })

  it('treats a year-less letter as current rather than demoting on a missing field', () => {
    const s = ratingStatus({ letter: 'D', year: null }, utc('2026-09-21'))
    expect(s.effective).toBe('D')
    expect(s.expired).toBe(false)
    expect(s.validThrough).toBeNull()
    expect(s.seasonsLeft).toBeNull()
  })

  it('leaves an unrated fencer unrated and unexpiring', () => {
    const s = ratingStatus({ letter: 'U', year: null }, utc('2026-09-21'))
    expect(s).toMatchObject({ effective: 'U', expired: false, validThrough: null })
  })
})

describe('formatRating / parseRating', () => {
  it('prints the letter and year the way a results sheet does', () => {
    expect(formatRating({ letter: 'B', year: 2024 })).toBe('B2024')
    expect(formatRating({ letter: 'E', year: null })).toBe('E')
    expect(formatRating({ letter: 'U', year: null })).toBe('Unrated')
  })

  it('round-trips through parse', () => {
    for (const r of [
      { letter: 'A' as const, year: 2026 },
      { letter: 'E' as const, year: null },
      { letter: 'U' as const, year: null },
    ]) {
      expect(parseRating(formatRating(r))).toEqual(r)
    }
  })

  it('takes the shapes a person actually types', () => {
    expect(parseRating('b2024')).toEqual({ letter: 'B', year: 2024 })
    expect(parseRating('B 2024')).toEqual({ letter: 'B', year: 2024 })
    expect(parseRating('b24')).toEqual({ letter: 'B', year: 2024 })
    expect(parseRating('C')).toEqual({ letter: 'C', year: null })
    expect(parseRating('')).toEqual({ letter: 'U', year: null })
    expect(parseRating('unrated')).toEqual({ letter: 'U', year: null })
  })

  it('refuses to guess at nonsense, because a mis-parse mis-seeds a fencer', () => {
    expect(parseRating('F2024')).toBeNull()
    expect(parseRating('B20244')).toBeNull()
    expect(parseRating('2024')).toBeNull()
    expect(parseRating('AB')).toBeNull()
  })
})

describe('compareRatings / bestRating', () => {
  it('sorts A strongest and U weakest', () => {
    const sorted = ['C', 'U', 'A', 'E', 'B', 'D'].sort((a, b) =>
      compareRatings(a as never, b as never))
    expect(sorted).toEqual(['A', 'B', 'C', 'D', 'E', 'U'])
  })

  it('picks the strongest rating a fencer still holds', () => {
    const now = utc('2026-09-21')
    expect(bestRating([
      { letter: 'C', year: 2025 },
      { letter: 'E', year: 2024 },
    ], now)).toBe('C')
  })

  it('ignores a lapsed letter when picking the best one', () => {
    const now = utc('2026-09-21')
    // The A lapsed in 2020; the D is live.
    expect(bestRating([
      { letter: 'A', year: 2015 },
      { letter: 'D', year: 2025 },
    ], now)).toBe('D')
  })

  it('is unrated for a fencer with nothing', () => {
    expect(bestRating([])).toBe('U')
    expect(bestRating([{ letter: 'U', year: null }])).toBe('U')
  })
})

describe('yearsSince', () => {
  it('counts whole years', () => {
    expect(yearsSince('2019-12-01', utc('2026-09-21'))).toBe(6)
    expect(yearsSince('2019-12-01', utc('2026-12-01'))).toBe(7)
  })

  it('does not round up the day before the anniversary', () => {
    expect(yearsSince('2019-09-22', utc('2026-09-21'))).toBe(6)
    expect(yearsSince('2019-09-21', utc('2026-09-21'))).toBe(7)
  })

  it('is null when nobody has said', () => {
    expect(yearsSince(null)).toBeNull()
    expect(yearsSince(undefined)).toBeNull()
    expect(yearsSince('')).toBeNull()
    expect(yearsSince('not a date')).toBeNull()
  })

  it('floors at zero rather than going negative on a future date', () => {
    expect(yearsSince('2030-01-01', utc('2026-09-21'))).toBe(0)
  })

  it('is the same function as ageFrom, because it is the same arithmetic', () => {
    expect(ageFrom('2010-03-04', utc('2026-09-21'))).toBe(16)
  })
})
