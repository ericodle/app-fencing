import { describe, it, expect } from 'vitest'
import { attendeesFrom, pollIsOpen, tally, type ResponseWithMember } from './attendance'
import type { AttendancePoll, AttendanceResponse } from '../types/db'

let n = 0
function row(
  over: Partial<AttendanceResponse> = {},
  member: Partial<ResponseWithMember['member']> = {},
): ResponseWithMember {
  const id = `m${++n}`
  return {
    response: {
      id: `r${n}`,
      created_at: '2026-09-01T00:00:00Z',
      updated_at: '2026-09-01T00:00:00Z',
      poll_id: 'p1',
      member_id: id,
      response: 'yes',
      arriving_at: null,
      leaving_at: null,
      guests: 0,
      origin_lat: null,
      origin_lng: null,
      origin_label: null,
      travel_mode: null,
      seats_offered: 0,
      needs_ride: false,
      note: null,
      ...over,
    } as AttendanceResponse,
    member: {
      id,
      name: 'Mei Lin',
      nickname: null,
      home_label: 'Daan',
      home_lat: 25.0263,
      home_lng: 121.5436,
      travel_mode: 'transit',
      ...member,
    },
  }
}

function poll(over: Partial<AttendancePoll> = {}): AttendancePoll {
  return {
    id: 'p1',
    created_at: '2026-09-01T00:00:00Z',
    updated_at: '2026-09-01T00:00:00Z',
    event_id: 'e1',
    question: null,
    opens_at: '2026-09-01T00:00:00Z',
    closes_at: null,
    status: 'open',
    allow_guests: true,
    created_by: null,
    ...over,
  } as AttendancePoll
}

describe('attendeesFrom', () => {
  it('counts only the people who said yes', () => {
    const attendees = attendeesFrom([
      row({ response: 'yes' }),
      row({ response: 'maybe' }),
      row({ response: 'no' }),
    ])
    expect(attendees).toHaveLength(1)
  })

  it('takes the home pin when the response gives no origin of its own', () => {
    const [a] = attendeesFrom([row({}, { home_lat: 25.1, home_lng: 121.5 })])
    expect(a.origin).toEqual({ lat: 25.1, lng: 121.5 })
    expect(a.originSource).toBe('home')
  })

  it('prefers a one-off origin on the response over the profile pin', () => {
    const [a] = attendeesFrom([
      row({ origin_lat: 25.06, origin_lng: 121.61, origin_label: 'The office' },
          { home_lat: 25.01, home_lng: 121.46 }),
    ])
    expect(a.origin).toEqual({ lat: 25.06, lng: 121.61 })
    expect(a.originSource).toBe('response')
  })

  it('marks somebody with no pin at all as unplaceable rather than guessing', () => {
    // NaN, not the club address: substituting a default would place them at
    // the answer and drag it toward the venue being questioned.
    const [a] = attendeesFrom([row({}, { home_lat: null, home_lng: null })])
    expect(Number.isFinite(a.origin.lat)).toBe(false)
    expect(Number.isFinite(a.origin.lng)).toBe(false)
  })

  it('takes the travel mode from the response, then the profile, then transit', () => {
    expect(attendeesFrom([row({ travel_mode: 'drive' }, { travel_mode: 'walk' })])[0].travelMode).toBe('drive')
    expect(attendeesFrom([row({}, { travel_mode: 'walk' })])[0].travelMode).toBe('walk')
    expect(attendeesFrom([row({}, { travel_mode: null })])[0].travelMode).toBe('transit')
  })

  it('counts guests into the party without inventing a second pin', () => {
    const [a] = attendeesFrom([row({ guests: 2 })])
    expect(a.partySize).toBe(3)
  })

  it('names somebody by their nickname if they have one', () => {
    expect(attendeesFrom([row({}, { nickname: 'Mei', name: 'Mei Lin' })])[0].name).toBe('Mei')
    expect(attendeesFrom([row({}, { nickname: null, name: 'Mei Lin' })])[0].name).toBe('Mei Lin')
    expect(attendeesFrom([row({}, { nickname: null, name: null })])[0].name).toBe('A member')
  })

  it('is empty when nobody said yes', () => {
    expect(attendeesFrom([row({ response: 'no' })])).toEqual([])
    expect(attendeesFrom([])).toEqual([])
  })
})

describe('pollIsOpen', () => {
  const now = new Date('2026-09-21T12:00:00Z')

  it('is open with no closing time', () => {
    expect(pollIsOpen(poll(), now)).toBe(true)
  })

  it('is open before the closing time and shut after it', () => {
    expect(pollIsOpen(poll({ closes_at: '2026-09-21T18:00:00Z' }), now)).toBe(true)
    expect(pollIsOpen(poll({ closes_at: '2026-09-21T06:00:00Z' }), now)).toBe(false)
  })

  it('is shut when an admin closed it, whatever the clock says', () => {
    expect(pollIsOpen(poll({ status: 'closed' }), now)).toBe(false)
  })

  it('is shut when there is no poll', () => {
    expect(pollIsOpen(null, now)).toBe(false)
  })

  it('treats the closing instant itself as shut', () => {
    expect(pollIsOpen(poll({ closes_at: '2026-09-21T12:00:00Z' }), now)).toBe(false)
  })
})

describe('tally', () => {
  it('counts each answer', () => {
    const t = tally([
      row({ response: 'yes' }), row({ response: 'yes' }),
      row({ response: 'maybe' }), row({ response: 'no' }),
    ])
    expect(t).toMatchObject({ yes: 2, maybe: 1, no: 1 })
  })

  it('counts guests only from people who are actually coming', () => {
    const t = tally([row({ response: 'yes', guests: 2 }), row({ response: 'maybe', guests: 5 })])
    expect(t.guests).toBe(2)
  })

  it('counts seats from yes and maybe, because a maybe who drives still might', () => {
    const t = tally([
      row({ response: 'yes', seats_offered: 3 }),
      row({ response: 'maybe', seats_offered: 2 }),
      row({ response: 'no', seats_offered: 0 }),
    ])
    expect(t.seatsOffered).toBe(5)
  })

  it('counts who needs a lift', () => {
    expect(tally([
      row({ response: 'yes', needs_ride: true }),
      row({ response: 'yes', needs_ride: false }),
    ]).needRide).toBe(1)
  })

  it('is all zeros for no answers', () => {
    expect(tally([])).toEqual({ yes: 0, maybe: 0, no: 0, guests: 0, seatsOffered: 0, needRide: 0 })
  })
})
