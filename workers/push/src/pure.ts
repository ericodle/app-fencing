// The worker's decisions, as pure functions.
//
// Split from index.ts because index.ts cannot be imported by Vitest — it pulls
// in Workers globals and an npm: specifier the test runner cannot resolve — and
// because these are the parts worth testing. "Which sessions need a poll
// opening" and "who has not answered" are questions with right answers; the
// fetch calls around them are plumbing.

export interface SessionRow {
  id: string
  kind: string
  admin_title: string
  display_title: string | null
  start_date: string | null
  start_time: string | null
  course_days: string[] | null
  cancelled_at: string | null
  polls_attendance: boolean | null
  meetup_open: boolean
}

export interface PollRow {
  id: string
  event_id: string
  status: string
  closes_at: string | null
}

/** The day a dated session runs on. Courses are excluded from the cron's work
 *  entirely — registration for the term already answers "are you coming". */
export function sessionDay(session: SessionRow): string | null {
  return session.course_days ? null : session.start_date
}

/**
 * Sessions that should have a poll opened today.
 *
 * `leadDays` is how far ahead to ask. Three is deliberately short: a poll open
 * for a fortnight collects answers from people who then forget they gave them,
 * and the planner is only as good as the answers being current.
 */
export function sessionsNeedingPolls(
  sessions: readonly SessionRow[],
  existingPolls: readonly PollRow[],
  today: string,
  leadDays = 3,
): SessionRow[] {
  const hasPoll = new Set(existingPolls.map(p => p.event_id))
  const horizon = addDays(today, leadDays)

  return sessions.filter(session => {
    if (session.cancelled_at) return false
    if (session.polls_attendance === false) return false
    const day = sessionDay(session)
    if (day === null) return false
    if (day < today || day > horizon) return false
    return !hasPoll.has(session.id)
  })
}

/** Polls whose deadline has passed and which are still marked open. The cron
 *  closes them so the planner's answer stops moving. */
export function pollsToClose(polls: readonly PollRow[], now: Date): PollRow[] {
  return polls.filter(p =>
    p.status === 'open' && p.closes_at !== null && new Date(p.closes_at) <= now)
}

/** Members who have not answered a poll yet. The list a nudge goes to. */
export function unanswered(
  memberIds: readonly string[],
  answeredBy: readonly string[],
): string[] {
  const answered = new Set(answeredBy)
  return memberIds.filter(id => !answered.has(id))
}

/** Sessions happening tomorrow, for the reminder. */
export function sessionsTomorrow(sessions: readonly SessionRow[], today: string): SessionRow[] {
  const tomorrow = addDays(today, 1)
  return sessions.filter(s => !s.cancelled_at && sessionDay(s) === tomorrow)
}

export function addDays(iso: string, days: number): string {
  const date = new Date(`${iso}T12:00:00Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

/** The club's calendar day, wherever the worker happens to be running. A cron
 *  fires in UTC and the club is not in UTC; getting this wrong sends Friday's
 *  reminder on Thursday evening. */
export function clubToday(now: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(now)
}

export interface Notification {
  memberId: string
  title: string
  body: string
  url: string
  tag: string
  kind: string
  forDate: string
}

export function pollOpenedNotification(session: SessionRow, memberId: string, day: string, appUrl: string): Notification {
  const title = session.display_title || session.admin_title
  return {
    memberId,
    title: 'Who is coming?',
    body: `${title} — say yes and the club will know to expect you.`,
    url: `${appUrl}/calendar/${session.id}`,
    // Tagged per session so a second nudge replaces the first rather than
    // stacking two identical rows in the tray.
    tag: `poll-${session.id}`,
    kind: 'poll_open',
    forDate: day,
  }
}

export function reminderNotification(session: SessionRow, memberId: string, day: string, appUrl: string): Notification {
  const title = session.display_title || session.admin_title
  const at = session.start_time ? ` at ${session.start_time.slice(0, 5)}` : ''
  return {
    memberId,
    title: 'Tomorrow',
    body: `${title}${at}.`,
    url: `${appUrl}/calendar/${session.id}`,
    tag: `reminder-${session.id}`,
    kind: 'session_reminder',
    forDate: day,
  }
}
