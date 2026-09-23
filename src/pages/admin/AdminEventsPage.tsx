import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth'
import { t } from '../../i18n'
import { fetchForAdmin, titleFor, eventDays, hasFinished, type EventWithVenue } from '../../lib/events'
import { relativeDay, formatTimeRange } from '../../lib/dates'
import { eventKindLabel } from '../../lib/labels'
import { formatMoney } from '../../lib/money'
import { PageLoading } from '../../components/ui/Spinner'
import { Plate } from '../../components/ui/Plate'
import { Button } from '../../components/ui/Button'
import { EventForm } from '../../components/admin/EventForm'
import type { Venue, Price, CancellationPolicy } from '../../types/db'

// Every event from the last month on: what it is, how full, what it costs.
// Opening one goes to its registrations, where the money is.

export function AdminEventsPage() {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const [events, setEvents] = useState<EventWithVenue[]>([])
  const [taken, setTaken] = useState<Map<string, number>>(new Map())
  const [venues, setVenues] = useState<Venue[]>([])
  const [prices, setPrices] = useState<Price[]>([])
  const [policies, setPolicies] = useState<CancellationPolicy[]>([])
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState(false)

  const load = useCallback(async () => {
    const [rows, v, p, c] = await Promise.all([
      fetchForAdmin(),
      supabase.from('venues').select('*').order('name'),
      supabase.from('prices').select('*').order('sort_order'),
      supabase.from('cancellation_policies').select('*').order('title'),
    ])
    const { data: places } = await supabase.rpc('event_places_taken', { p_event_ids: rows.map(e => e.id) })
    setEvents(rows)
    setTaken(new Map((places ?? []).map(r => [r.event_id, r.taken])))
    setVenues(v.data ?? [])
    setPrices(p.data ?? [])
    setPolicies(c.data ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { void load() }, [load])

  if (loading) return <PageLoading />
  const isAdmin = profile?.role === 'admin'
  const priceOf = (id: string | null) => prices.find(p => p.id === id)

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-baseline justify-between gap-3">
        <h1 className="font-display text-2xl text-gold">{t.admin.events}</h1>
        {isAdmin && (
          <Button onClick={() => setAdding(v => !v)}>
            {adding ? t.common.cancel : 'Add an event'}
          </Button>
        )}
      </div>

      {adding && (
        <EventForm
          venues={venues} prices={prices} policies={policies} createdBy={profile!.id}
          onDone={async saved => {
            setAdding(false)
            if (saved) void navigate(`/manage/events/${saved.id}`)
          }}
        />
      )}

      <Plate>
        {events.length === 0 ? (
          <p className="text-muted">{t.dashboard.nothingScheduled}</p>
        ) : (
          <ul className="flex flex-col">
            {events.map(e => {
              const price = priceOf(e.price_id)
              const n = taken.get(e.id) ?? 0
              const faded = e.cancelled_at || hasFinished(e)
              return (
                <li key={e.id} className={`flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-rule-faint py-2.5 last:border-b-0 ${faded ? 'opacity-60' : ''}`}>
                  <span className="min-w-0">
                    <Link to={`/manage/events/${e.id}`} className="text-paper hover:text-gold">{titleFor(e)}</Link>
                    <span className="ml-2 font-display text-[0.55rem] uppercase tracking-widest text-gold-deep">
                      {eventKindLabel(e.kind)}
                    </span>
                    {e.cancelled_at && (
                      <span className="ml-2 font-display text-[0.55rem] uppercase tracking-widest text-signal-red">
                        {t.calendar.cancelled}
                      </span>
                    )}
                    {!e.registration_open && !e.cancelled_at && (
                      <span className="ml-2 text-xs text-muted-dim">staff registration only</span>
                    )}
                  </span>
                  <span className="figures text-sm text-muted">
                    {relativeDay(eventDays(e)[0] ?? '')}
                    {e.start_time && ` · ${formatTimeRange(e.start_time, e.end_time)}`}
                    {e.venue?.name && ` · ${e.venue.name}`}
                    {` · ${price ? formatMoney(price.amount) : 'free'}`}
                    {` · ${n}${e.capacity !== null ? `/${e.capacity}` : ''} registered`}
                  </span>
                </li>
              )
            })}
          </ul>
        )}
      </Plate>
    </div>
  )
}
