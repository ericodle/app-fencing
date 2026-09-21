-- ─────────────────────────────────────────────────────────────────────────────
-- Where the club fences, what it puts on, and who signed up.
--
-- One `events` table, discriminated by `kind`. Practices, courses, pop-ups,
-- tournaments, interclubs and socials are all rows here, and every child table
-- (bookings, event_vehicles, attendance_polls, bouts, …) points at it with a
-- plain event_id. The vocabulary lives in src/lib/event-kinds.ts and is pinned
-- to `events_kind_check` by a compile-time guard in src/types/database.ts.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── venues ───────────────────────────────────────────────────────────────────
-- Every place the club has ever fenced. A salle, a school gym, a corner of a
-- park. Coordinates are required, not optional: a venue with no pin cannot be
-- ranked by the meetup planner, and a venue the planner cannot see is one the
-- club will stop using without meaning to.

create table if not exists public.venues (
  id           uuid primary key default gen_random_uuid(),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  name         text not null,
  native_name  text,
  kind         text not null default 'salle',
  address      text,
  district     text,
  lat          numeric not null,
  lng          numeric not null,
  -- Free text handed to a maps deep link, for the places whose official
  -- address does not find them. "Minsheng Park east gate, Taipei".
  map_query    text,
  -- How many strips can be run here at once. Caps what a session can hold, and
  -- is the number that decides whether an interclub fits.
  pistes       integer,
  capacity     integer,
  indoor       boolean not null default true,
  -- Grounded boxes, floor reels, a scoring machine the club does not have to
  -- carry. A park has none of it; that is the point of recording it.
  has_scoring  boolean not null default false,
  hourly_cost  numeric,
  currency     text,
  notes        text,
  status       text not null default 'active',

  constraint venues_kind_check
    check (kind = any (array['salle','gym','school','park','community','competition','other'])),
  constraint venues_status_check
    check (status = any (array['active','archived'])),
  constraint venues_lat_check      check (lat between -90 and 90),
  constraint venues_lng_check      check (lng between -180 and 180),
  constraint venues_pistes_check   check (pistes is null or pistes >= 0),
  constraint venues_capacity_check check (capacity is null or capacity >= 0),
  constraint venues_cost_check     check (hourly_cost is null or hourly_cost >= 0)
);

create index if not exists venues_status_idx on public.venues (status);

create trigger venues_touch_updated_at
  before update on public.venues
  for each row execute function public.touch_updated_at();

create policy venues_select_active on public.venues
  for select to authenticated using (public.is_active_user());

create policy venues_write_admin on public.venues
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create trigger venues_audit
  after insert or update or delete on public.venues
  for each row execute function public.audit_admin_write();


-- ── events ───────────────────────────────────────────────────────────────────

create table if not exists public.events (
  id                   uuid primary key default gen_random_uuid(),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  kind                 text not null,

  -- Three titles, because they are read in three places with different room.
  -- `admin_title` is what staff type; `display_title` is what a member sees on
  -- the event page; `calendar_title` is the short form that has to survive a
  -- calendar cell on a phone. Blank display/calendar titles fall back to
  -- admin_title in the app rather than being backfilled here.
  admin_title          text not null,
  display_title        text,
  calendar_title       text,

  venue_id             uuid references public.venues(id) on delete set null,
  -- Set once the meetup planner's suggestion is accepted, so the event keeps
  -- the venue it was originally scheduled at and the app can show the move.
  original_venue_id    uuid references public.venues(id) on delete set null,

  start_date           date,
  end_date             date,
  start_time           time,
  end_time             time,
  -- Courses only: the explicit list of days the term runs on.
  course_days          date[],

  weapons              text[] not null default '{}',
  level                text not null default 'all',
  capacity             integer,
  fully_booked         boolean not null default false,
  price                numeric,
  currency             text,
  full_payment_deadline date,
  cancel_date          date,
  cancelled_at         timestamptz,
  cancellation_reason  text,

  -- Whether to open an attendance poll for this event. Defaults from the kind
  -- (see pollsAttendance in src/lib/event-kinds.ts) but is overridable: a
  -- club night with a known crowd need not be polled every week.
  polls_attendance     boolean,
  -- Whether the meetup planner may propose moving this event. Only meaningful
  -- for kinds where venueIsNegotiable(); the app does not offer the toggle
  -- elsewhere, and a stray true here does nothing on its own.
  meetup_open          boolean not null default false,

  series_id            uuid,
  featured             boolean not null default false,
  featured_image       text,
  is_private           boolean not null default false,
  prereqs              text,
  included             text,
  notes                text,
  created_by           uuid references public.profiles(id) on delete set null,

  constraint events_kind_check
    check (kind = any (array['practice','course','popup','tournament','interclub','social'])),
  constraint events_level_check
    check (level = any (array['all','beginner','intermediate','advanced','open'])),
  constraint events_weapons_check
    check (weapons <@ array['epee','foil','saber']),
  constraint events_capacity_check
    check (capacity is null or capacity >= 0),
  constraint events_price_check
    check (price is null or price >= 0),
  -- A course is defined by its day list; everything else by a start date. The
  -- two shapes are what usesDateEnvelope() splits on, and an event with
  -- neither would simply never be fetched by either query.
  constraint events_course_has_days
    check (kind <> 'course' or (course_days is not null and array_length(course_days, 1) >= 1)),
  constraint events_dated_has_start
    check (kind = 'course' or start_date is not null),
  constraint events_end_after_start
    check (end_date is null or start_date is null or end_date >= start_date)
);

create index if not exists events_kind_start_idx on public.events (kind, start_date);
create index if not exists events_start_idx      on public.events (start_date) where cancelled_at is null;
create index if not exists events_series_idx     on public.events (series_id) where series_id is not null;
create index if not exists events_venue_idx      on public.events (venue_id);

create trigger events_touch_updated_at
  before update on public.events
  for each row execute function public.touch_updated_at();

-- Remember where an event started out the first time its venue changes, so
-- "moved from Bade Road to Daan Park" is answerable later. Set once and never
-- overwritten: the original is the original.
create or replace function public.events_remember_original_venue() returns trigger
  language plpgsql set search_path to 'public'
  as $$
begin
  if new.venue_id is distinct from old.venue_id and new.original_venue_id is null then
    new.original_venue_id := old.venue_id;
  end if;
  return new;
end;
$$;

create trigger events_keep_original_venue
  before update of venue_id on public.events
  for each row execute function public.events_remember_original_venue();

create policy events_select_members on public.events
  for select to authenticated
  using (public.is_active_user() and (not is_private or public.is_coach_or_admin()));

create policy events_select_staff on public.events
  for select to authenticated using (public.is_coach_or_admin());

create policy events_write_admin on public.events
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- A coach may move a session, and nothing else about it.
--
-- This exists because of the meetup planner. The coach running Saturday's
-- pop-up is exactly the person who decides where it meets, on Friday night,
-- from the answers that have come in — and without this they could save the
-- decision (meetup_suggestions takes a coach's write) while the event itself
-- silently did not move. That failure has no error anywhere: the policy filters
-- the row out, PostgREST returns 204, and everyone turns up at the old venue.
--
-- The row-level permission is here; the column-level restriction is the trigger
-- below, because a policy cannot name columns. Same split as the member guard
-- on bookings.
create policy events_update_coach on public.events
  for update to authenticated
  using (public.is_coach_or_admin()) with check (public.is_coach_or_admin());

create or replace function public.events_coach_may_only_move_venue() returns trigger
  language plpgsql set search_path to 'public'
  as $$
begin
  if not public.is_end_user() or public.is_admin() then
    return new;
  end if;

  -- Everything a coach is NOT allowed to touch. Listed positively rather than
  -- comparing whole rows, so a column added in a later migration is locked by
  -- default and has to be let in deliberately.
  if new.kind             is distinct from old.kind
  or new.admin_title      is distinct from old.admin_title
  or new.display_title    is distinct from old.display_title
  or new.calendar_title   is distinct from old.calendar_title
  or new.start_date       is distinct from old.start_date
  or new.end_date         is distinct from old.end_date
  or new.course_days      is distinct from old.course_days
  or new.capacity         is distinct from old.capacity
  or new.price            is distinct from old.price
  or new.currency         is distinct from old.currency
  or new.is_private       is distinct from old.is_private
  or new.cancelled_at     is distinct from old.cancelled_at then
    raise exception 'a coach may move a session or change its notes; the rest is an admin change'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger events_coach_move_guard
  before update on public.events
  for each row execute function public.events_coach_may_only_move_venue();

create trigger events_audit
  after insert or update or delete on public.events
  for each row execute function public.audit_admin_write();


-- ── bookings ─────────────────────────────────────────────────────────────────
-- A place held for one person at one event. Distinct from attendance: a booking
-- is a commitment made in advance and possibly paid for; attendance is whether
-- they actually turned up. A term course has bookings and no poll; a Tuesday
-- club night has a poll and usually no bookings. Both exist because a club runs
-- both kinds of thing.

create table if not exists public.bookings (
  id             uuid primary key default gen_random_uuid(),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  event_id       uuid not null references public.events(id) on delete cascade,
  member_id      uuid not null references public.profiles(id) on delete cascade,
  -- Who pays. A parent booking for two juniors is one payer and three bookings.
  payer_id       uuid references public.profiles(id) on delete set null,
  status         text not null default 'confirmed',
  -- Kit the club is lending them for this event, from clubConfig.club
  -- .equipmentItems. Empty for a fencer who brings their own.
  loaner_kit     text[] not null default '{}',
  weapon         text,
  amount_due     numeric not null default 0,
  amount_paid    numeric not null default 0,
  notes          text,
  cancelled_at   timestamptz,
  created_by     uuid references public.profiles(id) on delete set null,

  constraint bookings_status_check
    check (status = any (array['confirmed','waitlisted','cancelled','no_show'])),
  constraint bookings_weapon_check
    check (weapon is null or weapon = any (array['epee','foil','saber'])),
  constraint bookings_amount_due_check  check (amount_due  >= 0),
  constraint bookings_amount_paid_check check (amount_paid >= 0),
  constraint bookings_unique_member_event unique (event_id, member_id)
);

create index if not exists bookings_event_idx  on public.bookings (event_id, status);
create index if not exists bookings_member_idx on public.bookings (member_id, created_at desc);
create index if not exists bookings_payer_idx  on public.bookings (payer_id) where payer_id is not null;

create trigger bookings_touch_updated_at
  before update on public.bookings
  for each row execute function public.touch_updated_at();

-- How many places an event has actually sold. A function rather than a stored
-- counter because a counter and its rows drift, and the drift is only ever
-- found when somebody is turned away from a session with space in it.
create or replace function public.event_confirmed_count(p_event_id uuid) returns integer
  language sql stable security definer set search_path to 'public'
  as $$
  select count(*)::integer from public.bookings
  where event_id = p_event_id and status = 'confirmed'
$$;

-- The same count for a page full of events, in one round trip.
create or replace function public.event_confirmed_counts(p_event_ids uuid[])
  returns table (event_id uuid, n integer)
  language sql stable security definer set search_path to 'public'
  as $$
  select b.event_id, count(*)::integer
  from public.bookings b
  where b.event_id = any (p_event_ids) and b.status = 'confirmed'
  group by b.event_id
$$;

grant execute on function public.event_confirmed_count(uuid)   to authenticated, service_role;
grant execute on function public.event_confirmed_counts(uuid[]) to authenticated, service_role;

-- A booking made into a full event is waitlisted by the database, not by the
-- form that submitted it. Two people registering at once both pass a
-- client-side capacity check and the event goes one over; this cannot.
create or replace function public.set_waitlisted_when_event_full() returns trigger
  language plpgsql security definer set search_path to 'public'
  as $$
declare
  v_capacity integer;
  v_taken    integer;
begin
  if new.status <> 'confirmed' then
    return new;
  end if;
  select capacity into v_capacity from public.events where id = new.event_id for update;
  if v_capacity is null then
    return new;
  end if;
  select count(*) into v_taken from public.bookings
    where event_id = new.event_id and status = 'confirmed' and id <> new.id;
  if v_taken >= v_capacity then
    new.status := 'waitlisted';
  end if;
  return new;
end;
$$;

create trigger bookings_waitlist_when_full
  before insert or update of status on public.bookings
  for each row execute function public.set_waitlisted_when_event_full();

create policy bookings_select_own on public.bookings
  for select to authenticated
  using (public.is_self_or_child(member_id) or payer_id = auth.uid());

create policy bookings_insert_own on public.bookings
  for insert to authenticated
  with check (public.is_active_user() and public.is_self_or_child(member_id));

-- A member may cancel their own booking. They may not edit what they owe, what
-- they have paid, or their way off a waitlist — the trigger below is what says
-- so, because a policy cannot name columns.
create policy bookings_update_own on public.bookings
  for update to authenticated
  using (public.is_self_or_child(member_id))
  with check (public.is_self_or_child(member_id));

create or replace function public.bookings_block_member_money_edits() returns trigger
  language plpgsql set search_path to 'public'
  as $$
begin
  if not public.is_end_user() or public.is_coach_or_admin() then
    return new;
  end if;
  if new.amount_due  is distinct from old.amount_due
  or new.amount_paid is distinct from old.amount_paid then
    raise exception 'amounts are set by the club' using errcode = '42501';
  end if;
  if new.status is distinct from old.status and new.status <> 'cancelled' then
    raise exception 'a member may cancel a booking, not change its status otherwise'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger bookings_member_edit_guard
  before update on public.bookings
  for each row execute function public.bookings_block_member_money_edits();

create policy bookings_all_staff on public.bookings
  for all to authenticated
  using (public.is_coach_or_admin()) with check (public.is_coach_or_admin());

create trigger bookings_audit
  after insert or update or delete on public.bookings
  for each row execute function public.audit_admin_write();
