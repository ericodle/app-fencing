// Translated labels for the database's string columns.
//
// Every one of these columns is plain `text` with a check constraint, so it
// arrives from PostgREST typed as `string` — the constraint does not survive
// into the generated types. That leaves two choices at every call site: index
// a message object with a `string` (which TypeScript refuses, correctly), or
// cast. These functions are the third: narrow once, here, and fall back
// visibly rather than rendering `undefined` when a migration adds a value the
// catalog has not caught up with.

import { t } from '../i18n'
import { EVENT_KINDS, type EventKind } from './event-kinds'
import { WEAPONS, type Weapon } from '../config/weapons'
import { TRAVEL_MODES, type TravelMode } from '../config/club'
import type { PollResponse } from '../types/db'

const POLL_RESPONSES = ['yes', 'no', 'maybe'] as const
const HANDEDNESS = ['right', 'left', 'ambidextrous'] as const
type Handedness = typeof HANDEDNESS[number]

function lookup<K extends string>(
  values: readonly K[],
  labels: Record<K, string>,
  value: string | null | undefined,
): string {
  // The raw value, not a blank: a label that quietly disappears is how a
  // vocabulary drifts for six months without anybody noticing.
  return (values as readonly string[]).includes(value ?? '')
    ? labels[value as K]
    : (value ?? '')
}

export const eventKindLabel = (v: string | null | undefined) =>
  lookup<EventKind>(EVENT_KINDS, t.eventKinds, v)

export const weaponLabel = (v: string | null | undefined) =>
  lookup<Weapon>(WEAPONS, t.weapons, v)

export const travelModeLabel = (v: string | null | undefined) =>
  lookup<TravelMode>(TRAVEL_MODES, t.travelModes, v)

export const pollAnswerLabel = (v: string | null | undefined) =>
  lookup<PollResponse>(POLL_RESPONSES, { yes: t.common.yes, no: t.common.no, maybe: t.common.maybe }, v)

export const handednessLabel = (v: string | null | undefined) =>
  lookup<Handedness>(HANDEDNESS, t.handedness, v)

/** RH / LH, for a roster line where the full word will not fit. */
export function handednessShort(v: string | null | undefined): string {
  if (v === 'right') return t.handedness.shortRight
  if (v === 'left') return t.handedness.shortLeft
  return ''
}

/** Every weapon a member fences, in the club's configured order rather than
 *  whatever order the array came out of the database in. */
export function weaponListLabel(weapons: readonly string[] | null | undefined): string {
  if (!weapons || weapons.length === 0) return t.common.notSet
  return WEAPONS.filter(w => weapons.includes(w)).map(weaponLabel).join(' · ')
}

const BOOKING_STATUSES = ['pending', 'confirmed', 'waitlisted', 'cancelled', 'no_show'] as const
type BookingStatusKey = typeof BOOKING_STATUSES[number]

export const bookingStatusLabel = (v: string | null | undefined) =>
  lookup<BookingStatusKey>(BOOKING_STATUSES, t.booking.status, v)
