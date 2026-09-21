# Development

## What you need

[Node](https://nodejs.org) LTS and [Docker](https://www.docker.com). That is
all — no accounts, no cloud services, no cost. The Supabase CLI ships as a dev
dependency, so `npm install` provides it.

```sh
npm install
cp .env.example .env.local     # the local values work as shipped
make start                     # first run pulls images; a few minutes
make dev                       # http://localhost:5373
```

## The seeded accounts

The login page offers these as one-click buttons in dev builds only
(`import.meta.env.DEV` keeps the block out of a production bundle). They live in
`supabase/seeds/test-users.sql`.

| Account | Password | What it is for |
| --- | --- | --- |
| `admin@admin.admin` | `adminadmin` | Everything. Drives Zhongshan, offers 4 seats. |
| `coach@coach.coach` | `coachcoach` | Coach Wu — left-handed, A2022 saber, national referee. The account that exercises the coach-versus-admin boundary. |
| `fencer@fencer.fencer` | `fencerfencer` | Mei Lin — épée and saber, C2025, a term of bouts and a season of benchmarks. The account most screens look best on. |
| `lefty@fencer.fencer` | `fencerfencer` | Sam Reyes — **left-handed**, so the handedness split on the bout page has somebody on the other side of it. |
| `junior@fencer.fencer` | `fencerfencer` | Kai, 13, on Mei's account. Exercises the family policies. |
| `pending@fencer.fencer` | `fencerfencer` | Left pending on purpose, so the approval queue is never empty. |

## The seed data

`supabase/seeds/club-data.sql` is a real week rather than a few placeholder
rows, because a feature with nothing on it cannot be judged:

- **Six venues** across Taipei, with real coordinates, spread deliberately from
  Banqiao in the west to Nangang in the east.
- **Seven sessions** on the calendar: Tuesday open training, saber night, a
  Saturday pop-up, an interclub at Banqiao, the end-of-term dinner, last week's
  practice, and a four-evening beginner course.
- **An open poll with five answers**, from five different districts. This is the
  fixture the meetup planner exists for — the two objectives genuinely disagree
  on it, which is what makes the side-by-side comparison worth looking at.
- **Thirteen bouts**, against both a left-hander and right-handers, and against
  club members and outsiders.
- **A competition** with two members' results, pool sheets and all.
- **A season of benchmarks**, three points on each curve, including both sides
  of a sided test so the asymmetry finding has something to compute.

## Local URLs

| | |
| --- | --- |
| App | http://localhost:5373 |
| Supabase API | http://127.0.0.1:64521 |
| Postgres | `postgresql://postgres:postgres@127.0.0.1:64522/postgres` |
| Studio (DB browser) | http://127.0.0.1:64523 |
| Mailpit (local inbox) | http://127.0.0.1:64524 |

The 645xx block is this repo's. `fundive` uses 644xx and `app-fundivers` uses
643xx, so all three stacks can run at once — which they routinely do on this
machine, and which is why `make reset`, `make types` and the database-touching
test targets all check for `supabase_db_app-fencing` before running. A CLI
command run against the wrong stack reports another repo's migrations as drift,
and that reads exactly like a production problem.

## Day to day

```sh
make dev         # Vite
make reset       # wipe the local db back to migrations + seeds
make types       # regenerate src/types/database.ts — after EVERY migration
make test        # the gate
make smoke       # a real browser walk; screenshots into ./screenshots
make help        # the rest
```

### After changing the schema

1. Write a **new** migration file. Never edit one that has been pushed.
2. `make reset` — apply it and re-seed.
3. `make types` — regenerate `src/types/database.ts`.
4. `make test` — the compile-time guards in `src/types/db.ts` and the
   vocabulary tests in `tests/integration/constraints.test.ts` are what catch a
   schema and an app that have drifted apart.

## When it will not start

**`make start` hangs or a port is taken.** Another project's stack may hold it.
`docker ps --format '{{.Names}}'` shows what is up; this repo's containers are
suffixed `app-fencing`.

**Migrations apply but the seed fails.** The seed runs as `postgres` with
`auth.uid()` null. Any guard trigger that does not begin with
`if not public.is_end_user() …` will block it — see rule 4 in `CLAUDE.md`. This
is exactly how that rule got written.

**`supabase gen types --local` fails with "error running container".** It shells
into a container that does not always come up. `make types` uses a direct
database connection instead and does not have the problem.

**The integration suite fails on the first run and passes on the second, or the
reverse.** A test is leaving state behind. Signatures and audit entries cannot
be deleted by design, so fixtures that touch them must be scoped to a throwaway
event — `tests/integration/constraints.test.ts` has a worked example and a note.

**A page renders blank with no test failure.** That is what `make smoke` is for:
it signs in as each role, visits every page, and fails on any console error.
