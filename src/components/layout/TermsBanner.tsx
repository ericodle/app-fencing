import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth'
import { t } from '../../i18n'
import { Button } from '../ui/Button'
import type { Terms } from '../../types/db'

// Asks a member to accept the club's terms of use when they have not accepted
// the current version. A banner, not a wall: the original app found a wall
// locks out a member who needs to check tonight's venue, and the terms are
// agreed to properly — read, then accepted — or not at all.
//
// accept_current_terms() takes the version and refuses anything but the
// current one, so a stale tab cannot record agreement to text it never showed.

export function TermsBanner() {
  const { profile, refreshProfile } = useAuth()
  const [terms, setTerms] = useState<Terms | null>(null)
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    void supabase.from('terms').select('*').not('published_at', 'is', null)
      .order('version', { ascending: false }).limit(1).maybeSingle()
      .then(({ data }) => setTerms(data ?? null))
  }, [])

  if (!terms || !profile) return null
  if ((profile.agreed_to_terms_version ?? 0) >= terms.version) return null

  async function accept() {
    setBusy(true)
    const { error } = await supabase.rpc('accept_current_terms', { p_version: terms!.version })
    setBusy(false)
    if (!error) await refreshProfile()
  }

  return (
    <div role="region" aria-label={t.terms.title} className="mb-6 border border-gold-deep bg-ink-900 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-paper">{profile.agreed_to_terms_version ? t.terms.changed : t.terms.first}</p>
        <Button variant="ghost" onClick={() => setOpen(o => !o)}>{open ? t.common.close : t.terms.read}</Button>
      </div>
      {open && (
        <div className="mt-4 flex flex-col gap-3">
          <div className="max-h-72 overflow-y-auto whitespace-pre-wrap border border-rule-faint p-3 text-sm text-muted">
            {terms.body}
          </div>
          <div><Button busy={busy} onClick={() => void accept()}>{t.terms.accept}</Button></div>
        </div>
      )}
    </div>
  )
}
