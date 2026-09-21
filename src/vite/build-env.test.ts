import { describe, it, expect } from 'vitest'
import { buildEnvProblems } from './build-env'

// Real local demo key from the Supabase CLI: iss "supabase-demo", role "anon".
const LOCAL_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'
const LOCAL_SERVICE = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'

// A plausible cloud anon key: different issuer, role anon.
const CLOUD_ANON = `header.${btoa(JSON.stringify({ iss: 'supabase', ref: 'abcdefgh', role: 'anon' }))
  .replace(/=/g, '')}.sig`

const ok = { VITE_SUPABASE_URL: 'https://abcdefgh.supabase.co', VITE_SUPABASE_ANON_KEY: CLOUD_ANON }

describe('buildEnvProblems', () => {
  it('passes a real deployment env', () => {
    expect(buildEnvProblems(ok)).toEqual([])
  })

  it('refuses a bundle pointed at the developer’s own machine', () => {
    for (const host of ['http://127.0.0.1:64521', 'http://localhost:64521', 'http://[::1]:64521']) {
      const problems = buildEnvProblems({ ...ok, VITE_SUPABASE_URL: host })
      expect(problems).toHaveLength(1)
      expect(problems[0].variable).toBe('VITE_SUPABASE_URL')
      expect(problems[0].problem).toMatch(/your own machine/)
    }
  })

  it('refuses the local demo anon key, whatever the URL says', () => {
    const problems = buildEnvProblems({ ...ok, VITE_SUPABASE_ANON_KEY: LOCAL_ANON })
    expect(problems.map(p => p.variable)).toEqual(['VITE_SUPABASE_ANON_KEY'])
    expect(problems[0].problem).toMatch(/local demo key/)
  })

  it('refuses a service-role key in any VITE_ variable', () => {
    const problems = buildEnvProblems({ ...ok, VITE_SOMETHING_ELSE: LOCAL_SERVICE })
    expect(problems).toHaveLength(1)
    expect(problems[0].variable).toBe('VITE_SOMETHING_ELSE')
    expect(problems[0].problem).toMatch(/SERVICE ROLE/)
  })

  it('refuses a service-role key even as the anon key, and says which fault', () => {
    const problems = buildEnvProblems({ ...ok, VITE_SUPABASE_ANON_KEY: LOCAL_SERVICE })
    expect(problems.some(p => p.problem.includes('SERVICE ROLE'))).toBe(true)
  })

  it('refuses plain http, which would carry an access token in clear', () => {
    const problems = buildEnvProblems({ ...ok, VITE_SUPABASE_URL: 'http://db.example.com' })
    expect(problems[0].problem).toMatch(/https/)
  })

  it('reports anything simply missing', () => {
    expect(buildEnvProblems({}).map(p => p.problem)).toEqual(['is not set', 'is not set'])
  })

  it('ignores a non-VITE service key, which never reaches the bundle', () => {
    expect(buildEnvProblems({ ...ok, SUPABASE_SERVICE_ROLE_KEY: LOCAL_SERVICE })).toEqual([])
  })

  it('does not choke on a value that is not a JWT at all', () => {
    expect(buildEnvProblems({ ...ok, VITE_MAP_TILE_URL: 'https://tiles.example.com/{z}/{x}/{y}.png' }))
      .toEqual([])
  })
})
