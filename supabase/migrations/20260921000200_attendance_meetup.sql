-- ─────────────────────────────────────────────────────────────────────────────
-- "Who is coming today?", and "then where should we meet?"
--
-- These are one feature in two tables. The poll collects the answers; the
-- planner reads the answers and proposes a point. The math is deliberately NOT
-- in the database — it lives in src/lib/meetup.ts as pure functions so it can
-- be unit-tested against known geometry without a stack running. What is here
-- is the record of what was asked, who answered, and which suggestion the club
-- actually took.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── polls ────────────────────────────────────────────────────────────────────
-- One poll per event. Not per day: two sessions on the same evening are two
-- different questions, and a fencer can come to one and not the other.

create table if not exists public.attendance_polls (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  event_id    uuid not null references public.events(id) on delete cascade,
  -- Overrides the event's own title in the push notification, for the weeks
  -- the question is not simply "coming on Tuesday?".
  question    text,
  opens_at    timestamptz not null default now(),
  -- After this the poll stops accepting answers and the planner freezes its
  -- suggestion. Null = open until the event starts.
  closes_at   timestamptz,
  status      text not null default 'open',
  -- Whether a member may answer for a guest they are bringing. Guests count
  -- toward the headcount and are ignored by the planner, which has no origin
  -- for them.
  allow_guests boolean not null default true,
  created_by  uuid references public.profiles(id) on delete set null,

  constraint attendance_polls_status_check
    check (status = any (array['open','closed'])),
  constraint attendance_polls_window_check
    check (closes_at is null or closes_at > opens_at),
  constraint attendance_polls_one_per_event unique (event_id)
);

create index if not exists attendance_polls_status_idx on public.attendance_polls (status, closes_at);

create trigger attendance_polls_touch_updated_at
  before update on public.attendance_polls
  for each row execute function public.touch_updated_at();

create policy attendance_polls_select on public.attendance_polls
  for select to authenticated using (public.is_active_user());

create policy attendance_polls_write_staff on public.attendance_polls
  for all to authenticated
  using (public.is_coach_or_admin()) with check (public.is_coach_or_admin());


-- ── responses ────────────────────────────────────────────────────────────────
-- One row per member per poll, upserted. A member changing their mind updates
-- their row rather than adding a second one, and `updated_at` is what tells the
-- planner that the roster shifted after it last ran.

create table if not exists public.attendance_responses (
  id           uuid primary key default gen_random_uuid(),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  poll_id      uuid not null references public.attendance_polls(id) on delete cascade,
  member_id    uuid not null references public.profiles(id) on delete cascade,
  response     text not null,
  -- When they can actually get there. A club that knows four people arrive at
  -- 19:00 and three at 20:00 runs the warm-up differently.
  arriving_at  time,
  leaving_at   time,
  guests       integer not null default 0,

  -- Where they are travelling FROM for this session, when it is not home —
  -- straight from the office, or from a parent's place at the weekend. Null
  -- means "use my profile's home pin", which is the normal case. The planner
  -- resolves this in src/lib/meetup.ts, not here, so the fallback is visible
  -- and testable rather than buried in a view.
  origin_lat   numeric,
  origin_lng   numeric,
  origin_label text,
  travel_mode  text,

  -- Carpool intent, captured in the same breath as the RSVP because that is
  -- the moment somebody knows whether they are driving.
  seats_offered integer not null default 0,
  needs_ride    boolean not null default false,

  note         text,

  constraint attendance_responses_response_check
    check (response = any (array['yes','no','maybe'])),
  constraint attendance_responses_guests_check
    check (guests >= 0 and guests <= 10),
  constraint attendance_responses_seats_check
    check (seats_offered >= 0 and seats_offered <= 8),
  constraint attendance_responses_travel_mode_check
    check (travel_mode is null or travel_mode = any (array['walk','bike','transit','drive'])),
  constraint attendance_responses_origin_complete
    check ((origin_lat is null) = (origin_lng is null)),
  constraint attendance_responses_lat_check check (origin_lat is null or (origin_lat between -90 and 90)),
  constraint attendance_responses_lng_check check (origin_lng is null or (origin_lng between -180 and 180)),
  -- Somebody who is not coming is not also offering three seats and needing a
  -- lift. Left loose for 'maybe', which is exactly the case where a fencer
  -- says "if I make it, I can drive".
  constraint attendance_responses_no_logistics_on_no
    check (response <> 'no' or (seats_offered = 0 and needs_ride = false and guests = 0)),
  constraint attendance_responses_one_per_member unique (poll_id, member_id)
);

create index if not exists attendance_responses_poll_idx   on public.attendance_responses (poll_id, response);
create index if not exists attendance_responses_member_idx on public.attendance_responses (member_id, created_at desc);

create trigger attendance_responses_touch_updated_at
  before update on public.attendance_responses
  for each row execute function public.touch_updated_at();

-- A closed poll takes no more answers. Enforced here rather than by hiding the
-- form, because the form is not the only way a row gets in.
create or replace function public.attendance_responses_poll_open() returns trigger
  language plpgsql set search_path to 'public'
  as $$
declare
  v_status text;
  v_closes timestamptz;
begin
  if not public.is_end_user() or public.is_coach_or_admin() then
    return new;
  end if;
  select status, closes_at into v_status, v_closes
    from public.attendance_polls where id = new.poll_id;
  if v_status <> 'open' or (v_closes is not null and now() > v_closes) then
    raise exception 'this poll is closed' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger attendance_responses_require_open_poll
  before insert or update on public.attendance_responses
  for each row execute function public.attendance_responses_poll_open();

-- Everyone in the club sees who is coming. That visibility IS the feature —
-- people decide whether to come based on who else will be there — so it is not
-- gated behind a role.
create policy attendance_responses_select on public.attendance_responses
  for select to authenticated using (public.is_active_user());

create policy attendance_responses_write_own on public.attendance_responses
  for all to authenticated
  using (public.is_self_or_child(member_id))
  with check (public.is_active_user() and public.is_self_or_child(member_id));

create policy attendance_responses_write_staff on public.attendance_responses
  for all to authenticated
  using (public.is_coach_or_admin()) with check (public.is_coach_or_admin());


-- The headcount for a set of polls, in one round trip — what the calendar
-- badge and the dashboard read. A view rather than a function so PostgREST can
-- filter and join it; security_invoker keeps it behind the reader's own RLS.
create or replace view public.attendance_tally
  with (security_invoker = true)
  as select
    p.id                                                              as poll_id,
    p.event_id,
    count(*) filter (where r.response = 'yes')                        as yes,
    count(*) filter (where r.response = 'maybe')                      as maybe,
    count(*) filter (where r.response = 'no')                         as no,
    coalesce(sum(r.guests) filter (where r.response = 'yes'), 0)      as guests,
    coalesce(sum(r.seats_offered) filter (where r.response <> 'no'), 0) as seats_offered,
    count(*) filter (where r.needs_ride and r.response <> 'no')       as needs_ride,
    max(r.updated_at)                                                 as last_answer_at
  from public.attendance_polls p
  left join public.attendance_responses r on r.poll_id = p.id
  group by p.id, p.event_id;

grant select on public.attendance_tally to authenticated;


-- ── meetup suggestions ───────────────────────────────────────────────────────
-- What the planner proposed, and which one the club took. Stored rather than
-- recomputed on demand for two reasons: the answer must not change under
-- somebody's feet after it has been announced, and "where did we actually meet
-- in October, and how far did people travel?" is a question worth being able
-- to ask a year later.

create table if not exists public.meetup_suggestions (
  id           uuid primary key default gen_random_uuid(),
  created_at   timestamptz not null default now(),
  poll_id      uuid not null references public.attendance_polls(id) on delete cascade,
  -- Which objective produced this row. Both are always computed and offered:
  --   'total'    — the geometric median: least total travel across everyone
  --   'fairest'  — the 1-center: the shortest worst individual journey
  --   'centroid' — the plain mean, kept because it is what people expect to
  --                see and because showing it next to the median is the
  --                clearest way to explain why the median is better
  --   'venue'    — a real venue from the venues table, ranked against the above
  method       text not null,
  lat          numeric not null,
  lng          numeric not null,
  -- Set when `method` = 'venue', or when a computed point was matched to the
  -- nearest usable venue. Null for a bare coordinate.
  venue_id     uuid references public.venues(id) on delete set null,

  -- The numbers behind the ranking, frozen at compute time.
  respondents  integer not null,
  total_km     numeric not null,
  max_km       numeric not null,
  mean_km      numeric not null,
  -- Spread of individual journeys. A low total with a high stddev means one
  -- person is carrying the whole group's convenience, which is worth seeing.
  stddev_km    numeric not null default 0,
  -- Longest estimated door-to-door journey, in minutes, at each fencer's own
  -- travel speed. The number people actually argue about.
  max_minutes  numeric,

  chosen       boolean not null default false,
  computed_at  timestamptz not null default now(),
  chosen_at    timestamptz,
  chosen_by    uuid references public.profiles(id) on delete set null,

  constraint meetup_suggestions_method_check
    check (method = any (array['total','fairest','centroid','venue'])),
  constraint meetup_suggestions_lat_check check (lat between -90 and 90),
  constraint meetup_suggestions_lng_check check (lng between -180 and 180),
  constraint meetup_suggestions_respondents_check check (respondents >= 0),
  constraint meetup_suggestions_distances_check
    check (total_km >= 0 and max_km >= 0 and mean_km >= 0 and stddev_km >= 0),
  constraint meetup_suggestions_venue_method
    check (method <> 'venue' or venue_id is not null)
);

create index if not exists meetup_suggestions_poll_idx on public.meetup_suggestions (poll_id, computed_at desc);

-- Exactly one chosen suggestion per poll. A partial unique index rather than a
-- trigger: the constraint is about the shape of the table, and the database can
-- hold it under concurrency where a read-then-write trigger cannot.
create unique index if not exists meetup_suggestions_one_chosen
  on public.meetup_suggestions (poll_id) where chosen;

create or replace function public.meetup_suggestions_stamp_choice() returns trigger
  language plpgsql set search_path to 'public'
  as $$
begin
  if new.chosen and not coalesce(old.chosen, false) then
    new.chosen_at := now();
    new.chosen_by := auth.uid();
  elsif not new.chosen then
    new.chosen_at := null;
    new.chosen_by := null;
  end if;
  return new;
end;
$$;

create trigger meetup_suggestions_stamp
  before insert or update of chosen on public.meetup_suggestions
  for each row execute function public.meetup_suggestions_stamp_choice();

create policy meetup_suggestions_select on public.meetup_suggestions
  for select to authenticated using (public.is_active_user());

create policy meetup_suggestions_write_staff on public.meetup_suggestions
  for all to authenticated
  using (public.is_coach_or_admin()) with check (public.is_coach_or_admin());


-- ── carpool ──────────────────────────────────────────────────────────────────
-- Who drives, and who rides with them. Separate from `seats_offered` on a poll
-- response: that is an intention captured at RSVP time, this is the actual
-- assignment somebody made afterwards.

create table if not exists public.vehicles (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  owner_id    uuid references public.profiles(id) on delete set null,
  label       text not null,
  seats       integer not null,
  plate       text,
  notes       text,
  active      boolean not null default true,

  constraint vehicles_seats_check check (seats between 1 and 12)
);

create policy vehicles_select on public.vehicles
  for select to authenticated using (public.is_active_user());

create policy vehicles_write_own on public.vehicles
  for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

create policy vehicles_write_staff on public.vehicles
  for all to authenticated
  using (public.is_coach_or_admin()) with check (public.is_coach_or_admin());


create table if not exists public.event_rides (
  id           uuid primary key default gen_random_uuid(),
  created_at   timestamptz not null default now(),
  event_id     uuid not null references public.events(id) on delete cascade,
  vehicle_id   uuid references public.vehicles(id) on delete set null,
  driver_id    uuid references public.profiles(id) on delete set null,
  -- Seats on offer for THIS trip, which is not always the car's full capacity.
  seats        integer not null,
  pickup_label text,
  pickup_lat   numeric,
  pickup_lng   numeric,
  leaving_at   time,
  notes        text,

  constraint event_rides_seats_check check (seats between 1 and 12),
  constraint event_rides_pickup_complete check ((pickup_lat is null) = (pickup_lng is null))
);

create index if not exists event_rides_event_idx on public.event_rides (event_id);


create table if not exists public.ride_seats (
  id           uuid primary key default gen_random_uuid(),
  created_at   timestamptz not null default now(),
  ride_id      uuid not null references public.event_rides(id) on delete cascade,
  member_id    uuid not null references public.profiles(id) on delete cascade,
  status       text not null default 'claimed',

  constraint ride_seats_status_check
    check (status = any (array['claimed','waitlisted','cancelled'])),
  constraint ride_seats_one_per_member unique (ride_id, member_id)
);

-- A car does not hold more people than it has seats. Same reasoning as the
-- event waitlist: two people tapping "claim" at once both pass a client-side
-- check, and the person who loses only finds out at the curb.
create or replace function public.ride_seats_waitlist_when_full() returns trigger
  language plpgsql security definer set search_path to 'public'
  as $$
declare
  v_seats integer;
  v_taken integer;
begin
  if new.status <> 'claimed' then
    return new;
  end if;
  select seats into v_seats from public.event_rides where id = new.ride_id for update;
  select count(*) into v_taken from public.ride_seats
    where ride_id = new.ride_id and status = 'claimed' and id <> new.id;
  if v_taken >= v_seats then
    new.status := 'waitlisted';
  end if;
  return new;
end;
$$;

create trigger ride_seats_waitlist
  before insert or update of status on public.ride_seats
  for each row execute function public.ride_seats_waitlist_when_full();

create policy event_rides_select on public.event_rides
  for select to authenticated using (public.is_active_user());

create policy event_rides_write_driver on public.event_rides
  for all to authenticated
  using (driver_id = auth.uid()) with check (driver_id = auth.uid());

create policy event_rides_write_staff on public.event_rides
  for all to authenticated
  using (public.is_coach_or_admin()) with check (public.is_coach_or_admin());

create policy ride_seats_select on public.ride_seats
  for select to authenticated using (public.is_active_user());

create policy ride_seats_write_own on public.ride_seats
  for all to authenticated
  using (public.is_self_or_child(member_id))
  with check (public.is_active_user() and public.is_self_or_child(member_id));

create policy ride_seats_write_staff on public.ride_seats
  for all to authenticated
  using (public.is_coach_or_admin()) with check (public.is_coach_or_admin());
