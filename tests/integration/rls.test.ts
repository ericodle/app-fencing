import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { clientFor, anonClient, serviceClient, ACCOUNTS } from '../helpers'
import type { Database } from '../../src/types/database'

// What each role can actually see and change.
//
// Every assertion here goes through a real signed-in client, because RLS is
// evaluated from the JWT — a service-role client sails past all of it, and a
// test written with one proves nothing about the policy it claims to test.

type Client = SupabaseClient<Database>

let fencer: Client
let lefty: Client
let coach: Client
let admin: Client
let pending: Client
const anon = anonClient()
const service = serviceClient()

beforeAll(async () => {
  ;[fencer, lefty, coach, admin, pending] = await Promise.all([
    clientFor('fencer'), clientFor('lefty'), clientFor('coach'),
    clientFor('admin'), clientFor('pending'),
  ])
}, 30_000)

describe('anonymous access', () => {
  it('reads nothing from profiles', async () => {
    const { data } = await anon.from('profiles').select('*')
    expect(data ?? []).toEqual([])
  })

  it('reads nothing from bouts, polls or fitness tests', async () => {
    for (const table of ['bouts', 'attendance_polls', 'fitness_tests'] as const) {
      const { data } = await anon.from(table).select('*')
      expect(data ?? [], `${table} leaked to anon`).toEqual([])
    }
  })

  it('can read the club contact details, which is deliberate', async () => {
    // A pending applicant whose application has gone wrong needs these
    // precisely when they cannot sign in, and they are on the public website.
    const { data } = await anon.from('club_contact').select('*')
    expect(data?.length).toBe(1)
  })

  it('cannot write anything', async () => {
    const { error } = await anon.from('venues').insert({ name: 'Nope', lat: 25, lng: 121 })
    expect(error).not.toBeNull()
  })
})

describe('a pending account', () => {
  it('sees its own profile but not the roster', async () => {
    const own = await pending.from('profiles').select('*').eq('id', ACCOUNTS.pending.id)
    expect(own.data?.length).toBe(1)

    const others = await pending.from('profiles').select('*').neq('id', ACCOUNTS.pending.id)
    expect(others.data ?? []).toEqual([])
  })

  it('cannot answer a poll — is_active_user() gates the write', async () => {
    const { data: poll } = await service.from('attendance_polls').select('id').limit(1).single()
    const { error } = await pending.from('attendance_responses')
      .insert({ poll_id: poll!.id, member_id: ACCOUNTS.pending.id, response: 'yes' })
    expect(error).not.toBeNull()
  })
})

describe('an active member', () => {
  it('sees the roster', async () => {
    const { data } = await fencer.from('roster').select('*')
    expect((data ?? []).length).toBeGreaterThan(2)
  })

  it('does not get medical notes or ID numbers through the roster view', async () => {
    const { data } = await fencer.from('roster').select('*').limit(1).single()
    expect(data).not.toHaveProperty('medical_notes')
    expect(data).not.toHaveProperty('id_number')
    expect(data).not.toHaveProperty('emergency_contact_phone')
    expect(data).not.toHaveProperty('date_of_birth')
    expect(data).not.toHaveProperty('home_lat')
  })

  it('cannot promote itself to admin', async () => {
    const { error } = await fencer.from('profiles')
      .update({ role: 'admin' }).eq('id', ACCOUNTS.fencer.id)
    expect(error?.message).toMatch(/set by an admin/)

    const { data } = await service.from('profiles').select('role').eq('id', ACCOUNTS.fencer.id).single()
    expect(data!.role).toBe('fencer')
  })

  it('cannot approve its own pending status', async () => {
    const { error } = await pending.from('profiles')
      .update({ status: 'active' }).eq('id', ACCOUNTS.pending.id)
    expect(error?.message).toMatch(/set by an admin/)
  })

  it('cannot adopt another account into its family', async () => {
    // Note what is asserted, and what is not.
    //
    // RLS does not raise here. The USING clause filters the row out of the
    // statement entirely, so the UPDATE matches zero rows and PostgREST
    // returns a cheerful 204. That is correct and it is also the failure mode
    // most likely to be mistaken for success by a test — so the assertion is
    // on the DATA, not on the error. "Refused loudly" and "silently changed
    // nothing" are both acceptable; "changed it" is not, and only a read-back
    // can tell the three apart.
    await fencer.from('profiles')
      .update({ parent_account: ACCOUNTS.fencer.id }).eq('id', ACCOUNTS.lefty.id)

    const { data } = await service.from('profiles')
      .select('parent_account').eq('id', ACCOUNTS.lefty.id).single()
    expect(data!.parent_account).toBeNull()
  })

  it('can edit its own athlete details', async () => {
    const { error } = await fencer.from('profiles')
      .update({ arm_span_cm: 172 }).eq('id', ACCOUNTS.fencer.id)
    expect(error).toBeNull()
    await service.from('profiles').update({ arm_span_cm: 171 }).eq('id', ACCOUNTS.fencer.id)
  })
})

describe('the family link', () => {
  it('lets a parent read the junior’s profile', async () => {
    const { data } = await fencer.from('profiles').select('*').eq('id', ACCOUNTS.junior.id)
    expect(data?.length).toBe(1)
  })

  it('lets a parent read the junior’s fitness tests', async () => {
    await service.from('fitness_tests').insert({
      fencer_id: ACCOUNTS.junior.id, tested_on: '2026-09-01',
      metric: 'lunge_length', value: 110, unit: 'cm',
    })
    const { data } = await fencer.from('fitness_tests').select('*').eq('fencer_id', ACCOUNTS.junior.id)
    expect((data ?? []).length).toBeGreaterThan(0)
    await service.from('fitness_tests').delete().eq('fencer_id', ACCOUNTS.junior.id)
  })

  it('does not let an unrelated member read them', async () => {
    await service.from('fitness_tests').insert({
      fencer_id: ACCOUNTS.junior.id, tested_on: '2026-09-01',
      metric: 'lunge_length', value: 110, unit: 'cm',
    })
    const { data } = await lefty.from('fitness_tests').select('*').eq('fencer_id', ACCOUNTS.junior.id)
    expect(data ?? []).toEqual([])
    await service.from('fitness_tests').delete().eq('fencer_id', ACCOUNTS.junior.id)
  })
})

describe('medical notes', () => {
  it('are readable by a coach', async () => {
    await service.from('profiles').update({ medical_notes: 'Asthma inhaler in her bag' })
      .eq('id', ACCOUNTS.fencer.id)
    const { data } = await coach.from('profiles').select('medical_notes').eq('id', ACCOUNTS.fencer.id).single()
    expect(data!.medical_notes).toMatch(/inhaler/)
  })

  it('are readable by the member themselves', async () => {
    const { data } = await fencer.from('profiles').select('medical_notes').eq('id', ACCOUNTS.fencer.id).single()
    expect(data!.medical_notes).toMatch(/inhaler/)
  })

  it('are NOT readable by another member, even though the roster is', async () => {
    // The row is visible — an active member sees active members — so the
    // protection has to come from the view the app actually reads. This is the
    // assertion that keeps that true.
    const { data } = await lefty.from('roster').select('*').eq('id', ACCOUNTS.fencer.id).single()
    expect(data).not.toHaveProperty('medical_notes')
  })
})

describe('coaching notes', () => {
  it('are visible to staff and invisible to the member they are about', async () => {
    const { data: note } = await coach.from('member_notes')
      .insert({ member_id: ACCOUNTS.fencer.id, author_id: ACCOUNTS.coach.id, body: 'Rushes the riposte.' })
      .select().single()
    expect(note).not.toBeNull()

    const asCoach = await coach.from('member_notes').select('*').eq('id', note!.id)
    expect(asCoach.data?.length).toBe(1)

    // A coach who has to weigh their words is writing something other than a
    // coaching note.
    const asMember = await fencer.from('member_notes').select('*').eq('id', note!.id)
    expect(asMember.data ?? []).toEqual([])

    await service.from('member_notes').delete().eq('id', note!.id)
  })

  it('freeze the author’s name, so deleting the author does not erase who said it', async () => {
    const { data: note } = await coach.from('member_notes')
      .insert({ member_id: ACCOUNTS.fencer.id, author_id: ACCOUNTS.coach.id, body: 'Good week.' })
      .select().single()
    expect(note!.author_name).toBe('Coach Ku')
    await service.from('member_notes').delete().eq('id', note!.id)
  })
})

describe('the audit log', () => {
  it('records an admin write', async () => {
    const { data: venue } = await admin.from('venues')
      .insert({ name: 'Audit test venue', lat: 25.05, lng: 121.55 }).select().single()

    const { data } = await admin.from('admin_audit_log').select('*')
      .eq('table_name', 'venues').eq('row_id', venue!.id)
    expect((data ?? []).length).toBeGreaterThan(0)
    expect(data![0].actor_email).toBe(ACCOUNTS.admin.email)

    await service.from('venues').delete().eq('id', venue!.id)
  })

  it('cannot be edited or deleted, by anybody', async () => {
    const { data: entry } = await service.from('admin_audit_log')
      .select('id, summary').limit(1).single()

    // An admin has SELECT on this table and no UPDATE policy at all, so the
    // statement matches nothing and returns no error. Read the row back rather
    // than trusting the absence of one.
    await admin.from('admin_audit_log').update({ summary: 'nothing to see' }).eq('id', entry!.id)
    const { data: after } = await service.from('admin_audit_log')
      .select('summary').eq('id', entry!.id).single()
    expect(after!.summary).toBe(entry!.summary)

    // The service role DOES bypass RLS, so its delete reaches the table and
    // meets the trigger — which is exactly why the guard is a trigger and not
    // a policy. A policy would have let this through.
    const deleted = await service.from('admin_audit_log').delete().eq('id', entry!.id)
    expect(deleted.error?.message).toMatch(/append-only/)

    const { count } = await service.from('admin_audit_log')
      .select('id', { count: 'exact', head: true }).eq('id', entry!.id)
    expect(count).toBe(1)
  })

  it('is invisible to a member', async () => {
    const { data } = await fencer.from('admin_audit_log').select('*')
    expect(data ?? []).toEqual([])
  })
})

afterAll(async () => {
  await service.from('profiles').update({ medical_notes: null }).eq('id', ACCOUNTS.fencer.id)
})
