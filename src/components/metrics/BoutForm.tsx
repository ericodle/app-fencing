import { useEffect, useState, type FormEvent } from 'react'
import { useSearchParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { t } from '../../i18n'
import { clubConfig } from '../../config/club'
import { WEAPONS, scoresDoubleTouches, usesRightOfWay, type Weapon } from '../../config/weapons'
import { todayInClub } from '../../lib/dates'
import { weaponLabel } from '../../lib/labels'
import { Plate } from '../ui/Plate'
import { Button } from '../ui/Button'
import { Field, inputClass } from '../ui/Field'
import type { RosterEntry } from '../../types/db'

// Recording one bout.
//
// The form is built around the thing that makes bout records rot: who the
// opponent was. A club-mate is picked from the roster and stored as a foreign
// key, so the record survives them changing their name and the handedness split
// can join their profile. Anybody else is typed in, and the form asks for a
// licence number — the one field that keeps a head-to-head record together when
// the same person's name is written three different ways across a season.

const BOUT_TYPES = [
  { key: 'practice', label: 'Practice bout' },
  { key: 'pool',     label: 'Pool bout' },
  { key: 'de',       label: 'Direct elimination' },
  { key: 'drill',    label: 'Drill' },
  { key: 'team',     label: 'Team relay' },
] as const

export function BoutForm({ memberId, onDone }: {
  memberId: string
  onDone: (saved: boolean) => void | Promise<void>
}) {
  const [params] = useSearchParams()
  const [roster, setRoster] = useState<RosterEntry[]>([])
  const [internal, setInternal] = useState(true)
  const [opponentId, setOpponentId] = useState('')
  const [opponentName, setOpponentName] = useState('')
  const [opponentClub, setOpponentClub] = useState('')
  const [opponentLicence, setOpponentLicence] = useState('')
  const [opponentHand, setOpponentHand] = useState<'' | 'right' | 'left' | 'ambidextrous'>('')
  const [weapon, setWeapon] = useState<Weapon>(clubConfig.club.weapons[0] as Weapon)
  const [boutType, setBoutType] = useState<typeof BOUT_TYPES[number]['key']>('practice')
  const [touchesTo, setTouchesTo] = useState(5)
  const [scoreFor, setScoreFor] = useState(0)
  const [scoreAgainst, setScoreAgainst] = useState(0)
  const [boutedOn, setBoutedOn] = useState(todayInClub())
  const [notes, setNotes] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const eventId = params.get('event')

  useEffect(() => {
    void supabase.from('roster').select('*').neq('id', memberId).order('name')
      .then(({ data }) => setRoster(data ?? []))
  }, [memberId])

  // A DE goes to 15 and a pool to 5, almost always. Following the bout type is
  // a default, not a rule — a club that drills to 10 just changes the number.
  useEffect(() => {
    setTouchesTo(boutType === 'de' ? 15 : boutType === 'team' ? 45 : 5)
  }, [boutType])

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)

    if (internal && !opponentId) { setError('Pick who you fenced.'); return }
    if (!internal && !opponentName.trim()) { setError('Write down who you fenced.'); return }

    // In a weapon with right of way only one fencer scores per exchange, so a
    // bout cannot end level at the target score. In épée it can, and routinely
    // does. Checked here because the database cannot know the difference and
    // the correction is a coaching point, not an error message.
    if (!scoresDoubleTouches(weapon) && scoreFor === scoreAgainst && scoreFor >= touchesTo) {
      setError(`A ${weaponLabel(weapon).toLowerCase()} bout cannot finish level at ${touchesTo} — one of these is a touch out.`)
      return
    }
    if (scoreFor > touchesTo || scoreAgainst > touchesTo) {
      setError(`A bout to ${touchesTo} cannot have a score above ${touchesTo}.`)
      return
    }

    setBusy(true)
    const { error } = await supabase.from('bouts').insert({
      bouted_on: boutedOn,
      event_id: eventId,
      weapon,
      bout_type: boutType,
      touches_to: touchesTo,
      fencer_id: memberId,
      score_for: scoreFor,
      score_against: scoreAgainst,
      opponent_id: internal ? opponentId : null,
      // The database refuses inline details for a club-mate: their profile is
      // the source of truth and a second copy would drift.
      opponent_name: internal ? null : opponentName.trim(),
      opponent_club: internal ? null : (opponentClub.trim() || null),
      opponent_external_id: internal ? null : (opponentLicence.trim() || null),
      opponent_handedness: internal ? null : (opponentHand || null),
      notes: notes.trim() || null,
      recorded_by: memberId,
    })
    setBusy(false)

    if (error) {
      setError(error.message.includes('duplicate')
        ? 'That bout is already recorded — one of you has entered it. Give it a bout number if you fenced twice.'
        : t.errors.saveFailed)
      return
    }
    await onDone(true)
  }

  return (
    <Plate title={t.bouts.add} edge="gold">
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <div className="flex gap-2">
          <ToggleButton on={internal} onClick={() => setInternal(true)}>
            {t.bouts.opponentFromClub}
          </ToggleButton>
          <ToggleButton on={!internal} onClick={() => setInternal(false)}>
            {t.bouts.opponentOutside}
          </ToggleButton>
        </div>

        {internal ? (
          <Field label={t.bouts.opponent} htmlFor="opponent">
            <select id="opponent" className={inputClass} value={opponentId}
                    onChange={e => setOpponentId(e.target.value)}>
              <option value="">{t.common.notSet}</option>
              {roster.map(m => (
                <option key={m.id!} value={m.id!}>
                  {m.name}{m.handedness === 'left' ? ' (LH)' : ''}
                </option>
              ))}
            </select>
          </Field>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t.bouts.opponentName} htmlFor="oppname">
              <input id="oppname" className={inputClass} value={opponentName}
                     onChange={e => setOpponentName(e.target.value)} />
            </Field>
            <Field label={t.bouts.opponentClub} htmlFor="oppclub">
              <input id="oppclub" className={inputClass} value={opponentClub}
                     onChange={e => setOpponentClub(e.target.value)} />
            </Field>
            <Field label={t.bouts.opponentLicence} htmlFor="opplic" help={t.bouts.opponentLicenceHelp}>
              <input id="opplic" className={inputClass} value={opponentLicence}
                     onChange={e => setOpponentLicence(e.target.value)} />
            </Field>
            <Field label={t.profile.handedness} htmlFor="opphand"
                   help="Worth thirty seconds now: it is the single most useful thing to know before you meet them again.">
              <select id="opphand" className={inputClass} value={opponentHand}
                      onChange={e => setOpponentHand(e.target.value as typeof opponentHand)}>
                <option value="">{t.common.notSet}</option>
                <option value="right">Right</option>
                <option value="left">Left</option>
                <option value="ambidextrous">Ambidextrous</option>
              </select>
            </Field>
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-3">
          <Field label={t.profile.weapons} htmlFor="weapon">
            <select id="weapon" className={inputClass} value={weapon}
                    onChange={e => setWeapon(e.target.value as Weapon)}>
              {WEAPONS.filter(w => (clubConfig.club.weapons as readonly Weapon[]).includes(w))
                .map(w => <option key={w} value={w}>{weaponLabel(w)}</option>)}
            </select>
          </Field>
          <Field label={t.bouts.boutType} htmlFor="bouttype">
            <select id="bouttype" className={inputClass} value={boutType}
                    onChange={e => setBoutType(e.target.value as typeof boutType)}>
              {BOUT_TYPES.map(b => <option key={b.key} value={b.key}>{b.label}</option>)}
            </select>
          </Field>
          <Field label={t.bouts.touchesTo} htmlFor="touchesto">
            <input id="touchesto" type="number" min={1} max={45} className={inputClass}
                   value={touchesTo} onChange={e => setTouchesTo(Number(e.target.value))} />
          </Field>
        </div>

        <fieldset>
          <legend className="font-display text-xs uppercase tracking-widest text-silver">
            {t.bouts.score}
          </legend>
          <div className="mt-2 flex items-end gap-4">
            <Field label={t.bouts.myScore} htmlFor="scorefor" className="w-24">
              <input id="scorefor" type="number" min={0} max={45} className={`${inputClass} figures text-center text-xl`}
                     value={scoreFor} onChange={e => setScoreFor(Number(e.target.value))} />
            </Field>
            <span className="pb-3 text-xl text-muted-dim">–</span>
            <Field label={t.bouts.theirScore} htmlFor="scoreagainst" className="w-24">
              <input id="scoreagainst" type="number" min={0} max={45} className={`${inputClass} figures text-center text-xl`}
                     value={scoreAgainst} onChange={e => setScoreAgainst(Number(e.target.value))} />
            </Field>
            <span className={`pb-3 font-display text-sm uppercase tracking-widest ${
              scoreFor > scoreAgainst ? 'text-signal-green'
              : scoreFor < scoreAgainst ? 'text-signal-amber' : 'text-muted'
            }`}>
              {scoreFor > scoreAgainst ? 'Win' : scoreFor < scoreAgainst ? 'Loss' : 'Level'}
            </span>
          </div>
          {scoresDoubleTouches(weapon) && (
            <p className="mt-2 text-sm text-muted-dim">
              Épée: both boxes can light on one action, so a bout can finish level.
            </p>
          )}
          {usesRightOfWay(weapon) && (
            <p className="mt-2 text-sm text-muted-dim">
              {weaponLabel(weapon)} has right of way — one touch per exchange, so the scores cannot both reach {touchesTo}.
            </p>
          )}
        </fieldset>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Date" htmlFor="bouted">
            <input id="bouted" type="date" className={inputClass} value={boutedOn}
                   max={todayInClub()} onChange={e => setBoutedOn(e.target.value)} />
          </Field>
        </div>

        <Field label="Notes" htmlFor="notes"
               help="What actually happened. This is the field coaches read.">
          <textarea id="notes" rows={2} className={inputClass} value={notes}
                    onChange={e => setNotes(e.target.value)} />
        </Field>

        {error && <p role="alert" className="text-sm text-signal-red">{error}</p>}

        <div className="flex gap-2">
          <Button type="submit" busy={busy}>{t.common.save}</Button>
          <Button type="button" variant="ghost" onClick={() => void onDone(false)}>
            {t.common.cancel}
          </Button>
        </div>
      </form>
    </Plate>
  )
}

function ToggleButton({ on, onClick, children }: {
  on: boolean; onClick: () => void; children: React.ReactNode
}) {
  return (
    <button
      type="button" aria-pressed={on} onClick={onClick}
      className={`min-h-11 flex-1 border px-3 py-2 font-display text-sm uppercase tracking-wide transition-colors ${
        on ? 'border-gold bg-gold text-onyx' : 'border-rule text-silver hover:border-silver'
      }`}
    >
      {children}
    </button>
  )
}
