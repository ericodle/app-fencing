import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { t } from '../i18n'
import { Button } from '../components/ui/Button'
import { Field, inputClass } from '../components/ui/Field'

export function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [busy, setBusy] = useState(false)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    })
    // Always "sent", whatever the result: telling somebody an address is not
    // registered confirms which addresses are.
    setSent(true)
    setBusy(false)
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-6 px-4 py-10">
      <h1 className="text-center font-display text-xl text-gold">{t.auth.forgotPassword}</h1>
      {sent ? (
        <div className="plate p-6 text-center">
          <p className="text-paper">{t.auth.checkEmail}</p>
          <p className="mt-2 text-sm text-muted">
            If that address belongs to a member, a reset link is on its way.
          </p>
        </div>
      ) : (
        <form onSubmit={onSubmit} className="plate flex flex-col gap-4 p-6">
          <Field label={t.auth.emailLabel} htmlFor="email">
            <input
              id="email" type="email" required autoComplete="email"
              value={email} onChange={e => setEmail(e.target.value)}
              className={inputClass}
            />
          </Field>
          <Button type="submit" busy={busy}>Send the link</Button>
        </form>
      )}
      <Link to="/login" className="text-center text-sm text-silver hover:text-gold">
        {t.common.back}
      </Link>
    </main>
  )
}
