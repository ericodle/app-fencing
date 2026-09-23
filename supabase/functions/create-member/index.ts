// Creates a member account on an admin's behalf: an Auth user with a password
// the admin chose, confirmed and active from the start, with the role set.
//
// The one flow the browser cannot do itself. Creating an Auth user for somebody
// else takes the service-role key, which bypasses every RLS policy and so can
// never be in the bundle. The caller's own token is what decides whether the
// request is allowed: it is checked against `is_admin()`, the same function
// every admin policy uses, so this cannot drift from the schema's idea of an
// admin.
//
// A password rather than an emailed invite: the project sends mail through
// Supabase's default sender, which only delivers to the project's own team.
// The admin hands the password over by message and the member changes it from
// their profile.

import { createClient } from 'npm:@supabase/supabase-js@2'
import { parseNewMember } from './new-member.ts'

const CORS = {
  // A bearer-token API with no cookies: an origin allow list would protect
  // nothing that the token check below does not already.
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function reply(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response(null, { headers: CORS })
  if (request.method !== 'POST') return reply(405, { error: 'POST only.' })

  const url = Deno.env.get('SUPABASE_URL')!
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

  const authorization = request.headers.get('Authorization') ?? ''
  const caller = createClient(url, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data: { user } } = await caller.auth.getUser(authorization.replace(/^Bearer\s+/i, ''))
  if (!user) return reply(401, { error: 'Sign in first.' })

  const { data: isAdmin } = await caller.rpc('is_admin')
  if (isAdmin !== true) return reply(403, { error: 'Only an admin can create accounts.' })

  const parsed = parseNewMember(await request.json().catch(() => null))
  if (!parsed.ok) return reply(400, { error: parsed.error })
  const { email, name, role, password } = parsed.value

  const service = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const created = await service.auth.admin.createUser({
    email, password, email_confirm: true, user_metadata: { name },
  })
  if (created.error || !created.data.user) {
    const taken = created.error?.status === 422 || /already/i.test(created.error?.message ?? '')
    return taken
      ? reply(409, { error: 'An account with that email already exists.' })
      : reply(500, { error: created.error?.message ?? 'Could not create the account.' })
  }
  const id = created.data.user.id

  // handle_new_user has already written a pending profile; an admin creating
  // the account is the approval, so it starts active.
  const { data: profile, error: profileError } = await service
    .from('profiles')
    .update({ status: 'active', role, name })
    .eq('id', id)
    .select('*')
    .single()
  if (profileError) {
    // Half an account — a login with a pending profile nobody asked for — is
    // worse than none. Take it back out so the admin can simply try again.
    await service.auth.admin.deleteUser(id)
    return reply(500, { error: profileError.message })
  }

  // The service role writes as nobody, so the audit row names the admin
  // explicitly. The password is not in it.
  await service.from('admin_audit_log').insert({
    actor_id: user.id,
    actor_email: user.email,
    action: 'insert',
    table_name: 'profiles',
    row_id: id,
    summary: `created a ${role} account for ${email}`,
    after: profile,
  })

  return reply(201, { id, email, role })
})
