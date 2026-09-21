import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { SUPABASE_URL, ANON_KEY, SERVICE_KEY, ACCOUNTS } from './setup.integration'
import type { Database } from '../src/types/database'

export { ACCOUNTS }

/** A client signed in as one of the seeded accounts. Every RLS assertion in
 *  these suites goes through one of these, because RLS is evaluated from the
 *  JWT and a service-role client would sail past all of it. */
export async function clientFor(
  account: keyof typeof ACCOUNTS,
): Promise<SupabaseClient<Database>> {
  const client = createClient<Database>(SUPABASE_URL, ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { error } = await client.auth.signInWithPassword({
    email: ACCOUNTS[account].email,
    password: ACCOUNTS[account].password,
  })
  if (error) throw new Error(`could not sign in as ${account}: ${error.message}`)
  return client
}

/** Anonymous — no session at all. What a stranger with the published anon key
 *  can reach, which is the question half of these tests are asking. */
export function anonClient(): SupabaseClient<Database> {
  return createClient<Database>(SUPABASE_URL, ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

/** Bypasses RLS entirely. For arranging fixtures a test needs and for cleaning
 *  up after itself — never for the assertion itself. */
export function serviceClient(): SupabaseClient<Database> {
  return createClient<Database>(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}
