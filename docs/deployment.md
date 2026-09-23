# Deployment

One Supabase project and two Cloudflare Workers. Free tiers cover a club this
size. Both accounts are `504068014080@tutanota.com`.

## Once, to set up

### 1. Supabase

Create a project at [supabase.com/dashboard](https://supabase.com/dashboard).
Pick a region close to the club — `ap-southeast-1` or `ap-northeast-1` for
Taipei. Keep the database password; it is shown once.

Fill into `.env.local`:

```
SUPABASE_PROJECT_REF=       # from the project URL
SUPABASE_DB_PASSWORD=       # the one from project creation
SUPABASE_ACCESS_TOKEN=      # supabase.com/dashboard/account/tokens
SUPABASE_POOLER_HOST=       # Connect → Session pooler, e.g. aws-0-ap-southeast-2.pooler.supabase.com
```

Then:

```sh
npm run db:push     # applies all six migrations to the cloud project
npm run db:auth     # points Auth's Site URL and redirect allow list at urls.app
```

A new project's Site URL is `http://localhost:3000`, so until `npm run db:auth`
runs, every confirmation and password-reset email links to the member's own
machine.

`npm run db:push` ships **migrations only**. The seed files under `supabase/seeds/`
are local fixtures and never leave the machine — which is deliberate, since they
contain accounts with published passwords.

### 2. Cloudflare

From [dash.cloudflare.com](https://dash.cloudflare.com), create an API token
with **Workers Scripts: Edit**, **Workers KV: Edit** and **Account Settings:
Read**, plus **Workers Routes: Edit** and **DNS: Edit** on the `kuou.dev` zone
for the custom domain. Put it and the account id in `.env.production`;
`npm run deploy:push` reads them from there too.

### 3. Web push

```sh
npx web-push generate-vapid-keys
```

The **public** half goes in `.env.production` as `VITE_VAPID_PUBLIC_KEY` (it is
baked into the bundle and is not a secret). Both halves go in `.env.push`, which
`npm run deploy:push` uploads as Worker secrets (`wrangler deploy
--secrets-file`).

Changing the pair later invalidates every existing subscription, so keep it.

### 4. The client values

In `.env.production`:

```
VITE_SUPABASE_URL=https://YOUR_REF.supabase.co
VITE_SUPABASE_ANON_KEY=       # Settings → API → anon public
VITE_PUSH_WORKER_URL=https://kuou-push.YOUR-SUBDOMAIN.workers.dev
```

## Every deploy

```sh
npm run deploy          # both workers
npm run deploy:app      # just the SPA
npm run deploy:push     # just the cron
```

## The build gate

`npm run deploy:app` refuses to produce a bundle that:

- points at `127.0.0.1` or `localhost` — nobody else can reach it
- points at a non-https URL — an access token would travel in clear
- carries the Supabase CLI's local demo anon key — it only works locally
- holds a **service-role key in any `VITE_` variable** — that bypasses every RLS
  policy and would be public in the bundle

Each rule exists because the value it rejects produces a bundle that looks fine,
deploys fine, and is broken for everyone who opens it. The check is
`src/vite/build-env.ts`, and it has its own tests.

## Secrets, and where they may appear

| | Browser bundle | Worker secret | `.env` only |
| --- | :--: | :--: | :--: |
| `VITE_SUPABASE_ANON_KEY` | yes | — | — |
| `VITE_VAPID_PUBLIC_KEY` | yes | — | — |
| `SUPABASE_SERVICE_ROLE_KEY` | **never** | yes | yes |
| `VAPID_PRIVATE_KEY` | **never** | yes | yes |
| `ADMIN_TRIGGER_SECRET` | **never** | yes | yes |
| `SUPABASE_DB_PASSWORD` | **never** | — | yes |
| `CLOUDFLARE_API_TOKEN` | **never** | — | yes |

The anon key is *meant* to be public: what scopes access is the RLS policies
behind it, not the key. The service-role key bypasses all of them.

## Custom domain

`wrangler.toml` claims `app.kuou.dev` as a custom domain, so the first
`npm run deploy:app` creates the DNS record and orders the certificate — there
is nothing to click. The `kuou.dev` zone has to be in the same Cloudflare
account. `urls.app` in `piste.config.ts` must match it, since share links and
the Auth redirect URLs are built from it.

## Verifying

```sh
npm run db:verify     # schema drift between local and cloud
```

Worth running before every deploy, and the only thing that catches a migration
somebody applied by hand in the dashboard.

## Rolling back

The SPA worker keeps previous versions — roll back from the Cloudflare
dashboard. **Migrations do not roll back**; a bad one is fixed by a new forward
migration. `npm run db:backup` before anything destructive.
