# Architecture

## The shape

```
  browser (React 19 PWA)
        │
        │  PostgREST + GoTrue, directly
        ▼
  Supabase project ──── Postgres, Auth, Row-Level Security
        ▲
        │  service role
        │
  Cloudflare Workers
    ├── kuou-app   serves dist/ with security headers
    └── kuou-push  daily cron: open polls, nudge, remind, close
```

There is **no application server**. The browser talks to PostgREST directly and
authorization lives entirely in RLS policies. That is the single decision
everything else follows from, and it is worth being explicit about what it buys
and what it costs.

**It buys:** one place where access rules live, enforced identically whether the
request came from the app, from `curl`, or from a member poking at PostgREST
with the anon key they found in the bundle. No API layer to keep in step with
the policies. No server to run, pay for, or patch.

**It costs:** every access rule has to be expressible in SQL, evaluated per row.
Anything that is not — "a coach may edit the venue but not the price" — needs a
trigger alongside the policy, because a policy cannot name columns. There are
four of those and they all follow the same shape; see rule 4 in `CLAUDE.md`.

## Where the logic lives

| Concern | Where | Why there |
| --- | --- | --- |
| Access control | RLS policies | The only layer a determined member cannot go around |
| Column-level rules | `before update` triggers | A policy cannot name columns |
| Data shape | Constraints, generated columns | A rule enforced once beats a rule checked everywhere |
| Domain math | `src/lib/*.ts`, pure | Testable against known answers, no stack needed |
| Vocabularies | `src/lib/event-kinds.ts`, `src/config/weapons.ts` | Import-free, so the workers can share them |
| Club identity | `piste.config.ts` | Pure data; three runtimes read it |
| Club contact | `club_contact` rows | Changes on a Tuesday, should not need a deploy |

The pure-function layer is where the interesting code is. `meetup.ts`,
`bout-stats.ts`, `competition-stats.ts`, `fitness-metrics.ts`, `ratings.ts`,
`events.ts` and `dates.ts` know nothing about Supabase or React: they take plain
data and return plain data. Roughly 270 unit tests run against them in under a
second, with no Docker.

## The two vocabularies

`EVENT_KINDS` and `WEAPONS` are declared in TypeScript and again as SQL check
constraints, and nothing in the system would notice them drifting apart — a kind
the database accepts but the app does not know about simply never renders, with
no error anywhere.

Three things keep them together:

1. A compile-time guard in `src/types/db.ts` proves every value the app sends is
   one the column's type accepts.
2. That guard cannot prove the reverse, because a SQL check constraint does not
   survive into the generated types — `kind` comes back as plain `string`. So
   `tests/integration/constraints.test.ts` inserts one row per vocabulary member
   and asserts the database takes all of them, then asserts it takes nothing
   else.
3. The helpers (`usesDateEnvelope`, `venueIsNegotiable`, …) are written as
   questions rather than equality checks, so adding a kind forces each question
   to be answered rather than letting the new kind inherit an else-branch.

## What is deliberately absent

**No caching of Supabase responses in the service worker.** Every row this app
reads is scoped by RLS to whoever asked for it, and a cache keyed by URL cannot
tell two members' requests apart. A stale-while-revalidate strategy here would
serve one fencer another's medical notes. The cache name exists only so sign-out
can clear anything a future change adds.

**No map tiles.** The planner draws its own map as inline SVG. A tile request
leaks where every member lives to whoever runs the tile server, and the only
thing the decision needs is relative positions on a scale bar.

**No routing API.** See [meetup.md](meetup.md) — straight lines and slow speeds,
honestly labelled, rather than a confident number from a service that has to be
paid for and told where everyone lives.

**No online payments.** The ledger records what was taken; taking it is somebody
handing over cash or making a transfer. Adding a processor is a real piece of
work and the club does not need it.

**No realtime.** Poll counts refresh when the page is loaded. A club of thirty
people does not need a websocket to find out that a seventh person said yes.

## The port

This app shares its stack, its auth shape, its security-header layer and its
testing strategy with [FunDive](https://github.com/fundive/fundive), which the
same author wrote for a dive shop. Subsystems were ported deliberately, one at
a time, rather than copied wholesale:

**Carried over**, because the shape genuinely transfers: the auth provider and
its single-subscription design, the route-guard tree, the RLS helper functions
and the `rls_auto_enable` event trigger, the append-only audit log, the family /
lead-payer model, waivers and versioned terms, the ledger-not-balance rule for
money, the worker + security-headers pair, the build-env gate, and the
three-suite test split.

**Rewritten for fencing**, because the domain is not a rename: the whole schema,
the event-kind vocabulary, the equipment list, ratings and their expiry, and
every screen.

**Dropped**, because a fencing club has no use for them: dive logs and their
export, coral surveys, wildlife taxa, the tide and weather almanac, dive-site
maps and soundings, boat manifests, nitrox and deep certifications, wetsuit and
BCD sizing, and the trip/destination/room travel machinery.

**Added**, because a fencing club does: attendance polls, the meetup planner,
the bout log and its statistics, competition results, and the benchmark log.
