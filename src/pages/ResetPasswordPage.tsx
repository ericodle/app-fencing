import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase, authCallbackParams } from '../lib/supabase'
import { t } from '../i18n'
import { Button } from '../components/ui/Button'
import { Field, inputClass } from '../components/ui/Field'
import { PageLoading } from '../components/ui/Spinner'

// Where a recovery link lands.
//
// The params were snapshotted at module load in lib/supabase.ts, before the
// client's detectSessionInUrl stripped them — without that this page cannot
// tell a burned link from a direct visit and hangs on "Verifying…". The common
// cause of a burned link is not the member: it is a mail security scanner that
// pre-fetched the URL and consumed the one-time token before anyone clicked it.

type State = 'verifying' | 'ready' | 'expired'

export function ResetPasswordPage() {
  const navigate = useNavigate()
  const [state, setState] = useState<State>('verifying')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    const { tokenHash, type, error: cbError } = authCallbackParams
    if (cbError) { setState('expired'); return }

    if (tokenHash && type === 'recovery') {
      void supabase.auth
        .verifyOtp({ token_hash: tokenHash, type: 'recovery' })
        .then(({ error }) => setState(error ? 'expired' : 'ready'))
      return
    }

    // No token in the URL: either a PKCE link the client already exchanged, or
    // somebody who navigated here directly. A live session means the former.
    void supabase.auth.getSession().then(({ data }) =>
      setState(data.session ? 'ready' : 'expired'))
  }, [])

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    const { error } = await supabase.auth.updateUser({ password })
    if (error) { setError(error.message); setBusy(false); return }
    void navigate('/dashboard', { replace: true })
  }

  if (state === 'verifying') return <PageLoading />

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-6 px-4 py-10">
      {state === 'expired' ? (
        <div className="plate p-6 text-center">
          <h1 className="font-display text-xl text-gold">That link has expired</h1>
          <p className="mt-3 text-sm text-muted">
            Reset links can only be used once, and some email systems open them
            automatically before you do. Ask for a fresh one.
          </p>
          <Button className="mt-4" variant="ghost" onClick={() => void navigate('/forgot-password')}>
            Send another
          </Button>
        </div>
      ) : (
        <form onSubmit={onSubmit} className="plate flex flex-col gap-4 p-6">
          <h1 className="font-display text-xl text-gold">Choose a new password</h1>
          <Field label={t.auth.passwordLabel} htmlFor="password" help="At least eight characters.">
            <input
              id="password" type="password" required minLength={8} autoComplete="new-password"
              value={password} onChange={e => setPassword(e.target.value)}
              className={inputClass}
            />
          </Field>
          {error && <p role="alert" className="text-sm text-signal-red">{error}</p>}
          <Button type="submit" busy={busy}>{t.common.save}</Button>
        </form>
      )}
    </main>
  )
}
