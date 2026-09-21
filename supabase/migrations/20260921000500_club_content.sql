-- ─────────────────────────────────────────────────────────────────────────────
-- The club's own text and the plumbing around it: the waivers people sign, the
-- terms they accept, the club's contact details, the coaching rota, and the
-- notification machinery.
--
-- Contact details are deliberately NOT in piste.config.ts. A phone number
-- changes on a Tuesday afternoon and nobody should need a deploy for it, so it
-- is admin-authored data here and read through useClubContact() in the app.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── club profile and contact ─────────────────────────────────────────────────
-- Single-row tables, guarded by a unique index on a constant. A settings table
-- that can hold two rows will eventually hold two rows, and then half the app
-- reads one and half the other.

create table if not exists public.club_profile (
  id           boolean primary key default true,
  updated_at   timestamptz not null default now(),
  mission      text,
  about        text,
  -- Overrides locale.currency / locale.language from piste.config.ts on the
  -- next build. Stored here so an admin can change them from the app; they
  -- cannot take effect at runtime, and the Club Profile page says so.
  currency     text,
  language     text,
  updated_by   uuid references public.profiles(id) on delete set null,

  constraint club_profile_singleton check (id)
);

create table if not exists public.club_contact (
  id            boolean primary key default true,
  updated_at    timestamptz not null default now(),
  email         text,
  phone         text,
  address       text,
  native_address text,
  map_query     text,
  hours         text,
  updated_by    uuid references public.profiles(id) on delete set null,

  constraint club_contact_singleton check (id)
);

create table if not exists public.contact_channels (
  id         uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  -- 'line', 'instagram', 'facebook', 'whatsapp', 'discord', 'email', 'phone'.
  -- Free text: the list of places a club is reachable changes faster than a
  -- check constraint can be migrated, and nothing branches on the value.
  channel    text not null,
  label      text not null,
  url        text,
  handle     text,
  sort_order integer not null default 0,
  active     boolean not null default true
);

create policy club_profile_select on public.club_profile
  for select to authenticated using (true);
create policy club_profile_write on public.club_profile
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Reachable before sign-in on purpose: the contact details are what a pending
-- applicant needs when something has gone wrong with their application, and
-- they are on the public website anyway.
create policy club_contact_select on public.club_contact
  for select to anon, authenticated using (true);
create policy club_contact_write on public.club_contact
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy contact_channels_select on public.contact_channels
  for select to anon, authenticated using (active);
create policy contact_channels_write on public.contact_channels
  for all to authenticated using (public.is_admin()) with check (public.is_admin());


-- ── terms of use ─────────────────────────────────────────────────────────────
-- Versioned. Publishing a new version re-gates every member behind an
-- acceptance screen, which is the whole point of the version number.

create table if not exists public.terms (
  id           uuid primary key default gen_random_uuid(),
  created_at   timestamptz not null default now(),
  version      integer not null unique,
  body         text not null,
  published_at timestamptz,
  author_id    uuid references public.profiles(id) on delete set null,

  constraint terms_version_check check (version >= 1)
);

create policy terms_select on public.terms
  for select to anon, authenticated using (published_at is not null);
create policy terms_write_admin on public.terms
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Accept the current version as the signed-in user. A function rather than a
-- direct update because `agreed_to_terms_version` must be the version the
-- server considers current, not whatever number the client sends.
create or replace function public.accept_current_terms(p_version integer) returns void
  language plpgsql security definer set search_path to 'public'
  as $$
declare
  v_current integer;
begin
  select max(version) into v_current from public.terms where published_at is not null;
  if v_current is null then
    raise exception 'no terms have been published';
  end if;
  if p_version <> v_current then
    raise exception 'terms version % is not the current version (%)', p_version, v_current
      using errcode = '23514';
  end if;
  update public.profiles
     set agreed_to_terms_at = now(), agreed_to_terms_version = v_current
   where id = auth.uid();
end;
$$;

grant execute on function public.accept_current_terms(integer) to authenticated;


-- ── waivers ──────────────────────────────────────────────────────────────────
-- Fencing is a combat sport with a needle-sharp implement; the liability
-- waiver, the media release and the minor-safeguarding consent are three
-- separate documents a club actually needs signed, so `code` distinguishes
-- them and `applies_to` says which events demand which.

create table if not exists public.waivers (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  code        text not null,
  version     integer not null default 1,
  title       text not null,
  body        text not null,
  applies_to  text[] not null default '{}',
  -- A minor's waiver is signed by a guardian, and the signature line has to
  -- say so. Drives which name field the signing page presents.
  requires_guardian boolean not null default false,
  published_at timestamptz,

  constraint waivers_applies_to_check
    check (applies_to <@ array['practice','course','popup','tournament','interclub','social']),
  constraint waivers_code_version unique (code, version)
);

create table if not exists public.waiver_signatures (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  waiver_id   uuid not null references public.waivers(id) on delete restrict,
  member_id   uuid not null references public.profiles(id) on delete cascade,
  event_id    uuid references public.events(id) on delete set null,
  signed_name text not null,
  guardian_name text,
  -- The text as it stood when they signed it. A waiver whose wording can be
  -- edited afterwards is not evidence of anything, and `waiver_id` alone points
  -- at whatever the row says today.
  body_snapshot text not null,
  signed_at   timestamptz not null default now(),

  constraint waiver_signatures_once_per_event unique (waiver_id, member_id, event_id)
);

create index if not exists waiver_signatures_member_idx on public.waiver_signatures (member_id);

-- A waiver signed once for the club at large, rather than for a specific event.
-- The constraint above cannot cover it: event_id is NULL there, and NULLs are
-- never equal to each other, so it would let the same person sign forever.
create unique index if not exists waiver_signatures_once_general
  on public.waiver_signatures (waiver_id, member_id) where event_id is null;

create policy waivers_select on public.waivers
  for select to authenticated using (published_at is not null);
create policy waivers_write_admin on public.waivers
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy waiver_signatures_select_own on public.waiver_signatures
  for select to authenticated using (public.is_self_or_child(member_id));
create policy waiver_signatures_insert_own on public.waiver_signatures
  for insert to authenticated
  with check (public.is_self_or_child(member_id));
create policy waiver_signatures_staff on public.waiver_signatures
  for select to authenticated using (public.is_coach_or_admin());

-- Signatures are never edited or deleted, by anyone. The point of a signature
-- is that it is not revisable after the fact.
create or replace function public.waiver_signatures_immutable() returns trigger
  language plpgsql set search_path to 'public'
  as $$
begin
  raise exception 'a signature cannot be changed' using errcode = '42501';
end;
$$;

create trigger waiver_signatures_no_mutations
  before update or delete on public.waiver_signatures
  for each row execute function public.waiver_signatures_immutable();


-- ── coaching rota ────────────────────────────────────────────────────────────

create table if not exists public.duties (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  event_id    uuid not null references public.events(id) on delete cascade,
  assignee_id uuid not null references public.profiles(id) on delete cascade,
  role        text not null default 'coach',
  note        text,
  assigned_by uuid references public.profiles(id) on delete set null,

  constraint duties_role_check
    check (role = any (array['coach','assistant','armorer','referee','scorer','driver','host'])),
  constraint duties_once unique (event_id, assignee_id, role)
);

create index if not exists duties_assignee_idx on public.duties (assignee_id);
create index if not exists duties_event_idx    on public.duties (event_id);

-- Only coaches and admins can be put on the rota. A fencer assigned as coach
-- would appear on the session sheet as one.
create or replace function public.duties_enforce_assignee_role() returns trigger
  language plpgsql security definer set search_path to 'public'
  as $$
begin
  if new.role in ('coach','assistant','armorer','referee')
     and not exists (select 1 from public.profiles
                     where id = new.assignee_id and role in ('coach','admin')) then
    raise exception 'only a coach or admin can take the % duty', new.role
      using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger duties_check_assignee
  before insert or update on public.duties
  for each row execute function public.duties_enforce_assignee_role();

create policy duties_select on public.duties
  for select to authenticated using (public.is_active_user());
create policy duties_write_staff on public.duties
  for all to authenticated
  using (public.is_coach_or_admin()) with check (public.is_coach_or_admin());


-- ── notifications and push ───────────────────────────────────────────────────

create table if not exists public.notifications (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  member_id   uuid not null references public.profiles(id) on delete cascade,
  title       text not null,
  body        text,
  url         text,
  kind        text not null default 'general',
  read_at     timestamptz,

  constraint notifications_kind_check
    check (kind = any (array['general','poll','event','payment','meetup','ride','result','admin']))
);

create index if not exists notifications_member_idx on public.notifications (member_id, created_at desc);

create policy notifications_select_own on public.notifications
  for select to authenticated using (member_id = auth.uid());
create policy notifications_update_own on public.notifications
  for update to authenticated
  using (member_id = auth.uid()) with check (member_id = auth.uid());
create policy notifications_write_staff on public.notifications
  for all to authenticated
  using (public.is_coach_or_admin()) with check (public.is_coach_or_admin());


create table if not exists public.push_subscriptions (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  member_id   uuid not null references public.profiles(id) on delete cascade,
  endpoint    text not null unique,
  p256dh      text not null,
  auth        text not null,
  user_agent  text,
  last_seen_at timestamptz not null default now()
);

create index if not exists push_subscriptions_member_idx on public.push_subscriptions (member_id);

create policy push_subscriptions_own on public.push_subscriptions
  for all to authenticated
  using (member_id = auth.uid()) with check (member_id = auth.uid());


-- What the cron worker has already sent, so a retry or a second run of the
-- daily job does not notify the same person about the same thing twice.
create table if not exists public.push_sent (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  member_id   uuid not null references public.profiles(id) on delete cascade,
  event_id    uuid references public.events(id) on delete cascade,
  poll_id     uuid references public.attendance_polls(id) on delete cascade,
  kind        text not null,
  -- The day the notification was FOR, not the day it was sent. A reminder for
  -- Friday sent twice on Thursday is a bug; the same reminder next Friday is not.
  for_date    date not null,

  constraint push_sent_kind_check
    check (kind = any (array['poll_open','poll_closing','session_reminder','meetup_decided','ride_offer','broadcast']))
);

-- The de-duplication key. An expression index rather than a table constraint
-- because a UNIQUE constraint cannot hold one, and a plain unique over a
-- nullable event_id would not de-duplicate at all: in SQL two NULLs are not
-- equal, so every broadcast would look new.
create unique index if not exists push_sent_once
  on public.push_sent (member_id, kind, for_date,
                       coalesce(event_id, '00000000-0000-0000-0000-000000000000'::uuid));

create policy push_sent_select_staff on public.push_sent
  for select to authenticated using (public.is_coach_or_admin());
