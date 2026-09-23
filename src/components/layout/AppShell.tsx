import { NavLink, Outlet } from 'react-router-dom'
import { useState } from 'react'
import { useAuth } from '../../hooks/useAuth'
import { clubConfig } from '../../config/club'
import { t } from '../../i18n'
import { Logo } from '../Logo'
import { TermsBanner } from './TermsBanner'

// The member-facing chrome: a fixed header with the lockup, a nav that becomes
// a bottom bar on a phone, and the outlet.
//
// The bottom bar rather than a burger, because every item in it is somewhere a
// member goes mid-session with one hand — checking who is coming, recording a
// bout — and a menu that has to be opened first is a menu that does not get
// used on the floor.

const LINKS = [
  { to: '/dashboard', label: () => t.nav.dashboard },
  { to: '/calendar',  label: () => t.nav.calendar },
  { to: '/bookings',  label: () => t.nav.bookings },
  { to: '/roster',    label: () => t.nav.roster },
  { to: '/records',   label: () => t.nav.records },
  { to: '/profile',   label: () => t.nav.profile },
]

export function AppShell() {
  const { profile, signOut } = useAuth()
  const [signingOut, setSigningOut] = useState(false)
  const isStaff = profile?.role === 'admin' || profile?.role === 'coach'

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-20 border-b border-rule-faint bg-ink-900/95 backdrop-blur-none">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-4 px-4 py-3">
          <NavLink to="/dashboard" className="shrink-0">
            <Logo />
          </NavLink>

          <nav className="hidden items-center gap-1 sm:flex" aria-label="Main">
            {LINKS.map(link => (
              <NavLink
                key={link.to}
                to={link.to}
                className={({ isActive }) =>
                  `px-3 py-2 font-display text-xs uppercase tracking-widest transition-colors ${
                    isActive ? 'text-gold' : 'text-silver hover:text-paper'
                  }`
                }
              >
                {link.label()}
              </NavLink>
            ))}
            {isStaff && (
              <NavLink
                to="/manage"
                className={({ isActive }) =>
                  `ml-2 border px-3 py-2 font-display text-xs uppercase tracking-widest transition-colors ${
                    isActive ? 'border-gold text-gold' : 'border-rule text-silver hover:text-paper'
                  }`
                }
              >
                {t.nav.manage}
              </NavLink>
            )}
          </nav>

          <button
            type="button"
            onClick={() => { setSigningOut(true); void signOut() }}
            disabled={signingOut}
            className="shrink-0 font-display text-xs uppercase tracking-widest text-muted-dim hover:text-signal-red"
          >
            {t.common.signOut}
          </button>
        </div>
      </header>

      {/* pb-24 on small screens leaves room for the fixed bottom bar. */}
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 pt-6 pb-24 sm:pb-10">
        <TermsBanner />
        <Outlet />
      </main>

      <nav
        className="fixed inset-x-0 bottom-0 z-20 grid grid-cols-6 border-t border-rule-faint bg-ink-900 pb-[env(safe-area-inset-bottom)] sm:hidden"
        aria-label="Main"
      >
        {LINKS.map(link => (
          <NavLink
            key={link.to}
            to={link.to}
            className={({ isActive }) =>
              `flex min-h-14 items-center justify-center px-1 text-center font-display text-[0.62rem] uppercase tracking-wider transition-colors ${
                isActive ? 'text-gold' : 'text-silver-deep'
              }`
            }
          >
            {link.label()}
          </NavLink>
        ))}
      </nav>

      <footer className="hidden border-t border-rule-faint px-4 py-6 text-center text-sm text-muted-dim sm:block">
        {/* AGPL §13: anyone using this over a network is entitled to the source,
            so the link is part of the app rather than a thing to remember. */}
        <a href={clubConfig.urls.site} className="hover:text-silver">{clubConfig.identity.clubName}</a>
        <span className="px-2 text-rule">·</span>
        <a href="https://github.com/ericodle/app-fencing" className="hover:text-silver">Source</a>
      </footer>
    </div>
  )
}
