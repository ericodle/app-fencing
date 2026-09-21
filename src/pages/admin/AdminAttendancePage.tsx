import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth'
import { t } from '../../i18n'
import { clubConfig } from '../../config/club'
import { venueIsNegotiable, pollsAttendance, type EventKind } from '../../lib/event-kinds'
import { fetchUpcoming, titleFor, eventDays, type EventWithVenue } from '../../lib/events'
import { fetchResponses, attendeesFrom, tally, type ResponseWithMember } from '../../lib/attendance'
import { relativeDay, formatInstant } from '../../lib/dates'
import { eventKindLabel } from '../../lib/labels'
import type { Venue, MeetupSuggestion } from '../../types/db'
import type { CandidateVenue, MeetupCandidate } from '../../lib/meetup'
import { PageLoading } from '../../components/ui/Spinner'
import { Plate } from '../../components/ui/Plate'
import { Button } from '../../components/ui/Button'
import { MeetupPanel } from '../../components/meetup/MeetupPanel'

// The staff view of attendance: every upcoming session, whether it has a poll,
// how many have answered, and — for the sessions whose venue can actually move
// — the planner, inline.
//
// Inline rather than behind a link because the decision is made here: a coach
// on Friday night wants to see the six answers and pick the venue in one place,
// not navigate between them.

export function AdminAttendancePage() {
  const { profile } = useAuth()
  const [events, setEvents] = useState<EventWithVenue[]>([])
  const [venues, setVenues] = useState<Venue[]>([])
  const [expanded, setExpanded] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [polls, setPolls] = useState<Map<string, { pollId: string; counts: ReturnType<typeof tally>; closesAt: string | null }>>(new Map())

  const load = useCallback(async () => {
    const [upcoming, v] = await Promise.all([
      fetchUpcoming(20),
      supabase.from('venues').select('*').eq('status', 'active').order('name'),
    ])
    setEvents(upcoming)
    setVenues(v.data ?? [])

    const { data: pollRows } = await supabase.from('attendance_polls').select('*')
      .in('event_id', upcoming.map(e => e.id))
    const { data: tallyRows } = await supabase.from('attendance_tally').select('*')
      .in('event_id', upcoming.map(e => e.id))

    const byEvent = new Map<string, { pollId: string; counts: ReturnType<typeof tally>; closesAt: string | null }>()
    for (const poll of pollRows ?? []) {
      const row = (tallyRows ?? []).find(r => r.poll_id === poll.id)
      byEvent.set(poll.event_id, {
        pollId: poll.id,
        closesAt: poll.closes_at,
        counts: {
          yes: Number(row?.yes ?? 0), maybe: Number(row?.maybe ?? 0), no: Number(row?.no ?? 0),
          guests: Number(row?.guests ?? 0), seatsOffered: Number(row?.seats_offered ?? 0),
          needRide: Number(row?.needs_ride ?? 0),
        },
      })
    }
    setPolls(byEvent)
    setLoading(false)
  }, [])

  useEffect(() => { void load() }, [load])

  async function openPoll(eventId: string) {
    if (!profile) return
    await supabase.from('attendance_polls').insert({ event_id: eventId, created_by: profile.id })
    await load()
  }

  if (loading) return <PageLoading />

  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-display text-2xl text-gold">{t.admin.polls}</h1>

      {events.length === 0 ? (
        <Plate><p className="text-muted">{t.dashboard.nothingScheduled}</p></Plate>
      ) : (
        events.map(event => {
          const kind = event.kind as EventKind
          const poll = polls.get(event.id)
          const movable = clubConfig.features.meetupPlanner && venueIsNegotiable(kind) && event.meetup_open
          const open = expanded === event.id

          return (
            <Plate
              key={event.id}
              title={<Link to={`/calendar/${event.id}`} className="hover:text-gold">{titleFor(event)}</Link>}
              subtitle={`${eventKindLabel(event.kind)} · ${relativeDay(eventDays(event)[0])}${event.venue ? ` · ${event.venue.name}` : ''}`}
              edge={movable ? 'gold' : undefined}
              actions={
                poll ? (
                  movable && (
                    <Button variant="ghost" onClick={() => setExpanded(open ? null : event.id)}>
                      {open ? t.common.close : t.admin.meetup}
                    </Button>
                  )
                ) : pollsAttendance(kind) ? (
                  <Button onClick={() => void openPoll(event.id)}>{t.poll.open}</Button>
                ) : undefined
              }
            >
              {poll ? (
                <>
                  <p className="figures text-sm text-muted">
                    <span className="text-signal-green">{t.poll.yesCount(poll.counts.yes + poll.counts.guests)}</span>
                    {' · '}{t.poll.maybeCount(poll.counts.maybe)}
                    {' · '}{t.poll.noCount(poll.counts.no)}
                    {poll.counts.seatsOffered > 0 && ` · ${t.poll.seats(poll.counts.seatsOffered)} offered`}
                    {poll.counts.needRide > 0 && ` · ${poll.counts.needRide} need a lift`}
                  </p>
                  {poll.closesAt && (
                    <p className="text-sm text-muted-dim">{t.poll.closesAt(formatInstant(poll.closesAt))}</p>
                  )}
                  {open && movable && (
                    <div className="mt-4">
                      <InlinePlanner pollId={poll.pollId} eventId={event.id} venues={venues} onChosen={load} />
                    </div>
                  )}
                </>
              ) : (
                <p className="text-sm text-muted">
                  {pollsAttendance(kind)
                    ? 'No poll yet.'
                    : 'This kind of event does not take an attendance poll — registration answers it.'}
                </p>
              )}
            </Plate>
          )
        })
      )}
    </div>
  )
}

function InlinePlanner({ pollId, eventId, venues, onChosen }: {
  pollId: string
  eventId: string
  venues: Venue[]
  onChosen: () => Promise<void>
}) {
  const [rows, setRows] = useState<ResponseWithMember[] | null>(null)
  const [chosen, setChosen] = useState<MeetupSuggestion | null>(null)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const [responses, suggestion] = await Promise.all([
        fetchResponses(pollId),
        supabase.from('meetup_suggestions').select('*').eq('poll_id', pollId).eq('chosen', true).maybeSingle(),
      ])
      if (cancelled) return
      setRows(responses)
      setChosen(suggestion.data ?? null)
    })()
    return () => { cancelled = true }
  }, [pollId])

  if (!rows) return <PageLoading />

  const candidates: CandidateVenue[] = venues.map(v => ({
    id: v.id, name: v.name,
    point: { lat: Number(v.lat), lng: Number(v.lng) },
    kind: v.kind, capacity: v.capacity, indoor: v.indoor, hasScoring: v.has_scoring,
  }))

  async function choose(candidate: MeetupCandidate) {
    await supabase.from('meetup_suggestions').update({ chosen: false }).eq('poll_id', pollId)
    const { data } = await supabase.from('meetup_suggestions').insert({
      poll_id: pollId,
      method: candidate.venue ? 'venue' : candidate.method,
      lat: candidate.point.lat, lng: candidate.point.lng,
      venue_id: candidate.venue?.id ?? null,
      respondents: candidate.summary.respondents,
      total_km: candidate.summary.totalKm,
      max_km: candidate.summary.maxKm,
      mean_km: candidate.summary.meanKm,
      stddev_km: candidate.summary.stddevKm,
      max_minutes: candidate.summary.maxMinutes,
      chosen: true,
    }).select().single()
    setChosen(data)
    if (candidate.venue) {
      await supabase.from('events').update({ venue_id: candidate.venue.id }).eq('id', eventId)
    }
    await onChosen()
  }

  return (
    <MeetupPanel
      attendees={attendeesFrom(rows)}
      venues={candidates}
      canChoose
      chosenVenueId={chosen?.venue_id}
      onChoose={choose}
    />
  )
}
