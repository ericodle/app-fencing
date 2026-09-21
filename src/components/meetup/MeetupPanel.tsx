import { useMemo, useState } from 'react'
import { planMeetup, describeTradeoff, type Attendee, type CandidateVenue, type MeetupCandidate } from '../../lib/meetup'
import { meetupOptions } from '../../lib/attendance'
import { clubConfig } from '../../config/club'
import { t } from '../../i18n'
import { Plate } from '../ui/Plate'
import { Button } from '../ui/Button'
import { MeetupMap } from './MeetupMap'

// The meetup planner, rendered.
//
// The whole design decision of this panel: it shows TWO answers side by side
// and names what each one costs, rather than showing one number and calling it
// the answer. "Where is the most convenient place to meet" is an optimization
// question with an unstated objective, and the two reasonable objectives —
// least total travel, and shortest worst journey — routinely disagree by a
// couple of kilometers. Picking one silently would be making the club's
// decision for it while looking like arithmetic.
//
// The ranked venue list is below, because a club cannot fence at a coordinate.

export function MeetupPanel({
  attendees, venues, canChoose, chosenVenueId, onChoose,
}: {
  attendees: Attendee[]
  venues: CandidateVenue[]
  canChoose: boolean
  chosenVenueId?: string | null
  onChoose?: (candidate: MeetupCandidate) => void | Promise<void>
}) {
  const [objective, setObjective] = useState<'total' | 'fairest'>(clubConfig.meetup.objective)

  const plan = useMemo(
    () => planMeetup(attendees, venues, meetupOptions, objective),
    [attendees, venues, objective],
  )

  if (!plan.recommended) {
    return (
      <Plate title={t.meetup.title} edge="silver">
        <p className="text-muted">
          {plan.reason === 'too-few-respondents' && t.meetup.tooFew(meetupOptions.minRespondents)}
          {plan.reason === 'no-locations' && t.meetup.noLocations}
          {plan.reason === 'spread-too-wide' && t.meetup.spreadTooWide}
        </p>
        {plan.unlocated.length > 0 && (
          <p className="mt-3 text-sm text-muted-dim">
            {t.meetup.unlocated(plan.unlocated.map(u => u.name).join(', '))}
          </p>
        )}
      </Plate>
    )
  }

  const [total, fairest, centroid] = plan.idealPoints
  const highlighted = objective === 'total' ? total : fairest

  return (
    <Plate title={t.meetup.title} subtitle={t.meetup.subtitle} edge="gold">
      <MeetupMap
        attendees={attendees}
        ideal={{ total: total.point, fairest: fairest.point, centroid: centroid.point }}
        venues={plan.venues}
        highlight={plan.recommended}
      />

      {/* The two objectives, as a real choice rather than a hidden default. */}
      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <ObjectiveCard
          label={t.meetup.leastTravel}
          why={t.meetup.leastTravelWhy}
          candidate={total}
          selected={objective === 'total'}
          onSelect={() => setObjective('total')}
        />
        <ObjectiveCard
          label={t.meetup.fairest}
          why={t.meetup.fairestWhy}
          candidate={fairest}
          selected={objective === 'fairest'}
          onSelect={() => setObjective('fairest')}
        />
      </div>

      <details className="mt-3 text-sm text-muted-dim">
        <summary className="cursor-pointer hover:text-silver">{t.meetup.centroid}</summary>
        <p className="mt-2 leading-snug">{t.meetup.centroidWhy}</p>
        <p className="mt-1 figures">
          {t.meetup.totalTravel(centroid.summary.totalKm)} ·{' '}
          {t.meetup.longestJourney(centroid.summary.maxKm, centroid.summary.maxMinutes)}
        </p>
      </details>

      {/* Venues, ranked by whichever objective is selected. */}
      <div className="mt-6 border-t border-rule-faint pt-4">
        <h3 className="font-display text-sm uppercase tracking-widest text-silver">
          {t.meetup.venuesNearby}
        </h3>
        {plan.venues.length === 0 ? (
          <p className="mt-2 text-sm text-muted">{t.meetup.noVenuesNearby}</p>
        ) : (
          <ul className="mt-3 flex flex-col gap-2">
            {plan.venues.map((candidate, i) => (
              <VenueRow
                key={candidate.venue!.id}
                candidate={candidate}
                rank={i + 1}
                chosen={candidate.venue!.id === chosenVenueId}
                canChoose={canChoose}
                onChoose={onChoose}
              />
            ))}
          </ul>
        )}
      </div>

      {/* Everybody's journey to the current recommendation, worst first. The
          list that settles the argument, or starts it honestly. */}
      <details className="mt-5 border-t border-rule-faint pt-4">
        <summary className="cursor-pointer font-display text-sm uppercase tracking-widest text-silver hover:text-gold">
          {t.meetup.everyoneElse}
        </summary>
        <ul className="mt-3 flex flex-col gap-1 text-sm">
          {(plan.recommended.summary.journeys).map(j => {
            const attendee = attendees.find(a => a.memberId === j.memberId)
            return (
              <li key={j.memberId} className="flex items-baseline justify-between gap-3 border-b border-rule-faint py-1">
                <span className="text-paper">
                  {j.name}
                  {attendee?.originSource === 'response' && (
                    <span className="ml-2 text-xs text-gold-deep">{t.meetup.fromElsewhere}</span>
                  )}
                </span>
                <span className="figures shrink-0 text-muted">
                  {j.km.toFixed(1)} km · {j.minutes} min · {t.travelModes[j.travelMode]}
                </span>
              </li>
            )
          })}
        </ul>
      </details>

      {plan.unlocated.length > 0 && (
        <p className="mt-4 border-t border-rule-faint pt-3 text-sm text-signal-amber">
          {t.meetup.unlocated(plan.unlocated.map(u => u.name).join(', '))}
        </p>
      )}

      {describeTradeoff(highlighted) && (
        <p className="mt-4 border-l-2 border-gold-deep pl-3 text-sm text-muted">
          {describeTradeoff(highlighted)}
        </p>
      )}
    </Plate>
  )
}

function ObjectiveCard({
  label, why, candidate, selected, onSelect,
}: {
  label: string
  why: string
  candidate: MeetupCandidate
  selected: boolean
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={`flex flex-col items-start gap-2 border p-4 text-left transition-colors ${
        selected ? 'border-gold bg-ink-700' : 'border-rule hover:border-silver'
      }`}
    >
      <span className={`font-display text-sm uppercase tracking-widest ${selected ? 'text-gold' : 'text-silver'}`}>
        {label}
      </span>
      <span className="figures text-sm text-paper">
        {t.meetup.totalTravel(candidate.summary.totalKm)}
      </span>
      <span className="figures text-sm text-muted">
        {t.meetup.longestJourney(candidate.summary.maxKm, candidate.summary.maxMinutes)}
      </span>
      <span className="text-sm leading-snug text-muted-dim">{why}</span>
    </button>
  )
}

function VenueRow({
  candidate, rank, chosen, canChoose, onChoose,
}: {
  candidate: MeetupCandidate
  rank: number
  chosen: boolean
  canChoose: boolean
  onChoose?: (c: MeetupCandidate) => void | Promise<void>
}) {
  const venue = candidate.venue!
  return (
    <li className={`flex flex-wrap items-center justify-between gap-3 border p-3 ${
      chosen ? 'border-gold' : 'border-rule-faint'
    }`}>
      <div className="min-w-0">
        <p className="flex items-baseline gap-2">
          <span className="figures text-sm text-gold-deep">{rank}</span>
          <span className="text-paper">{venue.name}</span>
          {chosen && (
            <span className="bg-gold px-1.5 py-0.5 font-display text-[0.6rem] uppercase tracking-widest text-onyx">
              {t.meetup.chosen}
            </span>
          )}
        </p>
        <p className="figures mt-1 text-sm text-muted">
          {t.meetup.totalTravel(candidate.summary.totalKm)} ·{' '}
          {t.meetup.averageJourney(candidate.summary.meanKm)} ·{' '}
          {t.meetup.longestJourney(candidate.summary.maxKm, candidate.summary.maxMinutes)}
        </p>
        <p className="mt-1 text-xs text-muted-dim">
          {venue.indoor ? 'Indoor' : 'Outdoor'}
          {venue.hasScoring && ' · scoring on site'}
          {venue.capacity !== null && ` · holds ${venue.capacity}`}
        </p>
      </div>
      {canChoose && !chosen && onChoose && (
        <Button variant="ghost" onClick={() => void onChoose(candidate)}>
          {t.meetup.chooseThis}
        </Button>
      )}
    </li>
  )
}
