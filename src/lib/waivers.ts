// Waivers, as a member's profile and an admin's roster show them.
//
// Which waivers a member still owes for an event is the database's answer —
// `my_missing_waivers`, which the booking trigger also asks, so the screen and
// the rule cannot disagree. What is here is the standing of each waiver on its
// own: signed, expired, out of date, or never signed.

/** How long an annual waiver lasts. The same 365 is in `missing_waivers`. */
export const ANNUAL_WAIVER_VALID_DAYS = 365

export type WaiverStanding = 'signed' | 'expired' | 'outdated' | 'unsigned'

export interface WaiverLike {
  code: string
  version: number
  cadence: string
}

export interface SignatureLike {
  waiver_code: string
  waiver_version: number
  signed_at: string
}

/** The standing of one waiver for one member, from their signatures. A
 *  per-event waiver has no standing between events, so it reads as unsigned
 *  until the event asks for it. */
export function waiverStanding(
  waiver: WaiverLike,
  signatures: readonly SignatureLike[],
  now: Date = new Date(),
): { standing: WaiverStanding; validUntil: string | null } {
  const mine = signatures
    .filter(s => s.waiver_code === waiver.code)
    .sort((a, b) => b.signed_at.localeCompare(a.signed_at))
  if (mine.length === 0 || waiver.cadence === 'per_event') return { standing: 'unsigned', validUntil: null }

  const current = mine.find(s => s.waiver_version >= waiver.version)
  if (!current) return { standing: 'outdated', validUntil: null }

  const until = new Date(new Date(current.signed_at).getTime() + ANNUAL_WAIVER_VALID_DAYS * 86_400_000)
  return until > now
    ? { standing: 'signed', validUntil: until.toISOString() }
    : { standing: 'expired', validUntil: until.toISOString() }
}
