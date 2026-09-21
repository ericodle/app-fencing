import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { t } from '../i18n'
import { clubConfig } from '../config/club'
import { WEAPONS, type Weapon } from '../config/weapons'
import { seasonOf, RATING_LETTERS } from '../lib/ratings'
import {
  bySeason, describeResult, seedDelta, finishPercentile, ordinal,
  type CompetitionResult,
} from '../lib/competition-stats'
import { formatDate, todayInClub } from '../lib/dates'
import { weaponLabel } from '../lib/labels'
import { PageLoading } from '../components/ui/Spinner'
import { Plate } from '../components/ui/Plate'
import { Button } from '../components/ui/Button'
import { Field, inputClass } from '../components/ui/Field'

export function ResultsPage() {
  const { profile } = useAuth()
  const [results, setResults] = useState<CompetitionResult[]>([])
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState(false)

  const load = useCallback(async () => {
    if (!profile) return
    const { data } = await supabase
      .from('competition_results')
      .select('*, competition:competitions(*)')
      .eq('fencer_id', profile.id)
    setResults((data ?? []).map(toResult))
    setLoading(false)
  }, [profile])

  useEffect(() => { void load() }, [load])

  if (loading) return <PageLoading />

  const seasons = bySeason(results, seasonOf)

  return (
    <div className="flex flex-col gap-6">
      {adding && profile && (
        <ResultForm memberId={profile.id} onDone={async saved => {
          setAdding(false); if (saved) await load()
        }} />
      )}

      {results.length === 0 ? (
        <Plate
          title={t.results.title}
          actions={!adding && <Button onClick={() => setAdding(true)}>{t.results.add}</Button>}
        >
          <p className="text-muted">{t.results.noResults}</p>
        </Plate>
      ) : (
        <>
          {!adding && (
            <div className="flex justify-end">
              <Button onClick={() => setAdding(true)}>{t.results.add}</Button>
            </div>
          )}
          {seasons.map(({ season, results: rows, summary }) => (
            <Plate key={season} title={t.results.season(season)} edge={season === seasonOf(new Date()) ? 'gold' : undefined}>
              <div className="flex flex-wrap gap-x-8 gap-y-3">
                <Stat label="Competitions" value={String(summary.competitions)} />
                {summary.bestPlace && (
                  <Stat label="Best finish" value={ordinal(summary.bestPlace.place)} />
                )}
                {summary.podiums > 0 && <Stat label="Podiums" value={String(summary.podiums)} />}
                {summary.pool && (
                  <Stat label="Pool record"
                        value={`${summary.pool.victories}V/${summary.pool.bouts} · ${summary.pool.indicator >= 0 ? '+' : ''}${summary.pool.indicator}`} />
                )}
                {summary.meanSeedDelta !== null && (
                  <Stat
                    label="Against seed"
                    value={`${summary.meanSeedDelta > 0 ? '+' : ''}${summary.meanSeedDelta}`}
                  />
                )}
              </div>

              {summary.meanSeedDelta !== null && Math.abs(summary.meanSeedDelta) >= 3 && (
                <p className="mt-3 border-l-2 border-gold-deep pl-3 text-sm text-muted">
                  {summary.meanSeedDelta > 0
                    ? `On average you finish ${summary.meanSeedDelta} places better than you are seeded. That is the number that controls for how strong the field was — a placing on its own does not.`
                    : `On average you finish ${-summary.meanSeedDelta} places worse than you are seeded, which usually means the pool is going better than the elimination table.`}
                </p>
              )}

              <ul className="mt-4 flex flex-col border-t border-rule-faint pt-2">
                {rows.map(r => {
                  const delta = seedDelta(r)
                  const pct = finishPercentile(r)
                  return (
                    <li key={r.id} className="border-b border-rule-faint py-2 last:border-b-0">
                      <p className="flex flex-wrap items-baseline justify-between gap-2">
                        <span className="text-paper">{r.competitionName}</span>
                        <span className="figures text-sm text-muted">
                          {formatDate(r.startDate)} · {weaponLabel(r.weapon)}
                          {r.category && ` · ${r.category}`}
                        </span>
                      </p>
                      <p className="figures mt-0.5 text-sm text-muted">
                        {describeResult(r)}
                        {delta !== null && (
                          <span className={delta > 0 ? ' text-signal-green' : delta < 0 ? ' text-signal-amber' : ''}>
                            {' · '}{t.results.seedDelta(delta)}
                          </span>
                        )}
                        {pct !== null && (
                          <span className="text-muted-dim">{` · top ${Math.max(1, Math.round(pct * 100))}%`}</span>
                        )}
                      </p>
                      {r.notes && <p className="mt-1 text-sm text-muted-dim">{r.notes}</p>}
                    </li>
                  )
                })}
              </ul>
            </Plate>
          ))}
        </>
      )}
    </div>
  )
}

function ResultForm({ memberId, onDone }: {
  memberId: string
  onDone: (saved: boolean) => void | Promise<void>
}) {
  const [name, setName] = useState('')
  const [startDate, setStartDate] = useState(todayInClub())
  const [location, setLocation] = useState('')
  const [level, setLevel] = useState<CompetitionResult['level']>('local')
  const [weapon, setWeapon] = useState<Weapon>(clubConfig.club.weapons[0] as Weapon)
  const [category, setCategory] = useState('')
  const [place, setPlace] = useState('')
  const [entrants, setEntrants] = useState('')
  const [poolV, setPoolV] = useState('')
  const [poolM, setPoolM] = useState('')
  const [poolTS, setPoolTS] = useState('')
  const [poolTR, setPoolTR] = useState('')
  const [seedAfter, setSeedAfter] = useState('')
  const [deWon, setDeWon] = useState('')
  const [ratingEarned, setRatingEarned] = useState('')
  const [notes, setNotes] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const num = (v: string) => (v.trim() === '' ? null : Number(v))

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (!name.trim()) { setError('Name the competition.'); return }

    setBusy(true)
    // The competition is its own row because a member can enter one the club
    // never put on its calendar, and because two club-mates at the same event
    // should point at the same competition rather than two spellings of it.
    const { data: competition, error: compError } = await supabase
      .from('competitions')
      .insert({ name: name.trim(), start_date: startDate, location: location.trim() || null, level })
      .select().single()

    if (compError || !competition) { setError(t.errors.saveFailed); setBusy(false); return }

    const { error } = await supabase.from('competition_results').insert({
      competition_id: competition.id,
      fencer_id: memberId,
      weapon,
      category: category.trim() || null,
      place: num(place),
      entrants: num(entrants),
      pool_victories: num(poolV),
      pool_bouts: num(poolM),
      pool_touches_for: num(poolTS),
      pool_touches_against: num(poolTR),
      seed_after_pools: num(seedAfter),
      de_rounds_won: num(deWon),
      rating_earned: ratingEarned || null,
      notes: notes.trim() || null,
      recorded_by: memberId,
    })
    setBusy(false)
    if (error) { setError(t.errors.saveFailed); return }
    await onDone(true)
  }

  return (
    <Plate title={t.results.add} edge="gold">
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t.results.competition} htmlFor="compname">
            <input id="compname" className={inputClass} value={name} onChange={e => setName(e.target.value)} />
          </Field>
          <Field label="Date" htmlFor="compdate">
            <input id="compdate" type="date" className={inputClass} value={startDate}
                   onChange={e => setStartDate(e.target.value)} />
          </Field>
          <Field label="Where" htmlFor="comploc">
            <input id="comploc" className={inputClass} value={location} onChange={e => setLocation(e.target.value)} />
          </Field>
          <Field label="Level" htmlFor="complevel">
            <select id="complevel" className={inputClass} value={level}
                    onChange={e => setLevel(e.target.value as CompetitionResult['level'])}>
              {['club', 'local', 'regional', 'national', 'international'].map(l => (
                <option key={l} value={l}>{l[0].toUpperCase() + l.slice(1)}</option>
              ))}
            </select>
          </Field>
          <Field label={t.profile.weapons} htmlFor="compweapon">
            <select id="compweapon" className={inputClass} value={weapon}
                    onChange={e => setWeapon(e.target.value as Weapon)}>
              {WEAPONS.filter(w => (clubConfig.club.weapons as readonly Weapon[]).includes(w))
                .map(w => <option key={w} value={w}>{weaponLabel(w)}</option>)}
            </select>
          </Field>
          <Field label="Category" htmlFor="compcat" help="Senior, U17, veteran — as the event called it.">
            <input id="compcat" className={inputClass} value={category} onChange={e => setCategory(e.target.value)} />
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t.results.place} htmlFor="place">
            <input id="place" type="number" min={1} className={inputClass} value={place}
                   onChange={e => setPlace(e.target.value)} />
          </Field>
          <Field label={t.results.entrants} htmlFor="entrants"
                 help="Without this a placing means nothing — 9th of 12 and 9th of 200 are not the same day.">
            <input id="entrants" type="number" min={1} className={inputClass} value={entrants}
                   onChange={e => setEntrants(e.target.value)} />
          </Field>
        </div>

        <fieldset className="border-t border-rule-faint pt-4">
          <legend className="font-display text-xs uppercase tracking-widest text-silver">{t.results.pool}</legend>
          <div className="mt-2 grid gap-4 sm:grid-cols-5">
            <Field label="V" htmlFor="poolv">
              <input id="poolv" type="number" min={0} className={inputClass} value={poolV}
                     onChange={e => setPoolV(e.target.value)} />
            </Field>
            <Field label="Bouts" htmlFor="poolm">
              <input id="poolm" type="number" min={0} className={inputClass} value={poolM}
                     onChange={e => setPoolM(e.target.value)} />
            </Field>
            <Field label="TS" htmlFor="poolts">
              <input id="poolts" type="number" min={0} className={inputClass} value={poolTS}
                     onChange={e => setPoolTS(e.target.value)} />
            </Field>
            <Field label="TR" htmlFor="pooltr">
              <input id="pooltr" type="number" min={0} className={inputClass} value={poolTR}
                     onChange={e => setPoolTR(e.target.value)} />
            </Field>
            <Field label="Seed" htmlFor="seedafter">
              <input id="seedafter" type="number" min={1} className={inputClass} value={seedAfter}
                     onChange={e => setSeedAfter(e.target.value)} />
            </Field>
          </div>
        </fieldset>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t.results.deRoundsWon} htmlFor="dewon">
            <input id="dewon" type="number" min={0} className={inputClass} value={deWon}
                   onChange={e => setDeWon(e.target.value)} />
          </Field>
          {clubConfig.club.ratingSystem !== 'none' && (
            <Field label={t.results.ratingEarned} htmlFor="earned">
              <select id="earned" className={inputClass} value={ratingEarned}
                      onChange={e => setRatingEarned(e.target.value)}>
                <option value="">{t.common.none}</option>
                {RATING_LETTERS.map(l => <option key={l} value={l}>{l}</option>)}
              </select>
            </Field>
          )}
        </div>

        <Field label="Notes" htmlFor="resnotes">
          <textarea id="resnotes" rows={2} className={inputClass} value={notes}
                    onChange={e => setNotes(e.target.value)} />
        </Field>

        {error && <p role="alert" className="text-sm text-signal-red">{error}</p>}

        <div className="flex gap-2">
          <Button type="submit" busy={busy}>{t.common.save}</Button>
          <Button type="button" variant="ghost" onClick={() => void onDone(false)}>{t.common.cancel}</Button>
        </div>
      </form>
    </Plate>
  )
}

interface ResultRow {
  id: string
  competition_id: string
  weapon: string
  category: string | null
  place: number | null
  entrants: number | null
  seed_before: number | null
  pool_victories: number | null
  pool_bouts: number | null
  pool_touches_for: number | null
  pool_touches_against: number | null
  seed_after_pools: number | null
  de_rounds_won: number | null
  de_exit_round: string | null
  rating_earned: string | null
  notes: string | null
  competition: { name: string; start_date: string; level: string } | null
}

function toResult(row: ResultRow): CompetitionResult {
  return {
    id: row.id,
    competitionId: row.competition_id,
    competitionName: row.competition?.name ?? 'A competition',
    startDate: row.competition?.start_date ?? '1970-01-01',
    level: (row.competition?.level ?? 'local') as CompetitionResult['level'],
    weapon: row.weapon as Weapon,
    category: row.category,
    place: row.place,
    entrants: row.entrants,
    seedBefore: row.seed_before,
    poolVictories: row.pool_victories,
    poolBouts: row.pool_bouts,
    poolTouchesFor: row.pool_touches_for,
    poolTouchesAgainst: row.pool_touches_against,
    seedAfterPools: row.seed_after_pools,
    deRoundsWon: row.de_rounds_won,
    deExitRound: row.de_exit_round,
    ratingEarned: row.rating_earned as CompetitionResult['ratingEarned'],
    notes: row.notes,
  }
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="font-display text-xs uppercase tracking-widest text-silver">{label}</p>
      <p className="figures text-lg text-paper">{value}</p>
    </div>
  )
}
