import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { FunctionsHttpError, type SupabaseClient } from '@supabase/supabase-js'
import { clientFor, anonClient, serviceClient } from '../helpers'
import type { Database } from '../../src/types/database'

// The create-member edge function, called the way the Manage screen calls it.
//
// The function holds the service-role key, so the only thing standing between
// a member and an account of their choosing is its own check of the caller.
// Every refusal is therefore asserted on the data too: no auth user, no
// profile, whatever the response said.

type Client = SupabaseClient<Database>

const service = serviceClient()
let admin: Client
let coach: Client
let fencer: Client

const run = Date.now()
const addressFor = (label: string) => `create-member-${label}-${run}@example.com`
const created: string[] = []

beforeAll(async () => {
  ;[admin, coach, fencer] = await Promise.all([clientFor('admin'), clientFor('coach'), clientFor('fencer')])
}, 30_000)

afterAll(async () => {
  for (const id of created) await service.auth.admin.deleteUser(id)
})

async function invoke(client: Client, body: Record<string, unknown>) {
  const { data, error } = await client.functions.invoke('create-member', { body })
  if (error instanceof FunctionsHttpError) {
    const response = error.context as Response
    return { status: response.status, body: await response.json() as Record<string, unknown> }
  }
  if (error) throw error
  return { status: 201, body: data as Record<string, unknown> }
}

async function profileByEmail(email: string) {
  const { data } = await service.from('profiles').select('*').eq('email', email).maybeSingle()
  return data
}

describe('create-member', () => {
  it('lets an admin create an active coach who can sign in straight away', async () => {
    const email = addressFor('coach')
    const result = await invoke(admin, { email, name: 'Yiling Test', role: 'coach', password: 'en-garde-8' })
    expect(result.status).toBe(201)
    created.push(result.body.id as string)

    const profile = await profileByEmail(email)
    expect(profile).toMatchObject({ name: 'Yiling Test', role: 'coach', status: 'active' })

    const fresh = anonClient()
    const { error } = await fresh.auth.signInWithPassword({ email, password: 'en-garde-8' })
    expect(error).toBeNull()

    const { data: audit } = await service.from('admin_audit_log').select('*')
      .eq('row_id', profile!.id).eq('table_name', 'profiles')
    expect(audit?.[0]).toMatchObject({ action: 'insert', actor_email: 'admin@admin.admin' })
    expect(JSON.stringify(audit)).not.toContain('en-garde-8')
  })

  it('refuses a coach, and creates nothing', async () => {
    const email = addressFor('by-coach')
    const result = await invoke(coach, { email, name: 'Nobody', password: 'en-garde-8' })
    expect(result.status).toBe(403)
    expect(await profileByEmail(email)).toBeNull()
  })

  it('refuses a fencer trying to mint an admin, and creates nothing', async () => {
    const email = addressFor('by-fencer')
    const result = await invoke(fencer, { email, name: 'Nobody', role: 'admin', password: 'en-garde-8' })
    expect(result.status).toBe(403)
    expect(await profileByEmail(email)).toBeNull()
  })

  it('refuses a caller with no session, and creates nothing', async () => {
    const email = addressFor('by-anon')
    const result = await invoke(anonClient(), { email, name: 'Nobody', password: 'en-garde-8' })
    expect(result.status).toBe(401)
    expect(await profileByEmail(email)).toBeNull()
  })

  it('reports an address that already has an account', async () => {
    const result = await invoke(admin, { email: 'fencer@fencer.fencer', name: 'Again', password: 'en-garde-8' })
    expect(result.status).toBe(409)
  })

  it('rejects a short password before touching Auth', async () => {
    const email = addressFor('short')
    const result = await invoke(admin, { email, name: 'Short', password: 'short' })
    expect(result.status).toBe(400)
    expect(await profileByEmail(email)).toBeNull()
  })
})
