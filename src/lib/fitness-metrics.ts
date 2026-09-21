// The athletic benchmarks: what the club tests, in what unit, and which
// direction is an improvement.
//
// That last question is the whole reason this file exists. A 5k time improves
// by going DOWN and a standing jump improves by going UP, and every personal
// best, every trend arrow and every chart axis in the app needs to know which —
// so it is declared once, here, next to the metric, rather than being
// re-decided by each caller.
//
// The `metric` values are pinned to the `fitness_tests_metric_check` constraint
// in the database; METRIC_KEYS below is asserted against the generated row type
// in src/types/database.ts, so the two cannot drift.

export type FitnessUnit = 's' | 'm' | 'cm' | 'kg' | 'reps' | 'level' | 'bpm'

export interface FitnessMetric {
  key: string
  label: string
  /** One line explaining how the club runs the test, shown under the field.
   *  A benchmark measured differently each time is not a benchmark. */
  protocol: string
  unit: FitnessUnit
  /** True when a smaller number is a better one. */
  lowerIsBetter: boolean
  /** Which part of fencing this is a proxy for. Groups the page. */
  group: 'speed' | 'power' | 'endurance' | 'strength' | 'mobility' | 'fencing' | 'body'
  /** Sane bounds for the input, to catch a seconds/minutes mix-up at the form
   *  rather than as a dot at the bottom of a chart three months later. */
  min: number
  max: number
  /** Whether the test is run per side, where the left/right difference is
   *  itself the finding — and in a sport played entirely off one leg, it is. */
  sided?: boolean
}

export const FITNESS_METRICS: readonly FitnessMetric[] = [
  {
    key: 'sprint_30m', label: '30 m sprint',
    protocol: 'Standing start, timed to the line. The distance a fencer actually covers at speed.',
    unit: 's', lowerIsBetter: true, group: 'speed', min: 3, max: 15,
  },
  {
    key: 'sprint_100m', label: '100 m sprint',
    protocol: 'Standing start on a track, hand-timed unless the club has gates.',
    unit: 's', lowerIsBetter: true, group: 'speed', min: 9, max: 40,
  },
  {
    key: 'run_1k', label: '1 km run',
    protocol: 'Flat course, best effort.',
    unit: 's', lowerIsBetter: true, group: 'endurance', min: 120, max: 900,
  },
  {
    key: 'run_5k', label: '5 km run',
    protocol: 'Flat course, best effort. Recorded in seconds; the form takes mm:ss.',
    unit: 's', lowerIsBetter: true, group: 'endurance', min: 720, max: 3600,
  },
  {
    key: 'lunge_length', label: 'Lunge length',
    protocol: 'Front heel to back toe at full extension from on-guard, measured on the floor. Taken on the weapon side.',
    unit: 'cm', lowerIsBetter: false, group: 'fencing', min: 60, max: 220,
  },
  {
    key: 'advance_retreat_10m', label: '10 m advance–retreat',
    protocol: 'Advance 10 m and retreat 10 m in on-guard, timed. Footwork speed under form.',
    unit: 's', lowerIsBetter: true, group: 'fencing', min: 5, max: 40,
  },
  {
    key: 'footwork_shuttle', label: 'Footwork shuttle',
    protocol: 'Six lengths of the 4 m box in on-guard, changing direction on the line.',
    unit: 's', lowerIsBetter: true, group: 'fencing', min: 8, max: 60,
  },
  {
    key: 'vertical_jump', label: 'Vertical jump',
    protocol: 'Countermovement jump from standing, reach minus standing reach.',
    unit: 'cm', lowerIsBetter: false, group: 'power', min: 10, max: 100,
  },
  {
    key: 'broad_jump', label: 'Standing broad jump',
    protocol: 'Two-footed take-off, heels to the mark on landing.',
    unit: 'cm', lowerIsBetter: false, group: 'power', min: 80, max: 350,
  },
  {
    key: 'single_leg_hop', label: 'Single-leg hop',
    protocol: 'Triple hop for distance on one leg. Run both sides — the difference is the point.',
    unit: 'cm', lowerIsBetter: false, group: 'power', min: 50, max: 900, sided: true,
  },
  {
    key: 'plank_hold', label: 'Plank hold',
    protocol: 'Front plank to failure of form, not to failure of will.',
    unit: 's', lowerIsBetter: false, group: 'strength', min: 5, max: 900,
  },
  { key: 'push_ups', label: 'Push-ups', protocol: 'Maximum in one unbroken set.', unit: 'reps', lowerIsBetter: false, group: 'strength', min: 0, max: 200 },
  { key: 'sit_ups',  label: 'Sit-ups',  protocol: 'Maximum in 60 seconds.',        unit: 'reps', lowerIsBetter: false, group: 'strength', min: 0, max: 200 },
  { key: 'pull_ups', label: 'Pull-ups', protocol: 'Maximum in one unbroken set, dead hang to chin over bar.', unit: 'reps', lowerIsBetter: false, group: 'strength', min: 0, max: 100 },
  {
    key: 'grip_strength', label: 'Grip strength',
    protocol: 'Hand dynamometer, best of three. Run both sides.',
    unit: 'kg', lowerIsBetter: false, group: 'strength', min: 5, max: 120, sided: true,
  },
  {
    key: 'sit_and_reach', label: 'Sit and reach',
    protocol: 'Standard box, measured past the toes (negative if short of them).',
    unit: 'cm', lowerIsBetter: false, group: 'mobility', min: -30, max: 50,
  },
  {
    key: 'beep_test', label: 'Beep test',
    protocol: '20 m multistage shuttle. Recorded as level.shuttle, e.g. 9.4.',
    unit: 'level', lowerIsBetter: false, group: 'endurance', min: 1, max: 23,
  },
  {
    key: 't_test', label: 'T-test',
    protocol: 'Standard agility T: 10 m up, 5 m each side, 10 m back.',
    unit: 's', lowerIsBetter: true, group: 'speed', min: 7, max: 30,
  },
  {
    key: 'illinois_agility', label: 'Illinois agility run',
    protocol: 'Standard 10 x 5 m course with four central cones.',
    unit: 's', lowerIsBetter: true, group: 'speed', min: 12, max: 40,
  },
  { key: 'bodyweight', label: 'Bodyweight', protocol: 'Morning, before training.', unit: 'kg',  lowerIsBetter: false, group: 'body', min: 20, max: 250 },
  { key: 'resting_hr', label: 'Resting heart rate', protocol: 'On waking, before getting up.', unit: 'bpm', lowerIsBetter: true, group: 'body', min: 30, max: 120 },
]

export const METRIC_KEYS = FITNESS_METRICS.map(m => m.key)
export type MetricKey = typeof FITNESS_METRICS[number]['key']

const BY_KEY = new Map(FITNESS_METRICS.map(m => [m.key, m]))

export function metricFor(key: string): FitnessMetric | undefined {
  return BY_KEY.get(key)
}

export function isFitnessMetric(key: unknown): key is MetricKey {
  return typeof key === 'string' && BY_KEY.has(key)
}

export const METRIC_GROUPS = [
  { key: 'fencing',   label: 'On the strip' },
  { key: 'speed',     label: 'Speed and agility' },
  { key: 'power',     label: 'Power' },
  { key: 'endurance', label: 'Endurance' },
  { key: 'strength',  label: 'Strength' },
  { key: 'mobility',  label: 'Mobility' },
  { key: 'body',      label: 'Body' },
] as const

// ── readings ─────────────────────────────────────────────────────────────────

export interface FitnessReading {
  id: string
  metric: string
  testedOn: string      // ISO date
  value: number
  unit: FitnessUnit
  side: 'left' | 'right' | null
  notes?: string | null
}

export interface MetricSeries {
  metric: FitnessMetric
  /** Oldest first. */
  readings: FitnessReading[]
  latest: FitnessReading
  best: FitnessReading
  /** Change from the first reading to the latest, in the metric's unit, signed
   *  so that a POSITIVE number is always an improvement whichever direction
   *  the raw value moved. This is the number the trend arrow reads. */
  improvement: number
  /** Change over the last two readings, same convention. */
  lastChange: number
}

/** True when `candidate` is a better reading than `incumbent` for this metric. */
export function isBetter(metric: FitnessMetric, candidate: number, incumbent: number): boolean {
  return metric.lowerIsBetter ? candidate < incumbent : candidate > incumbent
}

/** Signed improvement, always positive when it got better. */
export function improvementBetween(metric: FitnessMetric, from: number, to: number): number {
  const delta = to - from
  return metric.lowerIsBetter ? -delta : delta
}

/**
 * Group a member's readings into one series per metric-and-side.
 *
 * Sided metrics are kept apart: a left-hand grip test and a right-hand one are
 * not points on the same curve, and averaging them would hide the asymmetry
 * that is the reason for testing both. The series key is the metric key for an
 * unsided test and `metric:side` for a sided one.
 */
export function seriesFor(readings: readonly FitnessReading[]): Map<string, MetricSeries> {
  const buckets = new Map<string, FitnessReading[]>()
  for (const r of readings) {
    const metric = metricFor(r.metric)
    if (!metric) continue
    const key = metric.sided && r.side ? `${r.metric}:${r.side}` : r.metric
    const list = buckets.get(key)
    if (list) list.push(r)
    else buckets.set(key, [r])
  }

  const out = new Map<string, MetricSeries>()
  for (const [key, list] of buckets) {
    const metric = metricFor(list[0].metric)!
    const ordered = [...list].sort(
      (a, b) => a.testedOn.localeCompare(b.testedOn) || a.id.localeCompare(b.id))
    const latest = ordered[ordered.length - 1]
    const best = ordered.reduce((b, r) => (isBetter(metric, r.value, b.value) ? r : b), ordered[0])
    const previous = ordered.length > 1 ? ordered[ordered.length - 2] : null

    out.set(key, {
      metric,
      readings: ordered,
      latest,
      best,
      improvement: improvementBetween(metric, ordered[0].value, latest.value),
      lastChange: previous ? improvementBetween(metric, previous.value, latest.value) : 0,
    })
  }
  return out
}

/** Format a stored value for display. Times over two minutes read as mm:ss,
 *  because "1847 s" is not a 5k time anyone recognizes. */
export function formatReading(metric: FitnessMetric, value: number): string {
  if (metric.unit === 's' && value >= 120) {
    const mins = Math.floor(value / 60)
    const secs = value - mins * 60
    // Pad the WHOLE seconds to two digits and let any fraction ride along —
    // padding the formatted string instead turns 25:00 into 25:0000, because
    // "0" is one character and the target width was picked from the number.
    const whole = Math.floor(secs)
    const text = secs % 1 === 0
      ? String(whole).padStart(2, '0')
      : secs.toFixed(1).padStart(4, '0')
    return `${mins}:${text}`
  }
  if (metric.unit === 'reps' || metric.unit === 'bpm') return `${Math.round(value)} ${metric.unit}`
  if (metric.unit === 'level') return value.toFixed(1)
  return `${value % 1 === 0 ? value : value.toFixed(1)} ${metric.unit}`
}

/** Parse "12:34", "12m34s" or a plain number of seconds into seconds. The
 *  form accepts all three because a coach with a stopwatch writes all three. */
export function parseDuration(input: string): number | null {
  const text = input.trim()
  if (text === '') return null

  const colon = /^(\d+):([0-5]?\d(?:\.\d+)?)$/.exec(text)
  if (colon) return Number(colon[1]) * 60 + Number(colon[2])

  const spelled = /^(?:(\d+)\s*m(?:in)?)?\s*(?:([\d.]+)\s*s(?:ec)?)?$/i.exec(text)
  if (spelled && (spelled[1] || spelled[2])) {
    return Number(spelled[1] ?? 0) * 60 + Number(spelled[2] ?? 0)
  }

  const plain = Number(text)
  return Number.isFinite(plain) ? plain : null
}

/** Whether a value is inside the metric's plausible range. Returns the reason
 *  it is not, for the form to print. */
export function validateReading(metric: FitnessMetric, value: number): string | null {
  if (!Number.isFinite(value)) return 'Enter a number.'
  if (value < metric.min) return `That is below ${metric.min} ${metric.unit} — check the units.`
  if (value > metric.max) return `That is above ${metric.max} ${metric.unit} — check the units.`
  return null
}
