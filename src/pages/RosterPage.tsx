import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { t } from '../i18n'
import { clubConfig } from '../config/club'
import { WEAPONS, type Weapon } from '../config/weapons'
import { ratingStatus, formatRating, yearsSince, type Rating } from '../lib/ratings'
import { weaponLabel, handednessShort } from '../lib/labels'
import { PageLoading } from '../components/ui/Spinner'
import { Plate } from '../components/ui/Plate'
import type { RosterEntry } from '../types/db'

// Who is in the club.
//
// Reads the `roster` view, not `profiles`: the view carries what the club
// shares with itself — name, weapon, hand, rating, neighborhood — and leaves
// out what it does not: date of birth, ID number, medical notes, emergency
// contact, and the home coordinates the meetup planner uses. Those stay behind
// RLS on the underlying table.
//
// The left-hander count at the top is not trivia. Roughly one fencer in seven
// is left-handed against one person in ten in the population, and a
// right-hander who never drills against one is carrying a hole they will only
// find in a competition. Printing the split is the cheapest way to make the
// club notice it.

export function RosterPage() {
  const [rows, setRows] = useState<RosterEntry[]>([])
  const [weapon, setWeapon] = useState<Weapon | 'all'>('all')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const { data } = await supabase.from('roster').select('*').order('name')
      if (cancelled) return
      setRows(data ?? [])
      setLoading(false)
    })()
    return () => { cancelled = true }
  }, [])

  const visible = useMemo(
    () => weapon === 'all' ? rows : rows.filter(r => (r.weapons ?? []).includes(weapon)),
    [rows, weapon])

  const lefties = visible.filter(r => r.handedness === 'left').length

  if (loading) return <PageLoading />

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="font-display text-2xl text-gold">{t.roster.title}</h1>
        <p className="figures text-sm text-muted">
          {t.roster.members(visible.length)}
          {visible.length > 0 && <> · {t.roster.lefties(lefties, visible.length)}</>}
        </p>
      </header>

      {clubConfig.club.weapons.length > 1 && (
        <div className="flex gap-2">
          <FilterChip on={weapon === 'all'} onClick={() => setWeapon('all')}>All</FilterChip>
          {WEAPONS.filter(w => (clubConfig.club.weapons as readonly Weapon[]).includes(w)).map(w => (
            <FilterChip key={w} on={weapon === w} onClick={() => setWeapon(w)}>
              {weaponLabel(w)}
            </FilterChip>
          ))}
        </div>
      )}

      <Plate>
        <ul className="flex flex-col">
          {visible.map(member => <RosterRow key={member.id} member={member} />)}
        </ul>
      </Plate>
    </div>
  )
}

function RosterRow({ member }: { member: RosterEntry }) {
  const years = yearsSince(member.started_fencing_on)
  const best = bestVisibleRating(member)

  return (
    <li className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-rule-faint py-2.5 last:border-b-0">
      <span className="flex items-baseline gap-2">
        <span className="text-paper">{member.name ?? 'A member'}</span>
        {member.nickname && member.nickname !== member.name && (
          <span className="text-sm text-silver-deep">{member.nickname}</span>
        )}
        {member.role === 'coach' && (
          <span className="border border-gold-deep px-1.5 font-display text-[0.55rem] uppercase tracking-widest text-gold-deep">
            Coach
          </span>
        )}
        {/* A left-hander is flagged, a right-hander is not: the marked case is
            the informative one, and marking both is noise on nine rows in ten. */}
        {member.handedness === 'left' && (
          <span className="border border-signal-blue px-1.5 font-display text-[0.55rem] uppercase tracking-widest text-signal-blue">
            {handednessShort(member.handedness)}
          </span>
        )}
      </span>

      <span className="figures flex flex-wrap items-baseline gap-x-3 text-sm text-muted">
        {(member.weapons ?? []).length > 0 && (
          <span>{WEAPONS.filter(w => (member.weapons ?? []).includes(w)).map(weaponLabel).join(' · ')}</span>
        )}
        {best && <span className={best.expired ? 'text-muted-dim line-through' : 'text-gold'}>{best.text}</span>}
        {years !== null && (
          <span>{years === 0 ? t.roster.startedThisYear : t.roster.yearsFencing(years)}</span>
        )}
        {member.home_label && <span className="text-muted-dim">{member.home_label}</span>}
      </span>
    </li>
  )
}

/** The strongest rating to print on one line, and whether it has lapsed.
 *  A lapsed letter is still shown — struck through — because "I used to be a
 *  B" is information, and hiding it makes the roster look like the fencer
 *  never earned one. */
function bestVisibleRating(member: RosterEntry): { text: string; expired: boolean } | null {
  if (clubConfig.club.ratingSystem === 'none') return null

  const candidates = [
    { letter: member.rating_epee,  year: member.rating_epee_year },
    { letter: member.rating_foil,  year: member.rating_foil_year },
    { letter: member.rating_saber, year: member.rating_saber_year },
  ].filter((r): r is { letter: string; year: number | null } => Boolean(r.letter))

  if (candidates.length === 0) return null

  const order = ['A', 'B', 'C', 'D', 'E', 'U']
  const best = candidates.reduce((a, b) =>
    order.indexOf(a.letter) <= order.indexOf(b.letter) ? a : b)

  const status = ratingStatus({ letter: best.letter as Rating, year: best.year })
  return { text: formatRating({ letter: best.letter as Rating, year: best.year }), expired: status.expired }
}

function FilterChip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={`min-h-11 border px-3 py-1 font-display text-xs uppercase tracking-widest transition-colors ${
        on ? 'border-gold text-gold' : 'border-rule text-silver hover:border-silver'
      }`}
    >
      {children}
    </button>
  )
}
