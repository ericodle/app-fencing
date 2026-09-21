// Regenerate src/types/database.ts from the LOCAL stack.
//
// Over a direct database connection rather than `supabase gen types --local`,
// which shells into a container that does not reliably come up ("error running
// container: exit 1"). The db-url path needs nothing but a running Postgres.
//
// The generated file is overwritten wholesale every time, which is why the
// hand-written aliases and compile-time guards live next door in
// src/types/db.ts rather than at the bottom of it.

import { spawnSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { requireLocalStack } from './supabase.mjs'

const OUT = 'src/types/database.ts'
const DB_URL = process.env.LOCAL_DB_URL ?? 'postgresql://postgres:postgres@127.0.0.1:64522/postgres'

const HEADER = [
  '// GENERATED FILE — DO NOT EDIT. Regenerate with `npm run db:types` after every',
  '// migration. The hand-written aliases and the compile-time guards that pin the',
  "// app's vocabularies to this schema live next door in src/types/db.ts.",
  '',
  '',
].join('\n')

requireLocalStack()

const result = spawnSync(
  'npx',
  ['supabase', 'gen', 'types', 'typescript', '--db-url', DB_URL],
  { encoding: 'utf8', env: { ...process.env, DO_NOT_TRACK: '1' } },
)

if (result.status !== 0) {
  console.error(result.stderr || 'supabase gen types failed')
  process.exit(result.status ?? 1)
}

// The CLI writes a "Connecting to …" line to stdout alongside the types.
const body = result.stdout
  .split('\n')
  .filter(line => !line.startsWith('Connecting to'))
  .join('\n')

writeFileSync(OUT, HEADER + body)
console.log(`wrote ${OUT}`)
