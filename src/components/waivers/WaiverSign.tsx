import { useState, type FormEvent } from 'react'
import { supabase } from '../../lib/supabase'
import { t } from '../../i18n'
import { Button } from '../ui/Button'
import { Field, inputClass } from '../ui/Field'
import type { Waiver } from '../../types/db'

// One waiver, read and signed in place: the full text, a typed name and a box
// to tick. No drawn signature — a finger-drawn squiggle proves no more than a
// typed name does, and the record that matters is the snapshot the database
// takes of exactly what was agreed to.
//
// A guardian consent asks for two names: the junior it is for, and the parent
// or guardian signing it.

export function WaiverSign({ waiver, memberId, memberName, eventId, onSigned }: {
  waiver: Waiver
  memberId: string
  memberName: string
  eventId?: string
  onSigned: () => void | Promise<void>
}) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState(memberName)
  const [guardian, setGuardian] = useState('')
  const [agreed, setAgreed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const ready = name.trim() !== '' && agreed && (!waiver.requires_guardian || guardian.trim() !== '')

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const { error } = await supabase.rpc('sign_waiver', {
      p_waiver_id: waiver.id,
      p_member_id: memberId,
      p_signed_name: name,
      p_guardian_name: waiver.requires_guardian ? guardian : undefined,
      p_event_id: eventId,
    })
    setBusy(false)
    if (error) { setError(error.message); return }
    await onSigned()
  }

  const idBase = `waiver-${waiver.id}-${memberId}`

  return (
    <div className="border border-rule-faint">
      <button type="button" onClick={() => setOpen(o => !o)} aria-expanded={open}
              className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-ink-900">
        <span className="text-paper">{waiver.title}</span>
        <span className="font-display text-xs uppercase tracking-widest text-gold">
          {open ? t.common.close : t.register.sign}
        </span>
      </button>
      {open && (
        <form onSubmit={onSubmit} className="flex flex-col gap-4 border-t border-rule-faint p-4">
          <div className="max-h-72 overflow-y-auto whitespace-pre-wrap border border-rule-faint bg-ink-900 p-3 text-sm leading-relaxed text-muted">
            {waiver.body}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={waiver.requires_guardian ? t.waiver.signerName(memberName) : t.waiver.fullName}
                   htmlFor={`${idBase}-name`}>
              <input id={`${idBase}-name`} className={inputClass} value={name} autoComplete="name"
                     onChange={e => setName(e.target.value)} />
            </Field>
            {waiver.requires_guardian && (
              <Field label={t.waiver.guardianName} htmlFor={`${idBase}-guardian`}>
                <input id={`${idBase}-guardian`} className={inputClass} value={guardian}
                       onChange={e => setGuardian(e.target.value)} />
              </Field>
            )}
          </div>
          <label className="flex items-start gap-2 text-sm text-paper">
            <input type="checkbox" className="mt-0.5 size-4" checked={agreed}
                   onChange={e => setAgreed(e.target.checked)} />
            <span>{t.waiver.agree}</span>
          </label>
          {error && <p role="alert" className="text-sm text-signal-red">{error}</p>}
          <div>
            <Button type="submit" busy={busy} disabled={!ready}>{t.waiver.sign}</Button>
          </div>
        </form>
      )}
    </div>
  )
}
