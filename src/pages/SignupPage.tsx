import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { clubConfig } from '../config/club'
import { t } from '../i18n'
import { Logo } from '../components/Logo'
import { Button } from '../components/ui/Button'
import { Field, inputClass } from '../components/ui/Field'

// Applying to join. Creates the auth user; the `handle_new_user` trigger
// creates a matching profile in 'pending', and a coach approves it by hand.
//
// Deliberately short. Everything a coach needs to decide — handedness, weapon,
// experience — is on the profile form afterwards, and asking for it here would
// turn "I would like to try fencing" into a twenty-field form.

export function SignupPage() {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const { error } = await supabase.auth.signUp({
      email, password,
      options: { data: { name }, emailRedirectTo: `${window.location.origin}/pending` },
    })
    if (error) setError(error.message)
    else setDone(true)
    setBusy(false)
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-8 px-4 py-10">
      <div className="text-center">
        <Logo size={72} showName={false} />
        <h1 className="mt-4 font-display text-2xl text-gold">{t.auth.createAccount}</h1>
        <p className="mt-2 text-sm text-muted">{clubConfig.identity.clubName}</p>
      </div>

      {done ? (
        <div className="plate p-6 text-center">
          <p className="text-paper">{t.auth.checkEmail}</p>
          <p className="mt-3 text-sm text-muted">{t.auth.pendingBody}</p>
          <Link to="/login" className="mt-4 inline-block text-sm text-gold hover:text-gold-soft">
            {t.common.back}
          </Link>
        </div>
      ) : (
        <form onSubmit={onSubmit} className="plate flex flex-col gap-4 p-6">
          <Field label="Your name" htmlFor="name">
            <input
              id="name" required autoComplete="name"
              value={name} onChange={e => setName(e.target.value)}
              className={inputClass}
            />
          </Field>
          <Field label={t.auth.emailLabel} htmlFor="email">
            <input
              id="email" type="email" required autoComplete="email"
              value={email} onChange={e => setEmail(e.target.value)}
              className={inputClass}
            />
          </Field>
          <Field
            label={t.auth.passwordLabel}
            htmlFor="password"
            help="At least eight characters."
          >
            <input
              id="password" type="password" required minLength={8} autoComplete="new-password"
              value={password} onChange={e => setPassword(e.target.value)}
              className={inputClass}
            />
          </Field>

          {error && <p role="alert" className="text-sm text-signal-red">{error}</p>}

          <Button type="submit" busy={busy}>{t.auth.createAccount}</Button>
          <Link to="/login" className="text-center text-sm text-silver hover:text-gold">
            {t.common.back}
          </Link>
        </form>
      )}
    </main>
  )
}
