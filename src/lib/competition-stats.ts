// Competition results, and what a season of them adds up to.
//
// Separate from bout-stats.ts because a competition result is a different kind
// of fact: a placement in a field, not a score against a person. The two are
// related — a DE result is made of bouts — but nobody asks "what is my average
// finishing place against left-handers", and the pool round has its own
// arithmetic that the club needs to read exactly as the sheet on the wall
// prints it.

import type { Weapon } from '../config/weapons'
import type { RatingLetter } from './ratings'

export interface CompetitionResult {
  id: string
  competitionId: string
  competitionName: string
  startDate: string                 // ISO date
  level: 'club' | 'local' | 'regional' | 'national' | 'international'
  weapon: Weapon
  category: string | null

  place: number | null
  entrants: number | null
  seedBefore: number | null

  poolVictories: number | null
  poolBouts: number | null
  poolTouchesFor: number | null
  poolTouchesAgainst: number | null
  seedAfterPools: number | null

  deRoundsWon: number | null
  deExitRound: string | null

  ratingEarned: RatingLetter | null
  /** Whatever the fencer wrote about the day. Not summarized, not parsed — the
   *  one field that keeps the reason a result happened next to the result. */
  notes: string | null
}

const round = (n: number, dp = 3) => Math.round(n * 10 ** dp) / 10 ** dp

/**
 * Where a result sits in its field, as a fraction: 0 is the win, 1 is last.
 *
 * The number that makes two results comparable when the fields are not. Ninth
 * of twelve and ninth of two hundred are the same integer and nothing like the
 * same day, and a season summary that averages the raw places says the fencer
 * got worse the year they started entering real competitions.
 */
export function finishPercentile(result: CompetitionResult): number | null {
  if (result.place === null || result.entrants === null || result.entrants < 2) return null
  return round((result.place - 1) / (result.entrants - 1))
}

/** The pool round as the sheet prints it: V/M, TS, TR and the indicator. */
export interface PoolLine {
  victories: number
  bouts: number
  /** V/M — victories over bouts fenced. The first cut in the seeding. */
  victoryRate: number
  touchesFor: number
  touchesAgainst: number
  /** TS − TR. The second cut, and the one everybody watches. */
  indicator: number
}

export function poolLine(result: CompetitionResult): PoolLine | null {
  const { poolVictories: v, poolBouts: m, poolTouchesFor: ts, poolTouchesAgainst: tr } = result
  if (v === null || m === null || m === 0) return null
  return {
    victories: v,
    bouts: m,
    victoryRate: round(v / m, 4),
    touchesFor: ts ?? 0,
    touchesAgainst: tr ?? 0,
    indicator: (ts ?? 0) - (tr ?? 0),
  }
}

/**
 * Did the fencer finish better than they were seeded?
 *
 * Positive is an overperformance — seeded 30th, finished 12th, +18. The single
 * most informative number on a results page, because it is the only one that
 * controls for the strength of the field: a fencer who is always seeded last
 * and always finishes last has a flat line, and one who consistently beats
 * their seeding is improving whatever their placings look like.
 */
export function seedDelta(result: CompetitionResult): number | null {
  if (result.place === null) return null
  const seed = result.seedAfterPools ?? result.seedBefore
  if (seed === null) return null
  return seed - result.place
}

export interface SeasonSummary {
  competitions: number
  /** Best (numerically lowest) place, and where it came from. */
  bestPlace: { place: number; result: CompetitionResult } | null
  /** Median of the percentile finishes — median, not mean, because one
   *  disastrous day at a national should not define a season. */
  medianPercentile: number | null
  podiums: number
  /** Aggregate pool record across the season. */
  pool: PoolLine | null
  /** Mean seed delta, when enough results carry a seed to mean anything. */
  meanSeedDelta: number | null
  /** Letters earned this season, strongest first. */
  ratingsEarned: RatingLetter[]
}

const EMPTY_SEASON: SeasonSummary = {
  competitions: 0, bestPlace: null, medianPercentile: null, podiums: 0,
  pool: null, meanSeedDelta: null, ratingsEarned: [],
}

function median(values: readonly number[]): number | null {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

export function summarizeResults(results: readonly CompetitionResult[]): SeasonSummary {
  if (results.length === 0) return EMPTY_SEASON

  const placed = results.filter(r => r.place !== null)
  const best = placed.reduce<CompetitionResult | null>(
    (b, r) => (b === null || r.place! < b.place! ? r : b), null)

  const percentiles = results
    .map(finishPercentile)
    .filter((p): p is number => p !== null)

  const deltas = results
    .map(seedDelta)
    .filter((d): d is number => d !== null)

  const pools = results.map(poolLine).filter((p): p is PoolLine => p !== null)
  const pool = pools.length === 0 ? null : {
    victories: pools.reduce((s, p) => s + p.victories, 0),
    bouts: pools.reduce((s, p) => s + p.bouts, 0),
    victoryRate: round(
      pools.reduce((s, p) => s + p.victories, 0) / pools.reduce((s, p) => s + p.bouts, 0), 4),
    touchesFor: pools.reduce((s, p) => s + p.touchesFor, 0),
    touchesAgainst: pools.reduce((s, p) => s + p.touchesAgainst, 0),
    indicator: pools.reduce((s, p) => s + p.indicator, 0),
  }

  const order: RatingLetter[] = ['A', 'B', 'C', 'D', 'E']
  return {
    competitions: results.length,
    bestPlace: best === null ? null : { place: best.place!, result: best },
    medianPercentile: median(percentiles),
    podiums: placed.filter(r => r.place! <= 3).length,
    pool,
    meanSeedDelta: deltas.length === 0 ? null
      : round(deltas.reduce((s, d) => s + d, 0) / deltas.length, 2),
    ratingsEarned: results
      .map(r => r.ratingEarned)
      .filter((l): l is RatingLetter => l !== null)
      .sort((a, b) => order.indexOf(a) - order.indexOf(b)),
  }
}

/** Group results by the season they fell in, newest season first. Uses the
 *  same August rollover as the rating calendar, so a season summary and a
 *  rating expiry agree about which year it is. */
export function bySeason(
  results: readonly CompetitionResult[],
  seasonOf: (d: Date) => number,
): { season: number; results: CompetitionResult[]; summary: SeasonSummary }[] {
  const groups = new Map<number, CompetitionResult[]>()
  for (const r of results) {
    const season = seasonOf(new Date(`${r.startDate}T12:00:00Z`))
    const list = groups.get(season)
    if (list) list.push(r)
    else groups.set(season, [r])
  }
  return [...groups.entries()]
    .map(([season, list]) => ({
      season,
      results: list.sort((a, b) => b.startDate.localeCompare(a.startDate)),
      summary: summarizeResults(list),
    }))
    .sort((a, b) => b.season - a.season)
}

/** How a result reads in one line: "9th of 64 · 4V/5 · +7". */
export function describeResult(result: CompetitionResult): string {
  const parts: string[] = []
  if (result.place !== null) {
    parts.push(result.entrants !== null
      ? `${ordinal(result.place)} of ${result.entrants}`
      : ordinal(result.place))
  }
  const pool = poolLine(result)
  if (pool) {
    parts.push(`${pool.victories}V/${pool.bouts}`)
    parts.push(`${pool.indicator >= 0 ? '+' : ''}${pool.indicator}`)
  }
  if (result.ratingEarned) parts.push(`earned ${result.ratingEarned}`)
  return parts.join(' · ')
}

export function ordinal(n: number): string {
  const rem100 = n % 100
  if (rem100 >= 11 && rem100 <= 13) return `${n}th`
  switch (n % 10) {
    case 1:  return `${n}st`
    case 2:  return `${n}nd`
    case 3:  return `${n}rd`
    default: return `${n}th`
  }
}
