import { useAuth } from '../hooks/useAuth'
import { useClubContact } from '../hooks/useClubContact'
import { t } from '../i18n'
import { Logo } from '../components/Logo'
import { Button } from '../components/ui/Button'

// Where an account that is not yet active lands. Reachable with a session but
// outside RequireActive, which is the whole point of it.

export function PendingPage() {
  const { profile, signOut, refreshProfile } = useAuth()
  const { details, channels } = useClubContact()

  const rejected = profile?.status === 'rejected'
  const onHold = profile?.status === 'on_hold'
  const closed = profile?.status === 'closed'

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-6 px-4 py-10 text-center">
      <Logo size={160} className="mx-auto" />

      <div className="plate p-6">
        <h1 className="font-display text-xl text-gold">
          {rejected || closed ? 'This account is closed'
            : onHold ? 'This account is on hold'
            : t.auth.pendingTitle}
        </h1>
        <p className="mt-3 text-sm text-muted">
          {rejected || closed || onHold
            ? 'Get in touch with the club and a coach will sort it out.'
            : t.auth.pendingBody}
        </p>

        {(details?.email || channels.length > 0) && (
          <div className="mt-5 flex flex-wrap justify-center gap-3 border-t border-rule-faint pt-4 text-sm">
            {channels.map(c => (
              <a key={c.id} href={c.url ?? '#'} className="text-gold hover:text-gold-soft">
                {c.label}
              </a>
            ))}
            {details?.email && !channels.some(c => c.channel === 'email') && (
              <a href={`mailto:${details.email}`} className="text-gold hover:text-gold-soft">
                {details.email}
              </a>
            )}
          </div>
        )}
      </div>

      <div className="flex justify-center gap-3">
        {!rejected && !closed && (
          <Button variant="ghost" onClick={() => void refreshProfile()}>
            Check again
          </Button>
        )}
        <Button variant="ghost" onClick={() => void signOut()}>{t.common.signOut}</Button>
      </div>
    </main>
  )
}
