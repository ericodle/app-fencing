// Snapshot the LINKED cloud database — schema, data and roles — into backups/.
//
// Run before a risky migration. Migrations do not roll back; a bad one is fixed
// by a new forward migration, and this is what makes that survivable.
//
// backups/ is gitignored: these dumps contain every member's personal details.

import { spawnSync } from 'node:child_process'
import { mkdirSync } from 'node:fs'

const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
mkdirSync('backups', { recursive: true })

for (const [flag, name] of [['--schema-only', 'schema'], ['--data-only', 'data'], ['--role-only', 'roles']]) {
  const file = `backups/${stamp}-${name}.sql`
  const result = spawnSync(
    'npx',
    ['dotenv', '-e', '.env.local', '--', 'npx', 'supabase', 'db', 'dump', flag, '-f', file],
    { stdio: 'inherit', env: { ...process.env, DO_NOT_TRACK: '1' } },
  )
  if (result.status !== 0) {
    console.error(`failed while dumping ${name}`)
    process.exit(result.status ?? 1)
  }
  console.log(`wrote ${file}`)
}
