import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { t } from '../i18n'
import { clubConfig } from '../config/club'
import { fetchUpcoming, titleFor, eventDays, type EventWithVenue } from '../lib/events'
import { formatTimeRange, relativeDay } from '../lib/dates'
import { eventKindLabel } from '../lib/labels'
import { summarize, streaks, type BoutSide } from '../lib/bout-stats'
import { rowsToBoutSides } from '../lib/bouts'
import { PageLoading } from '../components/ui/Spinner'
import { Plate } from '../components/ui/Plate'
import type { AttendanceTally, BoutSideRow } from '../types/db'

// The first screen. Three questions, in the order a member asks them:
// what is next, has anyone asked me anything, and how am I going.

export function DashboardPage() {
  const { profile } = useAuth()
  const [events, setEvents] = useState<EventWithVenue[]>([])
  const [tallies, setTallies] = useState<Map<string, AttendanceTally>>(new Map())
  const [answered, setAnswered] = useState<Set<string>>(new Set())
  const [bouts, setBouts] = useState<BoutSide[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!profile) return
    let cancelled = false
    void (async () => {
      const upcoming = await fetchUpcoming(8)
      if (cancelled) return
      setEvents(upcoming)

      const [tallyRows, mine, boutRows] = await Promise.all([
        supabase.from('attendance_tally').select('*').in('event_id', upcoming.map(e => e.id)),
        supabase.from('attendance_responses').select('poll_id').eq('member_id', profile.id),
        supabase.from('bout_sides').select('*').eq('member_id', profile.id)
          .order('bouted_on', { ascending: false }).limit(60),
      ])
      if (cancelled) return

      setTallies(new Map((tallyRows.data ?? [])
        .filter((d): d is AttendanceTally & { event_id: string } => d.event_id !== null)
        .map(d => [d.event_id, d])))
      setAnswered(new Set((mine.data ?? []).map(r => r.poll_id)))
      setBouts(rowsToBoutSides((boutRows.data ?? []) as BoutSideRow[]))
      setLoading(false)
    })()
    return () => { cancelled = true }
  }, [profile])

  if (loading) return <PageLoading />

  const next = events[0]
  // A poll this member has not answered, on a session that has not happened.
  const waiting = events.filter(e => {
    const tallyRow = tallies.get(e.id)
    return tallyRow?.poll_id && !answered.has(tallyRow.poll_id)
  })

  const record = summarize(bouts)
  const streak = streaks(bouts)

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="font-display text-2xl text-gold">
          {t.dashboard.greeting(profile?.nickname || profile?.name || 'fencer')}
        </h1>
        <p className="text-sm text-muted">{clubConfig.identity.tagline}</p>
      </header>

      <Plate title={t.dashboard.nextSession} edge="gold">
        {next ? (
          <Link to={`/calendar/${next.id}`} className="group block">
            <p className="flex flex-wrap items-baseline gap-x-3">
              <span className="font-display text-xs uppercase tracking-widest text-gold-deep">
                {eventKindLabel(next.kind)}
              </span>
              <span className="text-lg text-paper group-hover:text-gold">{titleFor(next)}</span>
            </p>
            <p className="figures mt-1 text-muted">
              {relativeDay(eventDays(next)[0])}
              {next.start_time && ` · ${formatTimeRange(next.start_time, next.end_time)}`}
              {next.venue?.name && ` · ${next.venue.name}`}
            </p>
            {(() => {
              const tallyRow = tallies.get(next.id)
              return tallyRow && Number(tallyRow.yes ?? 0) > 0 ? (
                <p className="mt-1 text-sm text-signal-green">
                  {t.poll.yesCount(Number(tallyRow.yes) + Number(tallyRow.guests ?? 0))}
                </p>
              ) : null
            })()}
          </Link>
        ) : (
          <p className="text-muted">{t.dashboard.nothingScheduled}</p>
        )}
      </Plate>

      {waiting.length > 0 && (
        <Plate title={t.dashboard.openPolls} edge="silver">
          <ul className="flex flex-col">
            {waiting.map(e => (
              <li key={e.id} className="border-b border-rule-faint py-2 last:border-b-0">
                <Link to={`/calendar/${e.id}`} className="flex flex-wrap items-baseline justify-between gap-2 hover:text-gold">
                  <span className="text-paper">{titleFor(e)}</span>
                  <span className="figures text-sm text-muted">{relativeDay(eventDays(e)[0])}</span>
                </Link>
              </li>
            ))}
          </ul>
        </Plate>
      )}

      {clubConfig.features.boutLog && (
        <Plate
          title={t.dashboard.yourForm}
          actions={<Link to="/records/bouts" className="text-sm text-gold hover:text-gold-soft">{t.bouts.title} →</Link>}
        >
          {record.bouts === 0 ? (
            <p className="text-muted">{t.dashboard.noBoutsYet}</p>
          ) : (
            <div className="flex flex-wrap gap-x-8 gap-y-3">
              <Stat label={t.bouts.title} value={t.bouts.record(record.wins, record.losses, record.ties)} />
              <Stat label="Win rate" value={t.bouts.winRate(record.winRate)} />
              <Stat label="Indicator" value={t.bouts.indicator(record.indicator)} />
              <Stat label="Streak" value={t.bouts.currentStreak(streak.current)} />
            </div>
          )}
        </Plate>
      )}
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="font-display text-xs uppercase tracking-widest text-silver">{label}</p>
      <p className="figures text-lg text-paper">{value}</p>
    </div>
  )
}
