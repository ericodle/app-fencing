# The meetup planner

The club is online-first and runs pop-up practices all over Taipei. "Where shall
we meet on Saturday" is therefore a real weekly question with a real answer, and
this is the feature that answers it.

## The question is underspecified, and that is the design problem

"Where is the most convenient place for everyone to meet" is an optimization
question that does not say what it is optimizing. There are at least two
defensible answers, they routinely differ by a couple of kilometers, and
choosing one silently would be making the club's decision for it while looking
like arithmetic.

So the planner computes both, scores them with the same numbers, and shows them
side by side:

**Least total travel** — the *geometric median*, the point minimizing the sum of
everyone's distance. Best on average, and robust: one member living an hour out
barely moves it. Which is a virtue right up until that member is you. It will
quietly place the meeting next door to the four people who live near each other
and leave the fifth with an hour each way, forever.

**Fairest** — the center of the *smallest enclosing circle*, the point
minimizing the longest single journey. Nobody has a terrible trip; everybody has
a slightly worse one. It is the opposite of robust — the same outlier drags it
most of the way to their door.

A third, the **plain average** (the centroid), is computed and shown under a
disclosure, for comparison only. It is not the best answer to either question;
it is merely the easiest to compute, and showing it next to the median is the
clearest way to explain why the median is better.

`clubConfig.meetup.objective` decides which is highlighted first. It does not
decide which is computed.

## The math

All of it is in `src/lib/geo.ts`, `src/lib/optimize.ts` and `src/lib/meetup.ts`,
as pure functions with no database and no React — which is what lets it be
tested against hand-computed geometry rather than against fixtures. 61 unit
tests cover these three files.

### Distances

Great-circle, by the haversine formula (`haversineKm`). Not the spherical law of
cosines, which loses most of its significant figures at short range — and every
distance here is short range.

### The plane

Both optimizers are Euclidean: they assume the straight line between two points
is straight. On a sphere that is false; over a city it is false by an amount
nobody can measure with a metro card.

So `projectionFor` builds a tangent plane centered on the group — an
equirectangular projection with the longitude axis scaled by cos(lat₀) — the
geometry is solved there, and the answer is projected back. Across Taipei,
about 20 km, a distance round-trips about 1.2 m long: 0.006%. The projection is
rebuilt for each group so it stays centered on the points being optimized.

`planeIsSafe` refuses beyond a 400 km span, and `planMeetup` returns
`spread-too-wide` rather than a confident pin in the sea.

### Least total travel — Weiszfeld's algorithm

`geometricMedian` iteratively re-weights each point by the reciprocal of its
distance from the current estimate. Two things make a naive implementation
wrong, and both are handled:

- **The estimate landing exactly on a data point.** The reciprocal of zero ends
  the run. The Vardi–Zhang correction is applied: at such a point, take the step
  the other points ask for, limited by the weight sitting at the current
  position. If that weight dominates, the point *is* the median. This happens
  constantly in practice, because clubs have odd numbers of members living in a
  line along a metro route.
- **Two points, or unequal weights on two points.** The objective along a
  segment is linear, so it has no interior minimum: the heavier endpoint wins
  outright, however slim its majority, and only an exact tie makes the whole
  segment equally good. Taking the weighted mean here — which an early version
  did — is simply wrong, and there is a test named after it.

### Fairest — Welzl's algorithm

`smallestEnclosingCircle` is exact rather than iterative: the answer is
determined by at most three of the points, and this finds which three. The input
is shuffled with a seeded PRNG rather than `Math.random`, because the result
must be reproducible — the club is going to argue about it.

Weights are deliberately ignored here. The objective is the worst individual
journey, and a journey is not worse because the person making it is bringing a
friend along the same route.

## From answers to attendees

`attendeesFrom` in `src/lib/attendance.ts` turns poll answers into the planner's
input, and encodes three rules that could each reasonably go the other way:

1. **Only "yes" counts.** A maybe is not a person to be central to. Planning
   around people who then do not come produces a venue chosen for nobody, and
   the failure is invisible — the numbers still look convincing.
2. **A one-off origin on the response beats the profile's home pin.** If
   somebody said they are coming straight from the office, the office is where
   they are coming from.
3. **Somebody with neither is left out, and named.** Substituting the club's
   address would place them at the answer and drag it toward the venue the
   planner was supposed to be questioning. They come back in `unlocated` so the
   club can go and ask.

Guests weight the total-distance objective (three people in a car is three
people's inconvenience) but not the fairness objective (the journey is not
longer).

## Venues, not coordinates

A club cannot fence at a point in the road. The real output of `planMeetup` is
the club's actual venues, ranked against the ideal points by the chosen
objective. A venue is in the running if it is near *either* ideal point —
measuring against only one would drop the venue that is the obvious answer under
the other, which is exactly the comparison the club came for.

`maxVenueDetourKm` drops anything at the wrong end of the city rather than
ranking it last: a venue an hour away is not a worse option, it is not an
option.

## Privacy

The planner needs to know roughly where members travel from, which is the kind
of data a club roster has no business holding precisely. Three things keep that
honest:

- The profile asks for a **district**, not an address. There is a short list of
  the neighborhoods this club draws from, as data rather than a geocoder call —
  so the field works offline and sends nothing anywhere.
- "Use my current location" rounds to **three decimals**, about 100 m.
- Coordinates are **not on the `roster` view**. Members see each other's
  `home_label` ("Daan") and nothing more. The planner reads `profiles` directly
  and RLS decides who gets rows back.

## What it does not do

**It does not route.** Distances are straight lines; travel times are those
lines divided by a deliberately slow per-mode speed
(`clubConfig.meetup.travelSpeedKmh`). Taipei's MRT runs at about 35 km/h and the
config says 18, because the journey includes walking to the station, waiting,
and the fact that the track does not go where the crow flies. This is a cruder
model than a routing API and an honest one — it does not pretend to know about
traffic, and it phones nobody.

**It does not book the venue.** Choosing a suggestion records the decision and
moves the event; somebody still has to ring the community center.

**It does not decide.** A coach picks; the app shows the tradeoff.

## Storage

The chosen suggestion is stored in `meetup_suggestions` rather than recomputed
on demand, for two reasons: the answer must not change under somebody's feet
after it has been announced, and "where did we actually meet in October, and how
far did people travel?" is worth being able to ask a year later. The numbers
behind the ranking are frozen onto the row.

A partial unique index allows exactly one chosen suggestion per poll.
