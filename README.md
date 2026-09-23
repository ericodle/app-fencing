# Piste — Kuou Fencing Club

**The club app for [Kuou Fencing Club](https://www.kuou.dev).**

Who is coming to practice, where the club should meet, and every bout, result
and benchmark a fencer accumulates. A progressive web app the club hosts
itself, on free tiers.

It is built on the same stack as [FunDive](https://github.com/fundive/fundive)
and borrows its architecture — one Supabase project, two Cloudflare Workers, no
application server — but the domain is its own: the schema, the vocabulary and
every screen were written for a fencing club rather than adapted from a dive
shop.

## What it does

- **Attendance polls.** One poll per session. Everyone sees who has said yes,
  because that is what people decide on. Answers carry the logistics too — what
  time you can get there, whether you can drive, whether you need a lift.

- **The meetup planner.** The club is online-first and runs pop-up practices all
  over Taipei, so "where shall we meet" is a real weekly question. Given
  everyone who said yes and where they are coming from, the planner computes two
  answers — the point of least *total* travel, and the point where the *longest*
  single journey is shortest — shows what each one costs, and ranks the club's
  actual venues against them. See [docs/meetup.md](docs/meetup.md).

- **Bouts.** Score, opponent, weapon, notes. A bout between two members is
  stored once and shown to both, from each one's own side, so the two cannot
  disagree about the score. Statistics include the split that matters most and
  is least likely to be noticed by hand: **your record against left-handers
  versus right-handers.**

- **Competition results.** Placings, pool sheets (V/M, TS, TR, indicator), DE
  record, letters earned. Reported against the field size and against your seed,
  because ninth of twelve and ninth of two hundred are not the same day.

- **Athlete profiles.** Handedness, height, arm span and reach, weapons, grip,
  national classification with its expiry, licences, years fencing, kit.

- **Benchmarks.** 5k, 100 m, lunge length, jump, footwork shuttle and the rest
  — as a dated log, not as columns, so the question is "is she getting faster"
  rather than only "how fast is she". Left/right asymmetry is computed and
  flagged, because fencing is played almost entirely off one leg.

- **The ordinary club things.** Calendar, roster, carpools, prices and passes,
  waivers and terms, an approval queue for new members, an append-only audit
  trail, installable PWA, web push.

## Tech

- **Frontend** — React 19 + TypeScript, Vite, React Router, Tailwind 4. No UI
  framework: the look is the marketing site's, carried over token for token.
- **Backend** — [Supabase](https://supabase.com): Postgres, Auth, and Row-Level
  Security. The app talks to PostgREST directly and authorization lives in RLS
  policies. There is no application server.
- **Edge** — [Cloudflare Workers](https://workers.cloudflare.com): one serves
  the SPA with its security headers, one runs the daily push cron.
- **Tests** — Vitest, in three suites: unit (pure, no database), integration
  (against a live local Postgres, no mocks), and scenario (multi-step journeys).

## Getting started

You need [Node](https://nodejs.org) LTS and [Docker](https://www.docker.com).
Nothing else, no accounts, no cost.

```sh
git clone git@github.com:ericodle/app-fencing.git
cd app-fencing
npm install
cp .env.example .env.local     # the local values work as shipped
npm run db:start                     # boot Supabase in Docker (first run: a few minutes)
npm run dev                       # Vite on http://localhost:5373
```

Sign in as **`admin@admin.admin` / `adminadmin`** — one of six seeded accounts
the login page offers as one-click buttons in dev. The seed data is a real
week: venues across Taipei, sessions on the calendar, an open poll with five
answers spread across five districts, a term of bouts, a competition result and
a season of benchmarks. Everything has something on it from the first load.

```sh
npm test            # the gate: typecheck + lint + all three suites
npm run smoke       # drive the running app in a real browser and screenshot it
npm run db:reset    # wipe the local database back to migrations + seeds
npm run            # lists every script
```

## Making it yours

Two things make a clone a different club:

1. **[`piste.config.ts`](piste.config.ts)** — name, contact, URLs, timezone,
   currency, theme colors, weapons, equipment list, feature toggles, and the
   meetup planner's knobs. Pure data, read by the app, `vite.config.ts`, the
   service worker and the workers.
2. **[`public/`](public/)** — logo, favicon, app icons, social image.

Contact details are deliberately *not* config: a phone number changes on a
Tuesday afternoon and should not need a deploy, so they are admin-authored rows
(`club_contact`, `contact_channels`) edited in the app.

## Deploying

The app runs on one Supabase project and two Cloudflare Workers, both on free
tiers for a club this size.

```sh
npm run db:push           # apply new migrations to the cloud database
npm run db:verify         # schema drift between local and cloud
npm run db:auth           # point Auth's Site URL and redirect list at urls.app
npm run deploy:functions  # ship the Supabase edge functions (create-member)
npm run deploy            # build and ship both workers
npm run deploy:app        # just the app worker
npm run deploy:push       # just the push cron worker
npm run db:backup         # snapshot the cloud database before a risky migration
```

A typical release is `npm run db:push && npm run deploy:functions && npm run
deploy`. Migrations go first because the app may depend on them; `db:push`
applies only migrations the cloud has not seen, so it is safe to run every
time. The Supabase commands read the cloud project's credentials — including
`SUPABASE_ACCESS_TOKEN`, a personal access token from the account that owns the
project — from `.env.local`; the Cloudflare deploys read `.env.production`.

Required environment variables are documented in
[`.env.example`](.env.example) and the flow in
[docs/deployment.md](docs/deployment.md). The production build refuses a bundle
pointing at `127.0.0.1`, carrying the Supabase CLI's local demo key, or holding
a service-role key in any `VITE_` variable — see `src/vite/build-env.ts`.

## Documentation

[`docs/`](docs/) has the detail:

| | |
| --- | --- |
| [architecture.md](docs/architecture.md) | how the pieces fit, and what is deliberately absent |
| [data-model.md](docs/data-model.md) | the schema, and why each table is shaped as it is |
| [meetup.md](docs/meetup.md) | the planner: the math, the objectives, the limits |
| [metrics.md](docs/metrics.md) | bouts, results and benchmarks |
| [development.md](docs/development.md) | running it, the seeded accounts, what to do when it will not start |
| [deployment.md](docs/deployment.md) | going live |
| [testing.md](docs/testing.md) | the three suites and what belongs in each |

## License

Copyright (C) 2026 Eric Odle

Free software under the **GNU Affero General Public License, version 3 or
later** (`AGPL-3.0-or-later`). You may use, study, share and modify it; any
derivative — including a modified version offered to users over a network —
must also be released under the AGPL. See [LICENSE](LICENSE).

Because this runs as a network service, AGPL §13 requires that anyone running a
modified version and letting users interact with it over a network must offer
those users the corresponding source. The app keeps a visible source link in its
footer for that reason.

SPDX-License-Identifier: `AGPL-3.0-or-later`
