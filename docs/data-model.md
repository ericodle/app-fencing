# Data model

Six migrations, applied in order. Each is a subsystem rather than a slice of
time, which makes them readable as documentation — start at `core.sql`.

```
20260921000000_core.sql              extensions, RLS guard rail, profiles, audit
20260921000100_venues_events.sql     venues, events, bookings
20260921000200_attendance_meetup.sql polls, responses, suggestions, carpool
20260921000300_metrics.sql           bouts, competitions, results, benchmarks
20260921000400_money.sql             prices, payments, passes, discounts
20260921000500_club_content.sql      terms, waivers, contact, rota, push
```

## Conventions that hold throughout

**RLS is on for everything.** Enforced by the `rls_auto_enable` event trigger in
`core.sql`, which turns it on for every table created in `public`. Forgetting
one `alter table … enable row level security` is the single mistake in a schema
like this that silently exposes everything in it, so it is not left to a
reviewer to catch. A table created without a policy is therefore readable by
nobody, which is the safe direction to fail in.

**Every SECURITY DEFINER function pins `search_path`.** Without it a caller can
prepend a schema of their own and take over the function's identity.

**Money is a ledger, never a balance.** A refund is a negative payment; a
returned session is a negative punch. The sum of the column is always the truth.
A `balance` column kept in step by application code is wrong the first time two
writes interleave, and there is then no way to find out what it should have been.

**Views for what the app reads, tables for what it writes.** `roster`,
`attendance_tally`, `bout_sides`, `pass_balances` and `member_balances` are all
`security_invoker`, so they stay behind the reader's own RLS.

## profiles

One row per person, keyed to `auth.users`, created by the `handle_new_user`
trigger the moment an account exists — a signed-up account with no profile row
makes every policy in the schema evaluate against null.

It holds three quite different kinds of data, which is why the column list is
long: the account (role, status, family, terms), the contact details, and the
athlete.

The athlete block is deliberately the **stable measurements only**: handedness,
height, arm span, weapons, grip, ratings, when they started. Anything that
improves with training is a dated row in `fitness_tests`, not a column here.

`role` is `fencer | coach | admin`. `status` is
`pending | active | rejected | on_hold | closed` — closed accounts are listed in
the admin UI so a member who left and came back can be reinstated rather than
starting again and losing every bout they ever fenced.

**The `roster` view** is what every member-facing screen reads. It carries what
the club shares with itself — name, weapon, hand, rating, neighborhood — and
leaves out medical notes, ID number, emergency contact, date of birth and the
home coordinates. RLS is row-level, so this is where column-level privacy
actually happens, and there is an integration test asserting each omission.

## events

One table, discriminated by `kind`: `practice | course | popup | tournament |
interclub | social`.

Two temporal shapes, and this is the most load-bearing distinction in the
schema. A course runs on an explicit `course_days` list; everything else has a
`start_date` and an optional `end_date`. Two constraints enforce the pairing,
and `usesDateEnvelope` in `src/lib/event-kinds.ts` is what every query branches
on. Getting it wrong does not error — it makes a course look finished after its
first evening, or makes a kind never get fetched at all.

`original_venue_id` is set once, by a trigger, the first time an event's venue
changes, and never overwritten. It is what lets the app say "moved from Bade
Road" after the meetup planner relocates a session.

A coach may change `venue_id` and the notes; everything else about an event is
an admin change. Row permission in `events_update_coach`, column restriction in
the `events_coach_move_guard` trigger. This exists because the planner is for
coaches, and without it a coach could save a meetup decision while the event
silently did not move — a failure with no error anywhere.

## attendance_polls, attendance_responses, meetup_suggestions

One poll per event (unique). One response per member per poll (unique), upserted
— a member changing their mind updates their row.

**Responses are visible to every active member**, not just to staff. That
visibility *is* the feature: people decide whether to come based on who else
will be there, and a headcount only the coach can see helps nobody choose.

A response carries logistics as well as an answer, because the moment somebody
decides they are coming is the moment they know whether they can drive. A
constraint refuses logistics on a "no" and leaves them open on a "maybe", which
is exactly the case where a fencer says "if I make it, I can drive".

`meetup_suggestions` stores what was proposed and which one was taken. See
[meetup.md](meetup.md) for why it is stored rather than recomputed.

## bouts

**One row per bout, not one per fencer per bout.** Two club members fencing each
other produce a single row; `bout_sides` hands each of them their own view of
it. The alternative — each fencer records their own side — produces two rows
that can disagree, and they will: one person writes 5-3 and the other writes 3-5
a week later from memory.

A trigger puts a member-versus-member bout in a **canonical orientation** (lower
uuid first, scores swapped to match) so whoever types it in can type it from
their own point of view, and a unique index then makes a duplicate entry from
the other side fail loudly rather than quietly doubling everyone's bout count.

That index is on `(event_id, bouted_on, fencer_id, opponent_id,
coalesce(bout_number, 0))`. `bouted_on` is in it because an event can span days,
and without it two thirds of a term's bouts were silently discarded — which is
how it got there.

An opponent from outside the club has no profile, so their details are inline,
and a constraint refuses inline details for a club member: the profile is the
source of truth and a second copy rots. `opponent_external_id` is for a licence
number, which is the one thing that keeps a head-to-head record together when a
name is spelled three ways across a season.

`result` is a generated column, so it cannot disagree with the scores it comes
from.

## fitness_tests

The benchmark log. `metric` is an open vocabulary pinned by a check constraint
and mirrored in `src/lib/fitness-metrics.ts`, which also declares each metric's
unit and — the field that matters — whether a lower number is a better one. A 5k
improves downward and a jump improves upward, and every personal best, trend
arrow and chart axis in the app needs to know which.

`side` exists for the tests run per limb, where the left/right difference is
itself the finding. In a sport played almost entirely off one leg, it usually is.

## passes

A ten-session card or a term's unlimited training — the thing most clubs
actually sell. `pass_balances` computes what is left; a trigger refuses to punch
a card with nothing on it or one that has expired, and allows a negative punch
either way, because a correction must not be blocked by the rule that blocks a
fresh use.

## waiver_signatures

Immutable, by a trigger that rejects UPDATE and DELETE from everybody including
the service role. A signature that can be revised after the fact is not evidence
of anything. `body_snapshot` freezes the wording as it stood, because
`waiver_id` alone points at whatever the row says today.

## admin_audit_log

Append-only in the same strong sense: an admin who can do everything else still
cannot edit the record of what they did. The guard is a trigger rather than a
policy precisely so the service role meets it too.
