import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import { t } from '../../i18n'
import { Logo } from '../Logo'

// Staff chrome. Deliberately a different shape from the member shell — a side
// rail rather than a bottom bar — so it is never ambiguous which side of the
// app you are looking at.

const LINKS = [
  { to: '/manage',           label: () => t.admin.title,        end: true },
  { to: '/manage/members',   label: () => t.admin.members,      adminOnly: false },
  { to: '/manage/events',    label: () => t.admin.events,       adminOnly: false },
  { to: '/manage/attendance',label: () => t.admin.polls,        adminOnly: false },
  { to: '/manage/venues',    label: () => t.admin.venues,       adminOnly: true },
  { to: '/manage/prices',    label: () => t.admin.prices,       adminOnly: true },
  { to: '/manage/audit',     label: () => t.admin.audit,        adminOnly: true },
]

export function AdminShell() {
  const { profile, signOut } = useAuth()
  const isAdmin = profile?.role === 'admin'
  const links = LINKS.filter(l => !l.adminOnly || isAdmin)

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="border-b border-rule-faint bg-ink-900">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-4 py-3">
          <NavLink to="/dashboard"><Logo /></NavLink>
          <span className="font-display text-xs uppercase tracking-[0.3em] text-gold-deep">
            {t.admin.title}
          </span>
          <button
            type="button"
            onClick={() => void signOut()}
            className="font-display text-xs uppercase tracking-widest text-muted-dim hover:text-signal-red"
          >
            {t.common.signOut}
          </button>
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-4 py-6 md:flex-row">
        <nav className="flex shrink-0 gap-1 overflow-x-auto border-b border-rule-faint pb-2 md:w-48 md:flex-col md:border-b-0 md:border-r md:pr-4 md:pb-0" aria-label="Manage">
          {links.map(link => (
            <NavLink
              key={link.to}
              to={link.to}
              end={link.end}
              className={({ isActive }) =>
                `whitespace-nowrap px-3 py-2 font-display text-xs uppercase tracking-widest transition-colors ${
                  isActive ? 'text-gold' : 'text-silver hover:text-paper'
                }`
              }
            >
              {link.label()}
            </NavLink>
          ))}
          <NavLink
            to="/dashboard"
            className="mt-auto whitespace-nowrap px-3 py-2 font-display text-xs uppercase tracking-widest text-muted-dim hover:text-paper"
          >
            ← {t.nav.dashboard}
          </NavLink>
        </nav>
        <main className="min-w-0 flex-1"><Outlet /></main>
      </div>
    </div>
  )
}
