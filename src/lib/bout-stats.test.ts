import { describe, it, expect } from 'vitest'
import {
  summarize, splitBy, byWeapon, byOpponentHandedness, headToHead, streaks,
  inBoutOrder, recentForm, eloHistory, currentElo, boutProfile, EMPTY_RECORD,
  type BoutSide,
} from './bout-stats'

let n = 0
function bout(over: Partial<BoutSide> = {}): BoutSide {
  const scored = over.touchesScored ?? 5
  const received = over.touchesReceived ?? 3
  return {
    boutId: `b${++n}`,
    boutedOn: '2026-09-01',
    weapon: 'epee',
    boutType: 'practice',
    touchesScored: scored,
    touchesReceived: received,
    result: scored > received ? 'win' : scored < received ? 'loss' : 'tie',
    opponentId: null,
    opponentName: 'Someone',
    opponentHandedness: null,
    eventId: null,
    competitionId: null,
    ...over,
  }
}

const win  = (over: Partial<BoutSide> = {}) => bout({ touchesScored: 5, touchesReceived: 2, ...over })
const loss = (over: Partial<BoutSide> = {}) => bout({ touchesScored: 2, touchesReceived: 5, ...over })
const tie  = (over: Partial<BoutSide> = {}) => bout({ touchesScored: 4, touchesReceived: 4, ...over })

describe('summarize', () => {
  it('is empty for no bouts, rather than NaN', () => {
    expect(summarize([])).toEqual(EMPTY_RECORD)
  })

  it('counts wins, losses and ties', () => {
    const r = summarize([win(), win(), loss(), tie()])
    expect(r).toMatchObject({ bouts: 4, wins: 2, losses: 1, ties: 1 })
  })

  it('scores a tie as half a victory, the way a pool sheet does', () => {
    expect(summarize([win(), loss()]).winRate).toBe(0.5)
    expect(summarize([tie(), tie()]).winRate).toBe(0.5)
    expect(summarize([win(), tie(), loss(), loss()]).winRate).toBe(0.375)
  })

  it('computes the indicator as touches scored minus received', () => {
    const r = summarize([win(), win(), loss()])   // 5+5+2 scored, 2+2+5 received
    expect(r.touchesScored).toBe(12)
    expect(r.touchesReceived).toBe(9)
    expect(r.indicator).toBe(3)
  })

  it('reports touches per bout so records of different lengths compare', () => {
    const short = summarize([win()])
    const long  = summarize([win(), win(), win(), win()])
    expect(short.touchesScoredPerBout).toBe(long.touchesScoredPerBout)
    expect(short.indicator).not.toBe(long.indicator)
  })

  it('can describe a losing record as readily as a winning one', () => {
    const r = summarize([loss(), loss(), loss()])
    expect(r.winRate).toBe(0)
    expect(r.indicator).toBe(-9)
  })
})

describe('splitBy', () => {
  it('groups and summarizes, biggest group first', () => {
    const bouts = [
      win({ weapon: 'epee' }), loss({ weapon: 'epee' }), win({ weapon: 'epee' }),
      win({ weapon: 'saber' }),
    ]
    const split = byWeapon(bouts)
    expect(split.map(s => s.key)).toEqual(['epee', 'saber'])
    expect(split[0].record.bouts).toBe(3)
    expect(split[1].record.bouts).toBe(1)
  })

  it('drops rows the key cannot classify', () => {
    const split = splitBy([win(), loss()], b => (b.result === 'win' ? 'w' : null))
    expect(split).toHaveLength(1)
    expect(split[0].record.bouts).toBe(1)
  })
})

describe('byOpponentHandedness', () => {
  it('separates the record against lefties from the one against righties', () => {
    const bouts = [
      win({ opponentHandedness: 'right' }), win({ opponentHandedness: 'right' }),
      win({ opponentHandedness: 'right' }), loss({ opponentHandedness: 'right' }),
      loss({ opponentHandedness: 'left' }), loss({ opponentHandedness: 'left' }),
      win({ opponentHandedness: 'left' }),
    ]
    const h = byOpponentHandedness(bouts)
    expect(h.vsRight.winRate).toBe(0.75)
    expect(h.vsLeft.winRate).toBeCloseTo(1 / 3, 4)
    expect(h.unknown).toBe(0)
  })

  it('excludes unknown handedness rather than counting it as right-handed', () => {
    // Bucketing the unknowns as right-handed would flatter exactly the
    // comparison this split exists to make.
    const bouts = [win({ opponentHandedness: 'right' }), loss(), loss()]
    const h = byOpponentHandedness(bouts)
    expect(h.vsRight.bouts).toBe(1)
    expect(h.vsRight.winRate).toBe(1)
    expect(h.unknown).toBe(2)
  })

  it('leaves both sides empty when nothing is known', () => {
    const h = byOpponentHandedness([win(), loss()])
    expect(h.vsLeft).toEqual(EMPTY_RECORD)
    expect(h.vsRight).toEqual(EMPTY_RECORD)
    expect(h.unknown).toBe(2)
  })
})

describe('headToHead', () => {
  it('groups a club member by id, however their name was typed', () => {
    const bouts = [
      win({ opponentId: 'u1', opponentName: 'Wei' }),
      loss({ opponentId: 'u1', opponentName: 'Wei Chen' }),
      win({ opponentId: 'u1', opponentName: null }),
    ]
    const h = headToHead(bouts)
    expect(h).toHaveLength(1)
    expect(h[0].record.bouts).toBe(3)
    expect(h[0].opponentId).toBe('u1')
  })

  it('groups an outside opponent by name, case and space insensitively', () => {
    const bouts = [
      win({ opponentName: 'Ana Lopez' }),
      loss({ opponentName: '  ana lopez ' }),
    ]
    expect(headToHead(bouts)).toHaveLength(1)
  })

  it('does not merge an outside opponent with a club member', () => {
    const bouts = [win({ opponentId: 'u1', opponentName: 'Wei' }), win({ opponentName: 'Wei' })]
    expect(headToHead(bouts)).toHaveLength(2)
  })

  it('ignores a bout with no opponent recorded at all', () => {
    expect(headToHead([win({ opponentId: null, opponentName: null })])).toEqual([])
    expect(headToHead([win({ opponentId: null, opponentName: '   ' })])).toEqual([])
  })

  it('orders by how often they have met, and remembers when that was', () => {
    const bouts = [
      win({ opponentId: 'a', boutedOn: '2026-01-01' }),
      win({ opponentId: 'b', boutedOn: '2026-02-01' }),
      loss({ opponentId: 'b', boutedOn: '2026-03-01' }),
      win({ opponentId: 'b', boutedOn: '2026-04-01' }),
    ]
    const h = headToHead(bouts)
    expect(h[0].opponentId).toBe('b')
    expect(h[0].lastMetOn).toBe('2026-04-01')
    expect(h[1].lastMetOn).toBe('2026-01-01')
  })
})

describe('streaks', () => {
  it('counts a current run of wins forward and losses backward', () => {
    expect(streaks([
      loss({ boutedOn: '2026-01-01' }),
      win({ boutedOn: '2026-01-02' }),
      win({ boutedOn: '2026-01-03' }),
    ]).current).toBe(2)

    expect(streaks([
      win({ boutedOn: '2026-01-01' }),
      loss({ boutedOn: '2026-01-02' }),
      loss({ boutedOn: '2026-01-03' }),
      loss({ boutedOn: '2026-01-04' }),
    ]).current).toBe(-3)
  })

  it('treats a tie as breaking a streak, because it is neither result', () => {
    const s = streaks([
      win({ boutedOn: '2026-01-01' }),
      win({ boutedOn: '2026-01-02' }),
      tie({ boutedOn: '2026-01-03' }),
      win({ boutedOn: '2026-01-04' }),
    ])
    expect(s.current).toBe(1)
    expect(s.longestWin).toBe(2)
  })

  it('remembers the best and worst runs, not just the current one', () => {
    const s = streaks([
      win({ boutedOn: '2026-01-01' }), win({ boutedOn: '2026-01-02' }),
      win({ boutedOn: '2026-01-03' }), win({ boutedOn: '2026-01-04' }),
      loss({ boutedOn: '2026-01-05' }), loss({ boutedOn: '2026-01-06' }),
      win({ boutedOn: '2026-01-07' }),
    ])
    expect(s.longestWin).toBe(4)
    expect(s.longestLoss).toBe(2)
    expect(s.current).toBe(1)
  })

  it('is all zeros for no bouts', () => {
    expect(streaks([])).toEqual({ current: 0, longestWin: 0, longestLoss: 0 })
  })
})

describe('ordering', () => {
  it('puts bouts oldest first and breaks same-day ties stably', () => {
    const a = win({ boutId: 'b-a', boutedOn: '2026-05-02' })
    const b = win({ boutId: 'b-b', boutedOn: '2026-05-01' })
    const c = win({ boutId: 'b-c', boutedOn: '2026-05-02' })
    expect(inBoutOrder([a, b, c]).map(x => x.boutId)).toEqual(['b-b', 'b-a', 'b-c'])
  })

  it('takes the most recent n for form, newest last', () => {
    const bouts = ['2026-01-01', '2026-01-02', '2026-01-03', '2026-01-04']
      .map(d => win({ boutedOn: d, boutId: d }))
    expect(recentForm(bouts, 2).map(b => b.boutId)).toEqual(['2026-01-03', '2026-01-04'])
  })

  it('does not mutate its input', () => {
    const bouts = [win({ boutedOn: '2026-02-01' }), win({ boutedOn: '2026-01-01' })]
    const before = bouts.map(b => b.boutedOn)
    inBoutOrder(bouts)
    recentForm(bouts, 1)
    expect(bouts.map(b => b.boutedOn)).toEqual(before)
  })

  it('returns everything when asked for more form than exists', () => {
    expect(recentForm([win(), win()], 50)).toHaveLength(2)
  })
})

describe('elo', () => {
  const flat = () => 1500

  it('starts everyone level and moves a win up, a loss down', () => {
    expect(currentElo([], flat)).toBe(1500)
    expect(currentElo([win()], flat)).toBeGreaterThan(1500)
    expect(currentElo([loss()], flat)).toBeLessThan(1500)
  })

  it('leaves an evenly-matched draw exactly where it started', () => {
    expect(currentElo([tie()], flat)).toBe(1500)
  })

  it('pays more for beating a stronger fencer than a weaker one', () => {
    const vsStrong = eloHistory([win({ opponentId: 'strong' })], () => 1900)
    const vsWeak   = eloHistory([win({ opponentId: 'weak' })],   () => 1100)
    expect(vsStrong[0].change).toBeGreaterThan(vsWeak[0].change)
    expect(vsWeak[0].change).toBeGreaterThan(0)
  })

  it('punishes losing to a weaker fencer more than to a stronger one', () => {
    const toStrong = eloHistory([loss()], () => 1900)
    const toWeak   = eloHistory([loss()], () => 1100)
    expect(toWeak[0].change).toBeLessThan(toStrong[0].change)
  })

  it('walks the rating bout by bout in date order', () => {
    const history = eloHistory([
      loss({ boutedOn: '2026-03-01' }),
      win({ boutedOn: '2026-01-01' }),
      win({ boutedOn: '2026-02-01' }),
    ], flat)
    expect(history.map(h => h.boutedOn)).toEqual(['2026-01-01', '2026-02-01', '2026-03-01'])
    // Each row's rating is the previous one plus that bout's change.
    for (let i = 1; i < history.length; i++) {
      expect(history[i].rating).toBeCloseTo(history[i - 1].rating + history[i].change, 0)
    }
  })

  it('honors a k-factor that decides how lively the ladder is', () => {
    const lively = eloHistory([win()], flat, { k: 64 })
    const sedate = eloHistory([win()], flat, { k: 8 })
    expect(Math.abs(lively[0].change)).toBeGreaterThan(Math.abs(sedate[0].change))
  })

  it('converges on the rating that matches a known win rate', () => {
    // Beat a 1500 opponent three times in four, repeatedly. Elo should settle
    // near the rating whose expected score is 0.75 — about 1690.
    const pattern = ['win', 'win', 'win', 'loss'] as const
    const bouts = Array.from({ length: 400 }, (_, i) =>
      bout({
        boutedOn: `2026-01-01`,
        boutId: `e${i}`,
        touchesScored: pattern[i % 4] === 'win' ? 5 : 2,
        touchesReceived: pattern[i % 4] === 'win' ? 2 : 5,
      }))
    const settled = currentElo(bouts, flat, { k: 24 })
    expect(settled).toBeGreaterThan(1600)
    expect(settled).toBeLessThan(1800)
  })
})

describe('boutProfile', () => {
  it('assembles every view of a career in one pass', () => {
    const bouts = [
      win({ weapon: 'epee', opponentId: 'u1', opponentHandedness: 'left',  boutedOn: '2026-01-01' }),
      loss({ weapon: 'epee', opponentId: 'u1', opponentHandedness: 'left', boutedOn: '2026-01-08' }),
      win({ weapon: 'saber', opponentId: 'u2', opponentHandedness: 'right', boutedOn: '2026-01-15', boutType: 'pool' }),
    ]
    const p = boutProfile(bouts)
    expect(p.overall.bouts).toBe(3)
    expect(p.byWeapon.map(w => w.key).sort()).toEqual(['epee', 'saber'])
    expect(p.byBoutType.map(t => t.key).sort()).toEqual(['pool', 'practice'])
    expect(p.headToHead).toHaveLength(2)
    expect(p.handedness.vsLeft.bouts).toBe(2)
    expect(p.streaks.current).toBe(1)
    expect(p.form).toHaveLength(3)
  })

  it('separates recent form from the whole career', () => {
    // Lost everything last year, winning everything now.
    const old = Array.from({ length: 30 }, (_, i) =>
      loss({ boutId: `o${i}`, boutedOn: '2025-06-01' }))
    const now = Array.from({ length: 10 }, (_, i) =>
      win({ boutId: `n${i}`, boutedOn: '2026-09-01' }))
    const p = boutProfile([...old, ...now], 10)
    expect(p.overall.winRate).toBe(0.25)
    expect(p.recent.winRate).toBe(1)
  })

  it('survives an empty career', () => {
    const p = boutProfile([])
    expect(p.overall).toEqual(EMPTY_RECORD)
    expect(p.headToHead).toEqual([])
    expect(p.form).toEqual([])
  })
})
