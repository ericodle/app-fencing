-- ─────────────────────────────────────────────────────────────────────────────
-- The numbers: bouts fenced, competitions entered, benchmarks tested.
--
-- Three tables for three different time scales. A bout is a few minutes and
-- there are hundreds of them; a competition result is a day and there are a
-- dozen a year; a fitness test is a point on a curve the club plots over
-- seasons. They are kept apart because they are queried apart — "my touch
-- differential this month" and "is my 5k coming down" are not the same page.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── bouts ────────────────────────────────────────────────────────────────────
-- One row per bout, not one row per fencer per bout.
--
-- The alternative — each fencer records their own side — was rejected because
-- two club members fencing each other then produce two rows that can disagree,
-- and they will: one person writes 5-3 and the other writes 3-5 a week later
-- from memory. Here a bout between members is a single row, and the trigger
-- below puts it in a canonical orientation so it cannot be entered twice from
-- opposite ends. `bout_sides` (below) hands each fencer their own view of it.
--
-- An opponent from outside the club has no profile row, so their details are
-- recorded inline. `opponent_external_id` is for a licence number — FIE, national
-- federation, or a tournament's own — when one is available, which is what lets
-- head-to-head records survive somebody's name being spelled three ways.

create table if not exists public.bouts (
  id            uuid primary key default gen_random_uuid(),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  bouted_on     date not null,
  event_id      uuid references public.events(id) on delete set null,
  competition_id uuid,   -- FK added after `competitions` exists, below
  weapon        text not null,
  bout_type     text not null default 'practice',
  -- 5 in a pool, 15 in a direct elimination, whatever the club drills at.
  touches_to    integer,
  -- Where this sat in the session or the pool, so a sequence can be replayed.
  bout_number   integer,

  fencer_id     uuid not null references public.profiles(id) on delete cascade,
  score_for     integer not null,
  score_against integer not null,

  -- Exactly one of these two identifies the opponent.
  opponent_id   uuid references public.profiles(id) on delete set null,
  opponent_name text,
  opponent_club text,
  opponent_external_id text,
  -- Recorded for an outside opponent because it is the single most useful
  -- thing to know before you meet them again, and nothing else will remember.
  opponent_handedness text,
  opponent_rating     text,

  duration_s    integer,
  -- Free-text, and the field coaches actually use: "kept falling for the
  -- second-intention counter". Deliberately not a tag vocabulary — no club has
  -- ever agreed on one.
  notes         text,
  recorded_by   uuid references public.profiles(id) on delete set null,

  -- Stored rather than derived in the app: it is in the where-clause of every
  -- statistic on the page, and a generated column keeps the index honest.
  result text generated always as (
    case when score_for > score_against then 'win'
         when score_for < score_against then 'loss'
         else 'tie' end
  ) stored,

  constraint bouts_weapon_check
    check (weapon = any (array['epee','foil','saber'])),
  constraint bouts_type_check
    check (bout_type = any (array['practice','pool','de','drill','team'])),
  constraint bouts_scores_check
    check (score_for >= 0 and score_against >= 0 and score_for <= 45 and score_against <= 45),
  constraint bouts_touches_to_check
    check (touches_to is null or touches_to between 1 and 45),
  constraint bouts_duration_check
    check (duration_s is null or (duration_s > 0 and duration_s <= 3600)),
  constraint bouts_opponent_handedness_check
    check (opponent_handedness is null or opponent_handedness = any (array['right','left','ambidextrous'])),
  -- An opponent is either one of ours or a named outsider. A bout against
  -- nobody is a typo, and it would silently skew every rate on the page.
  constraint bouts_has_an_opponent
    check (opponent_id is not null or coalesce(opponent_name, '') <> ''),
  constraint bouts_not_self
    check (opponent_id is null or opponent_id <> fencer_id),
  -- Inline opponent details belong to an outside opponent; for a club member
  -- the profile is the source of truth and a second copy would rot.
  constraint bouts_no_inline_details_for_members
    check (opponent_id is null or (opponent_name is null and opponent_club is null
           and opponent_external_id is null and opponent_handedness is null
           and opponent_rating is null))
);

create index if not exists bouts_fencer_idx   on public.bouts (fencer_id, bouted_on desc);
create index if not exists bouts_opponent_idx on public.bouts (opponent_id, bouted_on desc) where opponent_id is not null;
create index if not exists bouts_event_idx    on public.bouts (event_id) where event_id is not null;
create index if not exists bouts_weapon_idx   on public.bouts (weapon, bouted_on desc);

create trigger bouts_touch_updated_at
  before update on public.bouts
  for each row execute function public.touch_updated_at();

-- Canonical orientation for a bout between two club members: the lower uuid is
-- always `fencer_id`. Whoever types it in gets to type it from their own point
-- of view — the trigger flips the row if necessary, scores and all — and the
-- unique index below then makes a duplicate entry from the other side fail
-- loudly instead of quietly doubling everyone's bout count.
create or replace function public.bouts_canonical_orientation() returns trigger
  language plpgsql set search_path to 'public'
  as $$
declare
  v_tmp_id uuid;
  v_tmp_score integer;
begin
  if new.opponent_id is not null and new.fencer_id > new.opponent_id then
    v_tmp_id        := new.fencer_id;
    new.fencer_id   := new.opponent_id;
    new.opponent_id := v_tmp_id;

    v_tmp_score        := new.score_for;
    new.score_for      := new.score_against;
    new.score_against  := v_tmp_score;
  end if;
  return new;
end;
$$;

create trigger bouts_canonicalize
  before insert or update of fencer_id, opponent_id on public.bouts
  for each row execute function public.bouts_canonical_orientation();

-- One bout per pair, per day, per position. The key is what stops the same bout
-- being entered twice from opposite ends of the strip; every column in it earns
-- its place:
--
--   bouted_on    because an event can span days — a two-day tournament, a term
--                course that is one row and eight evenings — and the same pair
--                meeting again next week is a second bout, not a duplicate.
--                Leaving this out silently discarded two thirds of a term's
--                bouts in testing, with no error anywhere.
--   bout_number  because two people do fence twice in one session, and the
--                number is what distinguishes a rematch from a double entry.
--                Unnumbered, a pair gets one bout per day — the right default,
--                since an unnumbered second row is far more often a mistake.
create unique index if not exists bouts_no_duplicate_internal
  on public.bouts (event_id, bouted_on, fencer_id, opponent_id, coalesce(bout_number, 0))
  where event_id is not null and opponent_id is not null;

-- Each fencer's own view of every bout they were in: their score first, the
-- other person second, whoever typed it in. Internal bouts appear twice (once
-- per side) and external bouts once. Every statistic in src/lib/bout-stats.ts
-- reads this, never `bouts` directly.
create or replace view public.bout_sides
  with (security_invoker = true)
  as
    select
      b.id as bout_id, b.bouted_on, b.event_id, b.competition_id, b.weapon,
      b.bout_type, b.touches_to, b.bout_number, b.duration_s, b.notes,
      b.fencer_id                                   as member_id,
      b.score_for                                   as touches_scored,
      b.score_against                               as touches_received,
      b.result,
      b.opponent_id,
      b.opponent_name, b.opponent_club, b.opponent_external_id,
      b.opponent_handedness, b.opponent_rating,
      false                                         as mirrored
    from public.bouts b
  union all
    select
      b.id, b.bouted_on, b.event_id, b.competition_id, b.weapon,
      b.bout_type, b.touches_to, b.bout_number, b.duration_s, b.notes,
      b.opponent_id                                 as member_id,
      b.score_against                               as touches_scored,
      b.score_for                                   as touches_received,
      case when b.score_against > b.score_for then 'win'
           when b.score_against < b.score_for then 'loss'
           else 'tie' end                           as result,
      b.fencer_id                                   as opponent_id,
      null::text, null::text, null::text, null::text, null::text,
      true                                          as mirrored
    from public.bouts b
    where b.opponent_id is not null;

grant select on public.bout_sides to authenticated;

-- A fencer reads their own bouts and their children's. A bout they were in but
-- did not record is still theirs to see — that is what the opponent_id arm is.
create policy bouts_select_own on public.bouts
  for select to authenticated
  using (public.is_self_or_child(fencer_id) or public.is_self_or_child(opponent_id));

create policy bouts_insert_own on public.bouts
  for insert to authenticated
  with check (
    public.is_active_user()
    and (public.is_self_or_child(fencer_id) or public.is_self_or_child(opponent_id))
  );

-- Only whoever recorded it can edit it afterwards. Both fencers can see a bout;
-- letting both rewrite the score is how a disputed 5-4 becomes an edit war.
create policy bouts_update_recorder on public.bouts
  for update to authenticated
  using (recorded_by = auth.uid()) with check (recorded_by = auth.uid());

create policy bouts_delete_recorder on public.bouts
  for delete to authenticated using (recorded_by = auth.uid());

create policy bouts_all_staff on public.bouts
  for all to authenticated
  using (public.is_coach_or_admin()) with check (public.is_coach_or_admin());


-- ── competitions ─────────────────────────────────────────────────────────────
-- The event as the wider world knows it, separate from the club's own calendar
-- row. A member who enters a competition the club did not organize still has a
-- result worth recording, and there is no `events` row for it.

create table if not exists public.competitions (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  name        text not null,
  start_date  date not null,
  end_date    date,
  location    text,
  country     text,
  organizer   text,
  level       text not null default 'local',
  url         text,
  -- Set when the club also put this on its own calendar.
  event_id    uuid references public.events(id) on delete set null,

  constraint competitions_level_check
    check (level = any (array['club','local','regional','national','international'])),
  constraint competitions_dates_check
    check (end_date is null or end_date >= start_date)
);

create index if not exists competitions_date_idx on public.competitions (start_date desc);

alter table public.bouts
  add constraint bouts_competition_fk
  foreign key (competition_id) references public.competitions(id) on delete set null;

create index if not exists bouts_competition_idx
  on public.bouts (competition_id) where competition_id is not null;

create policy competitions_select on public.competitions
  for select to authenticated using (public.is_active_user());

create policy competitions_write_staff on public.competitions
  for all to authenticated
  using (public.is_coach_or_admin()) with check (public.is_coach_or_admin());


-- ── competition results ──────────────────────────────────────────────────────
-- One row per fencer per event-within-a-competition. A competition runs several
-- events — men's épée, women's saber, U17 — and a fencer can be in more than
-- one, so weapon and category are part of the row, not the competition.

create table if not exists public.competition_results (
  id             uuid primary key default gen_random_uuid(),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  competition_id uuid not null references public.competitions(id) on delete cascade,
  fencer_id      uuid not null references public.profiles(id) on delete cascade,
  weapon         text not null,
  category       text,

  place          integer,
  entrants       integer,
  seed_before    integer,

  -- The pool round, as the sheet records it. Kept as five plain numbers rather
  -- than a parsed pool sheet: every federation prints them, every fencer can
  -- read them off the wall, and the indicator (V/M and TS−TR) is what the
  -- seeding for the DE table is actually computed from.
  pool_victories integer,
  pool_bouts     integer,
  pool_touches_for     integer,
  pool_touches_against integer,
  seed_after_pools     integer,

  -- The elimination table: how far they got, and against whom. `de_rounds` is
  -- the number of DE bouts won, so 0 means "lost the first one".
  de_rounds_won  integer,
  de_exit_round  text,

  rating_earned  text,
  points         numeric,
  notes          text,
  recorded_by    uuid references public.profiles(id) on delete set null,

  -- V − M and TS − TR, the two numbers a fencer quotes at each other. Generated
  -- so they cannot disagree with the columns they come from.
  pool_indicator integer generated always as
    (coalesce(pool_touches_for, 0) - coalesce(pool_touches_against, 0)) stored,

  constraint competition_results_weapon_check
    check (weapon = any (array['epee','foil','saber'])),
  constraint competition_results_place_check
    check (place is null or place >= 1),
  constraint competition_results_entrants_check
    check (entrants is null or entrants >= 1),
  constraint competition_results_place_within_field
    check (place is null or entrants is null or place <= entrants),
  constraint competition_results_pool_check
    check (pool_victories is null or pool_bouts is null or pool_victories <= pool_bouts),
  constraint competition_results_rating_check
    check (rating_earned is null or rating_earned = any (array['A','B','C','D','E'])),
  constraint competition_results_de_check
    check (de_rounds_won is null or de_rounds_won >= 0),
  constraint competition_results_place_sane
    check (place is null or de_rounds_won is null or place >= 1)
);

create index if not exists competition_results_fencer_idx on public.competition_results (fencer_id);

-- One result per fencer per event within a competition. An expression index,
-- not a constraint: `category` is nullable for a competition with a single
-- open field, and a plain unique over it would never fire on those rows.
create unique index if not exists competition_results_one_per_event
  on public.competition_results (competition_id, fencer_id, weapon, coalesce(category, ''));

create trigger competition_results_touch_updated_at
  before update on public.competition_results
  for each row execute function public.touch_updated_at();

create policy competition_results_select_own on public.competition_results
  for select to authenticated using (public.is_self_or_child(fencer_id));

-- Results are public within the club. A placement is a public fact — it was
-- announced in a hall — and hiding club-mates' results makes the club's own
-- record of its season unreadable.
create policy competition_results_select_club on public.competition_results
  for select to authenticated using (public.is_active_user());

create policy competition_results_write_own on public.competition_results
  for all to authenticated
  using (public.is_self_or_child(fencer_id))
  with check (public.is_active_user() and public.is_self_or_child(fencer_id));

create policy competition_results_write_staff on public.competition_results
  for all to authenticated
  using (public.is_coach_or_admin()) with check (public.is_coach_or_admin());


-- ── fitness tests ────────────────────────────────────────────────────────────
-- The athletic benchmarks, as a log rather than a set of columns on `profiles`.
--
-- This is the whole reason the athlete block on `profiles` holds only stable
-- measurements. A `sprint_100m_s` column answers "how fast is she?" and
-- destroys the answer to "is she getting faster?" — which is the only question
-- worth asking about a benchmark. One row per test, with a date, keeps both.
--
-- `metric` is an open vocabulary pinned by a check constraint, mirrored in
-- src/lib/fitness-metrics.ts along with each metric's unit and whether a lower
-- number is a better one (a 5k improves downward, a jump upward — every chart
-- and every personal-best query needs to know which).

create table if not exists public.fitness_tests (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  fencer_id   uuid not null references public.profiles(id) on delete cascade,
  tested_on   date not null,
  metric      text not null,
  value       numeric not null,
  -- Denormalized from the metric's definition so a stored row is still
  -- readable if the vocabulary is ever re-cut, and so an export needs no join.
  unit        text not null,
  -- 'left' / 'right' for the single-sided tests (single-leg jump, grip), where
  -- the difference between sides is itself the finding.
  side        text,
  conditions  text,
  notes       text,
  recorded_by uuid references public.profiles(id) on delete set null,

  constraint fitness_tests_metric_check
    check (metric = any (array[
      'sprint_30m','sprint_100m','run_1k','run_5k',
      'lunge_length','advance_retreat_10m','footwork_shuttle',
      'vertical_jump','broad_jump','single_leg_hop',
      'plank_hold','push_ups','sit_ups','pull_ups',
      'grip_strength','sit_and_reach','beep_test','t_test','illinois_agility',
      'bodyweight','resting_hr'
    ])),
  constraint fitness_tests_unit_check
    check (unit = any (array['s','m','cm','kg','reps','level','bpm'])),
  constraint fitness_tests_side_check
    check (side is null or side = any (array['left','right'])),
  constraint fitness_tests_value_check check (value >= 0),
  constraint fitness_tests_not_future
    check (tested_on <= (now() at time zone 'utc')::date + 1)
);

create index if not exists fitness_tests_fencer_idx on public.fitness_tests (fencer_id, metric, tested_on desc);

create policy fitness_tests_select_own on public.fitness_tests
  for select to authenticated using (public.is_self_or_child(fencer_id));

create policy fitness_tests_select_staff on public.fitness_tests
  for select to authenticated using (public.is_coach_or_admin());

create policy fitness_tests_write_own on public.fitness_tests
  for all to authenticated
  using (public.is_self_or_child(fencer_id))
  with check (public.is_active_user() and public.is_self_or_child(fencer_id));

create policy fitness_tests_write_staff on public.fitness_tests
  for all to authenticated
  using (public.is_coach_or_admin()) with check (public.is_coach_or_admin());
