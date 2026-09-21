// Reading bouts out of the database and into the shape bout-stats.ts works in.
//
// The `bout_sides` view already does the hard part — handing each fencer their
// own view of a bout whichever way round it was typed in — so this is mostly a
// rename from snake_case to the domain type. It is a separate function rather
// than an inline map because every screen that shows statistics needs it and a
// second copy would be a second place for the mirrored-bout logic to go wrong.

import { supabase } from './supabase'
import { isWeapon } from '../config/weapons'
import type { BoutSide, BoutType, Handedness } from './bout-stats'
import type { BoutSideRow } from '../types/db'

const BOUT_TYPES: readonly BoutType[] = ['practice', 'pool', 'de', 'drill', 'team']

export function rowsToBoutSides(rows: readonly BoutSideRow[]): BoutSide[] {
  return rows
    // A row whose weapon the app does not recognize is a row from a migration
    // this build predates. Dropping it keeps every per-weapon split honest;
    // coercing it to épée would quietly file it under the wrong heading.
    .filter(r => isWeapon(r.weapon))
    .map(r => ({
      boutId: r.bout_id!,
      boutedOn: r.bouted_on!,
      weapon: r.weapon as BoutSide['weapon'],
      boutType: (BOUT_TYPES as readonly string[]).includes(r.bout_type ?? '')
        ? r.bout_type as BoutType
        : 'practice',
      touchesScored: r.touches_scored ?? 0,
      touchesReceived: r.touches_received ?? 0,
      result: (r.result ?? 'tie') as BoutSide['result'],
      opponentId: r.opponent_id,
      opponentName: r.opponent_name,
      opponentHandedness: r.opponent_handedness as Handedness | null,
      eventId: r.event_id,
      competitionId: r.competition_id,
    }))
}

/** Every bout a member was in, newest first. Reads `bout_sides`, never `bouts`
 *  — the view is what makes a bout somebody else recorded still show up as
 *  yours, from your side. */
export async function fetchBouts(memberId: string, limit = 500): Promise<BoutSide[]> {
  const { data } = await supabase
    .from('bout_sides').select('*')
    .eq('member_id', memberId)
    .order('bouted_on', { ascending: false })
    .limit(limit)
  return rowsToBoutSides((data ?? []) as BoutSideRow[])
}

/**
 * Opponent handedness for a bout against a club member.
 *
 * The bouts table refuses inline opponent details when the opponent is one of
 * ours — the profile is the source of truth and a second copy would rot — so
 * the handedness split has to join them back in here. Bouts against outsiders
 * already carry it on the row.
 */
export async function withClubOpponentHandedness(bouts: BoutSide[]): Promise<BoutSide[]> {
  const ids = [...new Set(bouts.map(b => b.opponentId).filter((id): id is string => id !== null))]
  if (ids.length === 0) return bouts

  const { data } = await supabase.from('roster').select('id, name, nickname, handedness').in('id', ids)
  const byId = new Map((data ?? []).map(r => [r.id, r]))

  return bouts.map(b => {
    if (!b.opponentId) return b
    const them = byId.get(b.opponentId)
    if (!them) return b
    return {
      ...b,
      opponentName: b.opponentName ?? them.nickname ?? them.name,
      opponentHandedness: (them.handedness as Handedness | null) ?? b.opponentHandedness,
    }
  })
}
