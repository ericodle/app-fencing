import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { t } from '../../i18n'
import { waiverStanding } from '../../lib/waivers'
import { formatDate } from '../../lib/dates'
import { Plate } from '../ui/Plate'
import { WaiverSign } from '../waivers/WaiverSign'
import type { CurrentWaiver, Waiver, WaiverSignature } from '../../types/db'

// Where a member stands on each yearly waiver, and the place to sign again
// before one runs out rather than at the door of the next session. Per-event
// waivers are signed on the event's own page, so they are not listed here.

export function WaiversSection({ memberId, memberName, isMinor }: {
  memberId: string
  memberName: string
  isMinor: boolean
}) {
  const [waivers, setWaivers] = useState<CurrentWaiver[]>([])
  const [signatures, setSignatures] = useState<WaiverSignature[]>([])

  const load = useCallback(async () => {
    const [w, s] = await Promise.all([
      supabase.from('current_waivers').select('*').eq('cadence', 'annual').order('title'),
      supabase.from('waiver_signatures').select('*').eq('member_id', memberId),
    ])
    setWaivers((w.data ?? []).filter(x => !x.requires_guardian || isMinor))
    setSignatures(s.data ?? [])
  }, [memberId, isMinor])

  useEffect(() => { void load() }, [load])

  if (waivers.length === 0) return null

  return (
    <Plate title={t.waiver.title}>
      <ul className="flex flex-col gap-3">
        {waivers.map(w => {
          const { standing, validUntil } = waiverStanding(
            { code: w.code!, version: w.version!, cadence: w.cadence! }, signatures)
          return (
            <li key={w.id} className="flex flex-col gap-2">
              <p className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="text-paper">{w.title}</span>
                <span className={`text-sm ${standing === 'signed' ? 'text-signal-green' : 'text-signal-amber'}`}>
                  {t.waiver.standing[standing]}
                  {standing === 'signed' && validUntil && ` · ${t.waiver.validUntil(formatDate(validUntil.slice(0, 10)))}`}
                </span>
              </p>
              {standing !== 'signed' && (
                <WaiverSign waiver={w as Waiver} memberId={memberId} memberName={memberName} onSigned={load} />
              )}
            </li>
          )
        })}
      </ul>
    </Plate>
  )
}
