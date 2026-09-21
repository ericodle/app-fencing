import { describe, it, expect } from 'vitest'
import {
  finishPercentile, poolLine, seedDelta, summarizeResults, bySeason,
  describeResult, ordinal, type CompetitionResult,
} from './competition-stats'
import { seasonOf } from './ratings'

let n = 0
function result(over: Partial<CompetitionResult> = {}): CompetitionResult {
  return {
    id: `r${++n}`,
    competitionId: `c${n}`,
    competitionName: 'Taipei Open',
    startDate: '2026-03-14',
    level: 'local',
    weapon: 'epee',
    category: 'senior',
    place: null,
    entrants: null,
    seedBefore: null,
    poolVictories: null,
    poolBouts: null,
    poolTouchesFor: null,
    poolTouchesAgainst: null,
    seedAfterPools: null,
    deRoundsWon: null,
    deExitRound: null,
    ratingEarned: null,
    notes: null,
    ...over,
  }
}

describe('finishPercentile', () => {
  it('is 0 for the winner and 1 for last', () => {
    expect(finishPercentile(result({ place: 1, entrants: 64 }))).toBe(0)
    expect(finishPercentile(result({ place: 64, entrants: 64 }))).toBe(1)
  })

  it('makes fields of different sizes comparable, which raw places do not', () => {
    const smallPond = result({ place: 9, entrants: 12 })
    const bigField  = result({ place: 9, entrants: 200 })
    expect(finishPercentile(smallPond)!).toBeGreaterThan(finishPercentile(bigField)!)
    expect(finishPercentile(bigField)!).toBeLessThan(0.05)
  })

  it('is null without both numbers, and for a field of one', () => {
    expect(finishPercentile(result({ place: 4 }))).toBeNull()
    expect(finishPercentile(result({ entrants: 40 }))).toBeNull()
    expect(finishPercentile(result({ place: 1, entrants: 1 }))).toBeNull()
  })
})

describe('poolLine', () => {
  it('reads the sheet: V/M, TS, TR and the indicator', () => {
    const p = poolLine(result({
      poolVictories: 4, poolBouts: 5, poolTouchesFor: 23, poolTouchesAgainst: 16,
    }))!
    expect(p).toMatchObject({ victories: 4, bouts: 5, touchesFor: 23, touchesAgainst: 16 })
    expect(p.victoryRate).toBe(0.8)
    expect(p.indicator).toBe(7)
  })

  it('handles a negative indicator, which happens more than a positive one', () => {
    expect(poolLine(result({
      poolVictories: 1, poolBouts: 5, poolTouchesFor: 14, poolTouchesAgainst: 23,
    }))!.indicator).toBe(-9)
  })

  it('treats missing touches as zero but missing bouts as no pool at all', () => {
    expect(poolLine(result({ poolVictories: 3, poolBouts: 5 }))!.indicator).toBe(0)
    expect(poolLine(result({ poolVictories: 3 }))).toBeNull()
    expect(poolLine(result({ poolVictories: 3, poolBouts: 0 }))).toBeNull()
  })
})

describe('seedDelta', () => {
  it('is positive when a fencer finishes better than their seed', () => {
    expect(seedDelta(result({ place: 12, seedAfterPools: 30 }))).toBe(18)
  })

  it('is negative when they finish worse', () => {
    expect(seedDelta(result({ place: 30, seedAfterPools: 12 }))).toBe(-18)
  })

  it('prefers the post-pool seed, which is the one the table was cut on', () => {
    expect(seedDelta(result({ place: 10, seedBefore: 40, seedAfterPools: 20 }))).toBe(10)
  })

  it('falls back to the entry seed when there was no pool', () => {
    expect(seedDelta(result({ place: 10, seedBefore: 40 }))).toBe(30)
  })

  it('is null with no seed or no place', () => {
    expect(seedDelta(result({ place: 10 }))).toBeNull()
    expect(seedDelta(result({ seedBefore: 10 }))).toBeNull()
  })
})

describe('summarizeResults', () => {
  it('is empty for no results', () => {
    expect(summarizeResults([])).toMatchObject({ competitions: 0, bestPlace: null, podiums: 0 })
  })

  it('finds the best finish and counts podiums', () => {
    const s = summarizeResults([
      result({ place: 14, entrants: 40 }),
      result({ place: 2,  entrants: 40 }),
      result({ place: 3,  entrants: 22 }),
      result({ place: 31, entrants: 60 }),
    ])
    expect(s.competitions).toBe(4)
    expect(s.bestPlace!.place).toBe(2)
    expect(s.podiums).toBe(2)
  })

  it('uses the median percentile so one bad day does not define a season', () => {
    const s = summarizeResults([
      result({ place: 3,  entrants: 41 }),   // 0.05
      result({ place: 5,  entrants: 41 }),   // 0.10
      result({ place: 41, entrants: 41 }),   // 1.00 — the disaster
    ])
    expect(s.medianPercentile).toBeCloseTo(0.1, 6)
  })

  it('aggregates the pool round across the whole season', () => {
    const s = summarizeResults([
      result({ poolVictories: 4, poolBouts: 5, poolTouchesFor: 23, poolTouchesAgainst: 16 }),
      result({ poolVictories: 2, poolBouts: 6, poolTouchesFor: 20, poolTouchesAgainst: 26 }),
    ])
    expect(s.pool).toMatchObject({ victories: 6, bouts: 11, touchesFor: 43, touchesAgainst: 42 })
    expect(s.pool!.indicator).toBe(1)
    expect(s.pool!.victoryRate).toBeCloseTo(6 / 11, 4)
  })

  it('averages the seed delta only over results that carry a seed', () => {
    const s = summarizeResults([
      result({ place: 10, seedAfterPools: 20 }),   // +10
      result({ place: 20, seedAfterPools: 10 }),   // -10
      result({ place: 5 }),                        // no seed, excluded
    ])
    expect(s.meanSeedDelta).toBe(0)
  })

  it('lists the letters earned, strongest first', () => {
    const s = summarizeResults([
      result({ ratingEarned: 'D' }),
      result({ ratingEarned: 'B' }),
      result({}),
    ])
    expect(s.ratingsEarned).toEqual(['B', 'D'])
  })

  it('survives results with nothing filled in but a name', () => {
    const s = summarizeResults([result(), result()])
    expect(s.competitions).toBe(2)
    expect(s.bestPlace).toBeNull()
    expect(s.pool).toBeNull()
    expect(s.medianPercentile).toBeNull()
  })
})

describe('bySeason', () => {
  it('groups on the August rollover, newest season first', () => {
    const grouped = bySeason([
      result({ startDate: '2026-03-14' }),   // 2026 season
      result({ startDate: '2026-09-20' }),   // 2027 season
      result({ startDate: '2026-07-30' }),   // 2026 season
    ], seasonOf)

    expect(grouped.map(g => g.season)).toEqual([2027, 2026])
    expect(grouped[0].results).toHaveLength(1)
    expect(grouped[1].results).toHaveLength(2)
  })

  it('orders results within a season newest first', () => {
    const grouped = bySeason([
      result({ startDate: '2026-01-10' }),
      result({ startDate: '2026-05-10' }),
    ], seasonOf)
    expect(grouped[0].results.map(r => r.startDate)).toEqual(['2026-05-10', '2026-01-10'])
  })

  it('summarizes each season independently', () => {
    const grouped = bySeason([
      result({ startDate: '2026-03-14', place: 1, entrants: 20 }),
      result({ startDate: '2026-09-20', place: 18, entrants: 20 }),
    ], seasonOf)
    expect(grouped[0].summary.podiums).toBe(0)
    expect(grouped[1].summary.podiums).toBe(1)
  })
})

describe('describeResult / ordinal', () => {
  it('writes a result the way a fencer would say it', () => {
    expect(describeResult(result({
      place: 9, entrants: 64, poolVictories: 4, poolBouts: 5,
      poolTouchesFor: 23, poolTouchesAgainst: 16,
    }))).toBe('9th of 64 · 4V/5 · +7')
  })

  it('mentions a letter earned', () => {
    expect(describeResult(result({ place: 3, entrants: 30, ratingEarned: 'D' })))
      .toBe('3rd of 30 · earned D')
  })

  it('says as much as it can when most of the row is blank', () => {
    expect(describeResult(result())).toBe('')
    expect(describeResult(result({ place: 4 }))).toBe('4th')
  })

  it('gets the awkward ordinals right', () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 23, 101, 111].map(ordinal))
      .toEqual(['1st', '2nd', '3rd', '4th', '11th', '12th', '13th', '21st', '22nd', '23rd', '101st', '111th'])
  })
})
