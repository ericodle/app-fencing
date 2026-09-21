import { NavLink, Outlet } from 'react-router-dom'
import { clubConfig } from '../config/club'
import { t } from '../i18n'

// The member's own numbers, in three tabs, because they answer three different
// questions and nobody reads all three at once.

export function RecordsPage() {
  const tabs = [
    { to: '/records/bouts',   label: t.bouts.title,   on: clubConfig.features.boutLog },
    { to: '/records/results', label: t.results.title, on: clubConfig.features.competitionResults },
    { to: '/records/history', label: 'Attendance',    on: true },
  ].filter(tab => tab.on)

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="font-display text-2xl text-gold">{t.nav.records}</h1>
      </header>
      <nav className="flex gap-1 border-b border-rule-faint" aria-label="Records">
        {tabs.map(tab => (
          <NavLink
            key={tab.to}
            to={tab.to}
            className={({ isActive }) =>
              `-mb-px border-b-2 px-3 py-2 font-display text-xs uppercase tracking-widest transition-colors ${
                isActive ? 'border-gold text-gold' : 'border-transparent text-silver hover:text-paper'
              }`
            }
          >
            {tab.label}
          </NavLink>
        ))}
      </nav>
      <Outlet />
    </div>
  )
}
