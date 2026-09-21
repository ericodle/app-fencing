import { useCallback, useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { t } from '../i18n'
import { clubConfig } from '../config/club'
import { venueIsNegotiable, pollsAttendance, hasBouting, type EventKind } from '../lib/event-kinds'
import { fetchEvent, eventDays, titleFor, type EventWithVenue } from '../lib/events'
import { fetchPoll, fetchResponses, answerPoll, attendeesFrom, type ResponseWithMember, type AnswerInput } from '../lib/attendance'
import { formatDateLong, formatTimeRange, relativeDay } from '../lib/dates'
import { eventKindLabel, weaponListLabel } from '../lib/labels'
import type { AttendancePoll, Venue, MeetupSuggestion } from '../types/db'
import type { CandidateVenue, MeetupCandidate } from '../lib/meetup'
import { PageLoading } from '../components/ui/Spinner'
import { Plate } from '../components/ui/Plate'
import { Button } from '../components/ui/Button'
import { PollPanel } from '../components/attendance/PollPanel'
import { MeetupPanel } from '../components/meetup/MeetupPanel'

// One session: what it is, who is coming, and — for the kinds whose venue is
// actually negotiable — where the club should meet.
//
// The meetup planner is shown only when `venueIsNegotiable(kind)`. A tournament
// is at the organizer's hall and a course is in the club's own salle; neither
// moves because six people happen to live north this week, and offering to move
// them would be offering something the app cannot deliver.

export function EventDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { profile } = useAuth()
  const [event, setEvent] = useState<EventWithVenue | null>(null)
  const [poll, setPoll] = useState<AttendancePoll | null>(null)
  const [responses, setResponses] = useState<ResponseWithMember[]>([])
  const [venues, setVenues] = useState<Venue[]>([])
  const [chosen, setChosen] = useState<MeetupSuggestion | null>(null)
  const [loading, setLoading] = useState(true)

  const isStaff = profile?.role === 'admin' || profile?.role === 'coach'

  const load = useCallback(async () => {
    if (!id) return
    const [e, p, v] = await Promise.all([
      fetchEvent(id),
      fetchPoll(id),
      supabase.from('venues').select('*').eq('status', 'active').order('name'),
    ])
    setEvent(e)
    setPoll(p)
    setVenues(v.data ?? [])
    if (p) {
      const [rows, suggestion] = await Promise.all([
        fetchResponses(p.id),
        supabase.from('meetup_suggestions').select('*').eq('poll_id', p.id).eq('chosen', true).maybeSingle(),
      ])
      setResponses(rows)
      setChosen(suggestion.data ?? null)
    }
    setLoading(false)
  }, [id])

  useEffect(() => { void load() }, [load])

  if (loading) return <PageLoading />
  if (!event) return <p className="text-muted">{t.errors.notFound}</p>

  const kind = event.kind as EventKind
  const days = eventDays(event)
  const attendees = attendeesFrom(responses)
  const candidateVenues: CandidateVenue[] = venues.map(v => ({
    id: v.id,
    name: v.name,
    point: { lat: Number(v.lat), lng: Number(v.lng) },
    kind: v.kind,
    capacity: v.capacity,
    indoor: v.indoor,
    hasScoring: v.has_scoring,
  }))

  async function onAnswer(input: AnswerInput) {
    if (!poll || !profile) return
    await answerPoll(poll.id, profile.id, input)
    setResponses(await fetchResponses(poll.id))
  }

  async function closePoll() {
    if (!poll) return
    await supabase.from('attendance_polls').update({ status: 'closed' }).eq('id', poll.id)
    setPoll({ ...poll, status: 'closed' })
  }

  async function openPoll() {
    if (!event || !profile) return
    const { data } = await supabase.from('attendance_polls')
      .insert({ event_id: event.id, created_by: profile.id })
      .select().single()
    setPoll(data)
  }

  // Recording the club's decision. Stored rather than recomputed so the answer
  // cannot change under somebody's feet after it has been announced, and so
  // "where did we meet in October, and how far did people travel?" stays
  // answerable a year later.
  async function chooseMeetup(candidate: MeetupCandidate) {
    if (!poll || !event) return
    await supabase.from('meetup_suggestions').update({ chosen: false }).eq('poll_id', poll.id)
    const { data } = await supabase.from('meetup_suggestions').insert({
      poll_id: poll.id,
      method: candidate.venue ? 'venue' : candidate.method,
      lat: candidate.point.lat,
      lng: candidate.point.lng,
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

    // Moving the event's venue is the point of choosing one. The DB remembers
    // where it started, so the page can show the move rather than pretending
    // it was always there.
    if (candidate.venue) {
      await supabase.from('events').update({ venue_id: candidate.venue.id }).eq('id', event.id)
      await load()
    }
  }

  const mapQuery = event.venue?.map_query || event.venue?.address || event.venue?.name

  return (
    <div className="flex flex-col gap-6">
      <header>
        <Link to="/calendar" className="text-sm text-silver hover:text-gold">← {t.nav.calendar}</Link>
        <h1 className="mt-2 font-display text-2xl text-gold">{titleFor(event)}</h1>
        <p className="mt-1 flex flex-wrap items-baseline gap-x-3 text-muted">
          <span className="font-display text-xs uppercase tracking-widest text-gold-deep">
            {eventKindLabel(event.kind)}
          </span>
          {days.length > 0 && (
            <span>
              {days.length === 1
                ? formatDateLong(days[0])
                : `${days.length} days from ${formatDateLong(days[0])}`}
            </span>
          )}
          {event.start_time && <span className="figures">{formatTimeRange(event.start_time, event.end_time)}</span>}
          {days[0] && <span className="text-gold-deep">{relativeDay(days[0])}</span>}
        </p>
        {event.cancelled_at && (
          <p className="mt-2 border-l-2 border-signal-red pl-3 text-signal-red">
            {t.calendar.cancelled}
            {event.cancellation_reason && ` — ${event.cancellation_reason}`}
          </p>
        )}
      </header>

      <Plate>
        <dl className="grid gap-x-8 gap-y-3 sm:grid-cols-2">
          <Detail label={t.admin.venue}>
            {event.venue ? (
              <>
                <span className="text-paper">{event.venue.name}</span>
                {event.venue.native_name && (
                  <span className="ml-2 text-silver-deep">{event.venue.native_name}</span>
                )}
                {event.venue.address && (
                  <span className="block text-sm text-muted">{event.venue.address}</span>
                )}
                {mapQuery && (
                  <a
                    href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(mapQuery)}`}
                    target="_blank" rel="noreferrer"
                    className="mt-1 inline-block text-sm text-gold hover:text-gold-soft"
                  >
                    Open map
                  </a>
                )}
                {event.original_venue_id && event.original_venue_id !== event.venue_id && (
                  <span className="mt-1 block text-sm text-signal-amber">
                    {t.calendar.movedFrom(
                      venues.find(v => v.id === event.original_venue_id)?.name ?? 'the usual venue')}
                  </span>
                )}
              </>
            ) : (
              <span className="text-muted">{t.calendar.venueTbd}</span>
            )}
          </Detail>

          {event.weapons.length > 0 && (
            <Detail label={t.profile.weapons}>{weaponListLabel(event.weapons)}</Detail>
          )}
          {event.capacity !== null && (
            <Detail label="Capacity">
              <span className="figures">{event.capacity}</span>
            </Detail>
          )}
          {event.price !== null && (
            <Detail label="Price">
              <span className="figures">
                {event.price} {event.currency ?? clubConfig.locale.currency}
              </span>
            </Detail>
          )}
        </dl>

        {event.notes && <p className="mt-4 border-t border-rule-faint pt-4 text-muted">{event.notes}</p>}
        {event.included && (
          <p className="mt-2 text-sm text-muted-dim"><strong className="text-silver">Included:</strong> {event.included}</p>
        )}
        {event.prereqs && (
          <p className="mt-2 text-sm text-muted-dim"><strong className="text-silver">You need:</strong> {event.prereqs}</p>
        )}
      </Plate>

      {clubConfig.features.attendancePolls && pollsAttendance(kind) && (
        poll ? (
          <PollPanel
            poll={poll}
            rows={responses}
            memberId={profile!.id}
            onAnswer={onAnswer}
            onClose={isStaff ? closePoll : undefined}
            canManage={isStaff}
          />
        ) : isStaff ? (
          <Plate title={t.poll.title}>
            <p className="text-muted">No poll has been opened for this session yet.</p>
            <Button className="mt-3" onClick={() => void openPoll()}>{t.poll.open}</Button>
          </Plate>
        ) : null
      )}

      {clubConfig.features.meetupPlanner && venueIsNegotiable(kind) && event.meetup_open && poll && (
        <MeetupPanel
          attendees={attendees}
          venues={candidateVenues}
          canChoose={isStaff}
          chosenVenueId={chosen?.venue_id}
          onChoose={chooseMeetup}
        />
      )}

      {clubConfig.features.boutLog && hasBouting(kind) && (
        <Plate title={t.bouts.title}>
          <Link to={`/records/bouts/new?event=${event.id}`} className="text-gold hover:text-gold-soft">
            {t.bouts.add} →
          </Link>
        </Plate>
      )}
    </div>
  )
}

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="font-display text-xs uppercase tracking-widest text-silver">{label}</dt>
      <dd className="mt-0.5">{children}</dd>
    </div>
  )
}
