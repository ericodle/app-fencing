# Testing

Three suites, split by what they are allowed to touch. `npm test` runs
typecheck, lint and all three.

## unit — `src/**/*.test.ts`, `workers/**/src/*.test.ts`

Pure functions and components. **No database, ever.** Runs in about a second
with no Docker, which is what makes it the suite you actually run while
working.

This is where the interesting code is tested, because the interesting code is
pure: the geometry (`geo`, `optimize`, `meetup`), the statistics
(`bout-stats`, `competition-stats`), the vocabularies and their helpers, the
date arithmetic, the push worker's decisions.

Tests here assert against **hand-computed answers**, not fixtures. The geometric
median of three collinear points is the middle one; the smallest circle around a
3-4-5 triangle has the hypotenuse as its diameter; a tie is half a victory
because that is what a pool sheet says. A test that only asserts the code does
what the code does is worth nothing.

If a helper needs a database to be tested, it is in the wrong file.

## integration — `tests/integration/`

Constraints, triggers and RLS policies, against the **live local stack**. `make
start` first.

**Nothing here is mocked, on purpose.** These rules only really exist when
tried; a mock of an RLS policy is a mock of the developer's belief about the
policy, and the belief is the thing being tested.

Two conventions:

**Sign in as a real account.** RLS is evaluated from the JWT, so every assertion
goes through a client signed in as one of the seeded members. A service-role
client sails past every policy, and a test written with one proves nothing. Use
`clientFor()`; the service client is for arranging fixtures and cleaning up,
never for the assertion.

**Assert on the data, not on the error.** RLS refuses by *filtering*: an UPDATE
the policy excludes matches zero rows and PostgREST returns a cheerful 204. That
is the failure mode most likely to be mistaken for success by a test. "Refused
loudly" and "silently changed nothing" are both fine; "changed it" is not, and
only a read-back tells the three apart. Two tests carry this note in full.

The vocabulary tests at the bottom of `constraints.test.ts` are load-bearing:
they insert one row per member of `EVENT_KINDS`, `WEAPONS` and the fitness
metric catalog and assert the database accepts all of them, then assert it
accepts nothing else. This is the only place the app-to-schema direction that
TypeScript cannot check gets checked. See `src/types/db.ts`.

## scenario — `tests/scenario/`

Multi-step journeys rather than single rules: *a coach schedules a pop-up, opens
a poll, four members answer from four corners of the city, the planner ranks the
venues, the coach picks one, the session moves.*

The reason this suite exists separately is that it catches a class of break
neither of the others can: every unit is correct, every policy is correct, and
the pieces still do not add up. The coach-cannot-move-an-event bug was found
here and nowhere else — the planner was right, the policy was right, and a coach
using the feature would have silently achieved nothing.

Scenarios must **restore what they change**. `poll-to-meetup.test.ts` saves
every member's real home pin before moving them across Taipei and puts them back
in `afterAll`, because the other suites read those.

## Running

```sh
npm test              # typecheck + lint + all three
npm run test:unit         # fast, no Docker
npm run test:integration  # needs npm run db:start
npm run test:scenario     # needs npm run db:start
npm run smoke             # a real browser; needs npm run dev too
npm run preflight         # everything, including smoke. Run before pushing.
```

## What belongs where

| Change | Test |
| --- | --- |
| A pure helper | `.test.ts` beside it, against hand-computed answers |
| A component | render + interaction, in the unit suite |
| A constraint, trigger or policy | integration |
| A new value in a vocabulary | the vocabulary tests in `constraints.test.ts` |
| A feature that spans several tables | scenario |
| A page that might render blank | `npm run smoke` |
