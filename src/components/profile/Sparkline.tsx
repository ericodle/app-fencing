import type { MetricSeries } from '../../lib/fitness-metrics'
import { formatReading } from '../../lib/fitness-metrics'

// A benchmark's history in 90 by 24 pixels.
//
// Drawn, not charted: no library, no axes, no gridlines. The only thing it has
// to communicate at this size is the SHAPE — is the line going the right way —
// and the exact numbers are on the row beside it.
//
// The one piece of real thought here: the line is drawn so that UP is always
// BETTER, whichever way the raw value moves. A 5k improving means the number
// falls, and a sparkline that fell for an improvement would read as a decline
// to everybody who glanced at it. `lowerIsBetter` on the metric is what flips
// it, and the accessible description says which direction the numbers went, so
// the inversion is never hidden from a screen reader.

const W = 90
const H = 24
const PAD = 3

export function Sparkline({ series }: { series: MetricSeries }) {
  const { metric, readings, best } = series
  if (readings.length < 2) return null

  const values = readings.map(r => r.value)
  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = max - min || 1

  const points = readings.map((r, i) => {
    const x = PAD + (i / (readings.length - 1)) * (W - PAD * 2)
    // Normalize to 0..1 where 1 is the BEST value, then draw 1 at the top.
    const goodness = metric.lowerIsBetter ? (max - r.value) / range : (r.value - min) / range
    const y = H - PAD - goodness * (H - PAD * 2)
    return { x, y, reading: r }
  })

  const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ')
  const last = points[points.length - 1]
  const bestPoint = points.find(p => p.reading.id === best.id)

  const first = readings[0]
  const latest = readings[readings.length - 1]
  const direction = latest.value === first.value ? 'unchanged'
    : (latest.value < first.value) === metric.lowerIsBetter ? 'improving' : 'declining'

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`} width={W} height={H}
      className="shrink-0"
      role="img"
      aria-label={`${metric.label}: ${readings.length} tests, ${direction}, from ${formatReading(metric, first.value)} to ${formatReading(metric, latest.value)}. Higher is better on this line.`}
    >
      <line x1="0" y1={H - PAD} x2={W} y2={H - PAD}
            stroke="var(--color-rule-faint)" strokeWidth="0.5" />
      <path d={path} fill="none" stroke="var(--color-silver)" strokeWidth="1.25"
            strokeLinejoin="round" strokeLinecap="round" />
      {bestPoint && bestPoint !== last && (
        <circle cx={bestPoint.x} cy={bestPoint.y} r="1.75" fill="var(--color-gold)" />
      )}
      <circle cx={last.x} cy={last.y} r="2"
              fill={direction === 'declining' ? 'var(--color-signal-amber)' : 'var(--color-signal-green)'} />
    </svg>
  )
}
