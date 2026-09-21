// A thin wrapper around the Supabase CLI, so two things are handled in one
// place rather than repeated across a dozen npm scripts.
//
// 1. DO_NOT_TRACK
//
//    The CLI ships PostHog telemetry, and its shutdown flush can time out and
//    take the CLI's EXIT CODE with it — so a deploy whose functions shipped
//    perfectly still fails with "Timeout while shutting down PostHog" and a
//    non-zero exit. DO_NOT_TRACK is the cross-tool convention
//    (consoledonottrack.com) the CLI honors: no telemetry, no flush, no
//    spurious failure. Set here rather than per-machine so it travels with the
//    repo and every clone and CI run gets it.
//
// 2. --require-local
//
//    A guard for anything that reads or writes the LOCAL database.
//
//    This repo, fundive and app-fundivers all run local Supabase stacks. They
//    are on different ports, but a CLI command is perfectly happy to talk to
//    whichever stack answers — and `supabase migration list --local` then
//    reports another repo's migrations as drift, which reads exactly like a
//    production problem. The container name is project-scoped, so its presence
//    is the one unambiguous check.
//
// Usage, from package.json:
//   node scripts/supabase.mjs start
//   node scripts/supabase.mjs --require-local db reset

import { spawnSync } from 'node:child_process'

export const LOCAL_DB_CONTAINER = 'supabase_db_app-fencing'

export function localStackIsUp() {
  const result = spawnSync('docker', ['ps', '--format', '{{.Names}}'], { encoding: 'utf8' })
  if (result.status !== 0) return false
  return result.stdout.split('\n').includes(LOCAL_DB_CONTAINER)
}

export function requireLocalStack() {
  if (localStackIsUp()) return
  console.error(
    `ERROR: this repo's local stack is not running (${LOCAL_DB_CONTAINER}).\n` +
    "       Another project's stack may hold the ports — check: docker ps --format '{{.Names}}'\n" +
    '       Start this one with: npm run db:start',
  )
  process.exit(1)
}

// Only act as a CLI when run directly, so the helpers above can be imported.
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2)
  const requireLocal = args[0] === '--require-local'
  if (requireLocal) {
    args.shift()
    requireLocalStack()
  }

  const result = spawnSync('npx', ['supabase', ...args], {
    stdio: 'inherit',
    env: { ...process.env, DO_NOT_TRACK: '1' },
  })
  process.exit(result.status ?? 1)
}
