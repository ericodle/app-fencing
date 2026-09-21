import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { ClubContactRow, ContactChannel } from '../types/db'

// The club's contact details, which are admin-authored rows rather than config.
//
// A phone number changes on a Tuesday afternoon and nobody should need a deploy
// for it — so unlike the name, timezone and theme, these live in the database.
// Readable before sign-in, because a pending applicant whose application has
// gone wrong needs them precisely when they cannot get in.

export interface ClubContact {
  details: ClubContactRow | null
  channels: ContactChannel[]
  loading: boolean
}

export function useClubContact(): ClubContact {
  const [details, setDetails] = useState<ClubContactRow | null>(null)
  const [channels, setChannels] = useState<ContactChannel[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const [contact, rows] = await Promise.all([
        supabase.from('club_contact').select('*').maybeSingle(),
        supabase.from('contact_channels').select('*').eq('active', true).order('sort_order'),
      ])
      if (cancelled) return
      setDetails(contact.data ?? null)
      setChannels(rows.data ?? [])
      setLoading(false)
    })()
    return () => { cancelled = true }
  }, [])

  return { details, channels, loading }
}
