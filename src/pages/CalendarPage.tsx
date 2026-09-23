import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { t } from '../i18n'
import { EVENT_KINDS, type EventKind } from '../lib/event-kinds'
import { fetchMonth, eventDays, calendarTitleFor, type EventWithVenue } from '../lib/events'
import { formatTime, todayInClub } from '../lib/dates'
import { buildGrid } from '../lib/month-grid'
import { eventKindLabel } from '../lib/labels'
import { PageLoading } from '../components/ui/Spinner'
import { Plate } from '../components/ui/Plate'
import type { AttendanceTally } from '../types/db'

// A month grid plus the month's list.
//
// The grid is a real grid — seven columns, Monday first — rather than a list
// with headings, because "which Tuesdays am I free" is a shape question and a
// list cannot answer it. Past days stay on the grid, dimmed: a member looking
// at the 3rd on the 5th should see that it happened, not find a hole.
//
// Each kind takes a color, and the five are a genuine categorical spread rather
// than five tints of gold: weekly silver, cross-training blue, tournament gold,
// interclub green, social deep gold. Carried over from the marketing site's
// calendar so the two read the same.

const KIND_COLOR: Record<EventKind, string> = {
  practice:       'border-silver text-silver',
  course:         'border-silver-deep text-silver-deep',
  cross_training: 'border-signal-blue text-signal-blue',
  tournament:     'border-gold text-gold',
  interclub:      'border-signal-green text-signal-green',
  social:         'border-gold-deep text-gold-deep',
}

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

export function CalendarPage() {
  const today = todayInClub()
  const [cursor, setCursor] = useState(() => {
    const [y, m] = today.split('-').map(Number)
    return { year: y, month: m }
  })
  const [events, setEvents] = useState<EventWithVenue[]>([])
  const [tallies, setTallies] = useState<Map<string, AttendanceTally>>(new Map())
  const [kinds, setKinds] = useState<Set<EventKind>>(new Set(EVENT_KINDS))
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    void (async () => {
      const rows = await fetchMonth(cursor.year, cursor.month)
      if (cancelled) return
      setEvents(rows)
      const { data } = await supabase.from('attendance_tally').select('*')
        .in('event_id', rows.map(r => r.id))
      if (cancelled) return
      setTallies(new Map((data ?? [])
        .filter((d): d is AttendanceTally & { event_id: string } => d.event_id !== null)
        .map(d => [d.event_id, d])))
      setLoading(false)
    })()
    return () => { cancelled = true }
  }, [cursor])

  const visible = useMemo(
    () => events.filter(e => kinds.has(e.kind as EventKind)),
    [events, kinds])

  // day → events on it, so the grid is a lookup rather than a scan per cell.
  const byDay = useMemo(() => {
    const map = new Map<string, EventWithVenue[]>()
    for (const e of visible) {
      for (const day of eventDays(e)) {
        const list = map.get(day)
        if (list) list.push(e)
        else map.set(day, [e])
      }
    }
    return map
  }, [visible])

  const cells = useMemo(() => buildGrid(cursor.year, cursor.month), [cursor])

  function step(by: number) {
    setCursor(({ year, month }) => {
      const next = month + by
      if (next < 1) return { year: year - 1, month: 12 }
      if (next > 12) return { year: year + 1, month: 1 }
      return { year, month: next }
    })
  }

  const monthLabel = new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' })
    .format(new Date(Date.UTC(cursor.year, cursor.month - 1, 1)))

  return (
    <div className="flex flex-col gap-6">
      <header className="flex items-center justify-between gap-4">
        <h1 className="font-display text-2xl text-gold">{t.calendar.title}</h1>
        <div className="flex items-center gap-2">
          <button onClick={() => step(-1)} aria-label="Previous month"
                  className="min-h-11 px-3 text-silver hover:text-gold">←</button>
          <span className="min-w-40 text-center font-display text-sm uppercase tracking-widest text-paper">
            {monthLabel}
          </span>
          <button onClick={() => step(1)} aria-label="Next month"
                  className="min-h-11 px-3 text-silver hover:text-gold">→</button>
        </div>
      </header>

      <div className="flex flex-wrap gap-2">
        {EVENT_KINDS.map(kind => {
          const on = kinds.has(kind)
          return (
            <button
              key={kind}
              type="button"
              aria-pressed={on}
              onClick={() => setKinds(prev => {
                const next = new Set(prev)
                if (next.has(kind)) next.delete(kind); else next.add(kind)
                return next
              })}
              className={`border px-2.5 py-1 font-display text-[0.65rem] uppercase tracking-widest transition-opacity ${
                KIND_COLOR[kind]} ${on ? '' : 'opacity-35'}`}
            >
              {eventKindLabel(kind)}
            </button>
          )
        })}
      </div>

      {loading ? <PageLoading /> : (
        <>
          <div className="grid grid-cols-7 border border-rule-faint">
            {WEEKDAYS.map(d => (
              <div key={d} className="border-b border-rule-faint px-1 py-2 text-center font-display text-[0.6rem] uppercase tracking-widest text-silver-deep">
                {d}
              </div>
            ))}
            {cells.map(cell => (
              <div
                key={cell.day ?? `blank-${cell.index}`}
                className={`min-h-20 border-r border-b border-rule-faint p-1 last:border-r-0 ${
                  cell.day === today ? 'bg-ink-700' : ''
                } ${cell.day && cell.day < today ? 'opacity-50' : ''}`}
              >
                {cell.day && (
                  <>
                    <span className={`figures block text-right text-xs ${
                      cell.day === today ? 'text-gold' : 'text-muted-dim'}`}>
                      {Number(cell.day.slice(8))}
                    </span>
                    <ul className="mt-0.5 flex flex-col gap-0.5">
                      {(byDay.get(cell.day) ?? []).map(e => (
                        <li key={e.id}>
                          <Link
                            to={`/calendar/${e.id}`}
                            className={`block truncate border-l-2 pl-1 text-[0.68rem] leading-tight hover:underline ${
                              KIND_COLOR[e.kind as EventKind]
                            } ${e.cancelled_at ? 'line-through opacity-60' : ''}`}
                            title={calendarTitleFor(e)}
                          >
                            {e.start_time && (
                              <span className="figures mr-1 text-muted-dim">{formatTime(e.start_time)}</span>
                            )}
                            {calendarTitleFor(e)}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </div>
            ))}
          </div>

          <Plate title={monthLabel}>
            {visible.length === 0 ? (
              <p className="text-muted">{t.calendar.noEvents}</p>
            ) : (
              <ul className="flex flex-col">
                {visible.map(e => {
                  const tallyRow = tallies.get(e.id)
                  const day = eventDays(e)[0]
                  return (
                    <li key={e.id} className="border-b border-rule-faint py-2 last:border-b-0">
                      <Link to={`/calendar/${e.id}`} className="flex flex-wrap items-baseline justify-between gap-2 hover:text-gold">
                        <span className="flex items-baseline gap-2">
                          <span className={`font-display text-[0.6rem] uppercase tracking-widest ${KIND_COLOR[e.kind as EventKind]} border-0`}>
                            {eventKindLabel(e.kind)}
                          </span>
                          <span className={e.cancelled_at ? 'text-muted line-through' : 'text-paper'}>
                            {calendarTitleFor(e)}
                          </span>
                        </span>
                        <span className="figures text-sm text-muted">
                          {day && new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', timeZone: 'UTC' })
                            .format(new Date(`${day}T12:00:00Z`))}
                          {e.start_time && ` · ${formatTime(e.start_time)}`}
                          {e.venue?.name && ` · ${e.venue.name}`}
                          {tallyRow && Number(tallyRow.yes ?? 0) > 0 && (
                            <span className="ml-2 text-signal-green">
                              {t.poll.yesCount(Number(tallyRow.yes))}
                            </span>
                          )}
                        </span>
                      </Link>
                    </li>
                  )
                })}
              </ul>
            )}
          </Plate>
        </>
      )}
    </div>
  )
}
