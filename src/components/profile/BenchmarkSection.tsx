import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { supabase } from '../../lib/supabase'
import { t } from '../../i18n'
import {
  FITNESS_METRICS, METRIC_GROUPS, metricFor, seriesFor, formatReading,
  parseDuration, validateReading, type FitnessReading, type MetricSeries,
} from '../../lib/fitness-metrics'
import { formatDate, todayInClub } from '../../lib/dates'
import { Plate } from '../ui/Plate'
import { Button } from '../ui/Button'
import { Field, inputClass } from '../ui/Field'
import { Sparkline } from './Sparkline'
import type { FitnessTest } from '../../types/db'

// The athletic benchmarks — sprint, 5k, lunge length, jump, and the rest.
//
// A log, not a set of fields. A `sprint_100m_s` column on the profile answers
// "how fast is she?" and destroys the answer to "is she getting faster?", which
// is the only question worth asking about a benchmark. So each test is a row
// with a date, and what the profile shows is the latest, the best, and the
// direction of travel.
//
// This section saves on its own rather than through the profile form's Save
// button: adding a benchmark is a different act from editing a profile, and
// batching them would mean a coach at the track loses a reading by navigating
// away.

export function BenchmarkSection({ memberId }: { memberId: string }) {
  const [readings, setReadings] = useState<FitnessReading[]>([])
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState(false)

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('fitness_tests').select('*')
      .eq('fencer_id', memberId)
      .order('tested_on', { ascending: true })
    setReadings((data ?? []).map(toReading))
    setLoading(false)
  }, [memberId])

  useEffect(() => { void load() }, [load])

  const series = seriesFor(readings)
  const grouped = METRIC_GROUPS
    .map(group => ({
      group,
      entries: [...series.values()].filter(s => s.metric.group === group.key),
    }))
    .filter(g => g.entries.length > 0)

  return (
    <Plate
      title={t.profile.benchmarks}
      edge="silver"
      actions={
        <Button type="button" variant="ghost" onClick={() => setAdding(v => !v)}>
          {adding ? t.common.cancel : t.fitness.add}
        </Button>
      }
    >
      {adding && (
        <AddReadingForm
          memberId={memberId}
          onSaved={async () => { setAdding(false); await load() }}
        />
      )}

      {loading ? null : readings.length === 0 ? (
        <p className="text-muted">{t.fitness.noReadings}</p>
      ) : (
        <div className="flex flex-col gap-6">
          {grouped.map(({ group, entries }) => (
            <div key={group.key}>
              <h3 className="font-display text-xs uppercase tracking-widest text-gold-deep">
                {group.label}
              </h3>
              <ul className="mt-2 flex flex-col">
                {entries.map(entry => <ReadingRow key={entry.metric.key + (entry.readings[0].side ?? '')} series={entry} />)}
              </ul>
            </div>
          ))}
          <Asymmetry series={series} />
        </div>
      )}
    </Plate>
  )
}

function ReadingRow({ series }: { series: MetricSeries }) {
  const { metric, latest, best, improvement, lastChange, readings } = series
  const side = latest.side ? ` (${latest.side})` : ''
  const improved = improvement > 0
  const first = readings.length === 1

  return (
    <li className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-b border-rule-faint py-2 last:border-b-0">
      <span className="min-w-40">
        <span className="text-paper">{metric.label}{side}</span>
        <span className="block text-xs text-muted-dim">{formatDate(latest.testedOn)}</span>
      </span>

      {readings.length > 1 && <Sparkline series={series} />}

      <span className="figures flex items-baseline gap-4 text-sm">
        <span className="text-paper">{formatReading(metric, latest.value)}</span>
        {best.id !== latest.id && (
          <span className="text-gold">{t.fitness.best} {formatReading(metric, best.value)}</span>
        )}
        {first ? (
          <span className="text-muted-dim">{t.fitness.firstTest}</span>
        ) : (
          <span className={improved ? 'text-signal-green' : lastChange === 0 ? 'text-muted' : 'text-signal-amber'}>
            {improved ? '▲' : '▼'} {Math.abs(improvement).toFixed(metric.unit === 'reps' ? 0 : 1)} {metric.unit}
          </span>
        )}
      </span>
    </li>
  )
}

/**
 * Left-versus-right, for the tests that are run per side.
 *
 * Fencing is played almost entirely off one leg, and a fencer who lunges a
 * thousand times a month on the same side develops an asymmetry they cannot
 * feel. Over about 10% is the threshold sports-medicine literature generally
 * flags, and it is exactly the kind of thing nobody computes by hand from two
 * numbers in a list — so it is computed here and said out loud.
 */
function Asymmetry({ series }: { series: Map<string, MetricSeries> }) {
  const findings = FITNESS_METRICS.filter(m => m.sided).flatMap(metric => {
    const left = series.get(`${metric.key}:left`)
    const right = series.get(`${metric.key}:right`)
    if (!left || !right) return []
    const l = left.latest.value
    const r = right.latest.value
    const stronger = Math.max(l, r)
    if (stronger === 0) return []
    const pct = Math.round((Math.abs(l - r) / stronger) * 100)
    return [{ metric, pct, strongerSide: l > r ? 'left' : 'right' }]
  })

  if (findings.length === 0) return null
  const notable = findings.some(f => f.pct > 10)

  return (
    <div className="border-t border-rule-faint pt-4">
      <h3 className="font-display text-xs uppercase tracking-widest text-gold-deep">
        Left and right
      </h3>
      <ul className="mt-2 flex flex-col gap-1 text-sm">
        {findings.map(f => (
          <li key={f.metric.key} className="figures flex justify-between gap-4">
            <span className="text-paper">{f.metric.label}</span>
            <span className={f.pct > 10 ? 'text-signal-amber' : 'text-muted'}>
              {t.fitness.asymmetry(f.pct)} · {f.strongerSide} stronger
            </span>
          </li>
        ))}
      </ul>
      {notable && (
        <p className="mt-2 border-l-2 border-signal-amber pl-3 text-sm text-muted">
          {t.fitness.asymmetryWarning}
        </p>
      )}
    </div>
  )
}

function AddReadingForm({ memberId, onSaved }: { memberId: string; onSaved: () => Promise<void> }) {
  const [metricKey, setMetricKey] = useState(FITNESS_METRICS[0].key)
  const [raw, setRaw] = useState('')
  const [testedOn, setTestedOn] = useState(todayInClub())
  const [side, setSide] = useState<'left' | 'right' | ''>('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const metric = metricFor(metricKey)!
  // A time is entered as "24:45" as often as "1485", because that is what a
  // stopwatch shows. parseDuration takes both; everything else is a number.
  const parsed = metric.unit === 's' ? parseDuration(raw) : (raw === '' ? null : Number(raw))

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (parsed === null) { setError('Enter a result.'); return }
    const problem = validateReading(metric, parsed)
    if (problem) { setError(problem); return }

    setBusy(true)
    const { error } = await supabase.from('fitness_tests').insert({
      fencer_id: memberId,
      metric: metric.key,
      value: parsed,
      unit: metric.unit,
      tested_on: testedOn,
      side: metric.sided && side ? side : null,
      recorded_by: memberId,
    })
    setBusy(false)
    if (error) { setError(t.errors.saveFailed); return }
    setRaw('')
    setError(null)
    await onSaved()
  }

  return (
    <div className="mb-5 border border-rule p-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t.fitness.metric} htmlFor="metric" help={metric.protocol}>
          <select id="metric" className={inputClass} value={metricKey}
                  onChange={e => { setMetricKey(e.target.value); setRaw(''); setError(null) }}>
            {METRIC_GROUPS.map(group => (
              <optgroup key={group.key} label={group.label}>
                {FITNESS_METRICS.filter(m => m.group === group.key).map(m => (
                  <option key={m.key} value={m.key}>{m.label}</option>
                ))}
              </optgroup>
            ))}
          </select>
        </Field>

        <Field
          label={`${t.fitness.value} (${metric.unit})`} htmlFor="value"
          help={metric.unit === 's' ? 'Seconds, or mm:ss — both work.' : undefined}
          error={error}
        >
          <input id="value" className={inputClass} value={raw} inputMode="decimal"
                 onChange={e => { setRaw(e.target.value); setError(null) }} />
        </Field>

        <Field label={t.fitness.testedOn} htmlFor="tested">
          <input id="tested" type="date" className={inputClass} value={testedOn}
                 max={todayInClub()}
                 onChange={e => setTestedOn(e.target.value)} />
        </Field>

        {metric.sided && (
          <Field label={t.fitness.side} htmlFor="side"
                 help="Run both sides — the difference between them is the finding.">
            <select id="side" className={inputClass} value={side}
                    onChange={e => setSide(e.target.value as 'left' | 'right' | '')}>
              <option value="">{t.common.notSet}</option>
              <option value="left">Left</option>
              <option value="right">Right</option>
            </select>
          </Field>
        )}
      </div>
      <Button type="button" className="mt-4" busy={busy} onClick={e => void onSubmit(e as never)}>
        {t.common.save}
      </Button>
    </div>
  )
}

function toReading(row: FitnessTest): FitnessReading {
  return {
    id: row.id,
    metric: row.metric,
    testedOn: row.tested_on,
    value: Number(row.value),
    unit: row.unit as FitnessReading['unit'],
    side: row.side as 'left' | 'right' | null,
    notes: row.notes,
  }
}
