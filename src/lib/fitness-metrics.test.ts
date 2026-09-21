import { describe, it, expect } from 'vitest'
import {
  FITNESS_METRICS, METRIC_KEYS, metricFor, isFitnessMetric, isBetter,
  improvementBetween, seriesFor, formatReading, parseDuration, validateReading,
  type FitnessReading,
} from './fitness-metrics'

let n = 0
const reading = (over: Partial<FitnessReading> & Pick<FitnessReading, 'metric' | 'value'>): FitnessReading => ({
  id: `r${++n}`,
  testedOn: '2026-01-01',
  unit: metricFor(over.metric)!.unit,
  side: null,
  ...over,
})

describe('the metric catalog', () => {
  it('has a unique key for every metric', () => {
    expect(new Set(METRIC_KEYS).size).toBe(METRIC_KEYS.length)
  })

  it('gives every metric a protocol, because an untimed test is not a benchmark', () => {
    for (const m of FITNESS_METRICS) {
      expect(m.protocol.length).toBeGreaterThan(10)
      expect(m.label.length).toBeGreaterThan(0)
    }
  })

  it('bounds every metric plausibly', () => {
    for (const m of FITNESS_METRICS) {
      expect(m.min).toBeLessThan(m.max)
    }
  })

  it('knows which way a 5k and a jump each improve', () => {
    expect(metricFor('run_5k')!.lowerIsBetter).toBe(true)
    expect(metricFor('sprint_100m')!.lowerIsBetter).toBe(true)
    expect(metricFor('vertical_jump')!.lowerIsBetter).toBe(false)
    expect(metricFor('lunge_length')!.lowerIsBetter).toBe(false)
    expect(metricFor('resting_hr')!.lowerIsBetter).toBe(true)
  })

  it('covers everything a fencer was asked for on their profile', () => {
    for (const key of ['run_5k', 'sprint_100m', 'lunge_length']) {
      expect(isFitnessMetric(key)).toBe(true)
    }
  })

  it('rejects an unknown key', () => {
    expect(isFitnessMetric('bench_press')).toBe(false)
    expect(metricFor('bench_press')).toBeUndefined()
  })
})

describe('isBetter / improvementBetween', () => {
  const fiveK = metricFor('run_5k')!
  const jump  = metricFor('vertical_jump')!

  it('reads a faster time as better and a slower one as worse', () => {
    expect(isBetter(fiveK, 1500, 1600)).toBe(true)
    expect(isBetter(fiveK, 1700, 1600)).toBe(false)
  })

  it('reads a higher jump as better', () => {
    expect(isBetter(jump, 55, 50)).toBe(true)
    expect(isBetter(jump, 45, 50)).toBe(false)
  })

  it('reports improvement as positive whichever way the raw number moved', () => {
    expect(improvementBetween(fiveK, 1600, 1500)).toBe(100)   // 100 s faster
    expect(improvementBetween(fiveK, 1500, 1600)).toBe(-100)  // 100 s slower
    expect(improvementBetween(jump, 50, 55)).toBe(5)          // 5 cm higher
    expect(improvementBetween(jump, 55, 50)).toBe(-5)
  })
})

describe('seriesFor', () => {
  it('orders a metric oldest first and picks out latest and best', () => {
    const s = seriesFor([
      reading({ metric: 'run_5k', value: 1600, testedOn: '2026-01-01' }),
      reading({ metric: 'run_5k', value: 1480, testedOn: '2026-05-01' }),
      reading({ metric: 'run_5k', value: 1520, testedOn: '2026-09-01' }),
    ]).get('run_5k')!

    expect(s.readings.map(r => r.testedOn)).toEqual(['2026-01-01', '2026-05-01', '2026-09-01'])
    expect(s.latest.value).toBe(1520)
    // The best 5k is the fastest one, not the most recent.
    expect(s.best.value).toBe(1480)
    expect(s.improvement).toBe(80)      // 1600 → 1520 is 80 s faster overall
    expect(s.lastChange).toBe(-40)      // but 40 s slower than last time
  })

  it('picks the best jump as the highest', () => {
    const s = seriesFor([
      reading({ metric: 'vertical_jump', value: 44, testedOn: '2026-01-01' }),
      reading({ metric: 'vertical_jump', value: 51, testedOn: '2026-04-01' }),
      reading({ metric: 'vertical_jump', value: 48, testedOn: '2026-08-01' }),
    ]).get('vertical_jump')!
    expect(s.best.value).toBe(51)
    expect(s.improvement).toBe(4)
  })

  it('keeps left and right apart for a sided test', () => {
    const map = seriesFor([
      reading({ metric: 'grip_strength', value: 48, side: 'right' }),
      reading({ metric: 'grip_strength', value: 39, side: 'left' }),
    ])
    expect([...map.keys()].sort()).toEqual(['grip_strength:left', 'grip_strength:right'])
    expect(map.get('grip_strength:right')!.latest.value).toBe(48)
    expect(map.get('grip_strength:left')!.latest.value).toBe(39)
  })

  it('does not split an unsided metric that arrived with a side by mistake', () => {
    const map = seriesFor([reading({ metric: 'run_5k', value: 1500, side: 'left' })])
    expect([...map.keys()]).toEqual(['run_5k'])
  })

  it('reports no change for a single reading rather than pretending to a trend', () => {
    const s = seriesFor([reading({ metric: 'push_ups', value: 30 })]).get('push_ups')!
    expect(s.improvement).toBe(0)
    expect(s.lastChange).toBe(0)
    expect(s.best).toBe(s.latest)
  })

  it('drops readings for a metric the catalog does not know', () => {
    const map = seriesFor([
      { id: 'x', metric: 'bench_press', testedOn: '2026-01-01', value: 80, unit: 'kg', side: null },
      reading({ metric: 'push_ups', value: 20 }),
    ])
    expect([...map.keys()]).toEqual(['push_ups'])
  })

  it('breaks a same-day tie stably instead of picking at random', () => {
    const s = seriesFor([
      { id: 'b', metric: 'push_ups', testedOn: '2026-01-01', value: 22, unit: 'reps', side: null },
      { id: 'a', metric: 'push_ups', testedOn: '2026-01-01', value: 20, unit: 'reps', side: null },
    ]).get('push_ups')!
    expect(s.readings.map(r => r.id)).toEqual(['a', 'b'])
    expect(s.latest.id).toBe('b')
  })

  it('is empty for no readings', () => {
    expect(seriesFor([]).size).toBe(0)
  })
})

describe('formatReading', () => {
  it('writes a long time as minutes and seconds', () => {
    expect(formatReading(metricFor('run_5k')!, 1485)).toBe('24:45')
    expect(formatReading(metricFor('run_5k')!, 1500)).toBe('25:00')
    expect(formatReading(metricFor('run_5k')!, 1445)).toBe('24:05')
    expect(formatReading(metricFor('run_5k')!, 1445.5)).toBe('24:05.5')
    expect(formatReading(metricFor('run_5k')!, 1485.5)).toBe('24:45.5')
  })

  it('round-trips through parseDuration', () => {
    const fiveK = metricFor('run_5k')!
    for (const seconds of [1485, 1500, 1445, 1445.5, 720, 3599]) {
      expect(parseDuration(formatReading(fiveK, seconds))).toBeCloseTo(seconds, 6)
    }
  })

  it('leaves a sprint in plain seconds', () => {
    expect(formatReading(metricFor('sprint_100m')!, 13.4)).toBe('13.4 s')
  })

  it('does not put a decimal on a rep count', () => {
    expect(formatReading(metricFor('push_ups')!, 31)).toBe('31 reps')
  })

  it('keeps a beep-test level at one decimal, which is its shuttle', () => {
    expect(formatReading(metricFor('beep_test')!, 9.4)).toBe('9.4')
  })

  it('appends the unit for a distance', () => {
    expect(formatReading(metricFor('lunge_length')!, 148)).toBe('148 cm')
  })
})

describe('parseDuration', () => {
  it('takes mm:ss', () => {
    expect(parseDuration('24:45')).toBe(1485)
    expect(parseDuration('4:07')).toBe(247)
    expect(parseDuration('24:45.5')).toBe(1485.5)
  })

  it('takes the way a coach writes it on a clipboard', () => {
    expect(parseDuration('24m45s')).toBe(1485)
    expect(parseDuration('24 min 45 sec')).toBe(1485)
    expect(parseDuration('13.4s')).toBe(13.4)
  })

  it('takes a plain number of seconds', () => {
    expect(parseDuration('1485')).toBe(1485)
    expect(parseDuration('13.4')).toBe(13.4)
  })

  it('rejects nonsense rather than guessing', () => {
    expect(parseDuration('')).toBeNull()
    expect(parseDuration('fast')).toBeNull()
    expect(parseDuration('24:99')).toBeNull()
  })
})

describe('validateReading', () => {
  const fiveK = metricFor('run_5k')!

  it('accepts a plausible value', () => {
    expect(validateReading(fiveK, 1485)).toBeNull()
  })

  it('catches a minutes-for-seconds mix-up', () => {
    // 24 entered where 1440 was meant.
    expect(validateReading(fiveK, 24)).toMatch(/units/)
  })

  it('catches an implausibly large value', () => {
    expect(validateReading(fiveK, 100_000)).toMatch(/units/)
  })

  it('rejects a non-number', () => {
    expect(validateReading(fiveK, Number.NaN)).toBe('Enter a number.')
  })

  it('allows a negative sit-and-reach, which is a real result', () => {
    expect(validateReading(metricFor('sit_and_reach')!, -8)).toBeNull()
  })
})
