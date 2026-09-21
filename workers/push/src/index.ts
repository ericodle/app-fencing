/// <reference types="@cloudflare/workers-types" />

// The daily job, and the admin broadcast endpoint.
//
// Runs on a cron: open the polls for sessions coming up, nudge whoever has not
// answered, remind everyone about tomorrow, and close the polls whose deadline
// has passed. The decisions are in pure.ts and tested there; this file is the
// plumbing around them — fetch, Web Push, and the de-duplication table.
//
// It holds the SERVICE ROLE key, so it bypasses RLS entirely. Everything it
// reads it reads on behalf of the club rather than a member, which is why it
// runs here and not in the browser.

import { buildPushPayload } from '@block65/webcrypto-web-push'
import {
  sessionsNeedingPolls, pollsToClose, unanswered, sessionsTomorrow,
  clubToday, pollOpenedNotification, reminderNotification,
  type SessionRow, type PollRow, type Notification,
} from './pure'

interface Env {
  SUPABASE_URL: string
  SUPABASE_SERVICE_ROLE_KEY: string
  VAPID_PUBLIC_KEY: string
  VAPID_PRIVATE_KEY: string
  VAPID_SUBJECT: string
  ADMIN_TRIGGER_SECRET: string
  APP_URL?: string
  CLUB_TIMEZONE?: string
  // The worker is its own wrangler package and cannot import piste.config.ts,
  // so the three values it needs from the club's identity arrive as vars. Set
  // them in wrangler.toml — they are configuration, not secrets.
  CLUB_NAME?: string
}

interface Subscription {
  id: string
  member_id: string
  endpoint: string
  p256dh: string
  auth: string
}

export default {
  async scheduled(_event: ScheduledController, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(runDailyJob(env))
  },

  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)

    // Bearer-gated, because this endpoint sends a notification to every member
    // of the club and there is no undo.
    if (url.pathname === '/broadcast' && request.method === 'POST') {
      const auth = request.headers.get('authorization')
      if (auth !== `Bearer ${env.ADMIN_TRIGGER_SECRET}`) {
        return new Response('no', { status: 401 })
      }
      const body = await request.json<{ title?: string; body?: string; url?: string }>()
      const sent = await broadcast(env, {
        title: body.title ?? clubName(env),
        body: body.body ?? '',
        url: body.url ?? appUrl(env),
      })
      return Response.json({ sent })
    }

    // Lets the daily job be run by hand, which is how it gets tested against a
    // real project without waiting a day for the cron.
    if (url.pathname === '/run' && request.method === 'POST') {
      const auth = request.headers.get('authorization')
      if (auth !== `Bearer ${env.ADMIN_TRIGGER_SECRET}`) {
        return new Response('no', { status: 401 })
      }
      return Response.json(await runDailyJob(env))
    }

    return new Response('piste-push', { status: 200 })
  },
}

const appUrl = (env: Env) => env.APP_URL ?? 'https://app.kuou.tw'
const clubName = (env: Env) => env.CLUB_NAME ?? 'Kuou Fencing Club'
const timeZone = (env: Env) => env.CLUB_TIMEZONE ?? 'Asia/Taipei'

async function runDailyJob(env: Env) {
  const now = new Date()
  const today = clubToday(now, timeZone(env))

  const [sessions, polls, members] = await Promise.all([
    select<SessionRow>(env, 'events',
      'id,kind,admin_title,display_title,start_date,start_time,course_days,cancelled_at,polls_attendance,meetup_open',
      `start_date=gte.${today}`),
    select<PollRow>(env, 'attendance_polls', 'id,event_id,status,closes_at'),
    select<{ id: string }>(env, 'profiles', 'id', 'status=eq.active'),
  ])

  const memberIds = members.map(m => m.id)
  const notifications: Notification[] = []

  // 1. Open polls for what is coming up.
  const needPolls = sessionsNeedingPolls(sessions, polls, today)
  for (const session of needPolls) {
    await insert(env, 'attendance_polls', {
      event_id: session.id,
      // Close the evening before, so the planner has a settled answer by the
      // time anyone needs to leave the house.
      closes_at: closesAt(session.start_date!, timeZone(env)),
    })
    for (const memberId of memberIds) {
      notifications.push(pollOpenedNotification(session, memberId, session.start_date!, appUrl(env)))
    }
  }

  // 2. Remind about tomorrow.
  for (const session of sessionsTomorrow(sessions, today)) {
    for (const memberId of memberIds) {
      notifications.push(reminderNotification(session, memberId, session.start_date!, appUrl(env)))
    }
  }

  // 3. Nudge whoever has not answered a poll that is about to close.
  const closing = polls.filter(p => p.status === 'open' && p.closes_at
    && new Date(p.closes_at).getTime() - now.getTime() < 36 * 3600 * 1000)
  for (const poll of closing) {
    const answers = await select<{ member_id: string }>(env, 'attendance_responses',
      'member_id', `poll_id=eq.${poll.id}`)
    const session = sessions.find(s => s.id === poll.event_id)
    if (!session?.start_date) continue
    for (const memberId of unanswered(memberIds, answers.map(a => a.member_id))) {
      notifications.push({
        ...pollOpenedNotification(session, memberId, session.start_date, appUrl(env)),
        kind: 'poll_closing',
        title: 'Still coming?',
      })
    }
  }

  // 4. Close what is past its deadline, so the planner's answer stops moving.
  const toClose = pollsToClose(polls, now)
  for (const poll of toClose) {
    await patch(env, 'attendance_polls', `id=eq.${poll.id}`, { status: 'closed' })
  }

  const sent = await deliver(env, notifications)
  return { today, pollsOpened: needPolls.length, pollsClosed: toClose.length, notified: sent }
}

/** 21:00 club-local the evening before the session. */
function closesAt(day: string, tz: string): string {
  const evening = new Date(`${day}T12:00:00Z`)
  evening.setUTCDate(evening.getUTCDate() - 1)
  const date = evening.toISOString().slice(0, 10)
  // Build the instant from the club's own offset rather than assuming one:
  // Taipei does not observe DST, but a fork elsewhere might.
  const offset = offsetMinutes(new Date(`${date}T12:00:00Z`), tz)
  const utc = new Date(`${date}T21:00:00Z`)
  utc.setUTCMinutes(utc.getUTCMinutes() - offset)
  return utc.toISOString()
}

function offsetMinutes(at: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone, hour12: false, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(at)
  const get = (type: string) => Number(parts.find(p => p.type === type)!.value)
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'))
  return Math.round((asUtc - at.getTime()) / 60000)
}

/**
 * Send, then record what was sent.
 *
 * The record comes second on purpose. If the send succeeds and the insert
 * fails, somebody gets a duplicate reminder tomorrow — annoying. If the insert
 * succeeded first and the send failed, they would get nothing at all and the
 * table would say they had been told. Of the two, the duplicate is the one to
 * choose.
 */
async function deliver(env: Env, notifications: Notification[]): Promise<number> {
  if (notifications.length === 0) return 0

  const memberIds = [...new Set(notifications.map(n => n.memberId))]
  const subscriptions = await select<Subscription>(env, 'push_subscriptions',
    'id,member_id,endpoint,p256dh,auth', `member_id=in.(${memberIds.join(',')})`)

  const byMember = new Map<string, Subscription[]>()
  for (const sub of subscriptions) {
    const list = byMember.get(sub.member_id)
    if (list) list.push(sub)
    else byMember.set(sub.member_id, [sub])
  }

  let sent = 0
  for (const notification of notifications) {
    // The de-duplication table has a unique index on
    // (member_id, kind, for_date, event_id); a conflict means this exact
    // notification already went out, so skip it rather than re-sending.
    const claimed = await insert(env, 'push_sent', {
      member_id: notification.memberId,
      kind: notification.kind,
      for_date: notification.forDate,
      event_id: notification.tag.startsWith('poll-') || notification.tag.startsWith('reminder-')
        ? notification.tag.split('-').slice(1).join('-')
        : null,
    })
    if (!claimed) continue

    for (const sub of byMember.get(notification.memberId) ?? []) {
      const ok = await push(env, sub, notification)
      if (ok) sent++
    }
  }
  return sent
}

async function broadcast(env: Env, message: { title: string; body: string; url: string }) {
  const subscriptions = await select<Subscription>(env, 'push_subscriptions',
    'id,member_id,endpoint,p256dh,auth')
  let sent = 0
  for (const sub of subscriptions) {
    const ok = await push(env, sub, { ...message, tag: 'broadcast', memberId: sub.member_id, kind: 'broadcast', forDate: '' })
    if (ok) sent++
  }
  return sent
}

async function push(env: Env, sub: Subscription, notification: Omit<Notification, 'forDate'> & { forDate?: string }) {
  try {
    const payload = await buildPushPayload(
      {
        data: JSON.stringify({
          title: notification.title,
          body: notification.body,
          url: notification.url,
          tag: notification.tag,
        }),
        options: { ttl: 60 * 60 * 20 },
      },
      { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
      { subject: env.VAPID_SUBJECT, publicKey: env.VAPID_PUBLIC_KEY, privateKey: env.VAPID_PRIVATE_KEY },
    )
    const response = await fetch(sub.endpoint, payload)

    // 404 and 410 mean the browser threw the subscription away — the phone was
    // wiped, the site data cleared. Keeping it would mean retrying a dead
    // endpoint every day forever.
    if (response.status === 404 || response.status === 410) {
      await del(env, 'push_subscriptions', `id=eq.${sub.id}`)
      return false
    }
    return response.ok
  } catch {
    return false
  }
}

// ── PostgREST, by hand ───────────────────────────────────────────────────────
// No supabase-js: the worker needs four verbs and a service-role header, and
// the client library is 40 kB of features this does not use.

function headers(env: Env, extra: Record<string, string> = {}) {
  return {
    apikey: env.SUPABASE_SERVICE_ROLE_KEY,
    authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
    'content-type': 'application/json',
    ...extra,
  }
}

async function select<T>(env: Env, table: string, columns: string, filter = ''): Promise<T[]> {
  const query = `select=${columns}${filter ? `&${filter}` : ''}`
  const response = await fetch(`${env.SUPABASE_URL}/rest/v1/${table}?${query}`, { headers: headers(env) })
  if (!response.ok) return []
  return response.json<T[]>()
}

/** True when the row went in, false on a conflict — which is how the
 *  de-duplication above is read. */
async function insert(env: Env, table: string, row: Record<string, unknown>): Promise<boolean> {
  const response = await fetch(`${env.SUPABASE_URL}/rest/v1/${table}`, {
    method: 'POST',
    headers: headers(env, { prefer: 'return=minimal' }),
    body: JSON.stringify(row),
  })
  return response.ok
}

async function patch(env: Env, table: string, filter: string, row: Record<string, unknown>) {
  await fetch(`${env.SUPABASE_URL}/rest/v1/${table}?${filter}`, {
    method: 'PATCH',
    headers: headers(env, { prefer: 'return=minimal' }),
    body: JSON.stringify(row),
  })
}

async function del(env: Env, table: string, filter: string) {
  await fetch(`${env.SUPABASE_URL}/rest/v1/${table}?${filter}`, {
    method: 'DELETE',
    headers: headers(env),
  })
}
