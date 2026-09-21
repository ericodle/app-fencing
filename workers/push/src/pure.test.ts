import { describe, it, expect } from 'vitest'
import {
  sessionDay, sessionsNeedingPolls, pollsToClose, unanswered, sessionsTomorrow,
  addDays, clubToday, pollOpenedNotification, reminderNotification,
  type SessionRow, type PollRow,
} from './pure'

let n = 0
const session = (over: Partial<SessionRow> = {}): SessionRow => ({
  id: `e${++n}`, kind: 'practice', admin_title: 'Open training', display_title: null,
  start_date: '2026-09-23', start_time: '19:00:00', course_days: null,
  cancelled_at: null, polls_attendance: null, meetup_open: false,
  ...over,
})

const poll = (over: Partial<PollRow> = {}): PollRow => ({
  id: `p${++n}`, event_id: 'e1', status: 'open', closes_at: null, ...over,
})

describe('addDays / clubToday', () => {
  it('walks the calendar, across months and years', () => {
    expect(addDays('2026-09-21', 3)).toBe('2026-09-24')
    expect(addDays('2026-09-30', 1)).toBe('2026-10-01')
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31')
  })

  it('gives the club’s day, not the cron’s', () => {
    // The cron fires at 22:00 UTC, which is already tomorrow morning in Taipei.
    // Getting this wrong sends Friday's reminder on Thursday.
    expect(clubToday(new Date('2026-09-20T22:00:00Z'), 'Asia/Taipei')).toBe('2026-09-21')
    expect(clubToday(new Date('2026-09-20T22:00:00Z'), 'UTC')).toBe('2026-09-20')
  })
})

describe('sessionDay', () => {
  it('is the start date for a dated session', () => {
    expect(sessionDay(session())).toBe('2026-09-23')
  })

  it('is null for a course, which the cron leaves alone', () => {
    expect(sessionDay(session({ course_days: ['2026-09-23'], start_date: null }))).toBeNull()
  })
})

describe('sessionsNeedingPolls', () => {
  const today = '2026-09-21'

  it('opens a poll for a session inside the lead window', () => {
    const needed = sessionsNeedingPolls([session({ start_date: '2026-09-23' })], [], today, 3)
    expect(needed).toHaveLength(1)
  })

  it('leaves one too far out alone', () => {
    expect(sessionsNeedingPolls([session({ start_date: '2026-10-15' })], [], today, 3)).toEqual([])
  })

  it('leaves one in the past alone', () => {
    expect(sessionsNeedingPolls([session({ start_date: '2026-09-20' })], [], today, 3)).toEqual([])
  })

  it('includes today, because a morning session is still worth asking about', () => {
    expect(sessionsNeedingPolls([session({ start_date: today })], [], today, 3)).toHaveLength(1)
  })

  it('skips one that already has a poll', () => {
    const s = session({ start_date: '2026-09-23' })
    expect(sessionsNeedingPolls([s], [poll({ event_id: s.id })], today, 3)).toEqual([])
  })

  it('skips a cancelled session', () => {
    expect(sessionsNeedingPolls(
      [session({ start_date: '2026-09-23', cancelled_at: '2026-09-21T00:00:00Z' })], [], today, 3),
    ).toEqual([])
  })

  it('honors an explicit "do not poll this one"', () => {
    expect(sessionsNeedingPolls(
      [session({ start_date: '2026-09-23', polls_attendance: false })], [], today, 3),
    ).toEqual([])
  })

  it('leaves courses out entirely — the term registration already answers it', () => {
    expect(sessionsNeedingPolls(
      [session({ kind: 'course', start_date: null, course_days: ['2026-09-23'] })], [], today, 3),
    ).toEqual([])
  })
})

describe('pollsToClose', () => {
  const now = new Date('2026-09-21T12:00:00Z')

  it('closes one whose deadline has passed', () => {
    expect(pollsToClose([poll({ closes_at: '2026-09-21T06:00:00Z' })], now)).toHaveLength(1)
  })

  it('leaves one still inside its window', () => {
    expect(pollsToClose([poll({ closes_at: '2026-09-21T18:00:00Z' })], now)).toEqual([])
  })

  it('leaves one with no deadline open indefinitely, as configured', () => {
    expect(pollsToClose([poll({ closes_at: null })], now)).toEqual([])
  })

  it('does not close an already-closed poll twice', () => {
    expect(pollsToClose([poll({ status: 'closed', closes_at: '2026-09-20T00:00:00Z' })], now)).toEqual([])
  })
})

describe('unanswered', () => {
  it('is everyone who has not replied', () => {
    expect(unanswered(['a', 'b', 'c'], ['b'])).toEqual(['a', 'c'])
  })

  it('is empty when everyone has', () => {
    expect(unanswered(['a', 'b'], ['a', 'b'])).toEqual([])
  })

  it('does not choke on an answer from somebody no longer on the roster', () => {
    expect(unanswered(['a'], ['a', 'gone'])).toEqual([])
  })
})

describe('sessionsTomorrow', () => {
  it('finds tomorrow and nothing else', () => {
    const rows = [
      session({ id: 'today', start_date: '2026-09-21' }),
      session({ id: 'tomorrow', start_date: '2026-09-22' }),
      session({ id: 'later', start_date: '2026-09-23' }),
    ]
    expect(sessionsTomorrow(rows, '2026-09-21').map(s => s.id)).toEqual(['tomorrow'])
  })

  it('skips a cancelled session', () => {
    expect(sessionsTomorrow(
      [session({ start_date: '2026-09-22', cancelled_at: '2026-09-21T00:00:00Z' })], '2026-09-21'),
    ).toEqual([])
  })
})

describe('the notifications', () => {
  it('links straight to the session, so the answer is one tap away', () => {
    const n = pollOpenedNotification(session({ id: 'abc' }), 'm1', '2026-09-23', 'https://app.example')
    expect(n.url).toBe('https://app.example/calendar/abc')
    expect(n.memberId).toBe('m1')
    expect(n.kind).toBe('poll_open')
  })

  it('tags per session, so a repeat replaces rather than stacks', () => {
    const a = pollOpenedNotification(session({ id: 'abc' }), 'm1', '2026-09-23', 'https://app.example')
    const b = pollOpenedNotification(session({ id: 'abc' }), 'm1', '2026-09-24', 'https://app.example')
    expect(a.tag).toBe(b.tag)
  })

  it('prefers the title members actually see', () => {
    const n = reminderNotification(
      session({ admin_title: 'Tue practice (staff)', display_title: 'Open training' }),
      'm1', '2026-09-22', 'https://app.example')
    expect(n.body).toContain('Open training')
    expect(n.body).not.toContain('staff')
  })

  it('mentions the time when there is one', () => {
    expect(reminderNotification(session({ start_time: '06:45:00' }), 'm1', '2026-09-22', 'x').body)
      .toContain('06:45')
    expect(reminderNotification(session({ start_time: null }), 'm1', '2026-09-22', 'x').body)
      .not.toContain('at ')
  })
})
