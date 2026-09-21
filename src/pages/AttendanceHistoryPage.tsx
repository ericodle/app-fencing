import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { formatDate } from '../lib/dates'
import { eventKindLabel, pollAnswerLabel } from '../lib/labels'
import { PageLoading } from '../components/ui/Spinner'
import { Plate } from '../components/ui/Plate'

// What this member said they would do, and when.
//
// Shows the answers, not the turnouts — the app records an RSVP, and nobody
// signs in at the door. Saying "you attended 14 sessions" from poll answers
// would be an invention, so the heading says "said yes" and means it.

interface HistoryRow {
  id: string
  response: string
  updated_at: string
  poll: {
    event: {
      id: string
      kind: string
      admin_title: string
      display_title: string | null
      start_date: string | null
    } | null
  } | null
}

export function AttendanceHistoryPage() {
  const { profile } = useAuth()
  const [rows, setRows] = useState<HistoryRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!profile) return
    let cancelled = false
    void (async () => {
      const { data } = await supabase
        .from('attendance_responses')
        .select('id, response, updated_at, poll:attendance_polls(event:events(id, kind, admin_title, display_title, start_date))')
        .eq('member_id', profile.id)
        .order('updated_at', { ascending: false })
        .limit(200)
      if (cancelled) return
      setRows((data ?? []) as unknown as HistoryRow[])
      setLoading(false)
    })()
    return () => { cancelled = true }
  }, [profile])

  if (loading) return <PageLoading />

  const said = (answer: string) => rows.filter(r => r.response === answer).length

  return (
    <Plate title="What you said">
      <p className="figures text-sm text-muted">
        <span className="text-signal-green">{said('yes')} yes</span>
        {' · '}{said('maybe')} maybe{' · '}{said('no')} no
      </p>
      <p className="mt-1 text-sm text-muted-dim">
        These are your answers to the attendance polls, not a record of who
        turned up — nobody signs in at the door.
      </p>

      {rows.length === 0 ? (
        <p className="mt-4 text-muted">Nothing yet.</p>
      ) : (
        <ul className="mt-4 flex flex-col border-t border-rule-faint pt-2">
          {rows.map(row => {
            const event = row.poll?.event
            return (
              <li key={row.id} className="flex flex-wrap items-baseline justify-between gap-2 border-b border-rule-faint py-1.5 text-sm last:border-b-0">
                <span className="flex items-baseline gap-2">
                  <span className={
                    row.response === 'yes' ? 'text-signal-green'
                    : row.response === 'maybe' ? 'text-signal-amber' : 'text-muted-dim'
                  }>
                    {pollAnswerLabel(row.response)}
                  </span>
                  {event ? (
                    <Link to={`/calendar/${event.id}`} className="text-paper hover:text-gold">
                      {event.display_title || event.admin_title}
                    </Link>
                  ) : (
                    <span className="text-muted-dim">A session that has since been removed</span>
                  )}
                </span>
                <span className="figures text-muted-dim">
                  {event && eventKindLabel(event.kind)}
                  {event?.start_date && ` · ${formatDate(event.start_date)}`}
                </span>
              </li>
            )
          })}
        </ul>
      )}
    </Plate>
  )
}
