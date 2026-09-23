import { useState, type FormEvent } from 'react'
import { FunctionsHttpError } from '@supabase/supabase-js'
import { supabase } from '../../lib/supabase'
import { generatePassword } from '../../lib/password'
import { t } from '../../i18n'
import { Plate } from '../ui/Plate'
import { Button } from '../ui/Button'
import { Field, inputClass } from '../ui/Field'
import type { Role } from '../../types/db'

// Creates an account for somebody else — a coach joining, or a member who
// would rather not fill in a signup form.
//
// Goes through the create-member edge function, because making an Auth user
// for another person takes the service-role key. The function checks the
// caller is an admin; hiding this form from everyone else is only navigation.

const EMPTY = { name: '', email: '', role: 'fencer' as Role, password: '' }

export function AddMemberForm({ onCreated }: { onCreated: () => void }) {
  const [form, setForm] = useState(EMPTY)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Kept after the form clears, so the admin can still copy what to send.
  const [done, setDone] = useState<{ name: string; email: string; password: string } | null>(null)

  function set<K extends keyof typeof EMPTY>(key: K, value: (typeof EMPTY)[K]) {
    setForm(prev => ({ ...prev, [key]: value }))
    setError(null)
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const { error } = await supabase.functions.invoke('create-member', { body: form })
    setBusy(false)
    if (error) {
      // The function's own message ("already exists", "too short") is the
      // useful one; the client's wrapper only says the status was not 2xx.
      const body = error instanceof FunctionsHttpError
        ? await (error.context as Response).json().catch(() => null) as { error?: string } | null
        : null
      setError(body?.error ?? t.errors.saveFailed)
      return
    }
    setDone({ name: form.name, email: form.email, password: form.password })
    setForm(EMPTY)
    onCreated()
  }

  return (
    <Plate title={t.admin.addMember} subtitle={t.admin.addMemberNote}>
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Name" htmlFor="new-name">
            <input id="new-name" required className={inputClass} value={form.name}
                   onChange={e => set('name', e.target.value)} />
          </Field>
          <Field label={t.auth.emailLabel} htmlFor="new-email">
            <input id="new-email" type="email" required autoComplete="off" className={inputClass}
                   value={form.email} onChange={e => set('email', e.target.value)} />
          </Field>
          <Field label="Role" htmlFor="new-role">
            <select id="new-role" className={inputClass} value={form.role}
                    onChange={e => set('role', e.target.value as Role)}>
              <option value="fencer">Fencer</option>
              <option value="coach">Coach</option>
              <option value="admin">Admin</option>
            </select>
          </Field>
          <Field label={t.admin.temporaryPassword} htmlFor="new-password" help="At least eight characters.">
            <div className="flex gap-2">
              <input id="new-password" type="text" required minLength={8} autoComplete="off"
                     spellCheck={false} className={`${inputClass} figures`}
                     value={form.password} onChange={e => set('password', e.target.value)} />
              <Button type="button" variant="ghost" onClick={() => set('password', generatePassword())}>
                {t.admin.generate}
              </Button>
            </div>
          </Field>
        </div>
        {error && <p role="alert" className="text-sm text-signal-red">{error}</p>}
        {done && (
          <p role="status" className="text-sm text-signal-green">
            {t.admin.accountCreated(done.name)}{' '}
            <span className="text-muted">
              {done.email} · <span className="figures text-paper">{done.password}</span>
            </span>
          </p>
        )}
        <div>
          <Button type="submit" busy={busy}>{t.admin.createAccount}</Button>
        </div>
      </form>
    </Plate>
  )
}
