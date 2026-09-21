import { useState } from 'react'
import { t } from '../../i18n'
import { formatInstant, formatTime } from '../../lib/dates'
import { pollIsOpen, tally, type ResponseWithMember, type AnswerInput } from '../../lib/attendance'
import { pollAnswerLabel } from '../../lib/labels'
import { TRAVEL_MODES, type TravelMode } from '../../config/club'
import type { AttendancePoll, PollResponse } from '../../types/db'
import { Plate } from '../ui/Plate'
import { Button } from '../ui/Button'
import { Field, inputClass } from '../ui/Field'

// "Who is coming today?"
//
// The answer list is visible to every member, not just to staff. That is the
// feature, not an oversight: people decide whether to come based on who else
// will be there, and a headcount only the coach can see does not help anyone
// choose. The RLS policy on attendance_responses says the same thing.

export function PollPanel({
  poll, rows, memberId, onAnswer, onClose, canManage,
}: {
  poll: AttendancePoll
  rows: ResponseWithMember[]
  memberId: string
  onAnswer: (input: AnswerInput) => Promise<void>
  onClose?: () => Promise<void>
  canManage: boolean
}) {
  const open = pollIsOpen(poll)
  const mine = rows.find(r => r.response.member_id === memberId)?.response
  const counts = tally(rows)
  const [editing, setEditing] = useState(!mine)

  return (
    <Plate
      title={t.poll.title}
      subtitle={poll.question ?? undefined}
      edge="silver"
      actions={canManage && open && onClose ? (
        <Button variant="ghost" onClick={() => void onClose()}>{t.poll.close}</Button>
      ) : undefined}
    >
      <p className="figures text-sm text-muted">
        <span className="text-signal-green">{t.poll.yesCount(counts.yes + counts.guests)}</span>
        {counts.maybe > 0 && <> · {t.poll.maybeCount(counts.maybe)}</>}
        {counts.no > 0 && <> · {t.poll.noCount(counts.no)}</>}
        {counts.seatsOffered > 0 && <> · {t.poll.seats(counts.seatsOffered)} offered</>}
        {counts.needRide > 0 && <> · {counts.needRide} need a lift</>}
      </p>

      {open ? (
        poll.closes_at && (
          <p className="mt-1 text-sm text-muted-dim">{t.poll.closesAt(formatInstant(poll.closes_at))}</p>
        )
      ) : (
        <p className="mt-1 text-sm text-signal-amber">{t.poll.closed}</p>
      )}

      {open && (editing ? (
        <AnswerForm
          initial={mine}
          allowGuests={poll.allow_guests}
          onSubmit={async input => { await onAnswer(input); setEditing(false) }}
          onCancel={mine ? () => setEditing(false) : undefined}
        />
      ) : (
        <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-rule-faint pt-4">
          <span className="font-display text-xs uppercase tracking-widest text-silver">
            {t.poll.yourAnswer}
          </span>
          <span className={
            mine?.response === 'yes' ? 'text-signal-green'
            : mine?.response === 'maybe' ? 'text-signal-amber'
            : 'text-muted'
          }>
            {mine ? pollAnswerLabel(mine.response) : t.common.notSet}
          </span>
          <Button variant="ghost" onClick={() => setEditing(true)}>{t.poll.change}</Button>
        </div>
      ))}

      <AnswerList rows={rows} />
    </Plate>
  )
}

function AnswerForm({
  initial, allowGuests, onSubmit, onCancel,
}: {
  initial?: ResponseWithMember['response']
  allowGuests: boolean
  onSubmit: (input: AnswerInput) => Promise<void>
  onCancel?: () => void
}) {
  const [response, setResponse] = useState<PollResponse>(initial?.response as PollResponse ?? 'yes')
  const [arrivingAt, setArrivingAt] = useState(formatTime(initial?.arriving_at ?? null))
  const [guests, setGuests] = useState(initial?.guests ?? 0)
  const [travelMode, setTravelMode] = useState<TravelMode | ''>((initial?.travel_mode as TravelMode) ?? '')
  const [seats, setSeats] = useState(initial?.seats_offered ?? 0)
  const [needsRide, setNeedsRide] = useState(initial?.needs_ride ?? false)
  const [note, setNote] = useState(initial?.note ?? '')
  const [busy, setBusy] = useState(false)

  // Everything below the answer is about logistics, and none of it means
  // anything for somebody who is not coming. The DB refuses those combinations
  // outright; hiding the fields is how the member finds out before submitting.
  const coming = response !== 'no'

  return (
    <form
      className="mt-4 flex flex-col gap-4 border-t border-rule-faint pt-4"
      onSubmit={async e => {
        e.preventDefault()
        setBusy(true)
        await onSubmit({
          response,
          arrivingAt: coming && arrivingAt ? arrivingAt : null,
          guests: coming ? guests : 0,
          travelMode: travelMode || null,
          seatsOffered: coming ? seats : 0,
          needsRide: coming ? needsRide : false,
          note: note.trim() || null,
        })
        setBusy(false)
      }}
    >
      <fieldset>
        <legend className="mb-2 font-display text-xs uppercase tracking-widest text-silver">
          {t.poll.question}
        </legend>
        <div className="flex gap-2">
          {(['yes', 'maybe', 'no'] as const).map(value => (
            <button
              key={value}
              type="button"
              aria-pressed={response === value}
              onClick={() => setResponse(value)}
              className={`min-h-11 flex-1 border px-3 py-2 font-display text-sm uppercase tracking-wide transition-colors ${
                response === value
                  ? 'border-gold bg-gold text-onyx'
                  : 'border-rule text-silver hover:border-silver'
              }`}
            >
              {t.common[value]}
            </button>
          ))}
        </div>
      </fieldset>

      {coming && (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t.poll.arrivingAt} htmlFor="arriving">
              <input id="arriving" type="time" value={arrivingAt}
                     onChange={e => setArrivingAt(e.target.value)} className={inputClass} />
            </Field>
            <Field label={t.profile.travelMode} htmlFor="mode">
              <select id="mode" value={travelMode} className={inputClass}
                      onChange={e => setTravelMode(e.target.value as TravelMode | '')}>
                <option value="">{t.common.notSet}</option>
                {TRAVEL_MODES.map(m => <option key={m} value={m}>{t.travelModes[m]}</option>)}
              </select>
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            {allowGuests && (
              <Field label={t.poll.guests} htmlFor="guests">
                <input id="guests" type="number" min={0} max={10} value={guests}
                       onChange={e => setGuests(Number(e.target.value))} className={inputClass} />
              </Field>
            )}
            <Field label={t.poll.canDrive} htmlFor="seats">
              <input id="seats" type="number" min={0} max={8} value={seats}
                     onChange={e => setSeats(Number(e.target.value))} className={inputClass} />
            </Field>
          </div>

          <label className="flex items-center gap-2 text-sm text-paper">
            <input type="checkbox" checked={needsRide}
                   onChange={e => setNeedsRide(e.target.checked)} className="size-4" />
            {t.poll.needsRide}
          </label>
        </>
      )}

      <Field label={t.poll.noteLabel} htmlFor="note">
        <textarea id="note" rows={2} value={note}
                  onChange={e => setNote(e.target.value)} className={inputClass} />
      </Field>

      <div className="flex gap-2">
        <Button type="submit" busy={busy}>{t.common.save}</Button>
        {onCancel && <Button type="button" variant="ghost" onClick={onCancel}>{t.common.cancel}</Button>}
      </div>
    </form>
  )
}

function AnswerList({ rows }: { rows: ResponseWithMember[] }) {
  if (rows.length === 0) {
    return <p className="mt-4 border-t border-rule-faint pt-4 text-sm text-muted">{t.poll.noAnswers}</p>
  }

  const order: Record<string, number> = { yes: 0, maybe: 1, no: 2 }
  const sorted = [...rows].sort((a, b) =>
    (order[a.response.response] ?? 3) - (order[b.response.response] ?? 3)
    || (a.member.nickname ?? a.member.name ?? '').localeCompare(b.member.nickname ?? b.member.name ?? ''))

  return (
    <ul className="mt-4 flex flex-col border-t border-rule-faint pt-2">
      {sorted.map(({ response, member }) => (
        <li key={response.id} className="flex flex-wrap items-baseline justify-between gap-2 border-b border-rule-faint py-1.5 text-sm">
          <span className="flex items-baseline gap-2">
            <span
              aria-hidden="true"
              className={`inline-block size-2 ${
                response.response === 'yes' ? 'bg-signal-green'
                : response.response === 'maybe' ? 'bg-signal-amber'
                : 'bg-muted-dim'
              }`}
            />
            <span className={response.response === 'no' ? 'text-muted-dim line-through' : 'text-paper'}>
              {member.nickname || member.name || 'A member'}
            </span>
            {response.guests > 0 && <span className="text-muted">+{response.guests}</span>}
          </span>
          <span className="figures flex items-center gap-3 text-muted">
            {response.arriving_at && <span>from {formatTime(response.arriving_at)}</span>}
            {response.seats_offered > 0 && (
              <span className="text-signal-blue">{t.poll.seats(response.seats_offered)}</span>
            )}
            {response.needs_ride && <span className="text-signal-amber">{t.poll.needsRide}</span>}
          </span>
        </li>
      ))}
    </ul>
  )
}
