# Metrics

Three tables for three time scales, kept apart because they are read apart. A
bout is a few minutes and there are hundreds; a competition result is a day and
there are a dozen a year; a benchmark is a point on a curve the club plots over
seasons. "My touch differential this month" and "is my 5k coming down" are not
the same page.

## Bouts

### One row, two sides

A bout between two club members is stored **once**, and `bout_sides` hands each
of them their own view of it. See [data-model.md](data-model.md#bouts) for the
canonical-orientation trigger that makes this safe. Every statistic in
`src/lib/bout-stats.ts` reads that view, never `bouts` directly, which is why
the same function computes "my record" for either fencer without the caller
knowing which way round the row was typed.

### A tie is half a victory

Not a rounding convenience: it is how V/M is computed on a pool sheet and how
every federation's seeding formula works. A win rate that ignored ties would
disagree with the paper the fencer is holding.

### The handedness split

The most useful number in the sport and the least likely to be noticed without
being counted.

About one fencer in seven is left-handed, against one person in ten in the
population. A left-hander therefore spends their whole career drilling against
right-handers; a right-hander meets a lefty a few times a season and never
builds the reflex. A right-hander whose win rate drops twenty points against
lefties has a *training problem*, not a run of bad luck — and this is the only
place that shows up.

Bouts where the opponent's handedness is unknown are **excluded** rather than
bucketed as right-handed, which would flatter exactly the comparison the split
exists to make. The count of unknowns is shown, so the fencer can see how much
of their record is missing from it.

For a club member the handedness comes from their profile — the bouts table
refuses a second copy, because a second copy rots — so `withClubOpponentHandedness`
joins it back in. For an outsider it is on the row, which is why the bout form
asks, with a note explaining that it is the single most useful thing to know
before you meet them again.

### The club ladder

An Elo rating from club bouts. It exists because a win rate says nothing about
*who you beat*: a fencer winning 80% against the beginners' group and one
winning 50% in the open group are not comparable on win rate, and every club has
both.

k = 24, which is deliberately lively — a club fences a few hundred bouts a
season, not a few thousand, and a rating that takes two years to respond is not
telling anyone anything.

It is **not** a substitute for the national classification. A letter is earned
in sanctioned competition against a qualified field, and no amount of club
bouting can produce one. The UI says so.

## Competition results

### Percentile, not placing

Ninth of twelve and ninth of two hundred are the same integer and nothing like
the same day. `finishPercentile` normalizes into the field, which is what makes
two results comparable — a season summary that averaged raw placings would say a
fencer got worse the year they started entering real competitions.

The season summary uses the **median** percentile rather than the mean, so one
disastrous day at a national does not define a season.

### Seed delta

`seedDelta` is the number that controls for the strength of the field: seeded
30th, finished 12th, +18. A fencer who is always seeded last and always finishes
last has a flat line; one who consistently beats their seeding is improving
whatever their placings look like. It prefers the post-pool seed, because that
is the one the elimination table was actually cut on.

### The pool sheet

V/M, TS, TR and the indicator, recorded as five plain numbers. Not a parsed pool
grid: every federation prints these, every fencer can read them off the wall,
and the indicator is what the DE seeding is computed from. The indicator is a
generated column so it cannot disagree with the touches it comes from.

## Benchmarks

### Why it is a log

A `sprint_100m_s` column on the profile answers "how fast is she?" and destroys
the answer to "is she getting faster?" — which is the only question worth asking
about a benchmark. So each test is a dated row, and the profile shows the
latest, the personal best, and the direction of travel.

### Direction

`lowerIsBetter` on each metric is the field everything else keys off. A 5k
improves by going down and a jump improves by going up, and every personal best,
trend arrow and chart axis needs to know which. The sparkline is drawn so **up
is always better**, whichever way the raw value moved — a line that fell for an
improvement would read as a decline to anyone who glanced at it — and the
accessible description says which direction the numbers actually went, so the
inversion is never hidden.

### Protocols

Every metric carries a one-line protocol, shown under the input. A benchmark
measured differently each time is not a benchmark, and "30 m sprint" does not
say whether it was a standing start.

### Left and right

`sided` metrics are kept as separate series, never averaged: the asymmetry is
the finding. Fencing is played almost entirely off one leg, and a fencer who
lunges a thousand times a month on the same side develops a difference they
cannot feel. Over 10% between sides is flagged with a note suggesting they
mention it to a coach — that threshold is the one the sports-medicine literature
generally uses, and it is exactly the kind of thing nobody computes by hand from
two numbers in a list.

### Input

Times accept `24:45`, `24m45s` or `1485` — because that is what a stopwatch
shows and what a coach writes on a clipboard. `validateReading` bounds every
metric, which is what catches a minutes-for-seconds mix-up at the form rather
than as a dot at the bottom of a chart three months later.
