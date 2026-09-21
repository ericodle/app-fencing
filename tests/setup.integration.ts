// Integration and scenario suites run against the LIVE local Supabase stack.
//
// Nothing here is mocked, on purpose. The whole point of these suites is to
// catch drift between what the app believes the schema does and what it does:
// constraints, triggers and RLS policies are only really tested by trying them,
// and a mock of a policy is a mock of the developer's belief about the policy.
//
// `npm run db:start` first. Every one of these files will fail loudly and quickly if
// the stack is not up, which is the intended way to find that out.

import { beforeAll } from 'vitest'

export const SUPABASE_URL = process.env.SUPABASE_URL ?? 'http://127.0.0.1:64521'
export const ANON_KEY = process.env.SUPABASE_ANON_KEY
  ?? 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'
export const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
  ?? 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'

// The accounts supabase/seeds/test-users.sql creates. Ids are fixed so a test
// can assert about a specific person without first looking them up.
export const ACCOUNTS = {
  fencer: { id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', email: 'fencer@fencer.fencer', password: 'fencerfencer' },
  admin:  { id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', email: 'admin@admin.admin',    password: 'adminadmin' },
  coach:  { id: 'cccccccc-cccc-cccc-cccc-cccccccccccc', email: 'coach@coach.coach',    password: 'coachcoach' },
  eric:   { id: 'cccccccc-1111-4111-8111-cccccccccccc', email: 'eric@coach.coach',     password: 'coachcoach' },
  lefty:  { id: 'dddddddd-dddd-dddd-dddd-dddddddddddd', email: 'lefty@fencer.fencer',  password: 'fencerfencer' },
  junior: { id: 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', email: 'junior@fencer.fencer', password: 'fencerfencer' },
  pending:{ id: 'ffffffff-ffff-ffff-ffff-ffffffffffff', email: 'pending@fencer.fencer',password: 'fencerfencer' },
} as const

beforeAll(async () => {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/`, { headers: { apikey: ANON_KEY } })
    .catch(() => null)
  if (!response?.ok) {
    throw new Error(
      `The local Supabase stack is not answering on ${SUPABASE_URL}.\n` +
      'Run `npm run db:start` first — these suites deliberately do not mock the database.',
    )
  }
}, 20_000)
