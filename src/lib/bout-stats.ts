// What a pile of bouts adds up to.
//
// Pure functions over plain rows — no supabase, no React — because every one of
// these numbers is going to be argued about, and a number you cannot write a
// test for is a number you cannot defend.
//
// The input is always a `BoutSide`: one fencer's view of one bout, which is
// what the `bout_sides` view in the database hands back. A bout between two
// club members is stored once and appears in that view twice, once per side, so
// the same function computes "my record" for either of them without the caller
// having to know which way round the row was typed in.

import type { Weapon } from '../config/weapons'

export type BoutResult = 'win' | 'loss' | 'tie'
export type BoutType = 'practice' | 'pool' | 'de' | 'drill' | 'team'
export type Handedness = 'right' | 'left' | 'ambidextrous'

export interface BoutSide {
  boutId: string
  boutedOn: string           // ISO date
  weapon: Weapon
  boutType: BoutType
  touchesScored: number
  touchesReceived: number
  result: BoutResult
  opponentId: string | null
  opponentName: string | null
  opponentHandedness: Handedness | null
  eventId: string | null
  competitionId: string | null
}

export interface BoutRecord {
  bouts: number
  wins: number
  losses: number
  ties: number
  /** Wins as a share of bouts. Ties count as half a win, which is how a pool
   *  sheet treats them and how every federation's seeding formula does. */
  winRate: number
  touchesScored: number
  touchesReceived: number
  /** TS − TR: the indicator. The number that separates two fencers on the same
   *  number of victories, and the one a pool seeding is actually cut on. */
  indicator: number
  /** Per bout, so a fencer with 20 bouts can be compared to one with 200. */
  touchesScoredPerBout: number
  touchesReceivedPerBout: number
}

export const EMPTY_RECORD: BoutRecord = {
  bouts: 0, wins: 0, losses: 0, ties: 0, winRate: 0,
  touchesScored: 0, touchesReceived: 0, indicator: 0,
  touchesScoredPerBout: 0, touchesReceivedPerBout: 0,
}

const round = (n: number, dp = 2) => Math.round(n * 10 ** dp) / 10 ** dp

/** Aggregate a set of bouts into a record. The base every other function here
 *  is built from. */
export function summarize(bouts: readonly BoutSide[]): BoutRecord {
  if (bouts.length === 0) return EMPTY_RECORD

  let wins = 0, losses = 0, ties = 0, scored = 0, received = 0
  for (const b of bouts) {
    if (b.result === 'win') wins++
    else if (b.result === 'loss') losses++
    else ties++
    scored += b.touchesScored
    received += b.touchesReceived
  }

  const n = bouts.length
  return {
    bouts: n,
    wins, losses, ties,
    // A tie is half a victory. Not a rounding convenience: it is how V/M is
    // computed on a pool sheet, so a win rate that ignored ties would disagree
    // with the paper the fencer is holding.
    winRate: round((wins + ties * 0.5) / n, 4),
    touchesScored: scored,
    touchesReceived: received,
    indicator: scored - received,
    touchesScoredPerBout: round(scored / n),
    touchesReceivedPerBout: round(received / n),
  }
}

/** Group bouts by some key, and summarize each group. The shape behind every
 *  split on the stats page. */
export function splitBy<K extends string>(
  bouts: readonly BoutSide[],
  key: (b: BoutSide) => K | null,
): { key: K; record: BoutRecord; bouts: BoutSide[] }[] {
  const groups = new Map<K, BoutSide[]>()
  for (const b of bouts) {
    const k = key(b)
    if (k === null) continue
    const list = groups.get(k)
    if (list) list.push(b)
    else groups.set(k, [b])
  }
  return [...groups.entries()]
    .map(([key, list]) => ({ key, record: summarize(list), bouts: list }))
    .sort((a, b) => b.record.bouts - a.record.bouts)
}

export const byWeapon   = (bouts: readonly BoutSide[]) => splitBy(bouts, b => b.weapon)
export const byBoutType = (bouts: readonly BoutSide[]) => splitBy(bouts, b => b.boutType)

/**
 * Record against left-handers versus right-handers.
 *
 * The most useful split in the sport, and the least likely to be noticed
 * without being counted. About one fencer in seven is left-handed against one
 * person in ten in the population, so a left-hander spends their whole career
 * drilling against right-handers while a right-hander meets a lefty a few times
 * a season and never builds the reflex. A right-hander whose win rate drops
 * twenty points against lefties has a training problem, not a run of bad luck —
 * and this is the only place that shows up.
 *
 * Bouts where the opponent's handedness is unknown are excluded rather than
 * bucketed as right-handed, which would flatter exactly the comparison the
 * split exists to make.
 */
export function byOpponentHandedness(bouts: readonly BoutSide[]): {
  vsRight: BoutRecord
  vsLeft: BoutRecord
  unknown: number
} {
  const right = bouts.filter(b => b.opponentHandedness === 'right')
  const left  = bouts.filter(b => b.opponentHandedness === 'left')
  return {
    vsRight: summarize(right),
    vsLeft:  summarize(left),
    unknown: bouts.length - right.length - left.length,
  }
}

export interface HeadToHead {
  opponentId: string | null
  opponentName: string
  record: BoutRecord
  lastMetOn: string | null
}

/**
 * Record against each opponent, most-fenced first.
 *
 * Keyed by profile id where there is one and by name where there is not, so a
 * club-mate is one row however their name is spelled and an outside opponent is
 * grouped as well as a free-text name allows. That is a real limitation: two
 * different people called "Chen" from different clubs merge here. Recording an
 * `opponentExternalId` is what avoids it, which is why the bout form asks.
 */
export function headToHead(bouts: readonly BoutSide[]): HeadToHead[] {
  const groups = new Map<string, { name: string; id: string | null; list: BoutSide[] }>()
  for (const b of bouts) {
    const key = b.opponentId ?? `name:${(b.opponentName ?? '').trim().toLowerCase()}`
    if (key === 'name:') continue
    const existing = groups.get(key)
    if (existing) existing.list.push(b)
    else groups.set(key, { name: b.opponentName ?? 'Club member', id: b.opponentId, list: [b] })
  }

  return [...groups.values()]
    .map(g => ({
      opponentId: g.id,
      opponentName: g.name,
      record: summarize(g.list),
      lastMetOn: g.list.reduce<string | null>(
        (latest, b) => (latest === null || b.boutedOn > latest ? b.boutedOn : latest), null),
    }))
    .sort((a, b) => b.record.bouts - a.record.bouts || (b.lastMetOn ?? '').localeCompare(a.lastMetOn ?? ''))
}

export interface Streaks {
  /** Positive for a run of wins, negative for a run of losses, 0 if the most
   *  recent bout was a tie or there are none. */
  current: number
  longestWin: number
  longestLoss: number
}

/** Runs of wins and losses, in bout order. Ties break a streak rather than
 *  extending it: a 4-4 is not a win and it is not a loss. */
export function streaks(bouts: readonly BoutSide[]): Streaks {
  const ordered = inBoutOrder(bouts)
  let current = 0, longestWin = 0, longestLoss = 0, run = 0

  for (const b of ordered) {
    if (b.result === 'win')  run = run > 0 ? run + 1 : 1
    else if (b.result === 'loss') run = run < 0 ? run - 1 : -1
    else run = 0
    longestWin  = Math.max(longestWin, run)
    longestLoss = Math.max(longestLoss, -run)
    current = run
  }
  return { current, longestWin, longestLoss }
}

/** Oldest first, and stable within a day. The order streaks and form depend on. */
export function inBoutOrder(bouts: readonly BoutSide[]): BoutSide[] {
  return [...bouts].sort((a, b) =>
    a.boutedOn.localeCompare(b.boutedOn) || a.boutId.localeCompare(b.boutId))
}

/** The most recent `n` bouts, newest last. */
export function recentForm(bouts: readonly BoutSide[], n = 10): BoutSide[] {
  const ordered = inBoutOrder(bouts)
  return ordered.slice(Math.max(0, ordered.length - n))
}

// ── rating ───────────────────────────────────────────────────────────────────

export interface EloOptions {
  /** Everyone starts here. 1500 is the convention and means nothing on its own
   *  — only differences between ratings carry information. */
  initial?: number
  /** How far one bout can move a rating. 24 is deliberately lively: a club
   *  fences a few hundred bouts a season, not a few thousand, and a rating that
   *  takes two years to respond is not telling anyone anything. */
  k?: number
  /** Ratings difference at which the stronger fencer is expected to win about
   *  76% of the time. */
  scale?: number
}

export interface RatedBout {
  boutId: string
  boutedOn: string
  result: BoutResult
  /** Rating after this bout. */
  rating: number
  change: number
}

/**
 * A club ladder from practice bouts, by Elo.
 *
 * Why a rating at all, when there is already a win rate: a win rate says
 * nothing about who you beat. A fencer who wins 80% against the beginners' group
 * and one who wins 50% in the open group are not comparable on win rate, and
 * every club has both. Elo compares them, because beating a stronger fencer
 * moves you further than beating a weaker one.
 *
 * Deliberately NOT a substitute for the national classification (see
 * ratings.ts): a letter is earned in sanctioned competition against a qualified
 * field, and no amount of club bouting can produce one. This is a training aid.
 */
export function eloHistory(
  bouts: readonly BoutSide[],
  opponentRating: (opponentId: string | null, name: string | null) => number,
  options: EloOptions = {},
): RatedBout[] {
  const initial = options.initial ?? 1500
  const k = options.k ?? 24
  const scale = options.scale ?? 400

  let rating = initial
  return inBoutOrder(bouts).map(b => {
    const theirs = opponentRating(b.opponentId, b.opponentName)
    const expected = 1 / (1 + 10 ** ((theirs - rating) / scale))
    const actual = b.result === 'win' ? 1 : b.result === 'loss' ? 0 : 0.5
    const change = k * (actual - expected)
    rating += change
    return {
      boutId: b.boutId,
      boutedOn: b.boutedOn,
      result: b.result,
      rating: round(rating, 1),
      change: round(change, 1),
    }
  })
}

/** Where a fencer's Elo stands after every bout they have fenced. */
export function currentElo(
  bouts: readonly BoutSide[],
  opponentRating: (opponentId: string | null, name: string | null) => number,
  options: EloOptions = {},
): number {
  const history = eloHistory(bouts, opponentRating, options)
  return history.length === 0 ? (options.initial ?? 1500) : history[history.length - 1].rating
}

// ── the shape the stats page renders ─────────────────────────────────────────

export interface BoutProfile {
  overall: BoutRecord
  byWeapon: ReturnType<typeof byWeapon>
  byBoutType: ReturnType<typeof byBoutType>
  handedness: ReturnType<typeof byOpponentHandedness>
  headToHead: HeadToHead[]
  streaks: Streaks
  form: BoutSide[]
  /** The last 20 bouts as a record, next to the whole career, so "is this
   *  fencer improving" is answerable at a glance. */
  recent: BoutRecord
}

export function boutProfile(bouts: readonly BoutSide[], formLength = 20): BoutProfile {
  return {
    overall: summarize(bouts),
    byWeapon: byWeapon(bouts),
    byBoutType: byBoutType(bouts),
    handedness: byOpponentHandedness(bouts),
    headToHead: headToHead(bouts),
    streaks: streaks(bouts),
    form: recentForm(bouts, 10),
    recent: summarize(recentForm(bouts, formLength)),
  }
}
