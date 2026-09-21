import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth'
import { t } from '../../i18n'
import { Plate } from '../../components/ui/Plate'

// The manage landing page: cards for each area, each carrying a count when
// something is actually waiting on a decision.
//
// The counts are the point. A menu of eight identical cards tells a coach
// nothing about where to start; a menu where two of them say "3 waiting" tells
// them exactly.

interface Counts {
  applications: number
  openPolls: number
  upcoming: number
  discounts: number
}

export function ManagePage() {
  const { profile } = useAuth()
  const [counts, setCounts] = useState<Counts>({ applications: 0, openPolls: 0, upcoming: 0, discounts: 0 })
  const isAdmin = profile?.role === 'admin'

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const today = new Date().toISOString().slice(0, 10)
      const [apps, polls, events, discounts] = await Promise.all([
        supabase.from('profiles').select('id', { count: 'exact', head: true })
          .in('status', ['pending', 'on_hold']),
        supabase.from('attendance_polls').select('id', { count: 'exact', head: true })
          .eq('status', 'open'),
        supabase.from('events').select('id', { count: 'exact', head: true })
          .gte('start_date', today).is('cancelled_at', null),
        supabase.from('booking_discounts').select('id', { count: 'exact', head: true })
          .eq('status', 'requested'),
      ])
      if (cancelled) return
      setCounts({
        applications: apps.count ?? 0,
        openPolls: polls.count ?? 0,
        upcoming: events.count ?? 0,
        discounts: discounts.count ?? 0,
      })
    })()
    return () => { cancelled = true }
  }, [])

  const cards = [
    { to: '/manage/members',    label: t.admin.members,  count: counts.applications, note: 'Approve applications, change roles, put an account on hold.' },
    { to: '/manage/events',     label: t.admin.events,   count: counts.upcoming,     note: 'Put sessions, courses and competitions on the calendar.' },
    { to: '/manage/attendance', label: t.admin.polls,    count: counts.openPolls,    note: 'Open a poll, see who is coming, decide where to meet.' },
    { to: '/manage/venues',     label: t.admin.venues,   count: 0, adminOnly: true,  note: 'The places the club fences, and their coordinates.' },
    { to: '/manage/prices',     label: t.admin.prices,   count: counts.discounts, adminOnly: true, note: 'What the club charges, and the discounts it grants.' },
    { to: '/manage/audit',      label: t.admin.audit,    count: 0, adminOnly: true,  note: 'Every privileged write, appended and unalterable.' },
  ].filter(card => !card.adminOnly || isAdmin)

  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-display text-2xl text-gold">{t.admin.title}</h1>
      <div className="grid gap-4 sm:grid-cols-2">
        {cards.map(card => (
          <Link key={card.to} to={card.to} className="group">
            <Plate className="h-full transition-colors group-hover:border-gold">
              <div className="flex items-baseline justify-between gap-3">
                <h2 className="font-display text-lg text-paper group-hover:text-gold">{card.label}</h2>
                {card.count > 0 && (
                  <span className="figures bg-gold px-2 py-0.5 font-display text-xs text-onyx">
                    {card.count}
                  </span>
                )}
              </div>
              <p className="mt-2 text-sm text-muted">{card.note}</p>
            </Plate>
          </Link>
        ))}
      </div>
    </div>
  )
}
