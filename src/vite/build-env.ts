// What a production bundle must NOT contain.
//
// Run as a hard gate in vite.config.ts on `build` only. Every rule here exists
// because the value it rejects produces a bundle that looks fine, deploys
// fine, and is broken for everyone who opens it — a class of failure that is
// only cheap to catch here.

export interface EnvProblem {
  variable: string
  problem: string
}

const LOCAL_HOSTS = ['127.0.0.1', 'localhost', '0.0.0.0', '[::1]']

/** The Supabase CLI's fixed local demo anon key, published in their docs. It is
 *  not a secret and it is not a credential for anything real — which is exactly
 *  why a bundle carrying it is a bundle pointed at a database that does not
 *  exist outside the developer's laptop. */
const LOCAL_DEMO_ANON_KEY_ISS = 'supabase-demo'

export function buildEnvProblems(env: Record<string, string | undefined>): EnvProblem[] {
  const problems: EnvProblem[] = []
  const url = env.VITE_SUPABASE_URL?.trim()
  const anon = env.VITE_SUPABASE_ANON_KEY?.trim()

  if (!url) {
    problems.push({ variable: 'VITE_SUPABASE_URL', problem: 'is not set' })
  } else if (LOCAL_HOSTS.some(host => url.includes(host))) {
    problems.push({
      variable: 'VITE_SUPABASE_URL',
      problem: `points at your own machine (${url}) — nobody else can reach it`,
    })
  } else if (!url.startsWith('https://')) {
    problems.push({
      variable: 'VITE_SUPABASE_URL',
      problem: 'is not https — an access token would travel in clear',
    })
  }

  if (!anon) {
    problems.push({ variable: 'VITE_SUPABASE_ANON_KEY', problem: 'is not set' })
  } else if (decodeIssuer(anon) === LOCAL_DEMO_ANON_KEY_ISS) {
    problems.push({
      variable: 'VITE_SUPABASE_ANON_KEY',
      problem: "is the Supabase CLI's local demo key, which only works against a local stack",
    })
  }

  // A service-role key in a VITE_ variable is baked into the bundle and served
  // to every visitor. It bypasses RLS completely. There is no situation in
  // which this is a mistake worth shipping past.
  for (const [key, value] of Object.entries(env)) {
    if (!key.startsWith('VITE_') || !value) continue
    if (decodeRole(value) === 'service_role') {
      problems.push({
        variable: key,
        problem: 'holds a SERVICE ROLE key. That bypasses every RLS policy and would be public in the bundle',
      })
    }
  }

  return problems
}

/** Pull one claim out of a JWT without verifying it — we are inspecting our own
 *  configuration, not trusting a token. Returns null for anything unparseable,
 *  because an unparseable key is somebody else's error to report. */
function claim(token: string, name: string): string | null {
  const parts = token.split('.')
  if (parts.length !== 3) return null
  try {
    const json = atob(parts[1].replace(/-/g, '+').replace(/_/g, '/'))
    const value = (JSON.parse(json) as Record<string, unknown>)[name]
    return typeof value === 'string' ? value : null
  } catch {
    return null
  }
}

const decodeIssuer = (token: string) => claim(token, 'iss')
const decodeRole   = (token: string) => claim(token, 'role')
