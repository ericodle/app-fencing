// Points the cloud project's Auth at the deployed app.
//
// Supabase builds every confirmation and password-reset link from the
// project's Site URL, and refuses a `redirectTo` that is not on its allow
// list. A new project has both set to http://localhost:3000, so until this
// runs, every email link sends the member to their own machine. supabase/
// config.toml only configures the local stack; the cloud project is set here,
// through the Management API, from `urls.app` in piste.config.ts.
//
// Usage: npm run db:auth   (reads SUPABASE_PROJECT_REF and
// SUPABASE_ACCESS_TOKEN from .env.local)

import { clubConfig } from '../piste.config.ts'

const { SUPABASE_PROJECT_REF: ref, SUPABASE_ACCESS_TOKEN: token } = process.env
if (!ref || !token) {
  console.error('ERROR: SUPABASE_PROJECT_REF and SUPABASE_ACCESS_TOKEN must be set in .env.local')
  process.exit(1)
}

const app = clubConfig.urls.app
const response = await fetch(`https://api.supabase.com/v1/projects/${ref}/config/auth`, {
  method: 'PATCH',
  headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ site_url: app, uri_allow_list: `${app}/**` }),
})
if (!response.ok) {
  console.error(`ERROR: ${response.status} ${await response.text()}`)
  process.exit(1)
}
console.log(`Auth site URL and redirect allow list set to ${app}`)
