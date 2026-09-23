import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { clientFor, serviceClient, ACCOUNTS } from '../helpers'
import { SUPABASE_URL, ANON_KEY } from '../setup.integration'
import type { Database } from '../../src/types/database'

// Waivers: what must be signed before a member can register, who may sign
// it, and that the record of a signature cannot be rewritten.
//
// A signature can never be deleted — not by an admin, not by the service role
// (the guard is a trigger, not a policy). So these tests sign as a member made
// fresh for this run, who is left in place: `npm run db:reset` clears them.

type Client = SupabaseClient<Database>
const service = serviceClient()
let admin: Client
let mei: Client
let fresh: Client
let freshId: string
const events: string[] = []

const inDays = (n: number) => {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

beforeAll(async () => {
  ;[admin, mei] = await Promise.all([clientFor('admin'), clientFor('fencer')])

  const email = `waiver-test-${Date.now()}@example.com`
  const { data, error } = await service.auth.admin.createUser({
    email, password: 'waiver-test-8', email_confirm: true, user_metadata: { name: 'Waiver Test' },
  })
  if (error) throw error
  freshId = data.user.id
  await service.from('profiles').update({ status: 'active', date_of_birth: '1990-01-01' }).eq('id', freshId)
  fresh = createClient<Database>(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
  await fresh.auth.signInWithPassword({ email, password: 'waiver-test-8' })
}, 30_000)

afterAll(async () => {
  await service.from('bookings').delete().in('event_id', events)
  await service.from('events').delete().in('id', events)
})

async function event(over: Record<string, unknown> = {}) {
  const { data, error } = await service.from('events')
    .insert({ kind: 'practice', admin_title: 'Waiver test', start_date: inDays(10), ...over })
    .select().single()
  if (error) throw error
  events.push(data.id)
  return data
}

async function current(code: string) {
  const { data } = await service.from('current_waivers').select('*').eq('code', code).single()
  return data!
}

describe('what a member must sign', () => {
  it('lists the waivers for the event kind, and not the guardian one for an adult', async () => {
    const e = await event()
    const { data } = await fresh.rpc('my_missing_waivers', { p_member_id: freshId, p_event_id: e.id })
    expect((data ?? []).map(w => w.code).sort()).toEqual(['liability', 'media'])
  })

  it('adds the guardian consent for somebody under 18', async () => {
    const e = await event()
    await service.from('profiles').update({ date_of_birth: inDays(-365 * 12) }).eq('id', freshId)
    const { data } = await admin.rpc('my_missing_waivers', { p_member_id: freshId, p_event_id: e.id })
    await service.from('profiles').update({ date_of_birth: '1990-01-01' }).eq('id', freshId)
    expect((data ?? []).map(w => w.code)).toContain('safeguarding')
  })

  it('answers only about yourself or your juniors', async () => {
    const e = await event()
    const { data } = await fresh.rpc('my_missing_waivers', { p_member_id: ACCOUNTS.lefty.id, p_event_id: e.id })
    expect(data ?? []).toEqual([])
  })

  it('refuses a registration until they are signed, and takes it after', async () => {
    const e = await event()
    const before = await fresh.from('bookings').insert({ event_id: e.id, member_id: freshId })
    expect(before.error?.message).toMatch(/sign the waivers/)

    for (const code of ['liability', 'media']) {
      const w = await current(code)
      const { error } = await fresh.rpc('sign_waiver', {
        p_waiver_id: w.id, p_member_id: freshId, p_signed_name: 'Waiver Test',
      })
      expect(error).toBeNull()
    }

    const after = await fresh.from('bookings').insert({ event_id: e.id, member_id: freshId }).select().single()
    expect(after.error).toBeNull()
    expect(after.data!.status).toBe('confirmed')
  })
})

describe('signing', () => {
  it('snapshots the text and its hash on the server', async () => {
    const w = await current('liability')
    const { data: sig } = await fresh.rpc('sign_waiver', {
      p_waiver_id: w.id, p_member_id: freshId, p_signed_name: '  Waiver Test  ',
    })
    expect(sig).toMatchObject({
      signed_name: 'Waiver Test', body_snapshot: w.body, waiver_code: 'liability',
      waiver_version: w.version, title_snapshot: w.title, method: 'e_signed', signed_by: freshId,
    })
    expect(sig!.content_sha256).toMatch(/^[0-9a-f]{64}$/)
  })

  it('refuses a blank name', async () => {
    const w = await current('media')
    const { error } = await fresh.rpc('sign_waiver', { p_waiver_id: w.id, p_member_id: freshId, p_signed_name: ' ' })
    expect(error?.message).toMatch(/full name/)
  })

  it('refuses signing for somebody who is not yours', async () => {
    const w = await current('media')
    const { error } = await fresh.rpc('sign_waiver', {
      p_waiver_id: w.id, p_member_id: ACCOUNTS.lefty.id, p_signed_name: 'Sam Reyes',
    })
    expect(error?.message).toMatch(/yourself or your own juniors/)
  })

  it('lets a parent sign the guardian consent for their junior, with the guardian named', async () => {
    const w = await current('safeguarding')
    const unnamed = await mei.rpc('sign_waiver', {
      p_waiver_id: w.id, p_member_id: ACCOUNTS.junior.id, p_signed_name: 'Kai Lin',
    })
    expect(unnamed.error?.message).toMatch(/guardian/)

    const { data, error } = await mei.rpc('sign_waiver', {
      p_waiver_id: w.id, p_member_id: ACCOUNTS.junior.id, p_signed_name: 'Kai Lin', p_guardian_name: 'Mei Lin',
    })
    expect(error).toBeNull()
    expect(data).toMatchObject({ member_id: ACCOUNTS.junior.id, guardian_name: 'Mei Lin', signed_by: ACCOUNTS.fencer.id })
  })

  it('does not accept a direct insert — the snapshot would be the client’s', async () => {
    const w = await current('media')
    await fresh.from('waiver_signatures').insert({
      waiver_id: w.id, member_id: freshId, signed_name: 'Forged', body_snapshot: 'Whatever I like',
      waiver_code: 'media', waiver_version: w.version,
    })
    const { data } = await service.from('waiver_signatures').select('id').eq('body_snapshot', 'Whatever I like')
    expect(data).toEqual([])
  })

  it('cannot be edited or deleted, even by the server', async () => {
    const { data: sig } = await service.from('waiver_signatures').select('id, signed_name')
      .eq('member_id', freshId).limit(1).single()
    const edit = await service.from('waiver_signatures').update({ signed_name: 'Someone else' }).eq('id', sig!.id)
    expect(edit.error?.message).toMatch(/cannot be changed/)
    const del = await service.from('waiver_signatures').delete().eq('id', sig!.id)
    expect(del.error?.message).toMatch(/cannot be changed/)
  })
})

describe('versions', () => {
  it('refuses an edit to a published waiver', async () => {
    const w = await current('media')
    const { error } = await admin.from('waivers').update({ body: 'Quietly different' }).eq('id', w.id)
    expect(error?.message).toMatch(/publish a new version/)
  })

  it('makes older signatures out of date when a new version is published', async () => {
    const old = await current('media')
    const e = await event({ kind: 'social' })
    const { data: versions } = await service.from('waivers').select('version').eq('code', 'media')
    const next = Math.max(...versions!.map(v => v.version)) + 1
    const { data: v2, error } = await admin.from('waivers').insert({
      code: 'media', version: next, title: old.title, body: `${old.body}\n\nRevised.`,
      applies_to: old.applies_to, published_at: new Date().toISOString(),
    }).select().single()
    expect(error).toBeNull()

    const { data } = await fresh.rpc('my_missing_waivers', { p_member_id: freshId, p_event_id: e.id })
    expect((data ?? []).map(w => w.id)).toContain(v2!.id)

    // Retire the new version so the rest of the suite sees the seeded one.
    await admin.from('waivers').update({ active: false }).eq('id', v2!.id)
  })
})

describe('paper forms', () => {
  it('can be recorded by an admin, and by nobody else', async () => {
    const w = await current('liability')
    const byMember = await mei.rpc('record_paper_waiver', {
      p_waiver_id: w.id, p_member_id: ACCOUNTS.fencer.id, p_signed_name: 'Mei Lin',
    })
    expect(byMember.error?.message).toMatch(/only an admin/)

    const { data, error } = await admin.rpc('record_paper_waiver', {
      p_waiver_id: w.id, p_member_id: freshId, p_signed_name: 'Waiver Test (paper)',
    })
    expect(error).toBeNull()
    expect(data).toMatchObject({ method: 'in_person', signed_by: ACCOUNTS.admin.id })
  })
})
