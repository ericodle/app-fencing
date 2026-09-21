// National letter classifications, and the fact that they expire.
//
// A fencer's rating is written as a letter and a year — "B2024" — and the year
// is not decoration. Under the USFA scale a classification is valid for four
// seasons after the one it was earned in, then drops away, and a fencer whose
// letter has lapsed is seeded as unrated. An app that shows "B" forever is
// telling its members something false about how they will be seeded on Sunday.
//
// `clubConfig.club.ratingSystem` decides whether any of this is shown at all:
// a club outside a federation that issues letters sets it to 'none' and the
// fields disappear.

export const RATING_LETTERS = ['A', 'B', 'C', 'D', 'E'] as const
export type RatingLetter = typeof RATING_LETTERS[number]
/** 'U' is not a letter earned; it is the absence of one. */
export type Rating = RatingLetter | 'U'

/** How many seasons a letter stays valid after the season it was earned in. */
export const RATING_VALID_SEASONS = 4

/** The month a competitive season rolls over, 1-indexed. August, under the
 *  USFA calendar: a letter earned in July belongs to the season ending then. */
export const SEASON_START_MONTH = 8

/**
 * The season a date falls in, named by the calendar year it ENDS in — the
 * convention every federation's results database uses. 2026-09-14 is in the
 * 2027 season; 2026-05-14 is in the 2026 season.
 */
export function seasonOf(date: Date): number {
  return date.getUTCMonth() + 1 >= SEASON_START_MONTH
    ? date.getUTCFullYear() + 1
    : date.getUTCFullYear()
}

export interface WeaponRating {
  letter: Rating
  /** The year printed next to the letter — the season it was earned in. Null
   *  for an unrated fencer, and for a letter recorded before anyone thought to
   *  ask which year it came from. */
  year: number | null
}

export interface RatingStatus extends WeaponRating {
  /** What the fencer will actually be seeded as today. */
  effective: Rating
  expired: boolean
  /** The last season the letter counts for. Null when unknown or unrated. */
  validThrough: number | null
  /** Seasons remaining, 0 once it has gone. Null when unknown. */
  seasonsLeft: number | null
}

/**
 * Where a rating stands as of `asOf`.
 *
 * A letter with no year is treated as current rather than expired: the club
 * recorded it without the year, and demoting somebody to unrated on the
 * strength of a missing field would be worse than the uncertainty. The UI shows
 * it without an expiry instead, which is an honest way of saying "we do not
 * know when this lapses".
 */
export function ratingStatus(rating: WeaponRating, asOf: Date = new Date()): RatingStatus {
  if (rating.letter === 'U') {
    return { ...rating, effective: 'U', expired: false, validThrough: null, seasonsLeft: null }
  }
  if (rating.year === null) {
    return { ...rating, effective: rating.letter, expired: false, validThrough: null, seasonsLeft: null }
  }

  const validThrough = rating.year + RATING_VALID_SEASONS
  const current = seasonOf(asOf)
  const expired = current > validThrough

  return {
    ...rating,
    effective: expired ? 'U' : rating.letter,
    expired,
    validThrough,
    seasonsLeft: Math.max(0, validThrough - current + 1),
  }
}

/** "B2024", or "Unrated". The form every results sheet prints. */
export function formatRating(rating: WeaponRating): string {
  if (rating.letter === 'U') return 'Unrated'
  return rating.year === null ? rating.letter : `${rating.letter}${rating.year}`
}

/** Parse "B2024", "b24", "B", "U" or "" back into a rating. Returns null for
 *  anything else rather than guessing, because a mis-parsed rating is a
 *  mis-seeded fencer. */
export function parseRating(input: string): WeaponRating | null {
  const text = input.trim().toUpperCase()
  if (text === '' || text === 'U' || text === 'UNRATED') return { letter: 'U', year: null }

  const match = /^([A-E])\s*(\d{2}|\d{4})?$/.exec(text)
  if (!match) return null

  const letter = match[1] as RatingLetter
  if (match[2] === undefined) return { letter, year: null }

  const digits = Number(match[2])
  // A two-digit year is this century. Fencing's letter system predates it, but
  // a letter from 1997 expired long ago and nobody is typing one in.
  return { letter, year: digits < 100 ? 2000 + digits : digits }
}

const ORDER: Record<Rating, number> = { A: 5, B: 4, C: 3, D: 2, E: 1, U: 0 }

/** Compare two ratings, strongest first. Sorts a roster the way a seeding does. */
export function compareRatings(a: Rating, b: Rating): number {
  return ORDER[b] - ORDER[a]
}

/** The strongest rating a fencer currently holds across their weapons — what
 *  goes on a roster line when there is room for one. */
export function bestRating(ratings: readonly WeaponRating[], asOf: Date = new Date()): Rating {
  return ratings
    .map(r => ratingStatus(r, asOf).effective)
    .reduce<Rating>((best, r) => (compareRatings(r, best) < 0 ? r : best), 'U')
}

/**
 * Years a fencer has been fencing, as a whole number, from the date they
 * started. Null when they have not said.
 *
 * Kept here rather than computed inline because it appears on the profile, the
 * roster, and every export, and three copies of a date subtraction is three
 * chances to be off by one across a birthday.
 */
export function yearsSince(startedOn: string | null | undefined, asOf: Date = new Date()): number | null {
  if (!startedOn) return null
  const start = new Date(`${startedOn}T00:00:00Z`)
  if (Number.isNaN(start.getTime())) return null

  let years = asOf.getUTCFullYear() - start.getUTCFullYear()
  const monthDiff = asOf.getUTCMonth() - start.getUTCMonth()
  if (monthDiff < 0 || (monthDiff === 0 && asOf.getUTCDate() < start.getUTCDate())) years--
  return Math.max(0, years)
}

/** Age in whole years from a date of birth. Same reasoning as `yearsSince`,
 *  and the same off-by-one to avoid — a fencer is not 14 until the day. */
export const ageFrom = yearsSince
