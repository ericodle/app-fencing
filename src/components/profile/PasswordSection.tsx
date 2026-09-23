import { useState, type FormEvent } from 'react'
import { supabase } from '../../lib/supabase'
import { t } from '../../i18n'
import { Plate } from '../ui/Plate'
import { Button } from '../ui/Button'
import { Field, inputClass } from '../ui/Field'

// Change the password while signed in. The way out of a temporary password an
// admin set, and the only one that does not depend on a reset email arriving.
//
// Its own form, outside the profile form: a password is not saved with the
// Save button and must not ride along with a change of arm span.

export function PasswordSection() {
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const { error } = await supabase.auth.updateUser({ password })
    setBusy(false)
    if (error) { setError(error.message); return }
    setPassword('')
    setSaved(true)
  }

  return (
    <Plate title={t.profile.password}>
      <form onSubmit={onSubmit} className="flex flex-wrap items-end gap-3">
        <Field className="min-w-0 flex-1" label={t.profile.newPassword} htmlFor="new-own-password"
               help="At least eight characters.">
          <input id="new-own-password" type="password" required minLength={8} autoComplete="new-password"
                 className={inputClass} value={password}
                 onChange={e => { setPassword(e.target.value); setSaved(false) }} />
        </Field>
        <Button type="submit" variant="ghost" busy={busy}>{t.profile.changePassword}</Button>
        {saved && <p role="status" className="w-full text-sm text-signal-green">{t.profile.passwordChanged}</p>}
        {error && <p role="alert" className="w-full text-sm text-signal-red">{error}</p>}
      </form>
    </Plate>
  )
}
