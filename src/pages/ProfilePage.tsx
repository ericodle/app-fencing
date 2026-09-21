import { useEffect, useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { t } from '../i18n'
import { clubConfig, TRAVEL_MODES, type TravelMode } from '../config/club'
import { WEAPONS, type Weapon } from '../config/weapons'
import { RATING_LETTERS, ratingStatus, yearsSince, ageFrom, type Rating } from '../lib/ratings'
import { weaponLabel, handednessLabel } from '../lib/labels'
import { Plate } from '../components/ui/Plate'
import { Button } from '../components/ui/Button'
import { Field, inputClass } from '../components/ui/Field'
import { PageLoading } from '../components/ui/Spinner'
import { BenchmarkSection } from '../components/profile/BenchmarkSection'
import { HomeAreaField } from '../components/profile/HomeAreaField'
import type { ProfileUpdate } from '../types/db'

// The member's own record.
//
// Split into sections that are edited at different rates. The account details
// change once; the athlete block changes when somebody grows or changes weapon;
// the home area changes when they move; the benchmarks change every few weeks
// and live in their own log, not here — see BenchmarkSection and the comment on
// `fitness_tests` in the migration for why a benchmark must not be a column.

const GRIPS = ['pistol', 'french', 'belgian', 'visconti', 'straight'] as const
const HANDS = ['right', 'left', 'ambidextrous'] as const

export function ProfilePage() {
  const { profile, refreshProfile, loading } = useAuth()
  const [form, setForm] = useState<ProfileUpdate>({})
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => { if (profile) setForm(profile) }, [profile])

  if (loading || !profile) return <PageLoading />

  function set<K extends keyof ProfileUpdate>(key: K, value: ProfileUpdate[K]) {
    setForm(prev => ({ ...prev, [key]: value }))
    setSaved(false)
  }

  function toggleWeapon(weapon: Weapon) {
    const current = (form.weapons ?? []) as string[]
    const next = current.includes(weapon)
      ? current.filter(w => w !== weapon)
      : [...current, weapon]
    setForm(prev => ({
      ...prev,
      weapons: next,
      // The database refuses a primary weapon the fencer does not fence, so
      // clear it here rather than letting a stale value bounce off a
      // constraint whose message nobody can act on.
      primary_weapon: next.includes(prev.primary_weapon ?? '') ? prev.primary_weapon : null,
    }))
    setSaved(false)
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)

    // Only the columns this form owns. Sending the whole row back would include
    // role and status, which the database rejects for a non-admin — correctly,
    // but with an error that reads as a bug rather than a rule.
    const patch: ProfileUpdate = {
      name: form.name, nickname: form.nickname, date_of_birth: form.date_of_birth,
      nationality: form.nationality, gender: form.gender,
      contact_method: form.contact_method, contact_id: form.contact_id,
      emergency_contact_name: form.emergency_contact_name,
      emergency_contact_phone: form.emergency_contact_phone,
      medical_notes: form.medical_notes,
      handedness: form.handedness, height_cm: form.height_cm, weight_kg: form.weight_kg,
      arm_span_cm: form.arm_span_cm, weapons: form.weapons, primary_weapon: form.primary_weapon,
      grip: form.grip, started_fencing_on: form.started_fencing_on,
      rating_epee: form.rating_epee,   rating_epee_year: form.rating_epee_year,
      rating_foil: form.rating_foil,   rating_foil_year: form.rating_foil_year,
      rating_saber: form.rating_saber, rating_saber_year: form.rating_saber_year,
      fie_licence_id: form.fie_licence_id, national_licence_id: form.national_licence_id,
      referee_qualification: form.referee_qualification,
      competition_notes: form.competition_notes,
      equipment_owned: form.equipment_owned,
      glove_size: form.glove_size, jacket_size: form.jacket_size,
      shoe_size: form.shoe_size, blade_size: form.blade_size,
      home_label: form.home_label, home_lat: form.home_lat, home_lng: form.home_lng,
      travel_mode: form.travel_mode, seats_offered: form.seats_offered,
    }

    const { error } = await supabase.from('profiles').update(patch).eq('id', profile!.id)
    if (error) setError(t.errors.saveFailed)
    else { setSaved(true); await refreshProfile() }
    setSaving(false)
  }

  const weapons = (form.weapons ?? []) as string[]
  const offeredWeapons = WEAPONS.filter(w => (clubConfig.club.weapons as readonly Weapon[]).includes(w))
  const reach = form.arm_span_cm !== null && form.arm_span_cm !== undefined
    && form.height_cm !== null && form.height_cm !== undefined
    ? Number(form.arm_span_cm) - Number(form.height_cm)
    : null
  const age = ageFrom(form.date_of_birth ?? null)
  const years = yearsSince(form.started_fencing_on ?? null)

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-6">
      <header className="flex flex-wrap items-baseline justify-between gap-3">
        <h1 className="font-display text-2xl text-gold">{t.profile.title}</h1>
        <div className="flex items-center gap-3">
          {saved && <span className="text-sm text-signal-green">{t.common.saved}</span>}
          {error && <span role="alert" className="text-sm text-signal-red">{error}</span>}
          <Button type="submit" busy={saving}>{t.common.save}</Button>
        </div>
      </header>

      <Plate title={t.profile.account}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Name" htmlFor="name">
            <input id="name" className={inputClass} value={form.name ?? ''}
                   onChange={e => set('name', e.target.value)} />
          </Field>
          <Field label="What people call you" htmlFor="nickname">
            <input id="nickname" className={inputClass} value={form.nickname ?? ''}
                   onChange={e => set('nickname', e.target.value)} />
          </Field>
          <Field
            label="Date of birth" htmlFor="dob"
            help={age !== null ? `${age} years old` : 'Competitions are entered by age category.'}
          >
            <input id="dob" type="date" className={inputClass} value={form.date_of_birth ?? ''}
                   onChange={e => set('date_of_birth', e.target.value || null)} />
          </Field>
          <Field label="Nationality" htmlFor="nationality">
            <input id="nationality" className={inputClass} value={form.nationality ?? ''}
                   onChange={e => set('nationality', e.target.value)} />
          </Field>
        </div>
      </Plate>

      <Plate title={t.profile.athlete} edge="gold">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t.profile.handedness} htmlFor="handedness">
            <select id="handedness" className={inputClass} value={form.handedness ?? ''}
                    onChange={e => set('handedness', e.target.value || null)}>
              <option value="">{t.common.notSet}</option>
              {HANDS.map(h => <option key={h} value={h}>{handednessLabel(h)}</option>)}
            </select>
          </Field>

          <Field
            label={t.profile.startedFencing} htmlFor="started"
            help={years !== null
              ? (years === 0 ? t.roster.startedThisYear : t.roster.yearsFencing(years))
              : 'A date, not a number of years — this one stays right next year.'}
          >
            <input id="started" type="date" className={inputClass} value={form.started_fencing_on ?? ''}
                   onChange={e => set('started_fencing_on', e.target.value || null)} />
          </Field>

          <Field label={`${t.profile.height} (cm)`} htmlFor="height">
            <input id="height" type="number" min={50} max={260} step="0.5" className={inputClass}
                   value={form.height_cm ?? ''}
                   onChange={e => set('height_cm', e.target.value ? Number(e.target.value) : null)} />
          </Field>

          <Field
            label={`${t.profile.armSpan} (cm)`} htmlFor="armspan"
            help={reach !== null ? t.profile.apeIndex(Math.round(reach)) : t.profile.armSpanHelp}
          >
            <input id="armspan" type="number" min={50} max={280} step="0.5" className={inputClass}
                   value={form.arm_span_cm ?? ''}
                   onChange={e => set('arm_span_cm', e.target.value ? Number(e.target.value) : null)} />
          </Field>

          <Field label={`${t.profile.weight} (kg)`} htmlFor="weight">
            <input id="weight" type="number" min={10} max={300} step="0.1" className={inputClass}
                   value={form.weight_kg ?? ''}
                   onChange={e => set('weight_kg', e.target.value ? Number(e.target.value) : null)} />
          </Field>

          <Field label={t.profile.grip} htmlFor="grip">
            <select id="grip" className={inputClass} value={form.grip ?? ''}
                    onChange={e => set('grip', e.target.value || null)}>
              <option value="">{t.common.notSet}</option>
              {GRIPS.map(g => <option key={g} value={g}>{g[0].toUpperCase() + g.slice(1)}</option>)}
            </select>
          </Field>
        </div>

        <fieldset className="mt-4 border-t border-rule-faint pt-4">
          <legend className="font-display text-xs uppercase tracking-widest text-silver">
            {t.profile.weapons}
          </legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {offeredWeapons.map(w => (
              <button
                key={w} type="button" aria-pressed={weapons.includes(w)}
                onClick={() => toggleWeapon(w)}
                className={`min-h-11 border px-4 py-2 font-display text-sm uppercase tracking-wide transition-colors ${
                  weapons.includes(w) ? 'border-gold bg-gold text-onyx' : 'border-rule text-silver hover:border-silver'
                }`}
              >
                {weaponLabel(w)}
              </button>
            ))}
          </div>

          {weapons.length > 1 && (
            <Field className="mt-4 max-w-xs" label={t.profile.primaryWeapon} htmlFor="primary">
              <select id="primary" className={inputClass} value={form.primary_weapon ?? ''}
                      onChange={e => set('primary_weapon', e.target.value || null)}>
                <option value="">{t.common.notSet}</option>
                {weapons.map(w => <option key={w} value={w}>{weaponLabel(w)}</option>)}
              </select>
            </Field>
          )}
        </fieldset>

        {clubConfig.club.ratingSystem !== 'none' && (
          <fieldset className="mt-4 border-t border-rule-faint pt-4">
            <legend className="font-display text-xs uppercase tracking-widest text-silver">
              {t.profile.ratings}
            </legend>
            <p className="mt-1 text-sm text-muted-dim">{t.profile.ratingHelp}</p>
            <div className="mt-3 flex flex-col gap-3">
              {offeredWeapons.map(w => (
                <RatingRow
                  key={w} weapon={w}
                  letter={form[`rating_${w}` as 'rating_epee'] ?? null}
                  year={form[`rating_${w}_year` as 'rating_epee_year'] ?? null}
                  onLetter={v => set(`rating_${w}` as 'rating_epee', v)}
                  onYear={v => set(`rating_${w}_year` as 'rating_epee_year', v)}
                />
              ))}
            </div>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <Field label="FIE licence" htmlFor="fie">
                <input id="fie" className={inputClass} value={form.fie_licence_id ?? ''}
                       onChange={e => set('fie_licence_id', e.target.value)} />
              </Field>
              <Field label="National licence" htmlFor="natid">
                <input id="natid" className={inputClass} value={form.national_licence_id ?? ''}
                       onChange={e => set('national_licence_id', e.target.value)} />
              </Field>
            </div>
          </fieldset>
        )}

        <div className="mt-4 grid gap-4 border-t border-rule-faint pt-4">
          <Field label={t.profile.refereeQualification} htmlFor="ref"
                 help="Weapon and level, if you hold one. Coaches use this to staff interclubs.">
            <input id="ref" className={inputClass} value={form.referee_qualification ?? ''}
                   onChange={e => set('referee_qualification', e.target.value)} />
          </Field>
          <Field label={t.profile.competitionNotes} htmlFor="compnotes"
                 help="Anything the results page does not capture — national squads, years away from the sport, an injury a coach should plan around.">
            <textarea id="compnotes" rows={3} className={inputClass} value={form.competition_notes ?? ''}
                      onChange={e => set('competition_notes', e.target.value)} />
          </Field>
        </div>
      </Plate>

      <Plate title={t.profile.travel} edge="silver">
        <HomeAreaField
          label={form.home_label ?? ''}
          lat={form.home_lat === null || form.home_lat === undefined ? null : Number(form.home_lat)}
          lng={form.home_lng === null || form.home_lng === undefined ? null : Number(form.home_lng)}
          onChange={(label, lat, lng) => {
            setForm(prev => ({ ...prev, home_label: label, home_lat: lat, home_lng: lng }))
            setSaved(false)
          }}
        />
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field label={t.profile.travelMode} htmlFor="travel">
            <select id="travel" className={inputClass} value={form.travel_mode ?? ''}
                    onChange={e => set('travel_mode', (e.target.value || null) as TravelMode | null)}>
              <option value="">{t.common.notSet}</option>
              {TRAVEL_MODES.map(m => <option key={m} value={m}>{t.travelModes[m]}</option>)}
            </select>
          </Field>
          <Field label={t.profile.seatsOffered} htmlFor="seats"
                 help="0 if you never drive. Shown when a session needs a carpool.">
            <input id="seats" type="number" min={0} max={8} className={inputClass}
                   value={form.seats_offered ?? 0}
                   onChange={e => set('seats_offered', Number(e.target.value))} />
          </Field>
        </div>
      </Plate>

      <Plate title={t.profile.kit}>
        <fieldset>
          <legend className="sr-only">Kit I own</legend>
          <div className="flex flex-wrap gap-2">
            {clubConfig.club.equipmentItems.map(item => {
              const owned = ((form.equipment_owned ?? []) as string[]).includes(item)
              return (
                <button
                  key={item} type="button" aria-pressed={owned}
                  onClick={() => {
                    const current = (form.equipment_owned ?? []) as string[]
                    set('equipment_owned', owned ? current.filter(i => i !== item) : [...current, item])
                  }}
                  className={`min-h-11 border px-3 py-1.5 text-sm transition-colors ${
                    owned ? 'border-silver bg-silver text-onyx' : 'border-rule text-silver hover:border-silver'
                  }`}
                >
                  {item}
                </button>
              )
            })}
          </div>
        </fieldset>
        <div className="mt-4 grid gap-4 sm:grid-cols-4">
          <Field label="Glove" htmlFor="glove">
            <input id="glove" className={inputClass} value={form.glove_size ?? ''}
                   onChange={e => set('glove_size', e.target.value)} />
          </Field>
          <Field label="Jacket" htmlFor="jacket">
            <input id="jacket" className={inputClass} value={form.jacket_size ?? ''}
                   onChange={e => set('jacket_size', e.target.value)} />
          </Field>
          <Field label="Shoes" htmlFor="shoes">
            <input id="shoes" className={inputClass} value={form.shoe_size ?? ''}
                   onChange={e => set('shoe_size', e.target.value)} />
          </Field>
          <Field label="Blade" htmlFor="blade" help="0 or 5.">
            <input id="blade" className={inputClass} value={form.blade_size ?? ''}
                   onChange={e => set('blade_size', e.target.value)} />
          </Field>
        </div>
      </Plate>

      <Plate title={t.profile.emergency}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Who to call" htmlFor="ecname">
            <input id="ecname" className={inputClass} value={form.emergency_contact_name ?? ''}
                   onChange={e => set('emergency_contact_name', e.target.value)} />
          </Field>
          <Field label="Their number" htmlFor="ecphone">
            <input id="ecphone" type="tel" className={inputClass} value={form.emergency_contact_phone ?? ''}
                   onChange={e => set('emergency_contact_phone', e.target.value)} />
          </Field>
        </div>
        <Field className="mt-4" label="Anything a coach should know" htmlFor="medical"
               help="Asthma, an old injury, a medication. Seen by coaches only — never on the roster.">
          <textarea id="medical" rows={2} className={inputClass} value={form.medical_notes ?? ''}
                    onChange={e => set('medical_notes', e.target.value)} />
        </Field>
      </Plate>

      {/* Benchmarks save themselves — they are rows in their own log, not
          columns on this form, so they do not wait for the Save button. */}
      {clubConfig.features.fitnessTests && <BenchmarkSection memberId={profile.id} />}
    </form>
  )
}

function RatingRow({
  weapon, letter, year, onLetter, onYear,
}: {
  weapon: Weapon
  letter: string | null
  year: number | null
  onLetter: (v: string | null) => void
  onYear: (v: number | null) => void
}) {
  const status = letter ? ratingStatus({ letter: letter as Rating, year }) : null
  return (
    <div className="flex flex-wrap items-end gap-3">
      <span className="min-w-20 font-display text-sm text-silver">{weaponLabel(weapon)}</span>
      <select
        aria-label={`${weaponLabel(weapon)} classification`}
        className={`${inputClass} w-24`} value={letter ?? ''}
        onChange={e => onLetter(e.target.value || null)}
      >
        <option value="">U</option>
        {RATING_LETTERS.map(l => <option key={l} value={l}>{l}</option>)}
      </select>
      <input
        aria-label={`${weaponLabel(weapon)} classification year`}
        type="number" min={1980} max={2100} placeholder="Year"
        className={`${inputClass} w-28`} value={year ?? ''}
        onChange={e => onYear(e.target.value ? Number(e.target.value) : null)}
      />
      {status && status.letter !== 'U' && (
        <span className={`text-sm ${status.expired ? 'text-signal-amber' : 'text-muted'}`}>
          {status.expired
            ? 'Lapsed — you are seeded unrated'
            : status.validThrough
              ? `Valid through the ${status.validThrough} season`
              : 'No year recorded, so no expiry shown'}
        </span>
      )}
    </div>
  )
}
