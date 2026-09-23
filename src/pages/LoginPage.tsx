import { useState, type FormEvent } from 'react'
import { Link, Navigate, useLocation } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { clubConfig } from '../config/club'
import { t } from '../i18n'
import { Logo } from '../components/Logo'
import { Button } from '../components/ui/Button'
import { Field, inputClass } from '../components/ui/Field'

// Seeded local accounts, offered as one-click buttons in dev only. They exist
// in supabase/seeds/test-users.sql and nowhere else; import.meta.env.DEV keeps
// the whole block out of a production bundle.
const DEV_ACCOUNTS = [
  { label: 'Fencer',     email: 'fencer@fencer.fencer', password: 'fencerfencer' },
  { label: 'Coach Ku',   email: 'coach@coach.coach',    password: 'coachcoach' },
  { label: 'Coach Eric', email: 'eric@coach.coach',     password: 'coachcoach' },
  { label: 'Admin',      email: 'admin@admin.admin',    password: 'adminadmin' },
]

export function LoginPage() {
  const { session } = useAuth()
  const location = useLocation()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  if (session) {
    const from = (location.state as { from?: Location } | null)?.from
    return <Navigate to={from?.pathname ?? '/dashboard'} replace />
  }

  async function signIn(withEmail: string, withPassword: string) {
    setBusy(true)
    setError(null)
    const { error } = await supabase.auth.signInWithPassword({
      email: withEmail, password: withPassword,
    })
    // Deliberately not "no account with that email" — that would confirm which
    // addresses are members to anybody who asks.
    if (error) setError('That email and password do not match an account.')
    setBusy(false)
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    void signIn(email, password)
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-8 px-4 py-10">
      <div className="text-center">
        <Logo size={160} className="mx-auto" />
        <h1 className="mt-4 font-display text-2xl text-gold">{clubConfig.identity.clubName}</h1>
        {clubConfig.identity.nativeName && (
          <p className="text-silver-deep">{clubConfig.identity.nativeName}</p>
        )}
        <p className="mt-2 text-sm text-muted">{clubConfig.identity.tagline}</p>
      </div>

      <form onSubmit={onSubmit} className="plate flex flex-col gap-4 p-6">
        <Field label={t.auth.emailLabel} htmlFor="email">
          <input
            id="email" type="email" autoComplete="email" required
            value={email} onChange={e => setEmail(e.target.value)}
            className={inputClass}
          />
        </Field>
        <Field label={t.auth.passwordLabel} htmlFor="password">
          <input
            id="password" type="password" autoComplete="current-password" required
            value={password} onChange={e => setPassword(e.target.value)}
            className={inputClass}
          />
        </Field>

        {error && <p role="alert" className="text-sm text-signal-red">{error}</p>}

        <Button type="submit" busy={busy}>{t.common.signIn}</Button>

        <div className="flex justify-between text-sm">
          <Link to="/forgot-password" className="text-silver hover:text-gold">
            {t.auth.forgotPassword}
          </Link>
          <Link to="/signup" className="text-silver hover:text-gold">
            {t.auth.createAccount}
          </Link>
        </div>
      </form>

      {import.meta.env.DEV && (
        <div className="plate p-4">
          <p className="mb-3 font-display text-xs uppercase tracking-widest text-gold-deep">
            Seeded local accounts
          </p>
          <div className="flex flex-wrap gap-2">
            {DEV_ACCOUNTS.map(a => (
              <Button
                key={a.email} type="button" variant="ghost"
                onClick={() => void signIn(a.email, a.password)}
              >
                {a.label}
              </Button>
            ))}
          </div>
        </div>
      )}
    </main>
  )
}
